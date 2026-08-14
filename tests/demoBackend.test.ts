import assert from 'node:assert/strict'
import test from 'node:test'
import { createDemoDatabase, demoRequest } from '../src/demoBackend.js'
import type { Page, User } from '../src/types.js'

class MemoryStorage {
  private values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
  clear() { this.values.clear() }
}

Object.defineProperty(globalThis, 'localStorage', { value: new MemoryStorage(), configurable: true })

test('demo database includes separate MASTER and user profiles', () => {
  const database = createDemoDatabase()
  assert.equal(database.users.find(user => user.username === 'admin')?.role, 'ADMIN_MASTER')
  assert.equal(database.users.find(user => user.username === 'matheus')?.role, 'ASSOCIATE')
  assert.ok(database.vehicles.length >= 3)
})

test('user-created ticket is visible to MASTER and protected by role', async () => {
  localStorage.clear()
  const userSession = await demoRequest<{ token: string }>('/auth/login', 'POST', { username: 'matheus', password: 'gomove2026' })
  await demoRequest('/tickets', 'POST', { subject: 'Teste integrado', department: 'Atendimento', priority: 'Média', status: 'Aberto' }, userSession.token)
  await assert.rejects(() => demoRequest('/admin/tickets', 'GET', undefined, userSession.token), /administrativo/)

  const masterSession = await demoRequest<{ token: string }>('/auth/login', 'POST', { username: 'admin', password: 'gomove2026' })
  const tickets = await demoRequest<Page<Record<string, any>>>('/admin/tickets', 'GET', undefined, masterSession.token)
  assert.equal(tickets.items[0].subject, 'Teste integrado')
})

test('investment creates an idempotent CoinPayments checkout', async () => {
  localStorage.clear()
  const session = await demoRequest<{ token: string }>('/auth/login', 'POST', { username: 'matheus', password: 'gomove2026' })
  await assert.rejects(() => demoRequest('/investments', 'POST', { pack: 'Cotas GoMove', amount: 500 }, session.token), /Identificador idempotente/)
  const payload = { pack: 'Cotas GoMove', amount: 500, preferredPaymentAsset: 'BTC', idempotencyKey: 'checkout-test-1' }
  const investment = await demoRequest<Record<string, any>>('/investments', 'POST', payload, session.token)
  const retry = await demoRequest<Record<string, any>>('/investments', 'POST', payload, session.token)
  assert.equal(investment.paymentMethod, 'CoinPayments')
  assert.equal(investment.paymentAsset, 'BTC')
  assert.equal(investment.paymentProvider, 'COINPAYMENTS')
  assert.equal(investment.paymentStatus, 'PENDING')
  assert.equal(investment.status, 'Aguardando pagamento')
  assert.match(investment.paymentReference, /^CP-/)
  assert.equal(investment.paymentUrl, '/investments?demo-payment=pending')
  assert.equal(retry.id, investment.id)
  const state = await demoRequest<{ investments: Record<string, any>[] }>('/state', 'GET', undefined, session.token)
  assert.equal(state.investments.filter(item => item.idempotencyKey === payload.idempotencyKey).length, 1)
})

