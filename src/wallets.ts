type Row = Record<string, any>

export type WalletType = 'BALANCE' | 'COTA' | 'REDE'
export const walletLabels: Record<WalletType, string> = { BALANCE: 'Carteira de Saldo', COTA: 'Carteira Cota', REDE: 'Carteira Rede' }
export const WITHDRAWAL_MIN_CENTS = 5_500
export const COTA_WITHDRAWAL_WINDOW_DAYS = [15, 30]
export const COTA_CARENCIA_DAYS = 30
export const WITHDRAWAL_FEE_BPS = 600

export const storeProducts = [
  { id: 'PROD-01', name: 'Capacete Urban Carbon', price: 289, category: 'Segurança' },
  { id: 'PROD-02', name: 'Carregador portátil GoMove', price: 419, category: 'Energia' },
  { id: 'PROD-03', name: 'Kit mobilidade premium', price: 149, category: 'Acessórios' },
]

export function moneyCents(value: unknown): number {
  const amount = Number(value), cents = Math.round(amount * 100)
  if (!Number.isFinite(amount) || !Number.isSafeInteger(cents) || Math.abs(amount * 100 - cents) > 0.000001 || cents <= 0) throw new Error('Informe um valor positivo com até duas casas decimais')
  return cents
}

// São Paulo calendar helpers — withdrawal windows/carência follow the project timezone.
function saoPauloParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const get = (type: string) => Number(parts.find(p => p.type === type)?.value)
  return { year: get('year'), month: get('month'), day: get('day') }
}
const saoPauloDateKey = (date: Date) => { const { year, month, day } = saoPauloParts(date); return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` }

// A withdrawal belongs to exactly one earnings wallet: COTA (own quota yield) or REDE (network bonuses).
export function withdrawalWallet(withdrawal: Row): WalletType {
  return withdrawal.wallet === 'COTA' ? 'COTA' : 'REDE'
}

// Classifies a ledger transaction into one of the three wallets.
// Daily quota yields land in COTA; bonuses (indicação, unilevel, manual) land in REDE; deposits/purchases in BALANCE.
export function transactionWallet(transaction: Row): WalletType {
  if (transaction.wallet === 'BALANCE' || transaction.wallet === 'COTA' || transaction.wallet === 'REDE') return transaction.wallet
  if (transaction.depositId || transaction.adjustmentReference) return 'BALANCE'
  if (transaction.dailyProfitabilityId) return 'COTA'
  if (transaction.bonusEntryId) return 'REDE'
  if (transaction.withdrawalId) return 'REDE'
  if (transaction.wallet === 'EARNINGS') return 'REDE'
  if (/^rendimento operacional/i.test(transaction.description ?? '')) return 'COTA'
  if (/^(bônus de rede|saque\s)/i.test(transaction.description ?? '')) return 'REDE'
  return 'BALANCE'
}

export function walletSummary(db: Row, user: Row, excludeWithdrawalId?: string) {
  let balanceCents = 0, cotaCents = 0, redeCents = 0
  for (const transaction of db.transactions as Row[]) {
    if (transaction.userId !== user.id) continue
    const amount = Math.round(Number(transaction.amount) * 100)
    if (!Number.isSafeInteger(amount)) continue
    const wallet = transactionWallet(transaction)
    if (wallet === 'BALANCE') balanceCents += amount
    else if (wallet === 'COTA') cotaCents += amount
    else redeCents += amount
  }
  const pending = (db.withdrawals as Row[]).filter(w => w.userId === user.id && w.id !== excludeWithdrawalId && ['Pendente', 'Em análise'].includes(w.status))
  const reservedCotaCents = pending.filter(w => withdrawalWallet(w) === 'COTA').reduce((sum, w) => sum + Math.round(Number(w.amount) * 100), 0)
  const reservedRedeCents = pending.filter(w => withdrawalWallet(w) === 'REDE').reduce((sum, w) => sum + Math.round(Number(w.amount) * 100), 0)
  const hasActivePackage = user.status === 'ACTIVE' && (user.associatePlanStatus === 'ACTIVE' || (db.investments as Row[]).some(i => i.userId === user.id && i.status === 'Ativo' && i.paymentStatus === 'CONFIRMED' && (!i.expiresAt || Date.parse(i.expiresAt) > Date.now())))
  const cotaWithdrawableCents = hasActivePackage ? Math.max(0, cotaCents - reservedCotaCents) : 0
  const redeWithdrawableCents = hasActivePackage ? Math.max(0, redeCents - reservedRedeCents) : 0
  return {
    balanceCents,
    cotaCents,
    redeCents,
    earningsCents: cotaCents + redeCents,
    reservedCents: reservedCotaCents + reservedRedeCents,
    reservedCotaCents,
    reservedRedeCents,
    hasActivePackage,
    cotaWithdrawableCents,
    redeWithdrawableCents,
    withdrawableCents: cotaWithdrawableCents + redeWithdrawableCents,
  }
}

export function isCotaWithdrawalWindow(date = new Date()): boolean {
  return COTA_WITHDRAWAL_WINDOW_DAYS.includes(saoPauloParts(date).day)
}

export function hasQuotaMatured(user: Row, date = new Date()): boolean {
  const since = user.shareholderSince
  if (!since) return false
  const sinceMs = Date.parse(since)
  if (!Number.isFinite(sinceMs)) return false
  return sinceMs + COTA_CARENCIA_DAYS * 24 * 60 * 60 * 1000 <= date.getTime()
}

function nonRefusedWithdrawals(db: Row, user: Row, wallet: WalletType, excludeId?: string): Row[] {
  return (db.withdrawals as Row[]).filter(w => w.userId === user.id && w.id !== excludeId && withdrawalWallet(w) === wallet && w.status !== 'Recusado' && w.status !== 'Cancelado')
}

// Same fee for both earnings wallets, rounded to the nearest cent.
export function withdrawalAmounts(amount: unknown) {
  const amountCents = moneyCents(amount)
  const feeCents = Math.floor(amountCents / 10_000) * WITHDRAWAL_FEE_BPS
    + Math.round((amountCents % 10_000) * WITHDRAWAL_FEE_BPS / 10_000)
  return { amountCents, feeBps: WITHDRAWAL_FEE_BPS, feeCents, netCents: amountCents - feeCents }
}

// Carteira Rede: at most one withdrawal per day.
export function hasRedeWithdrawalToday(db: Row, user: Row, excludeId?: string, date = new Date()): boolean {
  const today = saoPauloDateKey(date)
  return nonRefusedWithdrawals(db, user, 'REDE', excludeId).some(w => {
    if (w.createdAt) { const wd = new Date(w.createdAt); if (Number.isFinite(wd.getTime())) return saoPauloDateKey(wd) === today }
    return false
  })
}

// PIX payouts only accept a CPF key that matches the account holder.
export function validatePixKey(account: unknown, userCpf?: string): string {
  let cpf: string
  try { cpf = normalizeCpf(userCpf) }
  catch { throw new Error('Cadastre um CPF válido no seu perfil para sacar via PIX') }
  if (account !== undefined && String(account).replace(/[.\s-]/g, '') !== cpf) throw new Error('A chave PIX deve ser o CPF do titular cadastrado')
  return cpf
}

// Registration/profile CPF: normalized to 11 digits (same rule as the PIX key).
export function normalizeCpf(value: unknown): string {
  const digits = String(value ?? '').replace(/[.\s-]/g, '')
  if (digits.length !== 11) throw new Error('Informe um CPF válido com 11 dígitos')
  if (!isValidCpfDigits(digits)) throw new Error('CPF inválido: os dígitos verificadores não conferem')
  return digits
}

// Validates the two check digits a real CPF carries (this is what makes an
// 11-digit number a CPF rather than an arbitrary string).
export function isValidCpfDigits(digits: string): boolean {
  if (!/^\d{11}$/.test(digits)) return false
  if (/^(\d)\1{10}$/.test(digits)) return false
  let sum = 0
  for (let i = 0; i < 9; i++) sum += Number(digits[i]) * (10 - i)
  let check = (sum * 10) % 11
  if (check === 10) check = 0
  if (check !== Number(digits[9])) return false
  sum = 0
  for (let i = 0; i < 10; i++) sum += Number(digits[i]) * (11 - i)
  check = (sum * 10) % 11
  if (check === 10) check = 0
  return check === Number(digits[10])
}

// CPF uniqueness across accounts: profiles is the Record<userId, profile> map.
export function cpfOwnerId(profiles: Record<string, any> | undefined, cpf: string, excludeUserId?: string): string | undefined {
  const digits = String(cpf ?? '').replace(/\D/g, '')
  if (!digits) return undefined
  for (const [id, profile] of Object.entries(profiles ?? {})) {
    if (id === excludeUserId) continue
    if (profile && profile.cpf && String(profile.cpf).replace(/\D/g, '') === digits) return id
  }
  return undefined
}

export function validateWithdrawal(db: Row, user: Row, amount: unknown, wallet: WalletType, excludeId?: string, date = new Date()) {
  if (wallet !== 'COTA' && wallet !== 'REDE') throw new Error('Selecione uma carteira válida para saque (Cota ou Rede)')
  const wallets = walletSummary(db, user, excludeId)
  if (!wallets.hasActivePackage) throw new Error('É necessário ter um pacote ativo para sacar')
  const amounts = withdrawalAmounts(amount), cents = amounts.amountCents
  if (cents < WITHDRAWAL_MIN_CENTS) throw new Error('O valor mínimo para saque é de R$ 55,00')
  if (wallet === 'COTA') {
    if (!hasQuotaMatured(user, date)) throw new Error('A Carteira Cota exige 30 dias de cota ativa para o primeiro saque')
    if (!isCotaWithdrawalWindow(date)) throw new Error('A Carteira Cota permite saque apenas nos dias 15 e 30 de cada mês')
    if (cents > wallets.cotaWithdrawableCents) throw new Error('Valor indisponível para saque na Carteira Cota')
    return { ...amounts, wallet }
  }
  if (hasRedeWithdrawalToday(db, user, excludeId, date)) throw new Error('A Carteira Rede permite apenas 1 saque por dia')
  if (cents > wallets.redeWithdrawableCents) throw new Error('Valor indisponível para saque na Carteira Rede')
  return { ...amounts, wallet }
}

export function updateWithdrawal(db: Row, item: Row, changes: Row, createId: () => string) {
  const candidate = { ...item, ...changes }
  if (!['Pendente', 'Em análise', 'Pago', 'Recusado'].includes(candidate.status)) throw new Error('Status de saque inválido')
  if (item.status === 'Pago' || db.transactions.some((t: Row) => t.withdrawalId === item.id)) {
    if (item.status === 'Pago' && candidate.status === 'Pago' && candidate.userId === item.userId && candidate.amount === item.amount && candidate.method === item.method && candidate.account === item.account) return
    throw new Error('Um saque pago não pode ser alterado')
  }
  if (candidate.userId !== item.userId) throw new Error('O titular do saque não pode ser alterado')
  const user = db.users.find((u: Row) => u.id === item.userId)
  if (!user) throw new Error('Usuário inválido')
  const wallet = withdrawalWallet(item)
  const amountCents = candidate.status === 'Recusado' ? moneyCents(candidate.amount) : validateWithdrawal(db, user, candidate.amount, wallet, item.id).amountCents
  if (item.paymentProvider === '2PP' && (Number(candidate.amount) !== Number(item.amount) || candidate.account !== item.account || candidate.method !== item.method)) throw new Error('Valor e destino de um saque enviado ao gateway não podem ser alterados')
  const account = candidate.status === 'Recusado' ? item.account : validatePixKey(candidate.account, db.profiles?.[user.id]?.cpf)
  // Preserve the financial terms of existing requests, including pre-6% payouts.
  const preserved = db.withdrawals.includes(item) && Number(item.amount) === amountCents / 100
    && Number.isSafeInteger(item.feeCents) && item.feeCents >= 0 && Number.isSafeInteger(item.netCents) && item.netCents > 0 && item.feeCents + item.netCents === amountCents
  const amounts = preserved ? { amountCents, feeCents: item.feeCents, netCents: item.netCents, feeBps: item.feeBps } : withdrawalAmounts(candidate.amount)
  Object.assign(item, amounts, { amount: amountCents / 100, status: candidate.status, method: 'PIX', account, wallet, paidAt: '—' })
  if (item.status === 'Pago') {
    item.paidAt = new Date().toLocaleDateString('pt-BR')
    db.transactions.unshift({ id: createId(), userId: item.userId, withdrawalId: item.id, wallet, date: item.paidAt, description: `Saque ${item.id}`, amount: -amountCents / 100, status: 'Débito', createdAt: new Date().toISOString() })
  }
}

// Once the 2PP confirms a payout, settle the already-validated request without
// reapplying calendar/eligibility rules that were only relevant at submission.
export function settleWithdrawal(db: Row, item: Row, createId: () => string) {
  if (item.status === 'Pago' || db.transactions.some((t: Row) => t.withdrawalId === item.id)) return
  const amountCents = moneyCents(item.amount)
  const wallet = withdrawalWallet(item)
  Object.assign(item, { amount: amountCents / 100, status: 'Pago', wallet, paidAt: new Date().toLocaleDateString('pt-BR') })
  db.transactions.unshift({ id: createId(), userId: item.userId, withdrawalId: item.id, wallet, date: item.paidAt, description: `Saque ${item.id}`, amount: -amountCents / 100, status: 'Débito', createdAt: new Date().toISOString() })
}

export function debitPurchase(db: Row, user: Row, amountCents: number, reference: string, description: string, createId: () => string) {
  if (walletSummary(db, user).balanceCents < amountCents) throw new Error('Saldo insuficiente na Carteira de Saldo')
  db.transactions.unshift({ id: createId(), userId: user.id, purchaseId: reference, wallet: 'BALANCE', amount: -amountCents / 100, description, date: new Date().toLocaleDateString('pt-BR'), status: 'Débito', createdAt: new Date().toISOString() })
}

export function creditDeposit(db: Row, invoice: Row, createId: () => string) {
  if (db.transactions.some((t: Row) => t.depositId === invoice.id)) return
  const cents = moneyCents(invoice.amount)
  if (cents !== invoice.amountCents) throw new Error('Valor do depósito inválido')
  db.transactions.unshift({ id: createId(), userId: invoice.userId, depositId: invoice.id, wallet: 'BALANCE', amount: cents / 100, description: 'Depósito confirmado', date: new Date().toLocaleDateString('pt-BR'), status: 'Crédito', createdAt: new Date().toISOString() })
}
