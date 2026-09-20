import { ASSOCIATE_BONUS_CAP_CENTS, ASSOCIATE_PLAN_PRICE_CENTS } from './businessPlan.js'
import { walletSummary } from './wallets.js'

type Row = Record<string, any>

// Coleções que existem apenas para registrar dinheiro: saldo das carteiras, cotas,
// comissões, bonificações, Diários, cobranças e saques. "Zerar saldos" = esvaziar estas coleções.
export const FINANCIAL_COLLECTIONS = [
  'transactions',
  'withdrawals',
  'investments',
  'invoices',
  'orders',
  'cart',
  'bonusEntries',
  'dailyProfitabilities',
  'dailyProfitabilityRuns',
  'commissionEvents',
  'twoPpWebhookEvents',
] as const
export type FinancialCollection = (typeof FINANCIAL_COLLECTIONS)[number]

// Cadastro, rede, configuração e histórico operacional que a limpeza NÃO toca.
// A parametrização do gateway 2PP vive em variáveis de ambiente (TWOPP_*) e por isso
// nunca é afetada por um reset de dados.
export const PRESERVED_COLLECTIONS = ['users', 'profiles', 'vehicles', 'tickets', 'commissionRules', 'auditLogs', 'sessions'] as const

// Frase exata que o MASTER precisa digitar para liberar a limpeza.
export const FINANCIAL_RESET_PHRASE = 'ZERAR SALDOS'

export function matchesFinancialResetPhrase(value: unknown): boolean {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toUpperCase() === FINANCIAL_RESET_PHRASE
}

export type FinancialResetSummary = {
  collections: Record<FinancialCollection, number>
  clearedTransactionCents: number
  clearedWallets: { balanceCents: number; cotaCents: number; redeCents: number }
  accountsReset: number
}

function centsOf(value: unknown): number {
  const cents = Math.round(Number(value) * 100)
  return Number.isSafeInteger(cents) ? cents : 0
}

// Estado consolidado de tudo o que o reset apaga — também usado para auditar a operação.
export function summarizeFinancialState(db: Row): FinancialResetSummary {
  const collections = {} as Record<FinancialCollection, number>
  for (const key of FINANCIAL_COLLECTIONS) collections[key] = Array.isArray(db[key]) ? (db[key] as Row[]).length : 0
  const clearedWallets = { balanceCents: 0, cotaCents: 0, redeCents: 0 }
  for (const user of (db.users ?? []) as Row[]) {
    if (user.role !== 'ASSOCIATE') continue
    const wallets = walletSummary(db as Row, user)
    clearedWallets.balanceCents += wallets.balanceCents
    clearedWallets.cotaCents += wallets.cotaCents
    clearedWallets.redeCents += wallets.redeCents
  }
  return {
    collections,
    clearedTransactionCents: ((db.transactions ?? []) as Row[]).reduce((sum, row) => sum + centsOf(row.amount), 0),
    clearedWallets,
    accountsReset: ((db.users ?? []) as Row[]).filter(user => user.role === 'ASSOCIATE').length,
  }
}

// Zera o financeiro de TODAS as contas e devolve cada participante ao estado "sem pacote":
// Plano de Associado pendente, sem modalidade Cotista e sem carência de cota ativa.
// Contas, rede de patrocínio, perfis, veículos, tickets, regras de comissão e auditoria sobrevivem.
export function resetFinancialState(db: Row): FinancialResetSummary {
  const summary = summarizeFinancialState(db)
  for (const key of FINANCIAL_COLLECTIONS) db[key] = []
  for (const user of (db.users ?? []) as Row[]) {
    if (user.role !== 'ASSOCIATE') continue
    user.membershipType = 'ASSOCIATE'
    user.associatePlanStatus = 'PENDING'
    user.associatePlanAmountCents = ASSOCIATE_PLAN_PRICE_CENTS
    user.bonusCapCents = ASSOCIATE_BONUS_CAP_CENTS
    delete user.shareholderSince
    delete user.associatePlanPaidAt
  }
  return summary
}
