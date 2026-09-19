import assert from 'node:assert/strict'
import test from 'node:test'
import {
  ASSOCIATE_BONUS_CAP_CENTS,
  DIRECT_REFERRAL_BPS,
  ASSOCIATE_PLAN_PRICE_CENTS,
  ASSOCIATE_UPGRADE_MIN_QUOTA_CENTS,
  SHAREHOLDER_MIN_QUOTA_CENTS,
  UNILEVEL_LEVELS,
  allocateBonusByBusinessPlan,
  allocateEarningByBusinessPlan,
  associateBonusCapReached,
  canUpgradeToShareholder,
  requiredUpgradeQuotaCents,
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
  assert.equal(SHAREHOLDER_MIN_QUOTA_CENTS, 6_000)
  assert.equal(ASSOCIATE_UPGRADE_MIN_QUOTA_CENTS, 30_000)
})

test('commission plan uses 10% direct referral and six descending unilevel levels', () => {
  assert.equal(DIRECT_REFERRAL_BPS, 1_000)
  assert.deepEqual(UNILEVEL_LEVELS.map(item => item.bps), [1_000, 900, 800, 700, 600, 500])
})

test('associate bonus is split at the accumulated R$ 500 cap', () => {
  const entries = [{ userId: associate.id, amountCents: 45_000, status: 'APPROVED' }]
  assert.deepEqual(allocateBonusByBusinessPlan(associate, entries, 10_000), { availableCents: 5_000, blockedCents: 5_000 })
})

test('shareholder earnings are limited to 150% additional (250% total) of confirmed quotas', () => {
  const shareholder = { ...associate, membershipType: 'SHAREHOLDER' as const }
  const bonuses = [{ userId: shareholder.id, amountCents: 95_000, status: 'APPROVED' }]
  const dailyEarnings = [{ userId: shareholder.id, creditedAmountCents: 4_000 }]
  assert.deepEqual(allocateEarningByBusinessPlan(shareholder, bonuses, dailyEarnings, 50_000, 2_000), { availableCents: 0, cappedCents: 2_000, capCents: 75_000, consumedCents: 99_000 })
  assert.deepEqual(allocateEarningByBusinessPlan(shareholder, bonuses, dailyEarnings, 100_000, 2_000), { availableCents: 2_000, cappedCents: 0, capCents: 150_000, consumedCents: 99_000 })
})

test('direct entry as Cotista starts at R$ 60 and the mandatory upgrade at the cap requires R$ 300', () => {
  assert.equal(associateBonusCapReached(associate), false)
  assert.equal(requiredUpgradeQuotaCents(associate), 6_000)
  assert.equal(canUpgradeToShareholder(associate, 5_999), false)
  assert.equal(canUpgradeToShareholder(associate, 6_000), true)
  assert.equal(canUpgradeToShareholder({ ...associate, associatePlanStatus: 'INACTIVE' }, 6_000), true)
  assert.equal(canUpgradeToShareholder({ ...associate, status: 'BLOCKED' }, 6_000), false)

  const capped = [{ userId: associate.id, amountCents: 45_000, status: 'APPROVED' }, { userId: associate.id, amountCents: 5_000, status: 'PENDING' }]
  assert.equal(associateBonusCapReached(associate, capped), true)
  assert.equal(associateBonusCapReached(associate, [{ userId: associate.id, amountCents: 49_999, status: 'APPROVED' }]), false)
  assert.equal(associateBonusCapReached(associate, [{ userId: associate.id, amountCents: 60_000, status: 'BLOCKED_UPGRADE' }]), false)
  assert.equal(requiredUpgradeQuotaCents(associate, capped), 30_000)
  assert.equal(canUpgradeToShareholder(associate, 29_999, capped), false)
  assert.equal(canUpgradeToShareholder(associate, 30_000, capped), true)
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

test('shareholder upgrade releases blocked bonuses only within the available earning capacity', () => {
  const entries = [{ id: 'blocked-1', userId: associate.id, amountCents: 80_000, status: 'BLOCKED_UPGRADE', type: 'UNILEVEL' }]
  const released = releaseBlockedBonuses(entries, associate.id, 50_000, () => 'capped-1')
  assert.equal(released, 50_000)
  assert.deepEqual(entries.map(entry => ({ id: entry.id, amountCents: entry.amountCents, status: entry.status })), [
    { id: 'blocked-1', amountCents: 50_000, status: 'PENDING' },
    { id: 'capped-1', amountCents: 30_000, status: 'CAPPED_250_PERCENT' },
  ])
})

test('active associates need an active plan while active shareholders remain bonus eligible without it', () => {
  assert.equal(isBonusEligibleParticipant(associate), true)
  assert.equal(isBonusEligibleParticipant({ ...associate, associatePlanStatus: 'PENDING' }), false)
  assert.equal(isBonusEligibleParticipant({ ...associate, membershipType: 'SHAREHOLDER', associatePlanStatus: 'PENDING' }), true)
  assert.equal(isBonusEligibleParticipant({ ...associate, membershipType: 'SHAREHOLDER', associatePlanStatus: 'INACTIVE' }), true)
  assert.equal(isBonusEligibleParticipant({ ...associate, role: 'ADMIN_MASTER' }), false)
})