test('each investment confirmation generates only a 5% direct bonus and remains idempotent', async () => {
  localStorage.clear()
  const master = await demoRequest<{ token: string }>('/auth/login', 'POST', { username: 'admin', password: 'gomove2026' })
  const users = await demoRequest<{ items: Record<string, any>[] }>('/admin/associates', 'GET', undefined, master.token)
  const camila = users.items.find(item => item.username === 'camila')!
  const ana = users.items.find(item => item.username === 'ana')!
  const matheus = users.items.find(item => item.username === 'matheus')!
  const investment = await demoRequest<Record<string, any>>('/admin/investments', 'POST', { userId: camila.id, pack: 'Cotas GoMove', amount: 2500, status: 'Aguardando pagamento' }, master.token)
  const confirmation = await demoRequest<{ event: Record<string, any>; bonuses: Record<string, any>[]; idempotent: boolean }>(`/admin/investments/${investment.id}/confirm`, 'POST', {}, master.token)
  assert.equal(confirmation.idempotent, false)
  const totals = confirmation.bonuses.reduce<Record<string, number>>((result, item) => {
    const key = `${item.type}:N${item.level}`
    result[key] = (result[key] || 0) + item.amountCents
    return result
  }, {})
  assert.deepEqual(totals, { 'DIRECT_REFERRAL:N1': 12500 })
  const retry = await demoRequest<{ event: Record<string, any>; bonuses: Record<string, any>[]; idempotent: boolean }>(`/admin/investments/${investment.id}/confirm`, 'POST', {}, master.token)
  assert.equal(retry.idempotent, true)
  assert.equal(retry.event.id, confirmation.event.id)

  const nextInvestment = await demoRequest<Record<string, any>>('/admin/investments', 'POST', { userId: camila.id, pack: 'Cotas GoMove', amount: 510, status: 'Aguardando pagamento' }, master.token)
  const nextConfirmation = await demoRequest<{ bonuses: Record<string, any>[] }>(`/admin/investments/${nextInvestment.id}/confirm`, 'POST', {}, master.token)
  assert.equal(nextConfirmation.bonuses.length, 1)
  assert.equal(nextConfirmation.bonuses[0].type, 'DIRECT_REFERRAL')
  assert.equal(nextConfirmation.bonuses[0].amountCents, 2550)

  const matheusInvestment = await demoRequest<Record<string, any>>('/admin/investments', 'POST', { userId: ana.id, pack: 'Cotas GoMove', amount: 500, status: 'Aguardando pagamento' }, master.token)
  const matheusConfirmation = await demoRequest<{ bonuses: Record<string, any>[] }>(`/admin/investments/${matheusInvestment.id}/confirm`, 'POST', {}, master.token)
  const matheusBonus = matheusConfirmation.bonuses.find(item => item.userId === matheus.id)!
  await demoRequest(`/admin/bonus-entries/${matheusBonus.id}/approve`, 'POST', {}, master.token)
  const user = await demoRequest<{ token: string }>('/auth/login', 'POST', { username: 'matheus', password: 'gomove2026' })
  let state = await demoRequest<{ transactions: Record<string, any>[] }>('/state', 'GET', undefined, user.token)
  assert.equal(state.transactions.filter(item => item.bonusEntryId === matheusBonus.id).length, 1)
  assert.equal(state.transactions.find(item => item.bonusEntryId === matheusBonus.id)?.amount, 25)

  const reversal = await demoRequest<Record<string, any>>(`/admin/bonus-entries/${matheusBonus.id}/reverse`, 'POST', { reason: 'Teste de estorno auditável' }, master.token)
  state = await demoRequest<{ transactions: Record<string, any>[] }>('/state', 'GET', undefined, user.token)
  assert.equal(state.transactions.find(item => item.bonusEntryId === reversal.id)?.amount, -25)
  await assert.rejects(() => demoRequest(`/admin/bonus-entries/${matheusBonus.id}/reverse`, 'POST', { reason: 'Duplicado' }, master.token), /já estornado/)
})

test('commission rule CRUD validates percentages and preserves a single active rule', async () => {
  localStorage.clear()
  const master = await demoRequest<{ token: string }>('/auth/login', 'POST', { username: 'admin', password: 'gomove2026' })
  await assert.rejects(() => demoRequest('/admin/commission-rules', 'POST', { name: 'Inválida', levels: [{ level: 1, bps: 7000 }, { level: 2, bps: 4000 }] }, master.token), /100%/)
  const created = await demoRequest<Record<string, any>>('/admin/commission-rules', 'POST', { name: 'Nova regra', active: true, levels: [{ level: 1, bps: 800 }] }, master.token)
  const rules = await demoRequest<{ items: Record<string, any>[] }>('/admin/commission-rules', 'GET', undefined, master.token)
  assert.equal(rules.items.filter(item => item.active).length, 1)
  assert.equal(rules.items.find(item => item.id === created.id)?.active, true)
  await assert.rejects(() => demoRequest(`/admin/commission-rules/${created.id}`, 'DELETE', undefined, master.token), /Desative/)
  await demoRequest(`/admin/commission-rules/${created.id}`, 'PATCH', { active: false }, master.token)
  await demoRequest(`/admin/commission-rules/${created.id}`, 'DELETE', undefined, master.token)
})

