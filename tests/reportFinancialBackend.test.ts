import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { validateWithdrawal } from '../src/wallets.ts'
import { createRegistration } from '../server/mlm.ts'

// No real environment, database or provider is allowed in this harness.
const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || 'C:/Users/ntbk/AppData/Local/hermes/cache/scratch', 'move-financial-'))
Object.assign(process.env, { NODE_ENV: 'test', DATABASE_URL: '', DOTENV_CONFIG_PATH: path.join(dir, 'nonexistent.env'), GOMOVE_DATA_FILE: path.join(dir, 'db.json'), GOMOVE_VIEWER_ADMINS: '', TWOPP_API_KEY: '', TWOPP_API_SECRET: '', CRON_SECRET: '' })
const { app, readDb, writeDb } = await import('../server/index.ts')
const server = app.listen(0, '127.0.0.1')
await new Promise<void>(resolve => server.listening ? resolve() : server.once('listening', resolve))
const base = `http://127.0.0.1:${(server.address() as any).port}/api`
after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); fs.rmSync(dir, { recursive: true, force: true }) })
const original = structuredClone(readDb())
function fixture() {
  const db = structuredClone(original)
  for (const key of ['investments', 'invoices', 'transactions', 'withdrawals', 'commissionEvents', 'bonusEntries', 'dailyProfitabilities', 'dailyProfitabilityRuns']) db[key] = []
  db.auditLogs = [{ id: 'test-reset', action: 'FINANCIAL_RESET' }]
  db.users.find((u: any) => u.username === 'matheus')!.membershipType = 'ASSOCIATE'
  db.sessions = { testmaster: { userId: db.users[0].id, expiresAt: '2099-01-01T00:00:00.000Z' } }
  writeDb(db)
  return db
}
async function request(route: string, body?: any, token = 'testmaster', method = body === undefined ? 'GET' : 'POST') {
  const res = await fetch(`${base}${route}`, { method, headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  return { status: res.status, body: await res.json() as any }
}
async function daily(db: any, amountCents = 650000) {
  const child = db.users.find((u: any) => u.username === 'bruno')!
  child.membershipType = 'SHAREHOLDER'
  db.investments = [{ id: 'fixture-quota', userId: child.id, amountCents, amount: amountCents / 100, status: 'Ativo', paymentStatus: 'CONFIRMED' }]
  writeDb(db)
  const scheduled = await request('/admin/daily-profitabilities', { date: '2026-10-01', rateBps: 100 })
  assert.equal(scheduled.status, 201)
  return request(`/admin/daily-profitabilities/${scheduled.body.run.id}/process`, {})
}

test('R$55 plan activates eligibility but creates no commission, daily earning or wallet credit', async () => {
  const db = fixture(), child = db.users.find((u: any) => u.username === 'bruno')!
  child.associatePlanStatus = 'PENDING'
  db.invoices = [{ id: 'plan55', userId: child.id, productType: 'ASSOCIATE_PLAN', amount: 55, amountCents: 5500, paymentStatus: 'PENDING', status: 'Aguardando pagamento' }]
  writeDb(db)
  assert.equal((await request(`/admin/associates/${child.id}/reconcile`, { kind: 'invoices', recordId: 'plan55', reference: 'fixture55', reason: 'Controlled test only' })).status, 200)
  const scheduled = await request('/admin/daily-profitabilities', { date: '2026-10-02', rateBps: 100 })
  const processed = await request(`/admin/daily-profitabilities/${scheduled.body.run.id}/process`, {})
  assert.equal(processed.body.earnings.length, 0)
  assert.equal(processed.body.bonuses.length, 0)
  const persisted = readDb()
  assert.equal(persisted.commissionEvents.length, 0)
  assert.equal(persisted.bonusEntries.length, 0)
  assert.equal(persisted.transactions.length, 0)
  assert.equal(persisted.users.find((u: any) => u.id === child.id)?.associatePlanStatus, 'ACTIVE')
})

test('daily uses the configured Unilevel percentages and preserves the shareholder cap', async () => {
  const db = fixture(), child = db.users.find((u: any) => u.username === 'bruno')!, sponsor = db.users.find((u: any) => u.username === 'ana')!
  db.commissionRules.find((r: any) => r.active)!.levels = [{ level: 1, bps: 2000 }, { level: 2, bps: 500 }]
  db.bonusEntries = [{ id: 'used-shareholder-cap', userId: child.id, amountCents: 9600, type: 'MANUAL', status: 'APPROVED' }]
  // Quota 65 yields 65 cents; remaining lifetime capacity = 9750 - 9600 = 150.
  const result = await daily(db, 6500)
  assert.equal(result.body.earnings[0].creditedAmountCents, 65)
  assert.equal(result.body.bonuses.find((b: any) => b.userId === sponsor.id)?.amountCents, 13)
  const ownTx = readDb().transactions.find((t: any) => t.userId === child.id)!
  assert.equal(ownTx.wallet, 'COTA')
  const scheduled = await request('/admin/daily-profitabilities', { date: '2026-10-02', rateBps: 10000 })
  const capped = await request(`/admin/daily-profitabilities/${scheduled.body.run.id}/process`, {})
  assert.equal(capped.body.earnings[0].creditedAmountCents, 85)
  assert.equal(capped.body.earnings[0].cappedAmountCents, 6415)
  assert.equal(capped.body.bonuses.find((b: any) => b.userId === sponsor.id)?.amountCents, 17)
  assert.throws(() => validateWithdrawal(readDb(), readDb().users.find((u: any) => u.id === child.id)!, 55, 'COTA'), /30 dias/)
})

test('manual bonus keeps approval workflow and is withdrawable in REDE, not subject to COTA carencia', async () => {
  const db = fixture(), user = db.users.find((u: any) => u.username === 'ana')!
  const credit = await request('/admin/bonus-entries/manual-credit', { userId: user.id, amountCents: 6000, reason: 'Controlled manual test' })
  assert.equal(credit.status, 201)
  assert.equal(credit.body.status, 'PENDING')
  assert.equal(readDb().transactions.length, 0)
  assert.equal((await request(`/admin/bonus-entries/${credit.body.id}/approve`, {})).status, 200)
  assert.equal((await request(`/admin/bonus-entries/${credit.body.id}/approve`, {})).status, 422)
  let persisted = readDb()
  assert.equal(persisted.transactions.length, 1)
  assert.equal(persisted.transactions[0].wallet, 'REDE')
  assert.deepEqual(validateWithdrawal(persisted, user, 60, 'REDE'), { amountCents: 6000, feeBps: 600, feeCents: 360, netCents: 5640, wallet: 'REDE' })
  assert.throws(() => validateWithdrawal(persisted, user, 54, 'REDE'), /mínimo/)
  const reversed = await request(`/admin/bonus-entries/${credit.body.id}/reverse`, { reason: 'Controlled reversal' })
  assert.equal(reversed.status, 201, JSON.stringify(reversed.body))
  persisted = readDb()
  assert.equal(persisted.transactions.reduce((sum: number, t: any) => sum + Math.round(t.amount * 100), 0), 0)
  assert.equal((await request(`/admin/associates/${user.id}/account`)).body.wallets.redeCents, 0)
})

test('MASTER balance credit is idempotent, available without a plan, and reserves requested withdrawals', async () => {
  const db = fixture(), user = db.users.find((u: any) => u.username === 'ana')!
  user.associatePlanStatus = 'PENDING'
  writeDb(db)
  const payload = { amountCents: 10000, reason: 'Controlled balance credit', reference: 'balance-fixture', wallet: 'BALANCE' }
  assert.equal((await request(`/admin/associates/${user.id}/balance-adjustments`, payload)).status, 201)
  assert.equal((await request(`/admin/associates/${user.id}/balance-adjustments`, payload)).body.idempotent, true)
  assert.equal((await request(`/admin/associates/${user.id}/balance-adjustments`, { ...payload, amountCents: 11000 })).status, 409)
  const persisted = readDb()
  assert.equal(persisted.transactions.length, 1)
  assert.equal(validateWithdrawal(persisted, user, 100, 'BALANCE').netCents, 9400)
  persisted.withdrawals.push({ id: 'reserved-fixture', userId: user.id, amount: 60, status: 'Pendente', wallet: 'BALANCE' })
  writeDb(persisted)
  const account = await request(`/admin/associates/${user.id}/account`)
  assert.equal(account.body.wallets.balanceWithdrawableCents, 4000)
  assert.equal(account.body.wallets.reservedBalanceCents, 6000)
  assert.throws(() => validateWithdrawal(readDb(), user, 55, 'BALANCE'), /indisponível/)
  assert.equal((await request(`/admin/associates/${user.id}/balance-adjustments`, { ...payload, amountCents: -4500, reference: 'bad-debit' })).status, 422)
})

test('confirmed eligible quotas credit 10% directly to REDE without manual approval and retries do not duplicate', async () => {
  const db = fixture(), child = db.users.find((u: any) => u.username === 'bruno')!, sponsor = db.users.find((u: any) => u.id === child.sponsorId)!
  db.investments = [{ id: 'direct-65', userId: child.id, amountCents: 6500, amount: 65, status: 'Aguardando pagamento', paymentStatus: 'PENDING' }]
  writeDb(db)
  const confirmed = await request('/admin/investments/direct-65/confirm', {})
  assert.equal(confirmed.status, 200)
  assert.equal(confirmed.body.bonuses.length, 1)
  assert.equal(confirmed.body.bonuses[0].status, 'APPROVED')
  assert.equal(confirmed.body.bonuses[0].amountCents, 650)
  let persisted = readDb()
  assert.equal(persisted.transactions.filter((t: any) => t.bonusEntryId === confirmed.body.bonuses[0].id).length, 1)
  assert.equal((await request(`/admin/associates/${sponsor.id}/account`)).body.wallets.redeCents, 650)
  assert.equal((await request('/admin/investments/direct-65/confirm', {})).body.idempotent, true)
  persisted = readDb()
  assert.equal(persisted.transactions.filter((t: any) => t.bonusEntryId === confirmed.body.bonuses[0].id).length, 1)
  assert.equal(persisted.users.find((u: any) => u.id === child.id)?.membershipType, 'SHAREHOLDER')
})

test('unrelated admin edits preserve a legacy ambiguous code rather than blocking account maintenance', async () => {
  const db = fixture(), ana = db.users.find((u: any) => u.username === 'ana')!, bruno = db.users.find((u: any) => u.username === 'bruno')!
  bruno.inviteCode = 'ana'
  writeDb(db)
  const edited = await request(`/admin/associates/${ana.id}`, { name: 'Renamed legacy' }, 'testmaster', 'PATCH')
  assert.equal(edited.status, 200)
  assert.equal(edited.body.inviteCode, ana.inviteCode)
  assert.equal(readDb().users.find((u: any) => u.id === bruno.id)?.inviteCode, 'ana')
  assert.equal((await request('/public/invites/ana')).status, 404)
})

test('viewer generated invite codes also cannot shadow another account username', async () => {
  const db = fixture(), bruno = db.users.find((u: any) => u.username === 'bruno')!
  bruno.username = 'vis-010101'
  writeDb(db)
  const originalBytes = crypto.randomBytes
  try {
    crypto.randomBytes = ((size: number) => Buffer.alloc(size, 1)) as typeof crypto.randomBytes
    const created = await request('/admin/viewers', { username: 'viewernew', email: 'viewernew@example.invalid', password: 'fixture-password', name: 'Test' })
    assert.equal(created.status, 201)
    assert.notEqual(created.body.inviteCode, bruno.username)
  } finally { crypto.randomBytes = originalBytes }
})

test('generated invite codes cannot collide with another username', async () => {
  const db = fixture(), bruno = db.users.find((u: any) => u.username === 'bruno')!
  bruno.username = 'newinviteei'
  writeDb(db)
  const originalRandom = Math.random
  let calls = 0
  try {
    Math.random = () => calls++ === 0 ? 0.5 : 0.25
    const user = createRegistration(db.users, { username: 'newinvitee', email: 'newinvitee@example.invalid', passwordHash: 'test', name: 'Test' })
    assert.notEqual(user.inviteCode, bruno.username)
    calls = 0
    const created = await request('/admin/associates', { username: 'newinvitee', email: 'newinvitee@example.invalid', password: 'fixture-password', name: 'Test', cpf: '52998224725' })
    assert.equal(created.status, 201)
    assert.notEqual(created.body.inviteCode, bruno.username)
  } finally { Math.random = originalRandom }
})

test('ambiguous legacy username/code is rejected even when one owner is blocked', async () => {
  const db = fixture(), ana = db.users.find((u: any) => u.username === 'ana')!, bruno = db.users.find((u: any) => u.username === 'bruno')!
  bruno.inviteCode = 'ana'
  for (const status of ['ACTIVE', 'BLOCKED']) {
    bruno.status = status
    writeDb(db)
    assert.equal((await request('/public/invites/ana')).status, 404)
    assert.throws(() => createRegistration(db.users, { username: 'testambiguous', email: 'testambiguous@example.invalid', passwordHash: 'test', name: 'Test', inviteCode: 'ana' }), /active sponsor not found/)
  }
  ana.inviteCode = 'ana'
  db.users = db.users.filter((u: any) => u.id !== bruno.id)
  assert.equal(createRegistration(db.users, { username: 'sameowner', email: 'sameowner@example.invalid', passwordHash: 'test', name: 'Test', inviteCode: 'ana' }).sponsorId, ana.id)
})

test('a new username cannot take another account legacy invite code in registration or admin', async () => {
  const db = fixture()
  assert.throws(() => createRegistration(db.users, { username: 'ana01', email: 'cross@example.invalid', passwordHash: 'test', name: 'Test' }), /already exists/)
  const created = await request('/admin/associates', { username: 'ana01', email: 'cross@example.invalid', password: 'fixture-password', name: 'Test', cpf: '52998224725' })
  assert.equal(created.status, 409)
  const bruno = db.users.find((u: any) => u.username === 'bruno')!
  assert.equal((await request(`/admin/associates/${bruno.id}`, { username: 'ana01' }, 'testmaster', 'PATCH')).status, 409)
  assert.equal((await request('/admin/viewers', { username: 'ana01', email: 'viewer@example.invalid', password: 'fixture-password', name: 'Test' })).status, 409)
})

test('registration and public invite lookup accept username while preserving legacy invite codes', async () => {
  const db = fixture(), sponsor = db.users.find((u: any) => u.username === 'ana')!
  const input = { username: 'newinvitee', email: 'newinvitee@example.invalid', passwordHash: 'test-hash', name: 'Test' }
  assert.equal(createRegistration(db.users, { ...input, inviteCode: 'ANA' }).sponsorId, sponsor.id)
  assert.equal(createRegistration(db.users, { ...input, inviteCode: sponsor.inviteCode }).sponsorId, sponsor.id)
  const result = await request('/public/invites/ana')
  assert.equal(result.status, 200)
  assert.equal(result.body.sponsor.inviteCode, sponsor.inviteCode)
  assert.equal(result.body.sponsor.username, sponsor.username)
})

test('legacy Unilevel transactions wrongly normalized as COTA are repaired without touching daily yields', () => {
  const db = fixture(), sponsor = db.users.find((u: any) => u.username === 'ana')!
  db.bonusEntries.push({ id: 'legacy-unilevel', userId: sponsor.id, amountCents: 6000, status: 'APPROVED', type: 'UNILEVEL_PROFITABILITY' })
  db.transactions.push({ id: 'legacy-credit', userId: sponsor.id, amount: 60, wallet: 'COTA', bonusEntryId: 'legacy-unilevel', dailyProfitabilityId: 'source-daily' }, { id: 'real-daily', userId: sponsor.id, amount: 2, wallet: 'COTA', dailyProfitabilityId: 'own-daily' })
  writeDb(db)
  const persisted = readDb()
  assert.equal(persisted.transactions.find((t: any) => t.id === 'legacy-credit')?.wallet, 'REDE')
  assert.equal(persisted.transactions.find((t: any) => t.id === 'real-daily')?.wallet, 'COTA')
  assert.equal(validateWithdrawal(persisted, sponsor, 60, 'REDE').amountCents, 6000)
})

test('associate Unilevel overflow remains blocked for upgrade, not shareholder-capped', async () => {
  const db = fixture(), sponsor = db.users.find((u: any) => u.username === 'ana')!
  db.bonusEntries.push({ id: 'used-cap', userId: sponsor.id, amountCents: 49900, status: 'APPROVED', type: 'DIRECT_REFERRAL' })
  const result = await daily(db)
  assert.equal(result.status, 200)
  const bonuses = readDb().bonusEntries.filter((b: any) => b.userId === sponsor.id && b.type === 'UNILEVEL_PROFITABILITY')
  assert.equal(bonuses.find((b: any) => b.status === 'APPROVED')?.amountCents, 100)
  assert.equal(bonuses.find((b: any) => b.status === 'BLOCKED_UPGRADE')?.amountCents, 550)
  assert.equal(bonuses.some((b: any) => b.status === 'CAPPED_250_PERCENT'), false)
})

test('Unilevel is a REDE credit withdrawable by an active associate with no quota', async () => {
  const db = fixture(), sponsor = db.users.find((u: any) => u.username === 'ana')!
  const result = await daily(db)
  assert.equal(result.status, 200)
  const persisted = readDb(), bonus = persisted.bonusEntries.find((b: any) => b.userId === sponsor.id)!
  assert.equal(bonus.amountCents, 650)
  const transaction = persisted.transactions.find((t: any) => t.bonusEntryId === bonus.id)!
  assert.equal(transaction.wallet, 'REDE', 'Unilevel must not inherit the daily source COTA wallet')
  const summary = await request(`/admin/associates/${sponsor.id}/account`)
  assert.equal(summary.body.wallets.redeCents, 650)
  assert.equal(summary.body.wallets.cotaCents, 0)
  assert.equal(summary.body.wallets.redeWithdrawableCents, 650)
  const retry = await request(`/admin/daily-profitabilities/${result.body.run.id}/process`, {})
  assert.equal(retry.body.idempotent, true)
  assert.equal(readDb().transactions.filter((t: any) => t.bonusEntryId === bonus.id).length, 1)
})
