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