test('approved bonuses fund withdrawals and paid withdrawals debit the user ledger once', async () => {
  localStorage.clear()
  const master = await demoRequest<{ token: string }>('/auth/login', 'POST', { username: 'admin', password: 'gomove2026' })
  const users = await demoRequest<{ items: Record<string, any>[] }>('/admin/associates', 'GET', undefined, master.token)
  const matheus = users.items.find(item => item.username === 'matheus')!
  const credit = await demoRequest<Record<string, any>>('/admin/bonus-entries/manual-credit', 'POST', { userId: matheus.id, amountCents: 20_000, reason: 'Crédito de teste' }, master.token)
  await demoRequest(`/admin/bonus-entries/${credit.id}/approve`, 'POST', {}, master.token)
  const user = await demoRequest<{ token: string }>('/auth/login', 'POST', { username: 'matheus', password: 'gomove2026' })
  const withdrawal = await demoRequest<Record<string, any>>('/withdrawals', 'POST', { amount: 100, method: 'PIX', account: 'CPF' }, user.token)
  await assert.rejects(() => demoRequest('/withdrawals', 'POST', { amount: 1_000, method: 'PIX', account: 'CPF' }, user.token), /indisponível/)
  await demoRequest(`/admin/withdrawals/${withdrawal.id}`, 'PATCH', { ...withdrawal, status: 'Pago' }, master.token)
  await demoRequest(`/admin/withdrawals/${withdrawal.id}`, 'PATCH', { ...withdrawal, status: 'Pago' }, master.token)
  const state = await demoRequest<{ transactions: Record<string, any>[] }>('/state', 'GET', undefined, user.token)
  assert.equal(state.transactions.filter(item => item.withdrawalId === withdrawal.id).length, 1)
  assert.equal(state.transactions.find(item => item.withdrawalId === withdrawal.id)?.amount, -100)
})

test('MASTER daily rate credits shareholders by quota value and approved unilevel earnings once', async () => {
  localStorage.clear()
  const master = await demoRequest<{ token: string }>('/auth/login', 'POST', { username: 'admin', password: 'gomove2026' })
  const users = await demoRequest<Page<User>>('/admin/associates', 'GET', undefined, master.token)
  const camila = users.items.find(item => item.username === 'camila')!
  const ana = users.items.find(item => item.username === 'ana')!
  const matheus = users.items.find(item => item.username === 'matheus')!
  const quota = await demoRequest<Record<string, any>>('/admin/investments', 'POST', { userId: camila.id, pack: 'Cotas GoMove', amount: 1000, status: 'Aguardando pagamento' }, master.token)
  await demoRequest(`/admin/investments/${quota.id}/confirm`, 'POST', {}, master.token)
  const scheduled = await demoRequest<{ run: Record<string, any> }>('/admin/daily-profitabilities', 'POST', { date: '2026-08-13', rateBps: 100 }, master.token)
  assert.equal(scheduled.run.status, 'SCHEDULED')
  await assert.rejects(() => demoRequest('/admin/daily-profitabilities', 'POST', { date: '2026-08-13', rateBps: 100 }, master.token), /já foi cadastrado/i)
  const result = await demoRequest<{ run: Record<string, any>; earnings: Record<string, any>[]; bonuses: Record<string, any>[] }>(`/admin/daily-profitabilities/${scheduled.run.id}/process`, 'POST', {}, master.token)

  const camilaEarning = result.earnings.find(item => item.userId === camila.id)!
  assert.equal(camilaEarning.quotaAmountCents, 100_000)
  assert.equal(camilaEarning.grossAmountCents, 1_000)
  assert.equal(camilaEarning.creditedAmountCents, 1_000)
  assert.deepEqual(result.bonuses.filter(item => item.sourceUserId === camila.id).map(item => [item.userId, item.level, item.amountCents, item.status]), [
    [ana.id, 1, 60, 'APPROVED'],
    [matheus.id, 2, 50, 'APPROVED'],
  ])

  const retry = await demoRequest<{ run: Record<string, any>; idempotent: boolean }>(`/admin/daily-profitabilities/${scheduled.run.id}/process`, 'POST', {}, master.token)
  assert.equal(retry.idempotent, true)
  const history = await demoRequest<Page<Record<string, any>>>('/admin/daily-profitabilities', 'GET', undefined, master.token)
  assert.equal(history.items.filter(item => item.date === '2026-08-13').length, 1)
  assert.equal(history.items[0].rateBps, 100)
  assert.equal(history.items[0].status, 'PROCESSED')
})

