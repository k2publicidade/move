import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gomove-rules-2026-'))
process.env.NODE_ENV = 'test'
process.env.GOMOVE_DATA_FILE = path.join(testDir, 'db.json')
process.env.APP_PUBLIC_URL = 'https://gomove.example'
process.env.TWOPP_API_KEY = 'test-key'
process.env.TWOPP_API_SECRET = 'test-secret'
process.env.TWOPP_WEBHOOK_TOKEN = 'rules-tests-token-at-least-32-characters'
process.env.CRON_SECRET = 'nightly-processing-secret-at-least-16'
const { app, readDb, writeDb } = await import('../server/index.js')
const server = app.listen(0)
await new Promise<void>(resolve => server.listening ? resolve() : server.once('listening', resolve))
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`
after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); fs.rmSync(testDir, { recursive: true, force: true }) })

type Row = Record<string, any>
const request = async (route: string, body?: Row, token?: string, method = body === undefined ? 'GET' : 'POST') => {
  const res = await fetch(`${base}${route}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  return { status: res.status, body: await res.json() as Row }
}
const saoPauloDate = (offsetDays = 0) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(Date.now() + offsetDays * 86_400_000))
  const value = (type: string) => parts.find(part => part.type === type)!.value
  return `${value('year')}-${value('month')}-${value('day')}`
}
const saoPauloHour = () => Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hourCycle: 'h23' }).format(new Date()))

const login = async (username: string) => (await request('/auth/login', { username, password: 'gomove2026' })).body.token as string
const associates = async (token: string) => (await request('/admin/associates?pageSize=100', undefined, token)).body.items as Row[]

// CPFs de teste precisam ter dígitos verificadores válidos (mesma regra do cadastro).
const cpfFor = (seed: number) => {
  const base = String(100000000 + (seed % 800000000)).padStart(9, '0')
  const digit = (values: string) => { let sum = 0; values.split('').forEach((value, index) => { sum += Number(value) * (values.length + 1 - index) }); const check = (sum * 10) % 11; return check === 10 ? 0 : check }
  const d1 = digit(base)
  const d2 = digit(base + d1)
  return `${base}${d1}${d2}`
}
const registerUser = (username: string, cpf: string, inviteCode?: string) => request('/public/register', { name: `Regra ${username}`, username, email: `${username}@example.com`, password: 'test-password', cpf, ...(inviteCode ? { inviteCode } : {}) })

test('o cadastro rejeita um segundo CPF igual no site, no admin e no perfil', async () => {
  const cpf = cpfFor(11)
  const first = await registerUser('cpf_unico', cpf)
  assert.equal(first.status, 201, JSON.stringify(first.body))

  const duplicated = await registerUser('cpf_repetido', cpf)
  assert.equal(duplicated.status, 409)
  assert.match(String(duplicated.body.error), /CPF já cadastrado/)

  const master = await login('admin')
  const viaAdmin = await request('/admin/associates', { name: 'CPF Admin', username: 'cpf_admin', email: 'cpf_admin@example.com', password: 'test-password', cpf }, master)
  assert.equal(viaAdmin.status, 409)
  assert.match(String(viaAdmin.body.error), /CPF já cadastrado/)

  const other = await registerUser('cpf_outro', cpfFor(31))
  assert.equal(other.status, 201, JSON.stringify(other.body))
  const profile = await request('/profile', { cpf }, other.body.token, 'PUT')
  assert.equal(profile.status, 409)
  assert.match(String(profile.body.error), /CPF já cadastrado/)
})

test('a adesão de R$ 55 não gera bonificação; a cota ativada gera a indicação direta de 10%', async () => {
  const master = await login('admin')
  const ana = (await associates(master)).find(user => user.username === 'ana')!
  const bonusCount = () => readDb().bonusEntries.filter((entry: Row) => entry.userId === ana.id).length
  const before = bonusCount()

  const indicado = await registerUser('indicado_regra', cpfFor(23), 'ana01')
  assert.equal(indicado.status, 201, JSON.stringify(indicado.body))
  assert.equal(indicado.body.user.sponsorId, ana.id)

  const planInvoice = await request('/admin/invoices', { userId: indicado.body.user.id, productType: 'ASSOCIATE_PLAN', description: 'Plano de Associado GoMove', amount: 55, amountCents: 5_500, remaining: 55, status: 'Aguardando pagamento', paymentStatus: 'PENDING' }, master)
  assert.equal(planInvoice.status, 201, JSON.stringify(planInvoice.body))
  const reconciled = await request(`/admin/associates/${indicado.body.user.id}/reconcile`, { kind: 'invoices', recordId: planInvoice.body.id, reference: 'plano-55-teste', reason: 'Conferência do plano de R$ 55' }, master)
  assert.equal(reconciled.status, 200, JSON.stringify(reconciled.body))
  assert.equal(readDb().users.find((user: Row) => user.id === indicado.body.user.id).associatePlanStatus, 'ACTIVE')
  assert.equal(bonusCount(), before, 'a adesão de R$ 55 não pode gerar bonificação para a rede')
  assert.equal(readDb().commissionEvents.length, 0, 'a adesão de R$ 55 não pode abrir evento de comissão')

  const quota = await request('/admin/investments', { userId: indicado.body.user.id, pack: 'Cotas GoMove', amount: 300, status: 'Aguardando pagamento' }, master)
  assert.equal(quota.status, 201, JSON.stringify(quota.body))
  assert.equal((await request(`/admin/investments/${quota.body.id}/confirm`, {}, master)).status, 200)
  const referral = readDb().bonusEntries.find((entry: Row) => entry.userId === ana.id && entry.type === 'DIRECT_REFERRAL' && entry.investmentId === quota.body.id)
  assert.ok(referral, 'a cota ativada precisa gerar a indicação direta')
  assert.equal(referral.amountCents, 3_000)
  const upgraded = readDb().users.find((user: Row) => user.id === indicado.body.user.id)
  assert.equal(upgraded.membershipType, 'SHAREHOLDER')
  assert.ok(upgraded.shareholderSince)
})

