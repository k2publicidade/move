export const ASSOCIATE_PLAN_PRICE_CENTS = 5_500
export const ASSOCIATE_BONUS_CAP_CENTS = 50_000
export const SHAREHOLDER_MIN_QUOTA_CENTS = 50_000
export const DIRECT_REFERRAL_BPS = 500
export const UNILEVEL_LEVELS = [
  { level: 1, bps: 600 },
  { level: 2, bps: 500 },
  { level: 3, bps: 400 },
  { level: 4, bps: 300 },
  { level: 5, bps: 200 },
  { level: 6, bps: 100 },
] as const
export const COMMISSION_PLAN_VERSION = 2

export type MembershipType = 'ASSOCIATE' | 'SHAREHOLDER'
export type AssociatePlanStatus = 'PENDING' | 'ACTIVE' | 'INACTIVE'

export type BusinessParticipant = {
  id: string
  role: 'ADMIN_MASTER' | 'ASSOCIATE'
  status: 'PENDING' | 'ACTIVE' | 'BLOCKED'
  membershipType?: MembershipType
  associatePlanStatus?: AssociatePlanStatus
  associatePlanAmountCents?: number
  bonusCapCents?: number
  shareholderSince?: string
}

export type BonusLike = {
  userId: string
  amountCents: number
  status: string
  type?: string
}

export function withBusinessPlanDefaults<T extends BusinessParticipant>(participant: T): T & Required<Pick<BusinessParticipant, 'membershipType' | 'associatePlanStatus' | 'associatePlanAmountCents' | 'bonusCapCents'>> {
  return {
    ...participant,
    membershipType: participant.membershipType ?? 'ASSOCIATE',
    associatePlanStatus: participant.associatePlanStatus ?? (participant.status === 'ACTIVE' ? 'ACTIVE' : 'PENDING'),
    associatePlanAmountCents: participant.associatePlanAmountCents ?? ASSOCIATE_PLAN_PRICE_CENTS,
    bonusCapCents: participant.bonusCapCents ?? ASSOCIATE_BONUS_CAP_CENTS,
  }
}

export function isBonusEligibleParticipant(participant: BusinessParticipant): boolean {
  const normalized = withBusinessPlanDefaults(participant)
  return normalized.role === 'ASSOCIATE' && normalized.status === 'ACTIVE' && normalized.associatePlanStatus === 'ACTIVE'
}

export function allocateBonusByBusinessPlan(participant: BusinessParticipant, entries: BonusLike[], amountCents: number) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error('O valor da bonificação deve ser positivo e informado em centavos')
  const normalized = withBusinessPlanDefaults(participant)
  if (normalized.membershipType === 'SHAREHOLDER') return { availableCents: amountCents, blockedCents: 0 }

  const allocatedCents = entries
    .filter(entry => entry.userId === normalized.id && entry.amountCents > 0 && ['PENDING', 'APPROVED'].includes(entry.status))
    .reduce((sum, entry) => sum + entry.amountCents, 0)
  const remainingCents = Math.max(0, normalized.bonusCapCents - allocatedCents)
  const availableCents = Math.min(amountCents, remainingCents)
  return { availableCents, blockedCents: amountCents - availableCents }
}

export function canUpgradeToShareholder(participant: BusinessParticipant, quotaAmountCents: number): boolean {
  const normalized = withBusinessPlanDefaults(participant)
  return normalized.role === 'ASSOCIATE' && normalized.associatePlanStatus === 'ACTIVE' && Number.isInteger(quotaAmountCents) && quotaAmountCents >= SHAREHOLDER_MIN_QUOTA_CENTS
}

export function releaseBlockedBonuses<T extends BonusLike>(entries: T[], userId: string): number {
  let released = 0
  for (const entry of entries) {
    if (entry.userId === userId && entry.status === 'BLOCKED_UPGRADE') {
      entry.status = 'PENDING'
      released += entry.amountCents
    }
  }
  return released
}