test('migrates an existing demo database to the current commission plan', async () => {
  const legacy = createDemoDatabase()
  delete legacy.commissionPlanVersion
  legacy.commissionRules = [{ id: 'legacy-rule', name: 'Regra antiga', eventType: 'INVESTMENT_CONFIRMED', active: true, directReferralBps: 100, levels: [{ level: 1, bps: 1000 }] }]
  localStorage.setItem('gomove-demo-database-v4', JSON.stringify(legacy))
  const master = await demoRequest<{ token: string }>('/auth/login', 'POST', { username: 'admin', password: 'gomove2026' })
  const rules = await demoRequest<{ items: Record<string, any>[] }>('/admin/commission-rules', 'GET', undefined, master.token)
  const active = rules.items.find(item => item.active)
  assert.equal(active.directReferralBps, 500)
  assert.deepEqual(active.levels.map((item: Record<string, number>) => item.bps), [600, 500, 400, 300, 200, 100])
})

test('associate cap blocks excess bonus and confirmed quota upgrades to shareholder', async () => {
  localStorage.clear()
  const master = await demoRequest<{ token: string }>('/auth/login', 'POST', { username: 'admin', password: 'gomove2026' })
  let users = await demoRequest<Page<User>>('/admin/associates', 'GET', undefined, master.token)
  const ana = users.items.find(user => user.username === 'ana')!

  await demoRequest('/admin/bonus-entries/manual-credit', 'POST', { userId: ana.id, amountCents: 30_000, reason: 'Teste do teto do plano' }, master.token)
  let bonuses = await demoRequest<Page<Record<string, any>>>('/admin/bonus-entries', 'GET', undefined, master.token)
  const blocked = bonuses.items.find(entry => entry.userId === ana.id && entry.status === 'BLOCKED_UPGRADE')
  assert.equal(blocked?.amountCents, 5_000)

  const quota = await demoRequest<Record<string, any>>('/admin/investments', 'POST', { userId: ana.id, pack: 'Cotas GoMove', amount: 500, status: 'Aguardando pagamento' }, master.token)
  await demoRequest(`/admin/investments/${quota.id}/confirm`, 'POST', {}, master.token)

  users = await demoRequest<Page<User>>('/admin/associates', 'GET', undefined, master.token)
  assert.equal(users.items.find(user => user.id === ana.id)?.membershipType, 'SHAREHOLDER')
  bonuses = await demoRequest<Page<Record<string, any>>>('/admin/bonus-entries', 'GET', undefined, master.token)
  assert.equal(bonuses.items.find(entry => entry.id === blocked?.id)?.status, 'PENDING')
})

test('accounts with financial history are blocked instead of destructively deleted', async () => {
  localStorage.clear()
  const master = await demoRequest<{ token: string }>('/auth/login', 'POST', { username: 'admin', password: 'gomove2026' })
  const users = await demoRequest<{ items: Record<string, any>[] }>('/admin/associates', 'GET', undefined, master.token)
  const matheus = users.items.find(item => item.username === 'matheus')!
  await assert.rejects(() => demoRequest(`/admin/associates/${matheus.id}`, 'DELETE', undefined, master.token), /histórico financeiro/)
})

test('user unilevel view returns the complete network with stable generation levels', async () => {
  localStorage.clear()
  const user = await demoRequest<{ token: string }>('/auth/login', 'POST', { username: 'matheus', password: 'gomove2026' })
  const network = await demoRequest<Array<Record<string, any>>>('/network/unilevel?depth=10', 'GET', undefined, user.token)
  assert.deepEqual(network.map(item => [item.username, item.level]), [['ana', 1], ['bruno', 1], ['camila', 2]])
})

test('MASTER cannot assign a new account to an inactive sponsor', async () => {
  localStorage.clear()
  const master = await demoRequest<{ token: string }>('/auth/login', 'POST', { username: 'admin', password: 'gomove2026' })
  const users = await demoRequest<{ items: Record<string, any>[] }>('/admin/associates', 'GET', undefined, master.token)
  const pendingSponsor = users.items.find(item => item.status === 'PENDING')!
  await assert.rejects(() => demoRequest('/admin/associates', 'POST', { name: 'Conta inválida', username: 'invalidsponsor', email: 'invalidsponsor@gomove.local', password: 'segura123', sponsorId: pendingSponsor.id, status: 'PENDING' }, master.token), /patrocinador/i)
})