test('ingresso direto como Cotista a partir de R$ 60 e upgrade obrigatório com cota mínima de R$ 300', async () => {
  const master = await login('admin')
  const users = await associates(master)
  const ana = users.find(user => user.username === 'ana')!

  const belowMinimum = await request('/admin/investments', { userId: ana.id, pack: 'Cotas GoMove', amount: 50, status: 'Aguardando pagamento' }, master)
  assert.equal(belowMinimum.status, 422)
  assert.match(String(belowMinimum.body.error), /A aquisição deve ficar entre R\$ 60,00/)

  const direct = await request('/admin/investments', { userId: ana.id, pack: 'Cotas GoMove', amount: 60, status: 'Aguardando pagamento' }, master)
  assert.equal(direct.status, 201, JSON.stringify(direct.body))
  assert.equal((await request(`/admin/investments/${direct.body.id}/confirm`, {}, master)).status, 200)
  assert.equal(readDb().users.find((user: Row) => user.id === ana.id).membershipType, 'SHAREHOLDER')

  const bruno = users.find(user => user.username === 'bruno')!
  const credit = await request('/admin/bonus-entries/manual-credit', { userId: bruno.id, amountCents: 55_000, reason: 'Teto de bonificação do Associado' }, master)
  assert.equal(credit.status, 201, JSON.stringify(credit.body))
  const blocked = readDb().bonusEntries.find((entry: Row) => entry.userId === bruno.id && entry.status === 'BLOCKED_UPGRADE')
  assert.equal(blocked.amountCents, 5_000)

  const belowUpgrade = await request('/admin/investments', { userId: bruno.id, pack: 'Cotas GoMove', amount: 60, status: 'Aguardando pagamento' }, master)
  assert.equal(belowUpgrade.status, 422)
  assert.match(String(belowUpgrade.body.error), /Upgrade obrigatório/)

  const upgrade = await request('/admin/investments', { userId: bruno.id, pack: 'Cotas GoMove', amount: 500, status: 'Aguardando pagamento' }, master)
  assert.equal(upgrade.status, 201, JSON.stringify(upgrade.body))
  assert.equal((await request(`/admin/investments/${upgrade.body.id}/confirm`, {}, master)).status, 200)
  assert.equal(readDb().users.find((user: Row) => user.id === bruno.id).membershipType, 'SHAREHOLDER')
  assert.equal(readDb().bonusEntries.find((entry: Row) => entry.id === blocked.id).status, 'PENDING')
})

test('o processamento diário é noturno, idempotente e repete o último percentual do Diário', async () => {
  const db = readDb()
  db.dailyProfitabilityRuns.unshift({ id: 'DIA-ANTERIOR', date: saoPauloDate(-1), rateBps: 100, description: 'Diário anterior', status: 'PROCESSED', createdBy: 'test', createdAt: new Date().toISOString() })
  writeDb(db)

  assert.equal((await fetch(`${base}/cron/daily-profitability`)).status, 401)
  assert.equal((await fetch(`${base}/cron/daily-profitability`, { headers: { authorization: 'Bearer wrong' } })).status, 401)

  const header = { authorization: `Bearer ${process.env.CRON_SECRET}` }
  const hour = saoPauloHour()
  const first = await fetch(`${base}/cron/daily-profitability`, { headers: header })
  assert.equal(first.status, 200)
  const result = await first.json() as Row
  if (hour >= 18 || hour <= 5) {
    assert.equal(result.processed, true, JSON.stringify(result))
    assert.equal(result.autoScheduled, true)
    assert.equal(result.run.date, saoPauloDate())
    assert.equal(result.run.rateBps, 100)
    assert.match(String(result.run.description), /Repetição automática/)
    const retry = await fetch(`${base}/cron/daily-profitability`, { headers: header })
    const repeat = await retry.json() as Row
    assert.equal(repeat.processed, true)
    assert.equal(repeat.autoScheduled, false)
    assert.equal(repeat.idempotent, true)
    assert.equal(readDb().dailyProfitabilityRuns.filter((run: Row) => run.date === saoPauloDate()).length, 1)
  } else {
    assert.equal(result.processed, false, JSON.stringify(result))
    assert.match(String(result.reason), /Fora da janela noturna/)
  }
})

test('um Diário cadastrado pelo MASTER é processado a qualquer hora, uma única vez', async () => {
  const today = saoPauloDate()
  const db = readDb()
  const existing = db.dailyProfitabilityRuns.find((run: Row) => run.date === today)
  if (existing) Object.assign(existing, { status: 'SCHEDULED', processedAt: undefined })
  else db.dailyProfitabilityRuns.unshift({ id: 'DIA-HOJE', date: today, rateBps: 50, description: 'Diário manual', status: 'SCHEDULED', createdBy: 'test', createdAt: new Date().toISOString() })
  writeDb(db)

  const header = { authorization: `Bearer ${process.env.CRON_SECRET}` }
  const first = await (await fetch(`${base}/cron/daily-profitability`, { headers: header })).json() as Row
  assert.equal(first.processed, true, JSON.stringify(first))
  assert.equal(first.autoScheduled, false)
  assert.equal(first.run.status, 'PROCESSED')
  const second = await (await fetch(`${base}/cron/daily-profitability`, { headers: header })).json() as Row
  assert.equal(second.idempotent, true)
  assert.equal(readDb().dailyProfitabilityRuns.filter((run: Row) => run.date === saoPauloDate()).length, 1)
})
