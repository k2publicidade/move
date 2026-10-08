import test from 'node:test'
import assert from 'node:assert/strict'
import { createDemoDatabase, demoRequest } from '../src/demoBackend.js'

const values = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
  removeItem: (key: string) => values.delete(key),
} })
const databaseKey = 'gomove-demo-database-v4'
const persisted = () => JSON.parse(values.get(databaseKey)!)
const admin = 'demo:admin'

function isolatedDatabase() {
  const db = createDemoDatabase()
  db.transactions = []
  db.withdrawals = []
  db.bonusEntries = []
  values.set(databaseKey, JSON.stringify(db))
  return db
}

test('demo confirmed quota automatically approves direct 650-cent commission and credits REDE exactly once', async () => {
  isolatedDatabase()
  const quota = await demoRequest<any>('/admin/investments', 'POST', { userId: 'usr-camila', pack: 'Cotas GoMove', amount: 65, status: 'Aguardando pagamento' }, admin)
  const route = `/admin/investments/${quota.id}/confirm`
  const result = await demoRequest<any>(route, 'POST', {}, admin)
  assert.equal(result.bonuses.length, 1)
  const bonus = result.bonuses[0]
  assert.equal(bonus.amountCents, 650)
  assert.equal(bonus.status, 'APPROVED')
  let state = await demoRequest<any>('/state', 'GET', undefined, 'demo:ana')
  assert.equal(state.business.wallets.redeCents, 650)
  assert.equal(state.business.wallets.cotaCents, 0)
  assert.equal(state.business.wallets.balanceCents, 0)
  assert.equal(state.transactions.filter((entry: any) => entry.bonusEntryId === bonus.id).length, 1)
  assert.equal(state.transactions.find((entry: any) => entry.bonusEntryId === bonus.id).wallet, 'REDE')
  assert.equal((await demoRequest<any>(route, 'POST', {}, admin)).idempotent, true)
  await assert.rejects(() => demoRequest(`/admin/bonus-entries/${bonus.id}/approve`, 'POST', {}, admin), /pendentes/)
  state = await demoRequest<any>('/state', 'GET', undefined, 'demo:ana')
  assert.equal(state.business.wallets.redeCents, 650)
  assert.equal(persisted().commissionEvents.filter((event: any) => event.investmentId === quota.id).length, 1)
  assert.equal(persisted().transactions.filter((entry: any) => entry.bonusEntryId === bonus.id).length, 1)
})

test('demo Unilevel blocks associate excess for upgrade, preserves caps and replays without duplicate credits', async () => {
  const db = isolatedDatabase()
  db.users.find(user => user.id === 'usr-camila')!.membershipType = 'SHAREHOLDER'
  db.investments.push({ id: 'camila-quota', userId: 'usr-camila', amount: 650, amountCents: 65000, status: 'Ativo', paymentStatus: 'CONFIRMED' })
  db.bonusEntries.push({ id: 'consumed', userId: 'usr-ana', amountCents: 49900, status: 'APPROVED', type: 'MANUAL', reason: 'Consumed cap fixture' })
  db.transactions.push({ id: 'consumed-credit', userId: 'usr-ana', bonusEntryId: 'consumed', wallet: 'REDE', amount: 499, status: 'Crédito' })
  values.set(databaseKey, JSON.stringify(db))
  const scheduled = await demoRequest<any>('/admin/daily-profitabilities', 'POST', { date: '2026-10-08', rateBps: 1000 }, admin)
  const route = `/admin/daily-profitabilities/${scheduled.run.id}/process`
  const result = await demoRequest<any>(route, 'POST', {}, admin)
  const bonuses = result.bonuses.filter((entry: any) => entry.userId === 'usr-ana')
  const approved = bonuses.find((entry: any) => entry.status === 'APPROVED')
  assert.equal(approved.amountCents, 100)
  const blocked = bonuses.find((entry: any) => entry.status === 'BLOCKED_UPGRADE')
  assert.equal(blocked?.amountCents, 550)
  assert.equal(bonuses.some((entry: any) => entry.status === 'CAPPED_250_PERCENT'), false)
  assert.match(blocked.reason, /upgrade/)
  assert.equal(persisted().transactions.find((entry: any) => entry.bonusEntryId === approved.id).wallet, 'REDE')
  assert.equal(persisted().transactions.some((entry: any) => entry.bonusEntryId === blocked.id), false)
  const state = await demoRequest<any>('/state', 'GET', undefined, 'demo:ana')
  assert.equal(state.business.blockedBonusCents, 550)
  assert.equal(state.business.wallets.redeCents, 50000)
  assert.equal(state.business.wallets.cotaCents, 0)
  assert.equal((await demoRequest<any>(route, 'POST', {}, admin)).idempotent, true)
  assert.equal(persisted().transactions.filter((entry: any) => entry.bonusEntryId === approved.id).length, 1)
  await assert.rejects(() => demoRequest('/admin/investments', 'POST', { userId: 'usr-ana', pack: 'Cotas GoMove', amount: 60, status: 'Aguardando pagamento' }, admin), /Upgrade obrigatório/)
  const quota = await demoRequest<any>('/admin/investments', 'POST', { userId: 'usr-ana', pack: 'Cotas GoMove', amount: 400, status: 'Aguardando pagamento' }, admin)
  const confirmation = `/admin/investments/${quota.id}/confirm`
  await demoRequest(confirmation, 'POST', {}, admin)
  assert.equal(persisted().users.find((user: any) => user.id === 'usr-ana').membershipType, 'SHAREHOLDER')
  assert.equal(persisted().bonusEntries.find((entry: any) => entry.id === blocked.id).status, 'PENDING')
  assert.equal((await demoRequest<any>(confirmation, 'POST', {}, admin)).idempotent, true)
  await demoRequest(`/admin/bonus-entries/${blocked.id}/approve`, 'POST', {}, admin)
  const upgraded = await demoRequest<any>('/state', 'GET', undefined, 'demo:ana')
  assert.equal(upgraded.business.blockedBonusCents, 0)
  assert.equal(upgraded.business.wallets.redeCents, 50550)
  assert.equal(upgraded.business.earningCapConsumedCents, 50550)
  assert.equal(upgraded.business.earningCapRemainingCents, 9450)
  assert.equal(persisted().transactions.filter((entry: any) => entry.bonusEntryId === blocked.id).length, 1)
})

test('demo administrative manual credits still require approval before funding REDE', async () => {
  isolatedDatabase()
  const bonus = await demoRequest<any>('/admin/bonus-entries/manual-credit', 'POST', { userId: 'usr-ana', amountCents: 650, reason: 'Isolated manual credit' }, admin)
  assert.equal(bonus.status, 'PENDING')
  assert.equal(persisted().transactions.length, 0)
  await demoRequest(`/admin/bonus-entries/${bonus.id}/approve`, 'POST', {}, admin)
  const state = await demoRequest<any>('/state', 'GET', undefined, 'demo:ana')
  assert.equal(state.business.wallets.redeCents, 650)
  assert.equal(state.transactions.filter((entry: any) => entry.bonusEntryId === bonus.id).length, 1)
})
