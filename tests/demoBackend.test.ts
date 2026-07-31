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

test('investment requires immediate payment through an accepted method', async () => {
  localStorage.clear()
  const session = await demoRequest<{ token: string }>('/auth/login', 'POST', { username: 'matheus', password: 'gomove2026' })
  await assert.rejects(() => demoRequest('/investments', 'POST', { pack: 'Mobilidade Start', amount: 2500 }, session.token), /forma de pagamento/)
  const payload = { pack: 'Mobilidade Start', amount: 2500, paymentMethod: 'PIX', idempotencyKey: 'checkout-test-1' }
  const investment = await demoRequest<Record<string, any>>('/investments', 'POST', payload, session.token)
  const retry = await demoRequest<Record<string, any>>('/investments', 'POST', payload, session.token)
  assert.equal(investment.paymentMethod, 'PIX')
  assert.equal(investment.paymentStatus, 'PENDING')
  assert.equal(investment.status, 'Aguardando pagamento')
  assert.match(investment.paymentReference, /^PIX-/)
  assert.equal(retry.id, investment.id)
  const state = await demoRequest<{ investments: Record<string, any>[] }>('/state', 'GET', undefined, session.token)
  assert.equal(state.investments.filter(item => item.idempotencyKey === payload.idempotencyKey).length, 1)
})

test('invited account remains pending until MASTER activation', async () => {
  localStorage.clear()
  await demoRequest('/public/register', 'POST', { name: 'Nova Pessoa', email: 'nova@gomove.com.br', username: 'nova', password: 'segura123', inviteCode: 'matheus01' })
  await assert.rejects(() => demoRequest('/auth/login', 'POST', { username: 'nova', password: 'segura123' }), /inválidos/)

  const masterSession = await demoRequest<{ token: string }>('/auth/login', 'POST', { username: 'admin', password: 'gomove2026' })
  const associates = await demoRequest<Page<User>>('/admin/associates', 'GET', undefined, masterSession.token)
  const created = associates.items.find(user => user.username === 'nova')
  assert.ok(created)
  await demoRequest(`/admin/associates/${created.id}/status`, 'PATCH', { status: 'ACTIVE', reason: 'Cadastro validado' }, masterSession.token)
  const session = await demoRequest<{ user: User }>('/auth/login', 'POST', { username: 'nova', password: 'segura123' })
  assert.equal(session.user.status, 'ACTIVE')
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
  const created = await demoRequest<User>('/admin/associates', 'POST', { name: 'Usuário CRUD', username: 'usuariocrud', email: 'crud@gomove.com.br', password: 'segura123', status: 'ACTIVE' }, master.token)
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
    ['investments', { userId: owner, pack: 'Plano CRUD', amount: 1000, profit: 0, days: 0, date: '31/07/2026', status: 'Pendente' }],
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
