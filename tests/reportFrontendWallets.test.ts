import test from 'node:test'
import assert from 'node:assert/strict'
import { transactionWallet, walletSummary } from '../src/wallets.js'
import { createDemoDatabase, demoRequest } from '../src/demoBackend.js'

test('persisted demo repairs only proven daily Unilevel credits incorrectly stored in Cota', async () => {
  const db = createDemoDatabase()
  db.bonusEntries.push({ id: 'bonus-legacy', userId: 'usr-matheus', amountCents: 1000, status: 'APPROVED', type: 'UNILEVEL_PROFITABILITY' })
  db.transactions = [
    { id: 'legacy', userId: 'usr-matheus', amount: 10, bonusEntryId: 'bonus-legacy', dailyProfitabilityId: 'daily-source', wallet: 'COTA' },
    { id: 'own-daily', userId: 'usr-matheus', amount: 20, dailyProfitabilityId: 'own', wallet: 'COTA' },
  ]
  let stored = JSON.stringify(db)
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => stored, setItem: (_: string, value: string) => { stored = value } } })
  const state = await demoRequest<any>('/state', 'GET', undefined, 'demo:matheus')
  assert.equal(state.business.wallets.redeCents, 1000)
  assert.equal(state.business.wallets.cotaCents, 2000)
})

test('demo wallet migration preserves explicit BALANCE/REDE and unproven bonuses across repeated loads', async () => {
  const db = createDemoDatabase()
  db.bonusEntries.push({ id: 'proven-unilevel', userId: 'usr-matheus', amountCents: 1000, status: 'APPROVED', type: 'UNILEVEL_PROFITABILITY' })
  db.transactions = [
    { id: 'balance', userId: 'usr-matheus', amount: 1, bonusEntryId: 'proven-unilevel', dailyProfitabilityId: 'daily', wallet: 'BALANCE' },
    { id: 'rede', userId: 'usr-matheus', amount: 2, bonusEntryId: 'proven-unilevel', dailyProfitabilityId: 'daily', wallet: 'REDE' },
    { id: 'missing-bonus', userId: 'usr-matheus', amount: 3, bonusEntryId: 'nonexistent', dailyProfitabilityId: 'daily', wallet: 'COTA' },
    { id: 'unclassified-proven', userId: 'usr-matheus', amount: 4, bonusEntryId: 'proven-unilevel', dailyProfitabilityId: 'daily' },
  ]
  let stored = JSON.stringify(db)
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => stored, setItem: (_: string, value: string) => { stored = value } } })
  for (let load = 0; load < 2; load += 1) {
    const state = await demoRequest<any>('/state', 'GET', undefined, 'demo:matheus')
    assert.equal(state.business.wallets.balanceCents, 100)
    assert.equal(state.business.wallets.redeCents, 600)
    assert.equal(state.business.wallets.cotaCents, 300)
    // Normalization is persisted on the next ordinary write, not a read-only state request.
    await demoRequest('/profile', 'PUT', {}, 'demo:matheus')
    assert.deepEqual(JSON.parse(stored).transactions.map((entry: any) => [entry.id, entry.wallet]), [
      ['balance', 'BALANCE'], ['rede', 'REDE'], ['missing-bonus', 'COTA'], ['unclassified-proven', 'REDE'],
    ])
  }
})

test('Unilevel generated from daily profitability credits Rede, not Cota', () => {
  const commission = { userId: 'u', amount: 100, dailyProfitabilityId: 'daily-1', bonusEntryId: 'bonus-1' }
  assert.equal(transactionWallet(commission), 'REDE')
  const db = { transactions: [commission, { userId: 'u', amount: 50, dailyProfitabilityId: 'daily-2' }], withdrawals: [], investments: [] }
  const summary = walletSummary(db, { id: 'u', status: 'ACTIVE', associatePlanStatus: 'ACTIVE' })
  assert.equal(summary.redeCents, 10000)
  assert.equal(summary.cotaCents, 5000)
})
