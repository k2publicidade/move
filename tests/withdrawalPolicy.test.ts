import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cotaWithdrawalWeekKey, normalizeCpf, validatePixKey, validateWithdrawal, walletSummary, withdrawalAmounts, updateWithdrawal } from '../src/wallets.js'

test('CPF validation accepts formatting and rejects missing, repeated, invalid check digits and letters', () => {
  assert.equal(normalizeCpf('529.982.247-25'), '52998224725')
  for (const invalid of ['', undefined, '11111111111', '52998224724', 'abc52998224725']) {
    assert.throws(() => normalizeCpf(invalid), /CPF/)
  }
  assert.equal(validatePixKey(undefined, '529.982.247-25'), '52998224725')
  assert.equal(validatePixKey('529.982.247-25', '52998224725'), '52998224725')
  assert.throws(() => validatePixKey('11144477735', '52998224725'), /titular/)
  assert.throws(() => validatePixKey('52998224725'), /Cadastre um CPF válido/)
  assert.throws(() => validatePixKey(undefined, '11111111111'), /CPF válido/)
})

test('six percent is rounded in cents and applies to both wallets, including the first Cota withdrawal', () => {
  assert.deepEqual(withdrawalAmounts(100), { amountCents: 10000, feeBps: 600, feeCents: 600, netCents: 9400 })
  assert.deepEqual(withdrawalAmounts(55), { amountCents: 5500, feeBps: 600, feeCents: 330, netCents: 5170 })
  assert.deepEqual(withdrawalAmounts(55.09), { amountCents: 5509, feeBps: 600, feeCents: 331, netCents: 5178 })
  assert.throws(() => withdrawalAmounts(55.009), /duas casas/)
  const user = { id: 'u', status: 'ACTIVE', associatePlanStatus: 'ACTIVE', shareholderSince: '2026-01-01' }
  const db = { users: [user], investments: [], withdrawals: [] as any[], transactions: ['COTA', 'REDE'].map(wallet => ({ userId: 'u', wallet, amount: 300 })) }
  const date = new Date('2026-09-15T12:00:00-03:00')
  for (const wallet of ['COTA', 'REDE'] as const) {
    const result = validateWithdrawal(db, user, 100, wallet, undefined, date)
    assert.equal(result.feeCents, 600)
    assert.equal(result.netCents, 9400)
  }
  db.withdrawals.push({ id: 'old', userId: 'u', wallet: 'COTA', amount: 55, status: 'Pago', createdAt: '2026-09-01' })
  assert.equal(validateWithdrawal(db, user, 100, 'COTA', undefined, date).feeCents, 600)
})

test('MASTER uses the registered CPF and computes fees; editing preserves existing financial terms', () => {
  const user = { id: 'u', status: 'ACTIVE', associatePlanStatus: 'ACTIVE' }
  const db = { users: [user], profiles: { u: { cpf: '52998224725' } }, investments: [], withdrawals: [] as any[], transactions: [{ userId: 'u', wallet: 'REDE', amount: 300 }] as any[] }
  const item: any = { id: 'w', userId: 'u', amount: 100, wallet: 'REDE', status: 'Pendente', feeCents: 0, netCents: 10000 }
  updateWithdrawal(db, item, { status: 'Pendente' }, () => 'ledger')
  assert.equal(item.account, '52998224725')
  assert.equal(item.feeCents, 600)
  assert.equal(item.netCents, 9400)
  db.withdrawals.push(item)
  updateWithdrawal(db, item, { status: 'Pago', feeCents: 0, netCents: 10000 }, () => 'ledger')
  assert.equal(item.feeCents, 600)
  assert.equal(item.netCents, 9400)
  assert.equal(db.transactions.at(-1)?.amount, 300)
  assert.equal(db.transactions[0].amount, -100)
  const old: any = { id: 'old', userId: 'u', amount: 100, wallet: 'REDE', status: 'Pendente', account: '52998224725', feeCents: 0, netCents: 10000 }
  db.withdrawals.push(old)
  updateWithdrawal(db, old, { status: 'Em análise' }, () => 'ledger')
  assert.equal(old.feeCents, 0)
  assert.equal(old.netCents, 10000)
})

