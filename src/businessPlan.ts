export const ASSOCIATE_PLAN_PRICE_CENTS = 5_500
export const ASSOCIATE_BONUS_CAP_CENTS = 50_000
// Pacote mínimo do Cotista (ingresso direto, sem passar pelo Plano de Associado).
export const SHAREHOLDER_MIN_QUOTA_CENTS = 6_000
// Upgrade obrigatório do Associado que atingiu o teto de R$ 500 em bonificações.
export const ASSOCIATE_UPGRADE_MIN_QUOTA_CENTS = 30_000
export const SHAREHOLDER_EARNING_CAP_BPS = 15_000
export const DIRECT_REFERRAL_BPS = 1_000
export const UNILEVEL_LEVELS = [
  { level: 1, bps: 1_000 },
  { level: 2, bps: 900 },
  { level: 3, bps: 800 },
  { level: 4, bps: 700 },
  { level: 5, bps: 600 },
  { level: 6, bps: 500 },
] as const
export const COMMISSION_PLAN_VERSION = 3

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

export type DailyEarningLike = {
  userId: string
  creditedAmountCents: number
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
  return normalized.role === 'ASSOCIATE'
    && normalized.status === 'ACTIVE'
    && (normalized.membershipType === 'SHAREHOLDER' || normalized.associatePlanStatus === 'ACTIVE')
}

function allocatedBonusCents(participant: BusinessParticipant, entries: BonusLike[]): number {
  const normalized = withBusinessPlanDefaults(participant)
  return entries
    .filter(entry => entry.userId === normalized.id && entry.amountCents > 0 && ['PENDING', 'APPROVED'].includes(entry.status))
    .reduce((sum, entry) => sum + entry.amountCents, 0)
}

export function allocateBonusByBusinessPlan(participant: BusinessParticipant, entries: BonusLike[], amountCents: number) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error('O valor da bonificação deve ser positivo e informado em centavos')
  const normalized = withBusinessPlanDefaults(participant)
  if (normalized.membershipType === 'SHAREHOLDER') return { availableCents: amountCents, blockedCents: 0 }

  const remainingCents = Math.max(0, normalized.bonusCapCents - allocatedBonusCents(normalized, entries))
  const availableCents = Math.min(amountCents, remainingCents)
  return { availableCents, blockedCents: amountCents - availableCents }
}

export function allocateEarningByBusinessPlan(participant: BusinessParticipant, entries: BonusLike[], dailyEarnings: DailyEarningLike[], quotaAmountCents: number, amountCents: number) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error('O valor do ganho deve ser positivo e informado em centavos')
  if (!Number.isInteger(quotaAmountCents) || quotaAmountCents < 0) throw new Error('O valor das cotas deve ser informado em centavos')
  const normalized = withBusinessPlanDefaults(participant)
  const bonusCents = allocatedBonusCents(normalized, entries)
  const dailyCents = dailyEarnings
    .filter(entry => entry.userId === normalized.id && entry.creditedAmountCents > 0)
    .reduce((sum, entry) => sum + entry.creditedAmountCents, 0)
  const consumedCents = bonusCents + dailyCents
  const capCents = normalized.membershipType === 'SHAREHOLDER'
    ? Math.floor(quotaAmountCents * SHAREHOLDER_EARNING_CAP_BPS / 10_000)
    : normalized.bonusCapCents
  const availableCents = Math.min(amountCents, Math.max(0, capCents - consumedCents))
  return { availableCents, cappedCents: amountCents - availableCents, capCents, consumedCents }
}

// O Associado que já esgotou o teto de bonificações só evolui a Cotista com uma
// cota mínima de R$ 300 (upgrade obrigatório); o ingresso direto segue em R$ 60.
export function associateBonusCapReached(participant: BusinessParticipant, entries: BonusLike[] = []): boolean {
  const normalized = withBusinessPlanDefaults(participant)
  if (normalized.membershipType === 'SHAREHOLDER') return false
  return allocatedBonusCents(normalized, entries) >= normalized.bonusCapCents
}

export function requiredUpgradeQuotaCents(participant: BusinessParticipant, entries: BonusLike[] = []): number {
  return associateBonusCapReached(participant, entries) ? ASSOCIATE_UPGRADE_MIN_QUOTA_CENTS : SHAREHOLDER_MIN_QUOTA_CENTS
}

export function canUpgradeToShareholder(participant: BusinessParticipant, quotaAmountCents: number, entries: BonusLike[] = []): boolean {
  const normalized = withBusinessPlanDefaults(participant)
  return normalized.role === 'ASSOCIATE' && normalized.status === 'ACTIVE' && Number.isInteger(quotaAmountCents) && quotaAmountCents >= requiredUpgradeQuotaCents(normalized, entries)
}

export function releaseBlockedBonuses<T extends BonusLike & { id?: string; reason?: string }>(entries: T[], userId: string, maxReleaseCents = Number.POSITIVE_INFINITY, idFactory?: () => string): number {
  let released = 0
  for (const entry of [...entries]) {
    if (entry.userId === userId && entry.status === 'BLOCKED_UPGRADE') {
      const availableCents = Math.max(0, maxReleaseCents - released)
      if (entry.amountCents <= availableCents) {
        entry.status = 'PENDING'
        released += entry.amountCents
      } else if (availableCents > 0) {
        if (!idFactory) throw new Error('Um gerador de identificador é obrigatório para dividir ganhos no teto')
        const cappedCents = entry.amountCents - availableCents
        entry.amountCents = availableCents
        entry.status = 'PENDING'
        released += availableCents
        entries.push({ ...entry, id: idFactory(), amountCents: cappedCents, status: 'CAPPED_250_PERCENT', reason: 'Teto de 250% da cota atingido; renove suas cotas para ampliar o limite' } as T)
      } else {
        entry.status = 'CAPPED_250_PERCENT'
        entry.reason = 'Teto de 250% da cota atingido; renove suas cotas para ampliar o limite'
      }
    }
  }
  return released
}
