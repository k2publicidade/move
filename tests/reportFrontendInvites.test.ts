import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeInviteCode, inviteCodeFromLocation } from '../src/invites.js'
import * as invites from '../src/invites.js'
import { createDemoDatabase, demoRequest } from '../src/demoBackend.js'

const values = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) } })

test('cadastro ref resolves the unique login from shared URL and location', () => {
  assert.equal(normalizeInviteCode('https://gomoveinfra.com.br/cadastro?ref=Login.Usuario'), 'login.usuario')
  assert.equal(inviteCodeFromLocation({ pathname: '/cadastro', search: '?ref=Login.Usuario' }), 'login.usuario')
})
test('legacy numeric and convite paths remain valid', () => {
  assert.equal(normalizeInviteCode('https://gomoveinfra.com.br/convite/123456/'), '123456')
  assert.equal(inviteCodeFromLocation({ pathname: '/cadastro', search: '?inviteCode=123456' }), '123456')
})

test('malformed ref is still an invitation and must not silently register directly', () => {
  assert.equal(typeof (invites as any).hasInviteReference, 'function')
  assert.equal((invites as any).hasInviteReference({ pathname: '/cadastro', search: '?ref=%ZZ' }), true)
  assert.equal((invites as any).hasInviteReference({ pathname: '/cadastro', search: '?ref=' }), true)
  assert.equal((invites as any).hasInviteReference({ pathname: '/cadastro', search: '' }), false)
})

test('canonical link uses login and validation accepts returned login or legacy code', () => {
  assert.equal((invites as any).referralLink('Login.Usuario'), 'https://gomoveinfra.com.br/cadastro?ref=login.usuario')
  assert.equal((invites as any).matchesInviteSponsor('matheus', { username: 'matheus', inviteCode: 'matheus01' }), true)
  assert.equal((invites as any).matchesInviteSponsor('matheus01', { username: 'matheus', inviteCode: 'matheus01' }), true)
  assert.equal((invites as any).matchesInviteSponsor('ana', { username: 'matheus', inviteCode: 'matheus01' }), false)
})

test('legacy non-normalizable login keeps a usable convite link without renaming the account', async () => {
  const db = createDemoDatabase()
  const sponsor = db.users.find(user => user.username === 'ana')!
  sponsor.username = 'ana silva'
  sponsor.inviteCode = 'anasilva1234'
  values.set('gomove-demo-database-v4', JSON.stringify(db))
  const link = (invites as any).referralLink(sponsor.username, sponsor.inviteCode)
  assert.equal(link, 'https://gomoveinfra.com.br/convite/anasilva1234')
  const identifier = normalizeInviteCode(link)
  const response = await demoRequest<any>(`/public/invites/${identifier}`)
  assert.equal(response.sponsor.username, 'ana silva')
  assert.equal(invites.matchesInviteSponsor(identifier, response.sponsor), true)
  assert.equal((invites as any).referralLink('Ana', sponsor.inviteCode), 'https://gomoveinfra.com.br/cadastro?ref=ana')
})

test('demo lookup and registration bind login to the correct shareholder', async () => {
  values.clear()
  const response = await demoRequest<any>('/public/invites/matheus')
  assert.equal(response.sponsor.username, 'matheus')
  const session = await demoRequest<any>('/public/register', 'POST', { name: 'Novo', username: 'novo', email: 'novo@example.com', password: 'test-only', cpf: '99000010101', inviteCode: 'matheus' })
  assert.equal(session.user.sponsorId, 'usr-matheus')
})

