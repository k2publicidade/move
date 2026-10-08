import { allocateEarningByBusinessPlan, ASSOCIATE_BONUS_CAP_CENTS, SHAREHOLDER_TOTAL_CAP_BPS, type BusinessParticipant, type BonusLike, type DailyEarningLike } from './businessPlan.js'

type Indicator = { label: string; value: number | string; money?: boolean; note?: string }

// Keep credited earnings separate from ledger balances and withdrawal eligibility.
export function participantIndicators(business: Record<string, any>, network?: Record<string, any>): Indicator[] {
  const wallets = business.wallets ?? {}
  const metric = (label: string, value: unknown, money = false, note?: string): Indicator => ({ label, value: typeof value === 'number' && Number.isFinite(value) ? value : '—', money, note })
  const available = [wallets.balanceWithdrawableCents, wallets.cotaAvailableForWithdrawalCents, wallets.redeWithdrawableCents]
  return [
    metric('INDICAÇÃO DIRETA', business.directReferralBonusCents, true, 'Créditos aprovados após estornos, antes de saques.'),
    metric('UNILEVEL', business.unilevelBonusCents, true, 'Créditos aprovados após estornos, antes de saques.'),
    metric('DIÁRIO CREDITADO', business.dailyEarningCents, true, 'Rendimentos da própria cota, antes de saques.'),
    metric('INDICAÇÕES DIRETAS', network?.directs),
    metric('REDE TOTAL', network?.networkSize, false, 'Participantes abaixo de você, sem incluir sua conta.'),
    metric('REDE ATIVA', network?.activeNetwork, false, 'Contas ativas; não significa plano ou cota pagos.'),
    metric('CARTEIRA DE SALDO', wallets.balanceCents, true),
    metric('CARTEIRA COTA', wallets.cotaCents, true),
    metric('CARTEIRA REDE', wallets.redeCents, true),
    metric('DISPONÍVEL PARA SAQUE', available.every(value => typeof value === 'number' && Number.isFinite(value)) ? available.reduce((sum, value) => sum + value, 0) : undefined, true, 'Após reservas, carência e janela da Cota. Mínimo e taxa aplicados por carteira.'),
    { label: 'PONTUAÇÃO', value: 'Não definida', note: 'O plano atual não define uma fórmula de pontos.' },
  ]
}

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
type ReportBonus = BonusLike & { id?: string; reversalOfId?: string }

export function summarizeParticipantEarnings(user: BusinessParticipant, bonuses: ReportBonus[], daily: (DailyEarningLike & { cappedAmountCents?: number })[], investments: Quota[]) {
  const owned = bonuses.filter(entry => entry.userId === user.id)
  const originalById = new Map(owned.filter(entry => entry.id).map(entry => [entry.id, entry]))
  const netByType = (types: string[]) => owned.filter(entry => entry.status === 'APPROVED' && types.includes((entry.reversalOfId ? originalById.get(entry.reversalOfId)?.type : entry.type) ?? '')).reduce((total, entry) => total + entry.amountCents, 0)
  const sum = (status: string, positiveOnly = true) => owned.filter(entry => entry.status === status && (!positiveOnly || entry.amountCents > 0)).reduce((total, entry) => total + entry.amountCents, 0)
  const quotaAmountCents = confirmedQuotaCents(investments, user.id)
  const allocation = allocateEarningByBusinessPlan(user, bonuses, daily, quotaAmountCents, 1)
  const dailyEarningCents = daily.filter(entry => entry.userId === user.id).reduce((total, entry) => total + Number(entry.creditedAmountCents || 0), 0)
  return {
    approvedBonusCents: sum('APPROVED', false), pendingBonusCents: sum('PENDING'), blockedBonusCents: sum('BLOCKED_UPGRADE'),
    quotaAmountCents, dailyEarningCents,
    directReferralBonusCents: netByType(['DIRECT_REFERRAL']),
    unilevelBonusCents: netByType(['UNILEVEL', 'UNILEVEL_PROFITABILITY']),
    cappedEarningCents: sum('CAPPED_250_PERCENT') + daily.filter(entry => entry.userId === user.id).reduce((total, entry) => total + Number(entry.cappedAmountCents || 0), 0),
    earningCapCents: allocation.capCents,
    earningCapTotalCents: user.membershipType === 'SHAREHOLDER' ? Math.floor(quotaAmountCents * SHAREHOLDER_TOTAL_CAP_BPS / 10000) : Number(user.bonusCapCents ?? ASSOCIATE_BONUS_CAP_CENTS),
    earningCapConsumedCents: allocation.consumedCents,
    earningCapRemainingCents: Math.max(0, allocation.capCents - allocation.consumedCents),
    bonusCapRemainingCents: Math.max(0, allocation.capCents - allocation.consumedCents),
    canReceiveFinancialResults: user.membershipType === 'SHAREHOLDER',
  }
}