test('invited account enters immediately and keeps participation pending until choosing a product', async () => {
  localStorage.clear()
  const registration = await demoRequest<{ token: string; user: User }>('/public/register', 'POST', { name: 'Nova Pessoa', email: 'nova@gomove.com.br', username: 'nova', password: 'segura123', inviteCode: 'matheus01' })
  assert.ok(registration.token)
  assert.equal(registration.user.status, 'ACTIVE')
  assert.equal(registration.user.associatePlanStatus, 'PENDING')
  const session = await demoRequest<{ user: User }>('/auth/login', 'POST', { username: 'nova', password: 'segura123' })
  assert.equal(session.user.id, registration.user.id)
})

test('direct registration uses MASTER sponsorship and can acquire quotas without the associate plan', async () => {
  localStorage.clear()
  const registration = await demoRequest<{ token: string; user: User }>('/public/register', 'POST', { name: 'Cotista Direto', email: 'cotista.direto@gomove.com.br', username: 'cotistadireto', password: 'segura123' })
  assert.equal(registration.user.status, 'ACTIVE')
  assert.equal(registration.user.associatePlanStatus, 'PENDING')

  const master = await demoRequest<{ token: string; user: User }>('/auth/login', 'POST', { username: 'admin', password: 'gomove2026' })
  assert.equal(registration.user.sponsorId, master.user.id)
  const quota = await demoRequest<Record<string, any>>('/investments', 'POST', { amount: 500, preferredPaymentAsset: 'USDT', idempotencyKey: 'direct-quota-choice' }, registration.token)
  assert.equal(quota.amountCents, 50_000)
  await demoRequest(`/admin/investments/${quota.id}/confirm`, 'POST', {}, master.token)

  const refreshed = await demoRequest<{ user: User }>('/auth/login', 'POST', { username: 'cotistadireto', password: 'segura123' })
  assert.equal(refreshed.user.membershipType, 'SHAREHOLDER')
  assert.equal(refreshed.user.associatePlanStatus, 'PENDING')
  const daily = await demoRequest<{ run: Record<string, any> }>('/admin/daily-profitabilities', 'POST', { date: '2026-08-14', rateBps: 100 }, master.token)
  const result = await demoRequest<{ earnings: Record<string, any>[] }>(`/admin/daily-profitabilities/${daily.run.id}/process`, 'POST', {}, master.token)
  assert.equal(result.earnings.some(item => item.userId === registration.user.id), true)
})

test('associate choice creates one R$ 55 checkout per idempotency key', async () => {
  localStorage.clear()
  const registration = await demoRequest<{ token: string }>('/public/register', 'POST', { name: 'Associado Novo', email: 'associado.novo@gomove.com.br', username: 'associadonovo', password: 'segura123' })
  const first = await demoRequest<Record<string, any>>('/associate-plan', 'POST', { preferredPaymentAsset: 'USDT', idempotencyKey: 'associate-choice' }, registration.token)
  const retry = await demoRequest<Record<string, any>>('/associate-plan', 'POST', { preferredPaymentAsset: 'USDT', idempotencyKey: 'associate-choice' }, registration.token)
  assert.equal(first.amount, 55)
  assert.equal(first.id, retry.id)
  assert.ok(first.paymentUrl)
})

test('demo invite rejects an active account that has not chosen a financial product', async () => {
  const suffix = Math.random().toString(36).slice(2, 8)
  const registration = await demoRequest<any>('/public/register', 'POST', {
    name: 'Sem Produto',
    email: `sem-produto-${suffix}@gomove.local`,
    username: `sem-produto-${suffix}`,
    password: 'senha-segura',
  })

  await assert.rejects(
    () => demoRequest(`/public/invites/${registration.user.inviteCode}`),
    /Convite indisponível/,
  )
})

