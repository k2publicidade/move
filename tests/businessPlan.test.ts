import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ASSOCIATE_BONUS_CAP_CENTS,
  DIRECT_REFERRAL_BPS,
  ASSOCIATE_PLAN_PRICE_CENTS,
  SHAREHOLDER_MIN_QUOTA_CENTS,
  UNILEVEL_LEVELS,
  allocateBonusByBusinessPlan,
  allocateEarningByBusinessPlan,
  canUpgradeToShareholder,
  isBonusEligibleParticipant,
  releaseBlockedBonuses,
} from '../src/businessPlan.js'

const associate = {
  id: 'associate-1',
  role: 'ASSOCIATE' as const,
  status: 'ACTIVE' as const,
  membershipType: 'ASSOCIATE' as const,
  associatePlanStatus: 'ACTIVE' as const,
  associatePlanAmountCents: ASSOCIATE_PLAN_PRICE_CENTS,
  bonusCapCents: ASSOCIATE_BONUS_CAP_CENTS,
}

test('business plan constants match the attached document', () => {
  assert.equal(ASSOCIATE_PLAN_PRICE_CENTS, 5_500)
  assert.equal(ASSOCIATE_BONUS_CAP_CENTS, 50_000)
  assert.equal(SHAREHOLDER_MIN_QUOTA_CENTS, 50_000)
})

test('commission plan uses 5% direct referral and six descending unilevel levels', () => {
  assert.equal(DIRECT_REFERRAL_BPS, 500)
  assert.deepEqual(UNILEVEL_LEVELS.map(item => item.bps), [600, 500, 400, 300, 200, 100])
})

test('associate bonus is split at the accumulated R$ 500 cap', () => {
  const entries = [{ userId: associate.id, amountCents: 45_000, status: 'APPROVED' }]
  assert.deepEqual(allocateBonusByBusinessPlan(associate, entries, 10_000), { availableCents: 5_000, blockedCents: 5_000 })
})

test('shareholder earnings are limited to 200% of confirmed quotas and renewal expands the cap', () => {
  const shareholder = { ...associate, membershipType: 'SHAREHOLDER' as const }
  const bonuses = [{ userId: shareholder.id, amountCents: 95_000, status: 'APPROVED' }]
  const dailyEarnings = [{ userId: shareholder.id, creditedAmountCents: 4_000 }]
  assert.deepEqual(allocateEarningByBusinessPlan(shareholder, bonuses, dailyEarnings, 50_000, 2_000), { availableCents: 1_000, cappedCents: 1_000, capCents: 100_000, consumedCents: 99_000 })
  assert.deepEqual(allocateEarningByBusinessPlan(shareholder, bonuses, dailyEarnings, 100_000, 2_000), { availableCents: 2_000, cappedCents: 0, capCents: 200_000, consumedCents: 99_000 })
})

test('shareholder upgrade requires an active associate plan and at least R$ 500 in quotas', () => {
  assert.equal(canUpgradeToShareholder(associate, 49_999), false)
  assert.equal(canUpgradeToShareholder(associate, 50_000), true)
  assert.equal(canUpgradeToShareholder({ ...associate, associatePlanStatus: 'INACTIVE' }, 50_000), false)
})

test('upgrade releases every blocked bonus for the participant', () => {
  const entries = [
    { userId: associate.id, amountCents: 12_000, status: 'BLOCKED_UPGRADE' },
    { userId: 'other', amountCents: 8_000, status: 'BLOCKED_UPGRADE' },
  ]
  assert.equal(releaseBlockedBonuses(entries, associate.id), 12_000)
  assert.equal(entries[0].status, 'PENDING')
  assert.equal(entries[1].status, 'BLOCKED_UPGRADE')
})

test('shareholder upgrade releases blocked bonuses only within the 200% earning capacity', () => {
  const entries = [{ id: 'blocked-1', userId: associate.id, amountCents: 80_000, status: 'BLOCKED_UPGRADE', type: 'UNILEVEL' }]
  const released = releaseBlockedBonuses(entries, associate.id, 50_000, () => 'capped-1')
  assert.equal(released, 50_000)
  assert.deepEqual(entries.map(entry => ({ id: entry.id, amountCents: entry.amountCents, status: entry.status })), [
    { id: 'blocked-1', amountCents: 50_000, status: 'PENDING' },
    { id: 'capped-1', amountCents: 30_000, status: 'CAPPED_200_PERCENT' },
  ])
})

test('only active participants with an active associate plan earn network bonuses', () => {
  assert.equal(isBonusEligibleParticipant(associate), true)
  assert.equal(isBonusEligibleParticipant({ ...associate, associatePlanStatus: 'PENDING' }), false)
  assert.equal(isBonusEligibleParticipant({ ...associate, role: 'ADMIN_MASTER' }), false)
})
