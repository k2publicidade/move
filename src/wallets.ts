type Row = Record<string, any>
export type WalletType = 'BALANCE' | 'EARNINGS'
export const walletLabels = { BALANCE: 'Carteira de Saldo', EARNINGS: 'Carteira de Rendimentos' }
export const storeProducts = [
  { id: 'PROD-01', name: 'Capacete Urban Carbon', price: 289, category: 'Segurança' },
  { id: 'PROD-02', name: 'Carregador portátil GoMove', price: 419, category: 'Energia' },
  { id: 'PROD-03', name: 'Kit mobilidade premium', price: 149, category: 'Acessórios' },
]

// Old unidentified credits are restricted to purchases, never assumed to be earnings.
export function transactionWallet(transaction: Row): WalletType {
  if (transaction.wallet === 'BALANCE' || transaction.wallet === 'EARNINGS') return transaction.wallet
  if (transaction.depositId || transaction.adjustmentReference) return 'BALANCE'
  if (transaction.bonusEntryId || transaction.dailyProfitabilityId || transaction.withdrawalId) return 'EARNINGS'
  if (/^(rendimento operacional|bônus de rede|saque\s)/i.test(transaction.description ?? '')) return 'EARNINGS'
  return 'BALANCE'
}

export function moneyCents(value: unknown): number {
  const amount = Number(value), cents = Math.round(amount * 100)
  if (!Number.isFinite(amount) || !Number.isSafeInteger(cents) || Math.abs(amount * 100 - cents) > 0.000001 || cents <= 0) throw new Error('Informe um valor positivo com até duas casas decimais')
  return cents
}

export function walletSummary(db: Row, user: Row, excludeWithdrawalId?: string) {
  let balanceCents = 0, earningsCents = 0
  for (const transaction of db.transactions as Row[]) {
    if (transaction.userId !== user.id) continue
    const amount = Math.round(Number(transaction.amount) * 100)
    if (!Number.isSafeInteger(amount)) continue
    if (transactionWallet(transaction) === 'BALANCE') balanceCents += amount
    else earningsCents += amount
  }
  const reservedCents = (db.withdrawals as Row[]).filter(w => w.userId === user.id && w.id !== excludeWithdrawalId && ['Pendente', 'Em análise'].includes(w.status)).reduce((sum, w) => sum + Math.round(Number(w.amount) * 100), 0)
  const hasActivePackage = user.status === 'ACTIVE' && (user.associatePlanStatus === 'ACTIVE' || (db.investments as Row[]).some(i => i.userId === user.id && i.status === 'Ativo' && i.paymentStatus === 'CONFIRMED' && (!i.expiresAt || Date.parse(i.expiresAt) > Date.now())))
  return { balanceCents, earningsCents, reservedCents, hasActivePackage, withdrawableCents: hasActivePackage ? Math.max(0, earningsCents - reservedCents) : 0 }
}

export function validateWithdrawal(db: Row, user: Row, amount: unknown, excludeId?: string) {
  const wallets = walletSummary(db, user, excludeId)
  if (!wallets.hasActivePackage) throw new Error('É necessário ter um pacote ativo para sacar')
  const cents = moneyCents(amount)
  if (cents < 5000 || cents > wallets.withdrawableCents) throw new Error('Valor indisponível para saque na Carteira de Rendimentos (mínimo R$ 50,00)')
  return cents / 100
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
  const amount = candidate.status === 'Recusado' ? moneyCents(candidate.amount) / 100 : validateWithdrawal(db, user, candidate.amount, item.id)
  Object.assign(item, { amount, status: candidate.status, method: candidate.method, account: candidate.account, wallet: 'EARNINGS', paidAt: '—' })
  if (item.status === 'Pago') {
    item.paidAt = new Date().toLocaleDateString('pt-BR')
    db.transactions.unshift({ id: createId(), userId: item.userId, withdrawalId: item.id, wallet: 'EARNINGS', date: item.paidAt, description: `Saque ${item.id}`, amount: -amount, status: 'Débito', createdAt: new Date().toISOString() })
  }
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