test('demo admin follows the same activation, sponsor and quota safety rules as production', async () => {
  localStorage.clear()
  const suffix = Math.random().toString(36).slice(2, 8)
  const master = await demoRequest<{ token: string; user: User }>('/auth/login', 'POST', { username: 'admin', password: 'gomove2026' })
  const unpaid = await demoRequest<User>('/admin/associates', 'POST', {
    name: 'Ativo sem Produto', username: `unpaid-${suffix}`, email: `unpaid-${suffix}@gomove.local`,
    password: 'senha-segura', sponsorId: master.user.id, status: 'ACTIVE', associatePlanStatus: 'PENDING',
  }, master.token)
  assert.equal(unpaid.status, 'ACTIVE')
  assert.equal(unpaid.associatePlanStatus, 'PENDING')

  await assert.rejects(
    () => demoRequest('/admin/bonus-entries/manual-credit', 'POST', { userId: unpaid.id, amountCents: 100, reason: 'Não permitido' }, master.token),
    /financeiramente elegível/i,
  )
  await assert.rejects(
    () => demoRequest('/admin/associates', 'POST', { name: 'Filho', username: `child-${suffix}`, email: `child-${suffix}@gomove.local`, password: 'senha-segura', sponsorId: unpaid.id }, master.token),
    /patrocinador/i,
  )

  const quota = await demoRequest<Record<string, any>>('/admin/investments', 'POST', { userId: unpaid.id, amount: 500, status: 'Aguardando pagamento' }, master.token)
  assert.equal(quota.amountCents, 50_000)
  await assert.rejects(
    () => demoRequest(`/admin/investments/${quota.id}`, 'PATCH', { amount: 1e100 }, master.token),
    /aquisição deve ficar entre/i,
  )
  await assert.rejects(
    () => demoRequest(`/admin/associates/${master.user.id}/status`, 'PATCH', { status: 'BLOCKED', reason: 'Não pode' }, master.token),
    /associado/i,
  )
})

test('demo registration and quota inputs reject malformed credentials and unsafe money', async () => {
  const suffix = Math.random().toString(36).slice(2, 8)
  await assert.rejects(
    () => demoRequest('/public/register', 'POST', { name: 'Inválido', username: `bad-${suffix}`, email: 'sem-arroba', password: '123' }),
    /dados de cadastro inválidos/i,
  )
  const registration = await demoRequest<any>('/public/register', 'POST', { name: 'Cota Segura', username: `safe-${suffix}`, email: `safe-${suffix}@gomove.local`, password: 'senha-segura' })
  await assert.rejects(
    () => demoRequest('/investments', 'POST', { amount: 500.001, idempotencyKey: `unsafe-${suffix}` }, registration.token),
    /aquisição deve ficar entre/i,
  )
})

test('demo reserves the master alias and confirms the associate plan idempotently', async () => {
  const suffix = Math.random().toString(36).slice(2, 8)
  await assert.rejects(
    () => demoRequest('/public/register', 'POST', { name: 'Nome Reservado', username: 'master', email: `master-${suffix}@gomove.local`, password: 'senha-segura' }),
    /reservado/i,
  )
  const registration = await demoRequest<any>('/public/register', 'POST', { name: 'Plano Demo', username: `plan-demo-${suffix}`, email: `plan-demo-${suffix}@gomove.local`, password: 'senha-segura' })
  const invoice = await demoRequest<any>('/associate-plan', 'POST', { idempotencyKey: `plan-demo-${suffix}` }, registration.token)
  assert.equal(invoice.demo, true)
  const first = await demoRequest<any>(`/associate-plan/${invoice.id}/confirm-demo`, 'POST', {}, registration.token)
  const retry = await demoRequest<any>(`/associate-plan/${invoice.id}/confirm-demo`, 'POST', {}, registration.token)
  assert.equal(first.user.associatePlanStatus, 'ACTIVE')
  assert.equal(first.invoice.status, 'Pago')
  assert.equal(retry.idempotent, true)
})

