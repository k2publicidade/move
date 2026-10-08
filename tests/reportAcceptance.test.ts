import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import http, { type Server } from 'node:http'
import os from 'node:os'

// Prefer Hermes-provided scratch/workspace; reject MSYS /tmp on native Windows.
// Never use os.tmpdir(), an existing ledger, PostgreSQL or a real gateway.
const configuredScratch = [process.env.TMPDIR, process.env.BH_AGENT_WORKSPACE].find(value =>
  value && path.isAbsolute(value) && (process.platform !== 'win32' || /^(?:[A-Za-z]:[\\/]|\\\\)/.test(value)))
const scratch = configuredScratch ?? (process.platform === 'win32'
  ? path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'), 'hermes', 'cache', 'scratch')
  : path.join(os.homedir(), '.hermes', 'cache', 'scratch'))
fs.mkdirSync(scratch, { recursive: true })
const dir = fs.mkdtempSync(path.join(scratch, 'move-report-acceptance-'))
const webhookToken = 'report-acceptance-local-only-token-2026'
Object.assign(process.env, {
  NODE_ENV: 'test', DATABASE_URL: '', GOMOVE_DATA_FILE: path.join(dir, 'db.json'),
  DOTENV_CONFIG_PATH: path.join(dir, 'absent.env'), GOMOVE_VIEWER_ADMINS: '', CRON_SECRET: '',
  TWOPP_API_KEY: 'mock-key', TWOPP_API_SECRET: 'mock-secret', TWOPP_WEBHOOK_TOKEN: webhookToken,
  APP_PUBLIC_URL: 'https://gomove.example', GOMOVE_PUBLIC_RATE_LIMIT: '1000',
})
const realFetch = globalThis.fetch
const allowedOrigins = new Set<string>()
globalThis.fetch = ((input: any, init?: any) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
  assert.ok(allowedOrigins.has(url.origin), `External HTTP forbidden: ${url.origin}`)
  return realFetch(input, { ...init, redirect: 'error', signal: init?.signal ?? AbortSignal.timeout(10000) })
}) as typeof fetch
const calls: Array<{ route: string; body: any }> = []
const provider = http.createServer((req, res) => {
  let raw = ''
  req.setEncoding('utf8')
  req.on('data', chunk => { raw += chunk })
  req.on('end', () => {
    const body = JSON.parse(raw)
    calls.push({ route: req.url!, body })
    const id = new URL(body.webhookUrl).pathname.split('/').pop()
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ status: 'success', data: {
      transactionId: `mock-${id}`, status: 'PENDING', qrCode: '000201-mock-pix-not-a-real-charge',
      paymentUrl: '000201-mock-pix-not-a-real-charge', amount: String(body.amount), netAmount: String(body.amount),
    } }))
  })
})
async function listen(server: Server) {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const origin = `http://127.0.0.1:${address.port}`
  allowedOrigins.add(origin)
  return origin
}
process.env.TWOPP_BASE_URL = await listen(provider)
const { app, readDb, writeDb } = await import('../server/index.ts')
const db = readDb()
// Only fixture preparation uses direct writes. Every business mutation below uses HTTP.
for (const key of ['investments', 'invoices', 'transactions', 'withdrawals', 'commissionEvents', 'bonusEntries', 'dailyProfitabilities', 'dailyProfitabilityRuns', 'twoPpWebhookEvents']) db[key] = []
db.auditLogs = [{ id: 'acceptance-reset', action: 'FINANCIAL_RESET' }]
writeDb(db)
const server = http.createServer(app)
const base = `${await listen(server)}/api`
after(async () => {
  globalThis.fetch = realFetch
  await Promise.all([server, provider].map(s => new Promise<void>((resolve, reject) => s.close(error => error ? reject(error) : resolve()))))
  fs.rmSync(dir, { recursive: true, force: true })
})
async function request(route: string, body?: any, token?: string, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(`${base}${route}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  return { status: response.status, body: await response.json() as any }
}
function status(result: { status: number; body: any }, expected: number) {
  assert.equal(result.status, expected, JSON.stringify(result.body))
  return result.body
}
let sequence = 0
function cpfFor(index: number) {
  let digits = String(880000000 + index)
  for (const length of [9, 10]) {
    let sum = 0
    for (let i = 0; i < length; i++) sum += Number(digits[i]) * (length + 1 - i)
    const check = (sum * 10) % 11
    digits += check === 10 ? '0' : String(check)
  }
  return digits
}
async function register(inviteCode?: string) {
  const n = ++sequence, username = `report-user-${n}`, cpf = cpfFor(n)
  const result = await request('/public/register', { name: `Relatório ${n}`, username, email: `${username}@example.test`, password: 'acceptance-test-only', cpf, ...(inviteCode ? { inviteCode } : {}) })
  return { result, cpf, session: result.body }
}
async function state(session: any) { return status(await request('/state', undefined, session.token), 200) }
async function bonuses(session: any) { return status(await request('/bonuses/me?pageSize=100', undefined, session.token), 200).items as any[] }
async function complete(payment: any, amount: string) {
  return request(`/webhooks/2pp/${payment.id}?token=${webhookToken}`, { status: 'success', data: { transactionId: payment.paymentReference, status: 'COMPLETED', amount, netAmount: amount, paymentMethod: 'pix', createdAt: '2026-10-08T12:00:00.000Z' } })
}
async function plan(session: any, cpf: string) {
  const payment = status(await request('/associate-plan', { paymentMethod: 'PIX', customerDocument: cpf, idempotencyKey: `plan-${session.user.id}` }, session.token), 201)
  assert.equal(payment.amountCents, 5500)
  status(await complete(payment, '55.00'), 200)
  return payment
}
async function quota(session: any, cpf: string) {
  return status(await request('/investments', { amount: 65, paymentMethod: 'PIX', customerDocument: cpf, idempotencyKey: `quota-${session.user.id}` }, session.token), 201)
}
const admin = status(await request('/auth/login', { username: 'admin', password: 'gomove2026' }), 200)
async function approve(entry: any) { return status(await request(`/admin/bonus-entries/${entry.id}/approve`, {}, admin.token), 200) }
async function daily(date: string, rateBps: number) {
  const scheduled = status(await request('/admin/daily-profitabilities', { date, rateBps }, admin.token), 201)
  return status(await request(`/admin/daily-profitabilities/${scheduled.run.id}/process`, {}, admin.token), 200)
}
async function adjustment(session: any, wallet: string, amountCents: number, reference: string) {
  return request(`/admin/associates/${session.user.id}/balance-adjustments`, { wallet, amountCents, reference, reason: 'Somente ledger isolado de aceitação' }, admin.token)
}

test('relatório: 13 passos HTTP, exclusivamente mock e ledger descartável', async t => {
  let sponsor: any, sponsorCpf: string, planPayment: any, child: any, childCpf: string, childQuota: any, sponsorQuota: any, firstDaily: any, unpaid: any, unpaidCpf: string, withdrawal: any
  await t.test('01 — associado R$55: confirmação não gera bônus, diário nem Unilevel', async () => {
    const registration = await register()
    sponsor = status(registration.result, 201); sponsorCpf = registration.cpf
    planPayment = await plan(sponsor, sponsorCpf)
    const current = await state(sponsor)
    assert.equal(current.business.associatePlanStatus, 'ACTIVE')
    assert.equal(current.business.membershipType, 'ASSOCIATE')
    assert.equal(current.business.quotaAmountCents, 0)
    assert.equal(current.business.dailyEarningCents, 0)
    assert.equal(current.business.earningCapTotalCents, 50000)
    assert.deepEqual(await bonuses(sponsor), [])
    assert.equal(status(await request('/admin/bonus-entries?pageSize=100', undefined, admin.token), 200).items.length, 0)
    assert.equal(current.transactions.length, 0)
  })
  await t.test('02 — lookup do username e URL ?ref=username identifica o indicador', async () => {
    const plain = await request(`/public/invites/${sponsor.user.username}`)
    const pasted = await request(`/public/invites/${encodeURIComponent(`https://gomove.example/register?ref=${sponsor.user.username}`)}`)
    status(plain, 200); status(pasted, 200)
    assert.equal(plain.body.sponsor.name, sponsor.user.name)
    assert.equal(pasted.body.sponsor.inviteCode, sponsor.user.inviteCode)
  })
  await t.test('03 — registro por ref username mantém vínculo e aparece na rede', async () => {
    const attempted = await register(`https://gomove.example/register?ref=${sponsor.user.username}`)
    // A failed alias must remain RED, but must not prevent testing the financial workflow.
    const registration = attempted.result.status === 201 ? attempted : await register(sponsor.user.inviteCode)
    child = status(registration.result, 201); childCpf = registration.cpf
    assert.equal(child.user.sponsorId, sponsor.user.id)
    const directs = status(await request('/network/directs?pageSize=100', undefined, sponsor.token), 200)
    assert.ok(directs.items.some((user: any) => user.id === child.user.id))
    status(attempted.result, 201)
    assert.equal(attempted.session.user.sponsorId, sponsor.user.id)
  })
  await t.test('04 — cota R$65 só confirma no webhook e torna cotista', async () => {
    childQuota = await quota(child, childCpf)
    assert.equal(childQuota.amountCents, 6500)
    assert.equal((await state(child)).business.membershipType, 'ASSOCIATE')
    status(await complete(childQuota, '65.00'), 200)
    const current = await state(child)
    assert.equal(current.business.membershipType, 'SHAREHOLDER')
    assert.equal(current.business.quotaAmountCents, 6500)
    assert.equal(current.business.earningCapTotalCents, 16250)
    assert.equal(current.business.earningCapCents, 9750)
    assert.equal(current.investments.find((row: any) => row.id === childQuota.id).paymentStatus, 'CONFIRMED')
  })
  await t.test('05 — direto 10% de R$65 = R$6,50; aprovação credita Rede uma vez', async () => {
    const entries = (await bonuses(sponsor)).filter(row => row.investmentId === childQuota.id)
    assert.equal(entries.length, 1)
    assert.equal(entries[0].amountCents, 650)
    assert.equal(entries[0].status, 'APPROVED')
    const current = await state(sponsor)
    assert.equal(current.business.wallets.redeCents, 650)
    assert.equal(current.business.wallets.cotaCents, 0)
    assert.equal(current.transactions.filter((row: any) => row.bonusEntryId === entries[0].id).length, 1)
  })
  await t.test('06 — métricas existentes reconciliam rede, cotas e ganhos (sem fórmula fictícia de pontos)', async () => {
    const network = status(await request('/network/summary', undefined, sponsor.token), 200)
    const current = await state(sponsor)
    assert.equal(network.directs, 1)
    assert.equal(network.networkSize, 1)
    assert.equal(network.activeNetwork, 1)
    assert.equal(network.approvedBonusCents, 650)
    assert.equal(network.approvedBonusCents, current.business.approvedBonusCents)
    assert.equal(network.earningCapConsumedCents, 650)
    assert.equal((await state(child)).business.quotaAmountCents, 6500)
    t.diagnostic('Não há contrato HTTP de pontos; validadas as métricas existentes, não inventada uma conversão.')
  })
  await t.test('07 — diário configurado 1%: cotista R$0,65; associado sem cota recebe zero diário', async () => {
    firstDaily = await daily('2099-01-01', 100)
    assert.equal(firstDaily.run.rateBps, 100)
    assert.equal(firstDaily.earnings.find((row: any) => row.userId === child.user.id).creditedAmountCents, 65)
    assert.equal(firstDaily.earnings.some((row: any) => row.userId === sponsor.user.id), false)
    const current = await state(child)
    assert.equal(current.business.dailyEarningCents, 65)
    assert.equal(current.business.wallets.cotaCents, 65)
    assert.equal((await state(sponsor)).business.dailyEarningCents, 0)
  })
  await t.test('08 — Unilevel real N1–N6: 10/9/8/7/6/5% sobre diário, creditado em Rede', async () => {
    const rule = status(await request('/admin/commission-rules?pageSize=100', undefined, admin.token), 200).items.find((row: any) => row.active)
    assert.equal(rule.directReferralBps, 1000)
    assert.deepEqual(rule.levels.map((row: any) => row.bps), [1000, 900, 800, 700, 600, 500])
    const n1 = firstDaily.bonuses.find((row: any) => row.userId === sponsor.user.id && row.sourceUserId === child.user.id)
    assert.equal(n1.amountCents, 6) // floor(65 * 10%).
    const uplines = [sponsor]
    let parent = sponsor
    for (let i = 0; i < 5; i++) {
      const registration = await register(parent.user.inviteCode)
      parent = status(registration.result, 201)
      await plan(parent, registration.cpf)
      uplines.push(parent)
    }
    const leafRegistration = await register(parent.user.inviteCode)
    const leaf = status(leafRegistration.result, 201)
    const payment = await quota(leaf, leafRegistration.cpf)
    status(await complete(payment, '65.00'), 200)
    const result = await daily('2099-01-02', 1000)
    const earning = result.earnings.find((row: any) => row.userId === leaf.user.id)
    assert.equal(earning.creditedAmountCents, 650)
    const expected = [65, 58, 52, 45, 39, 32]
    for (let level = 1; level <= 6; level++) {
      const recipient = uplines[6 - level]
      const bonus = result.bonuses.find((row: any) => row.sourceUserId === leaf.user.id && row.userId === recipient.user.id && row.level === level)
      assert.ok(bonus, `missing Unilevel N${level}`)
      assert.equal(bonus.amountCents, expected[level - 1])
      const ledger = (await state(recipient)).transactions.find((row: any) => row.bonusEntryId === bonus.id)
      assert.equal(ledger.wallet, 'REDE')
      assert.equal(Math.round(ledger.amount * 100), expected[level - 1])
    }
  })
  await t.test('09 — associado adquire R$65: confirmação MASTER promove, preservando teto 250%', async () => {
    sponsorQuota = await quota(sponsor, sponsorCpf)
    const confirmed = status(await request(`/admin/investments/${sponsorQuota.id}/confirm`, {}, admin.token), 200)
    assert.equal(confirmed.idempotent, false)
    const current = await state(sponsor)
    assert.equal(current.business.membershipType, 'SHAREHOLDER')
    assert.equal(current.business.quotaAmountCents, 6500)
    assert.equal(current.business.earningCapTotalCents, 16250)
    assert.equal(current.business.earningCapCents, 9750)
  })
  await t.test('10 — crédito MASTER atualiza Rede; ajuste Saldo é idempotente e não exige plano', async () => {
    const before = (await state(sponsor)).business.wallets.redeCents
    const manual = status(await request('/admin/bonus-entries/manual-credit', { userId: sponsor.user.id, amountCents: 1000, reason: 'Aceitação isolada, não crédito real' }, admin.token), 201)
    assert.equal(manual.status, 'PENDING')
    assert.equal((await state(sponsor)).business.wallets.redeCents, before)
    await approve(manual)
    assert.equal((await state(sponsor)).business.wallets.redeCents, before + 1000)
    const registration = await register()
    unpaid = status(registration.result, 201); unpaidCpf = registration.cpf
    status(await adjustment(unpaid, 'BALANCE', 10000, 'report-balance'), 201)
    const retry = status(await adjustment(unpaid, 'BALANCE', 10000, 'report-balance'), 200)
    assert.equal(retry.idempotent, true)
    const current = await state(unpaid)
    assert.equal(current.business.associatePlanStatus, 'PENDING')
    assert.equal(current.business.wallets.balanceCents, 10000)
    assert.equal(current.business.wallets.balanceWithdrawableCents, 10000)
  })
  await t.test('11 — saque: mínimo R$55, taxa6%, reserva, carência só Cota, Rede disponível e dashboard', async () => {
    const payload = { amount: 55, wallet: 'BALANCE', account: unpaidCpf, idempotencyKey: 'report-withdrawal' }
    status(await request('/withdrawals', { ...payload, amount: 54.99 }, unpaid.token), 422)
    withdrawal = status(await request('/withdrawals', payload, unpaid.token), 201)
    assert.equal(withdrawal.feeBps, 600)
    assert.equal(withdrawal.feeCents, 330)
    assert.equal(withdrawal.netCents, 5170)
    assert.equal(calls.find(row => row.route.includes('/withdrawals') && row.body.pixKey === unpaidCpf)?.body.amount, 51.7)
    const retry = status(await request('/withdrawals', payload, unpaid.token), 200)
    assert.equal(retry.id, withdrawal.id)
    const current = await state(unpaid)
    assert.equal(current.business.wallets.reservedBalanceCents, 5500)
    assert.equal(current.business.wallets.balanceAvailableCents, 4500)
    const account = status(await request(`/admin/associates/${unpaid.user.id}/account`, undefined, admin.token), 200)
    assert.deepEqual(account.wallets, current.business.wallets)
    assert.equal(account.withdrawals.filter((row: any) => row.id === withdrawal.id).length, 1)
    status(await adjustment(sponsor, 'COTA', 10000, 'report-carencia-COTA'), 201)
    const beforeCotaCalls = calls.length
    const cotaResult = await request('/withdrawals', { amount: 55, wallet: 'COTA', account: sponsorCpf, idempotencyKey: 'report-young-COTA' }, sponsor.token)
    status(cotaResult, 422)
    assert.match(cotaResult.body.error, /30|carência/i)
    assert.equal(calls.length, beforeCotaCalls, 'Cota sem maturação não deve chamar payout')
    const cotaState = await state(sponsor)
    assert.equal(cotaState.business.wallets.reservedCotaCents, 0)
    assert.equal(cotaState.business.wallets.cotaAvailableForWithdrawalCents, 0)
    assert.equal(cotaState.withdrawals.some((row: any) => row.idempotencyKey === 'report-young-COTA'), false)

    status(await adjustment(sponsor, 'REDE', 10000, 'report-available-REDE'), 201)
    const beforeRede = (await state(sponsor)).business.wallets
    assert.equal(beforeRede.hasActivePackage, true)
    assert.ok(beforeRede.redeWithdrawableCents >= 5500)
    const beforeRedeCalls = calls.length
    const redeWithdrawal = status(await request('/withdrawals', { amount: 55, wallet: 'REDE', account: sponsorCpf, idempotencyKey: 'report-young-REDE' }, sponsor.token), 201)
    assert.equal(redeWithdrawal.wallet, 'REDE')
    assert.equal(redeWithdrawal.amountCents, 5500)
    assert.equal(redeWithdrawal.feeBps, 600)
    assert.equal(redeWithdrawal.feeCents, 330)
    assert.equal(redeWithdrawal.netCents, 5170)
    assert.equal(calls.length, beforeRedeCalls + 1)
    assert.ok(calls[beforeRedeCalls].route.includes('/withdrawals'))
    assert.equal(calls[beforeRedeCalls].body.pixKey, sponsorCpf)
    assert.equal(calls[beforeRedeCalls].body.amount, 51.7)
    const redeState = await state(sponsor)
    assert.equal(redeState.business.wallets.redeCents, beforeRede.redeCents)
    assert.equal(redeState.business.wallets.reservedRedeCents, beforeRede.reservedRedeCents + 5500)
    assert.equal(redeState.business.wallets.redeWithdrawableCents, beforeRede.redeWithdrawableCents - 5500)
    assert.equal(redeState.withdrawals.filter((row: any) => row.id === redeWithdrawal.id).length, 1)
    const redeAccount = status(await request(`/admin/associates/${sponsor.user.id}/account`, undefined, admin.token), 200)
    assert.deepEqual(redeAccount.wallets, redeState.business.wallets)
    const dashboard = status(await request('/admin/dashboard', undefined, admin.token), 200)
    const listed = status(await request('/admin/withdrawals?pageSize=100', undefined, admin.token), 200).items
    assert.equal(dashboard.pendingWithdrawals, listed.filter((row: any) => row.status === 'Pendente').length)
    assert.ok(dashboard.shareholders >= 3)

  })
  await t.test('12 — repetir indicação por ref username de cotista: vínculo, cota, direto10%, diário e Unilevel', async () => {
    assert.equal((await state(sponsor)).business.membershipType, 'SHAREHOLDER')
    const registration = await register(`https://gomove.example/register?ref=${sponsor.user.username}`)
    const invited = status(registration.result, 201)
    assert.equal(invited.user.sponsorId, sponsor.user.id)
    const payment = await quota(invited, registration.cpf)
    status(await complete(payment, '65.00'), 200)
    const entry = (await bonuses(sponsor)).find(row => row.investmentId === payment.id)
    assert.equal(entry.amountCents, 650)
    assert.equal(entry.status, 'APPROVED')
    const result = await daily('2099-01-03', 100)
    assert.equal(result.earnings.find((row: any) => row.userId === invited.user.id).creditedAmountCents, 65)
    assert.equal(result.earnings.find((row: any) => row.userId === sponsor.user.id).creditedAmountCents, 65)
    assert.equal(result.bonuses.find((row: any) => row.sourceUserId === invited.user.id && row.userId === sponsor.user.id).amountCents, 6)
    assert.equal((await state(sponsor)).business.earningCapTotalCents, 16250)
  })
  await t.test('13 — repetir webhook/MASTER/diário não duplica evento, crédito ou cobrança', async () => {
    const before = readDb()
    const counts = [before.commissionEvents.length, before.bonusEntries.length, before.transactions.length, before.investments.length, before.invoices.length]
    const providerCalls = calls.length
    assert.equal(status(await complete(planPayment, '55.00'), 200).idempotent, true)
    assert.equal(status(await complete(childQuota, '65.00'), 200).idempotent, true)
    assert.equal(status(await request(`/admin/investments/${sponsorQuota.id}/confirm`, {}, admin.token), 200).idempotent, true)
    assert.equal(status(await request(`/admin/daily-profitabilities/${firstDaily.run.id}/process`, {}, admin.token), 200).idempotent, true)
    const afterDb = readDb()
    assert.deepEqual([afterDb.commissionEvents.length, afterDb.bonusEntries.length, afterDb.transactions.length, afterDb.investments.length, afterDb.invoices.length], counts)
    assert.equal(calls.length, providerCalls)
    assert.equal(status(await request('/withdrawals', undefined, unpaid.token), 200).length, 1)
  })
})
