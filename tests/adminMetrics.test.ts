import test from 'node:test'
import assert from 'node:assert/strict'
import { adminDateKey, summarizeAdminMetrics } from '../src/adminMetrics'

test('admin calendar respects Sao Paulo midnight and legacy dates', () => {
  assert.equal(adminDateKey('2026-09-07T02:59:59Z'), '2026-09-06')
  assert.equal(adminDateKey('2026-09-07T03:00:00Z'), '2026-09-07')
  assert.equal(adminDateKey('06/09/2026'), '2026-09-06')
  assert.equal(adminDateKey('31/02/2026'), null)
  assert.equal(adminDateKey('—'), null)
})

test('counts participants and actual cash, excludes pending and wallet reuse', () => {
  const result = summarizeAdminMetrics({
    users: [{ id: 'admin', role: 'ADMIN_MASTER', status: 'ACTIVE' }, { id: 'a', role: 'ASSOCIATE', status: 'ACTIVE' }, { id: 'b', role: 'ASSOCIATE', status: 'BLOCKED', createdAt: '2026-09-06' }, { id: 'legacy', role: 'ASSOCIATE' }],
    auditLogs: [{ action: 'REGISTER', targetType: 'USER', targetId: 'a', createdAt: '2026-09-07T02:00:00Z' }],
    invoices: [
      { amount: 100, paymentStatus: 'CONFIRMED', paidAt: '2026-09-06', productType: 'DEPOSIT' },
      { amount: 55, paymentStatus: 'CONFIRMED', paidAt: '2026-09-06', paymentProvider: 'WALLET' },
      { amount: 90, paymentStatus: 'PENDING', createdAt: '2026-09-06' },
      { amount: 10, status: 'Pago' },
    ],
    investments: [{ amountCents: 30000, paymentStatus: 'CONFIRMED', confirmedAt: '2026-09-07T02:00:00Z' }, { amount: 50, paymentStatus: 'CONFIRMED', confirmedAt: '2026-09-05' }],
    withdrawals: [{ amount: 50, status: 'Pago', paidAt: '06/09/2026', date: '01/09/2026' }, { amount: 99, status: 'Pendente', date: '06/09/2026' }],
  }, new Date('2026-09-06T18:00:00Z'))
  assert.equal(result.peopleTotal, 3)
  assert.equal(result.registrationsToday, 2)
  assert.equal(result.activeRegistrationsToday, 1)
  assert.equal(result.cashInTodayCents, 40000)
  assert.equal(result.cashInTotalCents, 46000)
  assert.equal(result.cashOutTodayCents, 5000)
  assert.equal(result.cashOutTotalCents, 5000)
  assert.equal(result.registrationsWithoutDate, 1)
  assert.equal(result.paymentsWithoutDate, 1)
})
