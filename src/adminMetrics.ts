type Row = Record<string, any>
type MetricsDatabase = { users: Row[]; invoices: Row[]; investments: Row[]; withdrawals: Row[]; auditLogs: Row[] }

const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
export function adminDateKey(value: unknown): string | null {
  if (!value) return null
  const text = String(value)
  const local = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text)
  const key = local ? `${local[3]}-${local[2]}-${local[1]}` : /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null
  if (key) {
    const date = new Date(`${key}T12:00:00Z`)
    return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== key ? null : key
  }
  const date = value instanceof Date ? value : new Date(text)
  if (Number.isNaN(date.getTime())) return null
  const parts = formatter.formatToParts(date)
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)!.value).join('-')
}

export function summarizeAdminMetrics(db: MetricsDatabase, now = new Date()) {
  const day = adminDateKey(now)!
  const registrations = new Map<string, unknown>()
  for (const log of db.auditLogs) {
    if (log.targetType === 'USER' && ['REGISTER', 'RECORD_CREATE'].includes(log.action) && !registrations.has(log.targetId)) registrations.set(log.targetId, log.createdAt)
  }
  const people = db.users.filter(user => user.role === 'ASSOCIATE')
  const today = people.filter(user => adminDateKey(user.createdAt ?? registrations.get(user.id)) === day)
  const incoming = [...db.invoices, ...db.investments].filter(row => row.paymentProvider !== 'WALLET' && !row.walletPurchaseKey && (row.paymentStatus === 'CONFIRMED' || (!row.paymentStatus && row.status === 'Pago')))
  const outgoing = db.withdrawals.filter(row => row.status === 'Pago')
  const amount = (row: Row) => {
    const cents = row.amountCents == null ? Math.round(Number(row.amount) * 100) : Number(row.amountCents)
    return Number.isSafeInteger(cents) && cents > 0 ? cents : 0
  }
  const total = (rows: Row[]) => rows.reduce((sum, row) => sum + amount(row), 0)
  const paidToday = (row: Row) => adminDateKey(row.paidAt ?? row.confirmedAt) === day
  return {
    day, peopleTotal: people.length, registrationsToday: today.length,
    activeRegistrationsToday: today.filter(user => user.status === 'ACTIVE').length,
    activePeopleTotal: people.filter(user => user.status === 'ACTIVE').length,
    cashInTodayCents: total(incoming.filter(paidToday)), cashInTotalCents: total(incoming),
    cashOutTodayCents: total(outgoing.filter(paidToday)), cashOutTotalCents: total(outgoing),
    registrationsWithoutDate: people.filter(user => !adminDateKey(user.createdAt ?? registrations.get(user.id))).length,
    paymentsWithoutDate: [...incoming, ...outgoing].filter(row => !adminDateKey(row.paidAt ?? row.confirmedAt)).length,
  }
}