test('MASTER CRUD synchronizes fleet records with the linked user account', async () => {
  localStorage.clear()
  const master = await demoRequest<{ token: string }>('/auth/login', 'POST', { username: 'admin', password: 'gomove2026' })
  const associates = await demoRequest<Page<User>>('/admin/associates', 'GET', undefined, master.token)
  const matheus = associates.items.find(user => user.username === 'matheus')!

  const vehicle = await demoRequest<Record<string, any>>('/admin/vehicles', 'POST', { userId: matheus.id, plate: 'CRUD-01', model: 'Scooter CRUD', category: 'Scooter', location: 'Joinville - SC', battery: 100, status: 'Disponível' }, master.token)
  const userSession = await demoRequest<{ token: string }>('/auth/login', 'POST', { username: 'matheus', password: 'gomove2026' })
  let state = await demoRequest<{ vehicles: Record<string, any>[] }>('/state', 'GET', undefined, userSession.token)
  assert.equal(state.vehicles.find(item => item.id === vehicle.id)?.model, 'Scooter CRUD')

  await demoRequest(`/admin/vehicles/${vehicle.id}`, 'PATCH', { model: 'Scooter CRUD Pro', status: 'Em operação' }, master.token)
  state = await demoRequest('/state', 'GET', undefined, userSession.token)
  assert.equal(state.vehicles.find(item => item.id === vehicle.id)?.model, 'Scooter CRUD Pro')

  await demoRequest(`/admin/vehicles/${vehicle.id}`, 'DELETE', undefined, master.token)
  state = await demoRequest('/state', 'GET', undefined, userSession.token)
  assert.equal(state.vehicles.some(item => item.id === vehicle.id), false)
})

test('MASTER can create, edit and delete a user account', async () => {
  localStorage.clear()
  const master = await demoRequest<{ token: string }>('/auth/login', 'POST', { username: 'admin', password: 'gomove2026' })
  const created = await demoRequest<User>('/admin/associates', 'POST', { name: 'Usuário CRUD', username: 'usuariocrud', email: 'crud@gomove.com.br', password: 'segura123', status: 'ACTIVE', associatePlanStatus: 'ACTIVE' }, master.token)
  const session = await demoRequest<{ user: User }>('/auth/login', 'POST', { username: 'usuariocrud', password: 'segura123' })
  assert.equal(session.user.id, created.id)

  const updated = await demoRequest<User>(`/admin/associates/${created.id}`, 'PATCH', { ...created, name: 'Usuário Atualizado', email: 'atualizado@gomove.com.br' }, master.token)
  assert.equal(updated.name, 'Usuário Atualizado')

  await demoRequest(`/admin/associates/${created.id}`, 'DELETE', undefined, master.token)
  await assert.rejects(() => demoRequest('/auth/login', 'POST', { username: 'usuariocrud', password: 'segura123' }), /inválidos/)
})

test('all MASTER operational collections support integrated create, update and delete', async () => {
  localStorage.clear()
  const master = await demoRequest<{ token: string }>('/auth/login', 'POST', { username: 'admin', password: 'gomove2026' })
  const userSession = await demoRequest<{ token: string; user: User }>('/auth/login', 'POST', { username: 'matheus', password: 'gomove2026' })
  const owner = userSession.user.id
  const cases = [
    ['investments', { userId: owner, pack: 'Cotas GoMove', amount: 1000, profit: 0, date: '31/07/2026', status: 'Pendente' }],
    ['orders', { userId: owner, description: 'Pedido CRUD', quantity: 1, total: 99, date: '31/07/2026', status: 'Processando' }],
    ['invoices', { userId: owner, description: 'Fatura CRUD', amount: 199, remaining: 199, due: '10/08/2026', status: 'Pendente' }],
    ['withdrawals', { userId: owner, amount: 50, method: 'PIX', account: 'teste@pix', date: '31/07/2026', status: 'Pendente' }],
    ['tickets', { userId: owner, subject: 'Ticket CRUD', department: 'Atendimento', category: 'Teste', priority: 'Média', status: 'Aberto' }],
  ] as const

  for (const [collection, payload] of cases) {
    const created = await demoRequest<Record<string, any>>(`/admin/${collection}`, 'POST', payload, master.token)
    const updated = await demoRequest<Record<string, any>>(`/admin/${collection}/${created.id}`, 'PATCH', { status: 'Atualizado' }, master.token)
    assert.equal(updated.status, 'Atualizado')
    const state = await demoRequest<Record<string, Record<string, any>[]>>('/state', 'GET', undefined, userSession.token)
    assert.equal(state[collection].some(item => item.id === created.id), true)
    await demoRequest(`/admin/${collection}/${created.id}`, 'DELETE', undefined, master.token)
    const after = await demoRequest<Record<string, Record<string, any>[]>>('/state', 'GET', undefined, userSession.token)
    assert.equal(after[collection].some(item => item.id === created.id), false)
  }
})
