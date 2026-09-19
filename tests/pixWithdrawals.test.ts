import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gomove-pix-withdrawals-'))
process.env.NODE_ENV = 'test'
process.env.GOMOVE_DATA_FILE = path.join(testDir, 'db.json')
process.env.APP_PUBLIC_URL = 'https://gomove.example'
process.env.TWOPP_API_KEY = 'test-key'
process.env.TWOPP_API_SECRET = 'test-secret'
process.env.TWOPP_WEBHOOK_TOKEN = 'payout-tests-token-at-least-32-characters'
const { app, readDb, writeDb } = await import('../server/index.js')
after(() => fs.rmSync(testDir, { recursive: true, force: true }))

type Row = Record<string, any>
async function scenario(cpf: string, run: (context: {
  request: (route: string, body?: Row, token?: string, method?: string) => Promise<{ status: number; body: Row }>
  hook: (id: string, data: Row) => Promise<{ status: number; body: Row }>
  token: string; userId: string; calls: Row[]
  provider: { beforeResponse?: (body: Row, id: string) => Promise<void>; drop?: boolean }
}) => Promise<void>) {
  const calls: Row[] = [], behavior: { beforeResponse?: (body: Row, id: string) => Promise<void>; drop?: boolean } = {}
  const provider = http.createServer((req, res) => {
    let raw = ''
    req.setEncoding('utf8')
    req.on('data', chunk => { raw += chunk })
    req.on('end', () => { void (async () => {
      assert.equal(req.url, '/api/v1/withdrawals/pix')
      const body = JSON.parse(raw), id = new URL(body.webhookUrl).pathname.split('/').at(-1)!
      calls.push(body)
      await behavior.beforeResponse?.(body, id)
      if (behavior.drop) { req.socket.destroy(); return }
      res.writeHead(201, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ status: 'success', data: { transactionId: `payout-${id}`, amount: body.amount.toFixed(2), netAmount: body.amount.toFixed(2), pixKey: body.pixKey, pixKeyType: 'cpf', status: 'PENDING' } }))
    })().catch(error => { res.destroy(error) }) })
  })
  await new Promise<void>(resolve => provider.listen(0, '127.0.0.1', resolve))
  process.env.TWOPP_BASE_URL = `http://127.0.0.1:${(provider.address() as { port: number }).port}`
  const server = app.listen(0)
  await new Promise<void>(resolve => server.listening ? resolve() : server.once('listening', resolve))
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`
  const request = async (route: string, body?: Row, token?: string, method = body ? 'POST' : 'GET') => {
    const res = await fetch(`${base}${route}`, { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
    return { status: res.status, body: await res.json() as Row }
  }
  const hook = (id: string, data: Row) => request(`/webhooks/2pp/${id}?token=${process.env.TWOPP_WEBHOOK_TOKEN}`, { data: { transactionId: `payout-${id}`, type: 'PAY_OUT', paymentMethod: 'pix', amount: '94.00', ...data } })
  try {
    const signup = await request('/public/register', { name: 'Teste PIX', cpf, username: `payout-${cpf}`, email: `payout-${cpf}@example.com`, password: 'test-password' })
    assert.equal(signup.status, 201)
    const { token, user } = signup.body, db = readDb()
    db.users.find(u => u.id === user.id)!.associatePlanStatus = 'ACTIVE'
    db.transactions.push({ id: `credit-${user.id}`, userId: user.id, wallet: 'REDE', amount: 300 })
    writeDb(db)
    await run({ request, hook, token, userId: user.id, calls, provider: behavior })
  } finally {
    await new Promise<void>(resolve => server.close(() => resolve()))
    await new Promise<void>(resolve => provider.close(() => resolve()))
  }
}

test('PIX uses registered CPF, ignores forged fee/provider fields, sends net and settles gross exactly once', async () => {
  await scenario('99000002001', async ({ request, hook, token, userId, calls }) => {
    const mismatch = await request('/withdrawals', { amount: 100, account: '52998224725' }, token)
    assert.equal(mismatch.status, 422)
    assert.equal(calls.length, 0)
    const payload = { amount: 100, wallet: 'REDE', idempotencyKey: 'net-payout', feeCents: 0, netCents: 10000, payoutAmountCents: 10000, twoPpTransactionId: 'forged' }
    const result = await request('/withdrawals', payload, token)
    assert.equal(result.status, 201)
    const payout = result.body
    assert.equal(payout.account, '99000002001')
    assert.equal(payout.amountCents, 10000)
    assert.equal(payout.feeCents, 600)
    assert.equal(payout.netCents, 9400)
    assert.equal(payout.payoutAmountCents, 9400)
    assert.equal(calls[0].amount, 94)
    assert.equal(calls[0].pixKey, '99000002001')
    assert.equal(calls[0].pixKeyType, 'cpf')
    assert.equal(calls[0].customerDocument, '99000002001')
    assert.equal((await request('/withdrawals', payload, token)).body.id, payout.id)
    assert.equal((await request('/withdrawals', { ...payload, amount: 101 }, token)).status, 409)
    assert.equal(calls.length, 1)
    assert.equal((await request('/state', undefined, token)).body.business.wallets.reservedRedeCents, 10000)
    assert.equal(readDb().transactions.filter((t: Row) => t.withdrawalId === payout.id).length, 0)
    assert.equal((await hook(payout.id, { status: 'COMPLETED', amount: '100.00' })).status, 422)
    assert.equal((await hook(payout.id, { status: 'COMPLETED', type: 'PAY_IN' })).status, 422)
    assert.equal((await hook(payout.id, { status: 'COMPLETED', paymentMethod: 'crypto' })).status, 422)
    assert.equal((await hook(payout.id, { status: 'COMPLETED' })).status, 200)
    assert.equal((await hook(payout.id, { status: 'COMPLETED', retry: 2 })).status, 200)
    assert.equal((await hook(payout.id, { status: 'PENDING' })).status, 200)
    const db = readDb(), saved = db.withdrawals.find((w: Row) => w.id === payout.id)
    assert.equal(saved.paymentStatus, 'CONFIRMED')
    assert.equal(saved.paymentProviderStatus, 'COMPLETED')
    assert.equal(saved.feeCents, 600)
    assert.equal(db.transactions.filter((t: Row) => t.withdrawalId === payout.id).length, 1)
    assert.equal(db.transactions.find((t: Row) => t.withdrawalId === payout.id).amount, -100)
    const wallets = (await request('/state', undefined, token)).body.business.wallets
    assert.equal(wallets.redeCents, 20000)
    assert.equal(wallets.reservedRedeCents, 0)
    assert.ok(db.users.some(u => u.id === userId))
  })
})

test('early payout confirmation is not downgraded by the create response, even after eligibility changes', async () => {
  await scenario('99000002184', async ({ request, hook, token, userId, provider }) => {
    provider.beforeResponse = async (_body, id) => {
      const db = readDb(); db.users.find(u => u.id === userId)!.associatePlanStatus = 'INACTIVE'; writeDb(db)
      assert.equal((await hook(id, { status: 'COMPLETED' })).status, 200)
    }
    const result = await request('/withdrawals', { amount: 100, idempotencyKey: 'early-payout' }, token)
    assert.equal(result.status, 201)
    assert.equal(result.body.paymentStatus, 'CONFIRMED')
    assert.equal(result.body.status, 'Pago')
    assert.equal(result.body.paymentProviderStatus, 'COMPLETED')
    assert.equal(readDb().transactions.filter((t: Row) => t.withdrawalId === result.body.id).length, 1)
  })
})

test('ambiguous failure retains the gross reservation; failed webhook releases it without charging the fee', async () => {
  await scenario('99000002265', async ({ request, hook, token, calls, provider }) => {
    provider.drop = true
    const payload = { amount: 100, idempotencyKey: 'unknown-payout' }
    assert.equal((await request('/withdrawals', payload, token)).status, 502)
    const retry = await request('/withdrawals', payload, token)
    assert.equal(retry.body.paymentStatus, 'PROVIDER_UNKNOWN')
    assert.equal(calls.length, 1)
    assert.equal((await request('/state', undefined, token)).body.business.wallets.reservedRedeCents, 10000)
    assert.equal((await hook(retry.body.id, { status: 'FAILED' })).status, 200)
    const wallets = (await request('/state', undefined, token)).body.business.wallets
    assert.equal(wallets.redeCents, 30000)
    assert.equal(wallets.reservedRedeCents, 0)
    assert.equal(readDb().transactions.filter((t: Row) => t.withdrawalId === retry.body.id).length, 0)
  })
})

test('legacy accounts without a valid stored CPF cannot withdraw; old gross payouts still settle', async () => {
  await scenario('99000002346', async ({ request, hook, token, userId, calls }) => {
    let db = readDb(); delete db.profiles[userId].cpf; writeDb(db)
    assert.equal((await request('/withdrawals', { amount: 100, account: '99000002346' }, token)).status, 422)
    db = readDb(); db.profiles[userId].cpf = '11111111111'; writeDb(db)
    assert.equal((await request('/withdrawals', { amount: 100 }, token)).status, 422)
    assert.equal(calls.length, 0)
    db = readDb()
    db.withdrawals.push({ id: 'legacy-payout', userId, amount: 100, amountCents: 10000, feeCents: 0, netCents: 10000, wallet: 'REDE', paymentProvider: '2PP', paymentStatus: 'PENDING', status: 'Pendente', twoPpTransactionId: 'payout-legacy-payout' })
    writeDb(db)
    assert.equal((await hook('legacy-payout', { status: 'COMPLETED', amount: '100.00' })).status, 200)
    const saved = readDb().withdrawals.find((w: Row) => w.id === 'legacy-payout')
    assert.equal(saved.status, 'Pago')
    assert.equal(saved.feeCents, 0)
  })
})

test('public registration rejects missing, repeated and checksum-invalid CPFs before creating accounts', async () => {
  await scenario('99000002427', async ({ request }) => {
    const before = readDb().users.length
    for (const cpf of [undefined, '', '11111111111', '52998224724', 'abc52998224725']) {
      const result = await request('/public/register', { name: 'CPF inválido', username: 'invalid-cpf', email: 'invalid@example.com', password: 'test-password', cpf })
      assert.equal(result.status, 422)
    }
    assert.equal(readDb().users.length, before)
  })
})
