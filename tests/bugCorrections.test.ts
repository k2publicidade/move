import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gomove-bug-corrections-'))
process.env.NODE_ENV = 'test'
process.env.GOMOVE_DATA_FILE = path.join(dir, 'db.json')
const { app, readDb, writeDb } = await import('../server/index.js')
const server = app.listen(0)
await new Promise<void>(resolve => server.listening ? resolve() : server.once('listening', resolve))
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`
const request = async (route: string, token?: string, body?: unknown) => {
  const response = await fetch(base + route, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
  return { status: response.status, body: await response.json() as any }
}
after(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()))
  assert.equal(path.dirname(dir), os.tmpdir())
  assert.ok(path.basename(dir).startsWith('gomove-bug-corrections-'))
  fs.rmSync(dir, { recursive: true, force: true })
})

test('approved bonus totals include reversals and match the network wallet before withdrawals', async () => {
  const session = (await request('/auth/login', undefined, { username: 'ana', password: 'gomove2026' })).body
  const db = readDb(), userId = session.user.id
  db.bonusEntries = db.bonusEntries.filter((entry: any) => entry.userId !== userId)
  db.transactions = db.transactions.filter((entry: any) => entry.userId !== userId)
  for (const [id, amountCents, type] of [['bonus', 10000, 'MANUAL'], ['reversal', -10000, 'REVERSAL']] as const) {
    db.bonusEntries.push({ id, userId, amountCents, type, status: 'APPROVED', createdAt: new Date().toISOString() })
    db.transactions.push({ id: `tx-${id}`, userId, bonusEntryId: id, amount: amountCents / 100, createdAt: new Date().toISOString() })
  }
  writeDb(db)
  const state = (await request('/state', session.token)).body
  assert.equal(state.business.wallets.redeCents, 0)
  assert.equal(state.business.approvedBonusCents, 0)
  assert.equal(state.business.bonusPeriods.todayCents, 0)
  // Reversal does not renew an already consumed lifetime earnings cap.
  assert.equal(state.business.earningCapConsumedCents, 10000)
})

test('explicitly unpaid active quotas never enlarge the earnings cap; legacy paid quota amounts remain counted', async () => {
  const session = (await request('/auth/login', undefined, { username: 'matheus', password: 'gomove2026' })).body
  const db = readDb(), userId = session.user.id
  db.investments = [
    { id: 'unpaid', userId, status: 'Ativo', paymentStatus: 'PENDING', amount: 1000, amountCents: 100000 },
    { id: 'legacy', userId, status: 'Ativo', amount: 60 },
    { id: 'confirmed', userId, status: 'Ativo', paymentStatus: 'CONFIRMED', amount: 120 },
  ]
  writeDb(db)
  const state = (await request('/state', session.token)).body
  assert.equal(state.business.quotaAmountCents, 18000)
  assert.equal(state.business.earningCapCents, 27000)
})

test('invite validation and public registration accept the same pasted URL', async () => {
  const inviteCode = 'https://gomove.example/cadastro?convite=MATHEUS01'
  assert.equal((await request(`/public/invites/${encodeURIComponent(inviteCode)}`)).status, 200)
  const result = await request('/public/register', undefined, { name: 'URL invite', username: 'url_invite', email: 'urlinvite@example.com', password: 'safe-password', cpf: '52998224725', inviteCode })
  assert.equal(result.status, 201)
  assert.equal(result.body.user.sponsorId, readDb().users.find(user => user.username === 'matheus')!.id)
  assert.equal(result.body.user.status, 'ACTIVE')
})