test('demo registration reserves legacy identifiers against cross-account login collisions', async () => {
  values.clear()
  await assert.rejects(() => demoRequest('/public/register', 'POST', { name: 'Colisão', username: 'matheus01', email: 'collision@example.com', password: 'test-only', cpf: '99000010101' }), /Usuário|identificador/)
})
test('demo refuses ambiguous identifiers even when one matching account is inactive', async () => {
  const db = createDemoDatabase()
  db.users[2].inviteCode = 'matheus'
  db.users[2].status = 'BLOCKED'
  values.set('gomove-demo-database-v4', JSON.stringify(db))
  await assert.rejects(() => demoRequest('/public/invites/matheus'), /Convite indisponível/)
})
test('demo admin generated invites cannot shadow another login', async () => {
  const db = createDemoDatabase()
  db.users[2].username = 'newadmin55'
  values.set('gomove-demo-database-v4', JSON.stringify(db))
  const originalRandom = Math.random
  Math.random = () => 0.5
  try {
    await demoRequest('/admin/associates', 'POST', { name: 'Novo admin', username: 'newadmin', email: 'newadmin@example.com', password: 'test-only', cpf: '99000010101', status: 'ACTIVE' }, 'demo:admin')
    const response = await demoRequest<any>('/public/invites/newadmin55')
    assert.equal(response.sponsor.username, 'newadmin55')
  } finally { Math.random = originalRandom }
})

test('demo admin name and status edits preserve an unchanged legacy identifier despite an invite collision', async () => {
  const db = createDemoDatabase()
  const ana = db.users.find(user => user.id === 'usr-ana')!
  const bruno = db.users.find(user => user.username === 'bruno')!
  bruno.inviteCode = 'ana'
  const originalInviteCode = ana.inviteCode
  values.set('gomove-demo-database-v4', JSON.stringify(db))

  const renamed = await demoRequest<any>('/admin/associates/usr-ana', 'PATCH', { name: 'Renamed legacy' }, 'demo:admin')
  assert.equal(renamed.name, 'Renamed legacy')
  assert.equal(renamed.username, 'ana')
  assert.equal(renamed.inviteCode, originalInviteCode)

  const blocked = await demoRequest<any>('/admin/associates/usr-ana', 'PATCH', { name: renamed.name, username: 'ana', status: 'BLOCKED' }, 'demo:admin')
  assert.equal(blocked.status, 'BLOCKED')
  assert.equal(blocked.username, 'ana')
  assert.equal(blocked.inviteCode, originalInviteCode)
  const persisted = JSON.parse(values.get('gomove-demo-database-v4')!).users.find((user: any) => user.id === ana.id)
  assert.equal(persisted.name, 'Renamed legacy')
  assert.equal(persisted.status, 'BLOCKED')
  assert.equal(persisted.username, 'ana')
  assert.equal(persisted.inviteCode, originalInviteCode)

  await assert.rejects(() => demoRequest('/public/invites/ana'), /Convite indisponível/)
  await assert.rejects(() => demoRequest('/public/register', 'POST', { name: 'Ambiguous', username: 'ambiguous', email: 'ambiguous@example.com', password: 'test-only', cpf: '99000010101', inviteCode: 'ana' }), /Convite indisponível/)
})

test('demo admin rejects a new username that conflicts with another legacy invite code', async () => {
  const db = createDemoDatabase()
  const ana = db.users.find(user => user.id === 'usr-ana')!
  const bruno = db.users.find(user => user.username === 'bruno')!
  bruno.inviteCode = 'reservedlegacy'
  values.set('gomove-demo-database-v4', JSON.stringify(db))

  await assert.rejects(() => demoRequest('/admin/associates/usr-ana', 'PATCH', { name: ana.name, username: 'reservedlegacy' }, 'demo:admin'), /Usuário ou e-mail já cadastrado/)
  const persisted = JSON.parse(values.get('gomove-demo-database-v4')!).users.find((user: any) => user.id === ana.id)
  assert.equal(persisted.username, 'ana')
  assert.equal(persisted.inviteCode, ana.inviteCode)
})

test('active associate and legacy numeric referrals keep their sponsor', async () => {
  const db = createDemoDatabase()
  db.users[2].inviteCode = '123456'
  values.set('gomove-demo-database-v4', JSON.stringify(db))
  for (const code of ['ana', '123456']) {
    const response = await demoRequest<any>(`/public/invites/${code}`)
    assert.equal(response.sponsor.username, 'ana')
  }
})
