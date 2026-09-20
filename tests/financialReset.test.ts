import { after, test } from 'node:test'
import { strict as assert } from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gomove-reset-'))
process.env.NODE_ENV = 'test'
process.env.GOMOVE_DATA_FILE = path.join(dir, 'db.json')

const { app, readDb, writeDb } = await import('../server/index.js')
const { COMMISSION_PLAN_VERSION } = await import('../src/businessPlan.js')
const { FINANCIAL_COLLECTIONS, PRESERVED_COLLECTIONS } = await import('../src/financialReset.js')

const server = app.listen(0)
await new Promise<void>(resolve => server.listening ? resolve() : server.once('listening', resolve))
const address = server.address() as { port: number }

const request = async (route: string, token?: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') => {
  const response = await fetch(`http://127.0.0.1:${address.port}/api${route}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: response.status, body: await response.json() as any }
}

after(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()))
  fs.rmSync(dir, { recursive: true, force: true })
})

test('zerar saldos: frase de confirmação, backup, auditoria, contas zeradas e configuração preservada', async () => {
  const master = (await request('/auth/login', undefined, { username: 'admin', password: 'gomove2026' })).body
  const participant = (await request('/auth/login', undefined, { username: 'matheus', password: 'gomove2026' })).body
  const auxiliary = (await request('/auth/login', undefined, { username: 'ana', password: 'gomove2026' })).body
  assert.ok(master.token && participant.token && auxiliary.token)

  // Saldo de verdade em todas as carteiras: ajuste MASTER na Carteira de Saldo,
  // bonificação aprovada na Carteira Rede e um Diário processado na Carteira Cota.
  const credit = await request(`/admin/associates/${participant.user.id}/balance-adjustments`, master.token, { amountCents: 60_000, reason: 'Carga de teste', reference: 'reset-test-1' })
  assert.equal(credit.status, 201, JSON.stringify(credit.body))
  const manual = await request('/admin/bonus-entries/manual-credit', master.token, { userId: participant.user.id, amountCents: 7_500, reason: 'Bonificação de teste' })
  assert.equal(manual.status, 201, JSON.stringify(manual.body))
  assert.equal((await request(`/admin/bonus-entries/${manual.body.id}/approve`, master.token, {})).status, 200)

  const seeded = readDb()
  const run = { id: 'run-reset', date: '2026-09-01', rateBps: 100, status: 'PROCESSED', createdBy: master.user.id, createdAt: new Date().toISOString() }
  seeded.dailyProfitabilityRuns.push(run)
  seeded.dailyProfitabilities.push({ id: 'dia-reset', userId: participant.user.id, runId: run.id, creditedAmountCents: 12_500, createdAt: new Date().toISOString() })
  seeded.transactions.unshift({ id: 'tx-daily-reset', userId: participant.user.id, dailyProfitabilityId: 'dia-reset', amount: 125, description: 'Rendimento operacional do Diário', status: 'Crédito', date: '01/09/2026', createdAt: new Date().toISOString() })
  seeded.investments.push({ id: 'ATV-RESET', userId: participant.user.id, date: '01/09/2026', pack: 'Cotas GoMove', amount: 500, amountCents: 50_000, status: 'Ativo', paymentStatus: 'CONFIRMED' })
  seeded.withdrawals.push({ id: 'SAQ-RESET', userId: participant.user.id, date: '02/09/2026', amount: 60, amountCents: 6_000, wallet: 'COTA', method: 'PIX', account: '—', status: 'Pendente', paidAt: '—' })
  writeDb(seeded)

  const before = readDb()
  const beforeUsers = before.users.length
  const beforeVehicles = before.vehicles.length
  const beforeTickets = before.tickets.length
  const beforeRules = before.commissionRules.length
  const beforeProfiles = Object.keys(before.profiles).length
  const beforeKeys = Object.keys(before).sort()
  const beforeWallets = (await request('/state', participant.token)).body.business.wallets
  assert.ok(beforeWallets.balanceCents > 0 && beforeWallets.cotaCents > 0 && beforeWallets.redeCents > 0, JSON.stringify(beforeWallets))

  // Somente o MASTER executa, e só com a frase exata.
  assert.equal((await request('/admin/financial-reset', participant.token, { confirmation: 'ZERAR SALDOS' })).status, 403)
  assert.equal((await request('/admin/financial-reset', master.token, { confirmation: 'zerar' })).status, 422)
  assert.equal((await request('/admin/financial-reset', master.token, { confirmation: '' })).status, 422)
  const cleared = await request('/admin/financial-reset', master.token, { confirmation: '  zerar   saldos ' })
  assert.equal(cleared.status, 200, JSON.stringify(cleared.body))
  assert.ok(String(cleared.body.backup).includes('backup-'))
  assert.equal(cleared.body.reset.accountsReset, before.users.filter((user: any) => user.role === 'ASSOCIATE').length)
  assert.ok(cleared.body.reset.clearedTransactionCents !== 0)
  assert.ok(cleared.body.reset.clearedWallets.balanceCents > 0 && cleared.body.reset.clearedWallets.cotaCents > 0 && cleared.body.reset.clearedWallets.redeCents > 0)

  const after = readDb()
  // 1. Nada de financeiro sobrou.
  for (const key of FINANCIAL_COLLECTIONS) assert.deepEqual(after[key], [], `${key} deveria estar vazio`)
  // 2. Todas as contas voltaram ao estado sem pacote.
  for (const user of after.users.filter((item: any) => item.role === 'ASSOCIATE')) {
    assert.equal(user.membershipType, 'ASSOCIATE')
    assert.equal(user.associatePlanStatus, 'PENDING')
    assert.equal(user.associatePlanAmountCents, 5_500)
    assert.equal(user.bonusCapCents, 50_000)
    assert.equal(user.shareholderSince, undefined)
    assert.equal(user.associatePlanPaidAt, undefined)
    assert.equal(user.status, 'ACTIVE', 'a conta continua podendo entrar e recomprar o plano')
  }
  // 3. Cadastro, rede, operação e configuração sobrevivem — inclusive a parametrização do gateway.
  for (const key of PRESERVED_COLLECTIONS) assert.equal(typeof after[key], 'object', `${key} deveria continuar existindo`)
  assert.deepEqual(Object.keys(after).sort(), beforeKeys, 'nenhuma chave de configuração do estado pode desaparecer')
  assert.equal(after.users.length, beforeUsers)
  assert.equal(after.vehicles.length, beforeVehicles)
  assert.equal(after.tickets.length, beforeTickets)
  assert.equal(after.commissionRules.length, beforeRules)
  assert.equal(after.commissionRules.filter((rule: any) => rule.active).length, 1)
  assert.equal(after.commissionPlanVersion, COMMISSION_PLAN_VERSION)
  assert.equal(Object.keys(after.profiles).length, beforeProfiles)
  assert.equal(after.users.find((user: any) => user.id === participant.user.id).sponsorId, master.user.id)
  // 4. Histórico guardado antes da limpeza + trilha de auditoria.
  const backupFile = String(cleared.body.backup)
  assert.ok(fs.existsSync(backupFile), `backup esperado em ${backupFile}`)
  const backup = JSON.parse(fs.readFileSync(backupFile, 'utf8'))
  assert.ok(backup.transactions.some((item: any) => item.id === 'tx-daily-reset'))
  assert.ok(backup.investments.some((item: any) => item.id === 'ATV-RESET'))
  assert.ok(backup.withdrawals.some((item: any) => item.id === 'SAQ-RESET'))
  const audit = after.auditLogs.find((log: any) => log.action === 'FINANCIAL_RESET')
  assert.ok(audit, 'a limpeza precisa ficar registrada na auditoria')
  assert.equal(audit.actorId, master.user.id)
  assert.equal(audit.details.backup, backupFile)
  assert.equal(audit.details.accountsReset, cleared.body.reset.accountsReset)

  // 5. Visão do participante: todas as carteiras em zero e sem pacote ativo.
  const statement = (await request('/state', participant.token)).body
  assert.equal(statement.transactions.length, 0)
  assert.equal(statement.investments.length, 0)
  assert.equal(statement.business.wallets.balanceCents, 0)
  assert.equal(statement.business.wallets.cotaCents, 0)
  assert.equal(statement.business.wallets.redeCents, 0)
  assert.equal(statement.business.wallets.withdrawableCents, 0)
  assert.equal(statement.business.wallets.reservedCents, 0)
  assert.equal(statement.business.hasActivePackage ?? statement.business.wallets.hasActivePackage, false)
  const summary = (await request('/network/summary', participant.token)).body
  assert.equal(summary.quotaAmountCents, 0)
  assert.equal(summary.earningCapConsumedCents, 0)
  assert.equal(summary.earningCapCents, 50_000)
  assert.equal(summary.canReceiveFinancialResults, false)

  // 6. O MASTER continua operando e uma segunda execução é inofensiva.
  const second = await request('/admin/financial-reset', master.token, { confirmation: 'ZERAR SALDOS' })
  assert.equal(second.status, 200)
  assert.equal(second.body.reset.collections.transactions, 0)
  assert.equal(second.body.reset.clearedWallets.balanceCents, 0)
  assert.equal((await request('/admin/dashboard', master.token)).status, 200)
})