test('Carteira Cota libera 1 saque por semana a partir do domingo 18h', () => {
  const user = { id: 'u', status: 'ACTIVE', associatePlanStatus: 'ACTIVE', shareholderSince: '2026-08-01T12:00:00-03:00' }
  const db: any = { users: [user], investments: [], withdrawals: [], transactions: [{ userId: 'u', wallet: 'COTA', amount: 300 }, { userId: 'u', wallet: 'REDE', amount: 100 }] }
  const monday = new Date('2026-09-14T10:00:00-03:00')
  assert.equal(validateWithdrawal(db, user, 100, 'COTA', undefined, monday).netCents, 9400)
  db.withdrawals.push({ id: 'w1', userId: 'u', wallet: 'COTA', amount: 100, status: 'Pendente', createdAt: new Date('2026-09-14T10:00:00-03:00').toISOString() })
  assert.throws(() => validateWithdrawal(db, user, 100, 'COTA', undefined, monday), /1 saque por semana/)
  assert.throws(() => validateWithdrawal(db, user, 100, 'COTA', undefined, new Date('2026-09-20T17:59:00-03:00')), /1 saque por semana/)
  assert.equal(validateWithdrawal(db, user, 100, 'COTA', undefined, new Date('2026-09-20T18:00:00-03:00')).feeCents, 600)
  assert.equal(validateWithdrawal(db, user, 100, 'COTA', undefined, new Date('2026-09-24T09:00:00-03:00')).feeCents, 600)
  // Um saque recusado não consome a janela da semana seguinte.
  db.withdrawals.push({ id: 'w2', userId: 'u', wallet: 'COTA', amount: 100, status: 'Recusado', createdAt: new Date('2026-09-21T10:00:00-03:00').toISOString() })
  assert.equal(validateWithdrawal(db, user, 100, 'COTA', undefined, new Date('2026-09-21T11:00:00-03:00')).feeCents, 600)
  // Domingos antes das 18h ainda pertencem à semana anterior.
  assert.equal(cotaWithdrawalWeekKey(new Date('2026-09-20T17:59:00-03:00')), cotaWithdrawalWeekKey(new Date('2026-09-14T10:00:00-03:00')))
  assert.notEqual(cotaWithdrawalWeekKey(new Date('2026-09-20T18:00:00-03:00')), cotaWithdrawalWeekKey(new Date('2026-09-14T10:00:00-03:00')))
  assert.equal(walletSummary(db, user, undefined, monday).cotaWithdrawalUsedThisWeek, true)
  assert.equal(walletSummary(db, user, undefined, monday).cotaWithdrawalOpen, false)
  assert.equal(walletSummary(db, user, undefined, new Date('2026-09-20T18:00:00-03:00')).cotaWithdrawalOpen, true)
})

test('Carteira Rede aceita quantos saques quiser no mesmo dia, sem somar as carteiras', () => {
  const user = { id: 'u', status: 'ACTIVE', associatePlanStatus: 'ACTIVE', shareholderSince: '2026-08-01T12:00:00-03:00' }
  const db: any = { users: [user], investments: [], withdrawals: [], transactions: [{ userId: 'u', wallet: 'COTA', amount: 100 }, { userId: 'u', wallet: 'REDE', amount: 300 }] }
  const day = new Date('2026-09-14T10:00:00-03:00')
  assert.equal(validateWithdrawal(db, user, 100, 'REDE', undefined, day).feeCents, 600)
  db.withdrawals.push({ id: 'r1', userId: 'u', wallet: 'REDE', amount: 100, status: 'Pendente', createdAt: day.toISOString() })
  assert.equal(validateWithdrawal(db, user, 100, 'REDE', undefined, day).feeCents, 600)
  db.withdrawals.push({ id: 'r2', userId: 'u', wallet: 'REDE', amount: 100, status: 'Pendente', createdAt: day.toISOString() })
  // Saldos de carteiras diferentes não se somam para atingir o mínimo nem o disponível.
  assert.throws(() => validateWithdrawal(db, user, 150, 'REDE', undefined, day), /Valor indisponível/)
  assert.throws(() => validateWithdrawal(db, user, 150, 'COTA', undefined, day), /Valor indisponível/)
  assert.throws(() => validateWithdrawal(db, user, 50, 'REDE', undefined, day), /mínimo para saque/)
})
