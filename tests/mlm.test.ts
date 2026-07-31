import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { buildNetworkTree, calculateBonuses, createBonusReversal, createRegistration, transitionBonus, wouldCreateSponsorCycle } from '../server/mlm.ts'

const users = [
  { id: 'admin', username: 'admin', email: 'admin@gomove.local', role: 'ADMIN_MASTER', status: 'ACTIVE', inviteCode: 'admin01', sponsorId: null },
  { id: 'a', username: 'alice', email: 'alice@gomove.local', role: 'ASSOCIATE', status: 'ACTIVE', inviteCode: 'alice01', sponsorId: 'admin' },
  { id: 'b', username: 'bob', email: 'bob@gomove.local', role: 'ASSOCIATE', status: 'ACTIVE', inviteCode: 'bob01', sponsorId: 'a' },
  { id: 'c', username: 'cora', email: 'cora@gomove.local', role: 'ASSOCIATE', status: 'BLOCKED', inviteCode: 'cora01', sponsorId: 'b' },
]

test('registers only through an active invite and rejects duplicate identity', () => {
  const registered = createRegistration(users, { username: 'newuser', email: 'new@gomove.local', passwordHash: 'hash', inviteCode: 'alice01', name: 'New User' }, () => 'new-id')
  assert.equal(registered.sponsorId, 'a')
  assert.equal(registered.status, 'PENDING')
  assert.throws(() => createRegistration(users, { username: 'alice', email: 'other@gomove.local', passwordHash: 'hash', inviteCode: 'alice01', name: 'X' }, () => 'x'), /already exists/)
})

test('prevents direct and indirect sponsor cycles', () => {
  assert.equal(wouldCreateSponsorCycle(users, 'a', 'b'), true)
  assert.equal(wouldCreateSponsorCycle(users, 'b', 'a'), false)
  assert.equal(wouldCreateSponsorCycle(users, 'a', 'a'), true)
})

test('calculates unilevel bonuses in cents without compression', () => {
  const bonuses = calculateBonuses(users, 'c', 'investment-1', 100_00, [{ level: 1, bps: 1000 }, { level: 2, bps: 500 }, { level: 3, bps: 300 }])
  // Cora is blocked and therefore earns nothing, but she remains level 0: levels are not compressed.
  assert.deepEqual(bonuses.map(b => [b.userId, b.level, b.amountCents]), [['b', 1, 1000], ['a', 2, 500], ['admin', 3, 300]])
})

test('bonus calculation idempotency key is stable per event recipient and level', () => {
  const one = calculateBonuses(users, 'b', 'event-1', 9999, [{ level: 1, bps: 1000 }])
  const two = calculateBonuses(users, 'b', 'event-1', 9999, [{ level: 1, bps: 1000 }])
  assert.equal(one[0].idempotencyKey, two[0].idempotencyKey)
})

test('builds a bounded administrative subtree from the requested root', () => {
  const tree = buildNetworkTree(users, 'a', 1)
  assert.equal(tree.id, 'a')
  assert.deepEqual(tree.children.map(child => child.id), ['b'])
  assert.deepEqual(tree.children[0].children, [])
  assert.throws(() => buildNetworkTree(users, 'missing', 2), /not found/)
})

test('transitions only pending bonuses and creates one immutable approved reversal', () => {
  const original = { id: 'bonus-1', userId: 'a', amountCents: 1250, status: 'PENDING', type: 'UNILEVEL', createdAt: '2026-01-01T00:00:00.000Z' }
  assert.equal(transitionBonus(original, 'APPROVED').status, 'APPROVED')
  assert.throws(() => transitionBonus({ ...original, status: 'APPROVED' }, 'CANCELLED'), /PENDING/)
  const reversal = createBonusReversal([{ ...original, status: 'APPROVED' }], 'bonus-1', 'Lançamento indevido', () => 'reversal-1', () => '2026-01-02T00:00:00.000Z')
  assert.deepEqual(reversal, { id: 'reversal-1', userId: 'a', amountCents: -1250, status: 'APPROVED', type: 'REVERSAL', reversalOfId: 'bonus-1', reason: 'Lançamento indevido', createdAt: '2026-01-02T00:00:00.000Z' })
  assert.throws(() => createBonusReversal([{ ...original, status: 'APPROVED' }, reversal], 'bonus-1', 'Duplicada'), /already reversed/)
  assert.throws(() => createBonusReversal([{ ...original, status: 'PENDING' }], 'bonus-1', 'Sem aprovação'), /APPROVED/)
})
