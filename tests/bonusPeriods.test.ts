import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { summarizeBonusPeriods } from '../src/bonusPeriods'

test('summarizes credited bonuses for today, current week and current month in Sao Paulo', () => {
  const bonuses = [
    { id: 'today', userId: 'user-1', amountCents: 1000, status: 'APPROVED', createdAt: '2026-08-14T13:00:00Z' },
    { id: 'week', userId: 'user-1', amountCents: 2000, status: 'APPROVED', createdAt: '2026-08-11T13:00:00Z' },
    { id: 'month', userId: 'user-1', amountCents: 3000, status: 'APPROVED', createdAt: '2026-08-02T13:00:00Z' },
    { id: 'old', userId: 'user-1', amountCents: 4000, status: 'APPROVED', createdAt: '2026-07-31T13:00:00Z' },
  ]
  assert.deepEqual(summarizeBonusPeriods('user-1', bonuses, [], new Date('2026-08-14T15:00:00Z')), {
    todayCents: 1000,
    weekCents: 3000,
    monthCents: 6000,
  })
})

test('uses the credit timestamp, includes reversals and does not double count ledger entries', () => {
  const bonuses = [
    { id: 'approved-earlier', userId: 'user-1', amountCents: 5000, status: 'APPROVED', createdAt: '2026-07-01T12:00:00Z' },
    { id: 'reversal', userId: 'user-1', amountCents: -1000, status: 'APPROVED', createdAt: '2026-08-14T12:00:00Z' },
  ]
  const transactions = [
    { userId: 'user-1', bonusEntryId: 'approved-earlier', amount: 50, createdAt: '2026-08-14T13:00:00Z' },
    { userId: 'user-1', bonusEntryId: 'reversal', amount: -10, createdAt: '2026-08-14T13:30:00Z' },
  ]
  assert.deepEqual(summarizeBonusPeriods('user-1', bonuses, transactions, new Date('2026-08-14T15:00:00Z')), {
    todayCents: 4000,
    weekCents: 4000,
    monthCents: 4000,
  })
})
