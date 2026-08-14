type BonusLike = { id: string; userId: string; amountCents: number; status: string; createdAt?: string }
type TransactionLike = { id?: string; userId?: string; bonusEntryId?: string; amount?: number; createdAt?: string }

export type BonusPeriodSummary = {
  todayCents: number
  weekCents: number
  monthCents: number
}

const saoPauloDateKey = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date)
  const part = (type: string) => parts.find(item => item.type === type)?.value
  return `${part('year')}-${part('month')}-${part('day')}`
}

const mondayOf = (dateKey: string) => {
  const [year, month, day] = dateKey.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  const daysSinceMonday = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - daysSinceMonday)
  return date.toISOString().slice(0, 10)
}

export function summarizeBonusPeriods(
  userId: string,
  bonuses: BonusLike[],
  transactions: TransactionLike[],
  referenceDate = new Date(),
): BonusPeriodSummary {
  const today = saoPauloDateKey(referenceDate)!
  const weekStart = mondayOf(today)
  const monthStart = `${today.slice(0, 7)}-01`
  const bonusIds = new Set(bonuses.filter(item => item.userId === userId).map(item => item.id))
  const creditedBonusIds = new Set<string>()
  const entries: Array<{ amountCents: number; dateKey: string }> = []

  for (const transaction of transactions) {
    if (transaction.userId !== userId || !transaction.bonusEntryId || !bonusIds.has(transaction.bonusEntryId)) continue
    const dateKey = transaction.createdAt ? saoPauloDateKey(transaction.createdAt) : null
    if (!dateKey) continue
    creditedBonusIds.add(transaction.bonusEntryId)
    entries.push({ amountCents: Math.round(Number(transaction.amount || 0) * 100), dateKey })
  }

  // Legacy approved entries may predate the financial ledger link.
  for (const bonus of bonuses) {
    if (bonus.userId !== userId || bonus.status !== 'APPROVED' || creditedBonusIds.has(bonus.id) || !bonus.createdAt) continue
    const dateKey = saoPauloDateKey(bonus.createdAt)
    if (dateKey) entries.push({ amountCents: Number(bonus.amountCents || 0), dateKey })
  }

  return entries.reduce<BonusPeriodSummary>((summary, entry) => {
    if (entry.dateKey > today) return summary
    if (entry.dateKey === today) summary.todayCents += entry.amountCents
    if (entry.dateKey >= weekStart) summary.weekCents += entry.amountCents
    if (entry.dateKey >= monthStart) summary.monthCents += entry.amountCents
    return summary
  }, { todayCents: 0, weekCents: 0, monthCents: 0 })
}
