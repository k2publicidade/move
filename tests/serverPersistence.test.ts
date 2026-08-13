import { after, test } from 'node:test'
import { strict as assert } from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gomove-persistence-'))
const testFile = path.join(testDir, 'db.json')
process.env.NODE_ENV = 'test'
process.env.GOMOVE_DATA_FILE = testFile

const { app, readDb } = await import('../server/index.js')

after(() => fs.rmSync(testDir, { recursive: true, force: true }))

test('database reads normalize once and remain read-only afterwards', () => {
  const first = readDb()
  assert.ok(first.users.length > 0)
  const initial = fs.statSync(testFile)

  for (let index = 0; index < 20; index++) readDb()

  const afterReads = fs.statSync(testFile)
  assert.equal(afterReads.mtimeMs, initial.mtimeMs)
  assert.equal(fs.readdirSync(testDir).filter(name => name.endsWith('.tmp')).length, 0)
})

test('parallel authenticated administrative reads do not contend for the database file', async () => {
  const server = app.listen(0)
  try {
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const baseUrl = `http://127.0.0.1:${address.port}`
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'gomove2026' }),
    })
    assert.equal(login.status, 200)
    const { token } = await login.json() as { token: string }
    const headers = { authorization: `Bearer ${token}` }
    const responses = await Promise.all(Array.from({ length: 10 }, (_, index) =>
      fetch(`${baseUrl}/api/admin/${index % 2 ? 'invoices' : 'bonus-entries'}?pageSize=100`, { headers })
    ))

    assert.deepEqual(responses.map(response => response.status), Array(10).fill(200))
    for (const response of responses) assert.ok(Array.isArray(((await response.json()) as { items: unknown[] }).items))
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})

test('MASTER can manually confirm a pending CoinPayments quota acquisition once', async () => {
  const server = app.listen(0)
  try {
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const baseUrl = `http://127.0.0.1:${address.port}`
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'gomove2026' }),
    })
    assert.equal(login.status, 200)
    const { token } = await login.json() as { token: string }
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
    const associatesResponse = await fetch(`${baseUrl}/api/admin/associates?pageSize=100`, { headers })
    const associates = await associatesResponse.json() as { items: Array<{ id: string; username: string }> }
    const participant = associates.items.find(item => item.username === 'matheus')
    assert.ok(participant)
    const creation = await fetch(`${baseUrl}/api/admin/investments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ userId: participant.id, amount: 500, paymentProvider: 'COINPAYMENTS', paymentMethod: 'CoinPayments', paymentStatus: 'PENDING', status: 'Aguardando pagamento' }),
    })
    assert.equal(creation.status, 201)
    const investment = await creation.json() as { id: string }

    const confirmation = await fetch(`${baseUrl}/api/admin/investments/${investment.id}/confirm`, { method: 'POST', headers, body: '{}' })
    assert.equal(confirmation.status, 200)
    const confirmed = await confirmation.json() as { idempotent: boolean; bonuses: unknown[] }
    assert.equal(confirmed.idempotent, false)

    const retry = await fetch(`${baseUrl}/api/admin/investments/${investment.id}/confirm`, { method: 'POST', headers, body: '{}' })
    assert.equal(retry.status, 200)
    assert.equal(((await retry.json()) as { idempotent: boolean }).idempotent, true)
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})
