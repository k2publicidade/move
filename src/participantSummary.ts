import { allocateEarningByBusinessPlan, ASSOCIATE_BONUS_CAP_CENTS, SHAREHOLDER_TOTAL_CAP_BPS, type BusinessParticipant, type BonusLike, type DailyEarningLike } from './businessPlan.js'

type Quota = { [key: string]: unknown; userId?: string; status?: string; paymentStatus?: string; amount?: number; amountCents?: number }

export function confirmedQuotaCents(investments: Quota[], userId: string): number {
  return investments.filter(item => item.userId === userId && (item.paymentStatus === 'CONFIRMED' || (!item.paymentStatus && item.status === 'Ativo')))
    .reduce((sum, item) => {
      const value = item.amountCents ?? Math.round(Number(item.amount) * 100)
      return sum + (Number.isSafeInteger(value) && value > 0 ? value : 0)
    }, 0)
}

// Net approved credits include reversals; lifetime capacity follows the allocation
// engine and is never renewed by a withdrawal or an administrative reversal.
export function summarizeParticipantEarnings(user: BusinessParticipant, bonuses: BonusLike[], daily: (DailyEarningLike & { cappedAmountCents?: number })[], investments: Quota[]) {
  const owned = bonuses.filter(entry => entry.userId === user.id)
  const sum = (status: string, positiveOnly = true) => owned.filter(entry => entry.status === status && (!positiveOnly || entry.amountCents > 0)).reduce((total, entry) => total + entry.amountCents, 0)
  const quotaAmountCents = confirmedQuotaCents(investments, user.id)
  const allocation = allocateEarningByBusinessPlan(user, bonuses, daily, quotaAmountCents, 1)
  const dailyEarningCents = daily.filter(entry => entry.userId === user.id).reduce((total, entry) => total + Number(entry.creditedAmountCents || 0), 0)
  return {
    approvedBonusCents: sum('APPROVED', false), pendingBonusCents: sum('PENDING'), blockedBonusCents: sum('BLOCKED_UPGRADE'),
    quotaAmountCents, dailyEarningCents,
    cappedEarningCents: sum('CAPPED_250_PERCENT') + daily.filter(entry => entry.userId === user.id).reduce((total, entry) => total + Number(entry.cappedAmountCents || 0), 0),
    earningCapCents: allocation.capCents,
    earningCapTotalCents: user.membershipType === 'SHAREHOLDER' ? Math.floor(quotaAmountCents * SHAREHOLDER_TOTAL_CAP_BPS / 10000) : Number(user.bonusCapCents ?? ASSOCIATE_BONUS_CAP_CENTS),
    earningCapConsumedCents: allocation.consumedCents,
    earningCapRemainingCents: Math.max(0, allocation.capCents - allocation.consumedCents),
    bonusCapRemainingCents: Math.max(0, allocation.capCents - allocation.consumedCents),
    canReceiveFinancialResults: user.membershipType === 'SHAREHOLDER',
  }
}
