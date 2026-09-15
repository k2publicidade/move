import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { transactionWallet, walletSummary } from '../src/wallets.js'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gomove-wallets-'))
process.env.NODE_ENV = 'test'
process.env.GOMOVE_DATA_FILE = path.join(dir, 'db.json')
process.env.APP_PUBLIC_URL = 'https://gomove.example'
process.env.TWOPP_API_KEY = 'test'
process.env.TWOPP_API_SECRET = 'test'
process.env.TWOPP_WEBHOOK_TOKEN = 'wallet-test-token-with-at-least-32-characters'
const { app, readDb, writeDb } = await import('../server/index.js')
const server = app.listen(0)
await new Promise<void>(resolve => server.listening ? resolve() : server.once('listening', resolve))
const port = (server.address() as { port: number }).port
const request = async (route: string, token?: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') => {
  const res = await fetch(`http://127.0.0.1:${port}/api${route}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) })
  return { status: res.status, body: await res.json() as any }
}
after(async () => { await new Promise<void>(resolve => server.close(() => resolve())); fs.rmSync(dir, { recursive: true, force: true }) })

test('legacy credits are classified conservatively and active shareholder label alone does not unlock withdrawals', () => {
  assert.equal(transactionWallet({ amount: 100, description: 'Depósito PIX' }), 'BALANCE')
  assert.equal(transactionWallet({ amount: 100, description: 'Crédito sem origem' }), 'BALANCE')
  assert.equal(transactionWallet({ amount: 100, bonusEntryId: 'bonus' }), 'REDE')
  assert.equal(transactionWallet({ amount: -50, withdrawalId: 'withdrawal' }), 'REDE')
  const db = { transactions: [{ userId: 'u', amount: 100, wallet: 'EARNINGS' }], withdrawals: [], investments: [] }
  const user = { id: 'u', status: 'ACTIVE', membershipType: 'SHAREHOLDER', associatePlanStatus: 'INACTIVE' }
  assert.equal(walletSummary(db, user).withdrawableCents, 0)
  assert.equal(walletSummary({ ...db, investments: [{ userId: 'u', status: 'Encerrado', paymentStatus: 'CONFIRMED' }] }, user).hasActivePackage, false)
  assert.equal(walletSummary({ ...db, investments: [{ userId: 'u', status: 'Ativo', paymentStatus: 'CONFIRMED' }] }, user).withdrawableCents, 10000)
})

test('deposit webhook credits only purchase wallet; purchases, reservations and MASTER payout enforce separation', async () => {
  const master = (await request('/auth/login', undefined, { username: 'admin', password: 'gomove2026' })).body
  const session = (await request('/public/register', undefined, { name: 'Wallet Test', username: 'wallet_test', email: 'wallet@example.com', password: 'safe-password-123', cpf: '99000000050' })).body
  assert.ok(session.token, JSON.stringify(session))
  const userId = session.user.id
  const provider = http.createServer((req, res) => { req.resume(); req.on('end', () => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ data: { transactionId: 'wallet-deposit-1', qrCode: '000201-wallet-test', status: 'PENDING' } })) }) })
  await new Promise<void>(resolve => provider.listen(0, '127.0.0.1', resolve))
  process.env.TWOPP_BASE_URL = `http://127.0.0.1:${(provider.address() as { port: number }).port}`
  try {
    const payload = { amount: 1000, paymentMethod: 'PIX', customerDocument: '12345678901', idempotencyKey: 'deposit-1' }
    const created = await request('/deposits', session.token, payload)
    assert.equal(created.status, 201, JSON.stringify(created.body))
    assert.equal((await request('/deposits', session.token, payload)).body.id, created.body.id)
    assert.equal((await request('/deposits', session.token, { ...payload, amount: 100 })).status, 409)
    assert.equal((await request('/state', session.token)).body.business.wallets.balanceCents, 0)
    const event = { data: { transactionId: 'wallet-deposit-1', amount: '1000.00', status: 'COMPLETED', paymentMethod: 'pix' } }
    assert.equal((await request('/webhooks/2pp?token=wrong', undefined, event)).status, 401)
    const hook = `/webhooks/2pp?token=${process.env.TWOPP_WEBHOOK_TOKEN}`
    assert.equal((await request(hook, undefined, { data: { ...event.data, amount: '100.00' } })).status, 422)
    assert.equal((await request(hook, undefined, event)).status, 200)
    assert.equal((await request(hook, undefined, event)).status, 200)
    assert.equal((await request(hook, undefined, { ...event, retry: 2 })).status, 200)
    let wallets = (await request('/state', session.token)).body.business.wallets
    assert.equal(wallets.balanceCents, 100000)
    assert.equal(wallets.earningsCents, 0)
    assert.equal(wallets.hasActivePackage, false)
    assert.equal((await request('/withdrawals', session.token, { amount: 100, wallet: 'BALANCE' })).status, 422)
    const plan = { productType: 'ASSOCIATE_PLAN', idempotencyKey: 'plan-1' }
    assert.equal((await request('/wallet/purchases', session.token, plan)).status, 201)
    assert.equal((await request('/wallet/purchases', session.token, plan)).status, 200)
    wallets = (await request('/state', session.token)).body.business.wallets
    assert.equal(wallets.balanceCents, 94500)
    assert.equal(wallets.hasActivePackage, true)
    assert.equal((await request('/withdrawals', session.token, { amount: 50 })).status, 422)
    const quota = { productType: 'INVESTMENT', amount: 500, idempotencyKey: 'quota-1' }
    const bought = await request('/wallet/purchases', session.token, quota)
    assert.equal(bought.status, 201, JSON.stringify(bought.body))
    assert.equal(bought.body.status, 'Ativo')
    assert.equal((await request('/wallet/purchases', session.token, quota)).status, 200)
    const product = { productType: 'PRODUCT', productId: 'PROD-03', total: 0.01, idempotencyKey: 'product-1' }
    assert.equal((await request('/wallet/purchases', session.token, product)).body.total, 149)
    assert.equal((await request('/wallet/purchases', session.token, product)).status, 200)
    assert.equal((await request('/wallet/purchases', session.token, { productType: 'INVESTMENT', amount: 500, idempotencyKey: 'too-much' })).status, 422)
    const base = `/admin/associates/${userId}/balance-adjustments`
    assert.equal((await request(base, master.token, { amountCents: 20000, wallet: 'REDE', reason: 'Ganho conferido', reference: 'earning-1' })).status, 201)
    const pending = await request('/withdrawals', session.token, { amount: 150, wallet: 'REDE', account: '99000000050', status: 'Pago' })
    assert.equal(pending.status, 201)
    assert.equal(pending.body.status, 'Pendente')
    assert.equal(pending.body.wallet, 'REDE')
    assert.equal((await request('/withdrawals', session.token, { amount: 50.01 })).status, 422)
    assert.equal((await request('/withdrawals', session.token, { amount: 50.001 })).status, 422)
    assert.equal((await request(`/withdrawals/${pending.body.id}`, session.token, { status: 'Recusado' }, 'PATCH')).status, 403)
    assert.equal((await request('/admin/withdrawals', master.token, { userId, amount: 100, status: 'Pago' })).status, 422)
    assert.equal((await request(base, master.token, { amountCents: -10000, wallet: 'REDE', reason: 'Débito', reference: 'debit-1' })).status, 422)
    const db = readDb(); db.users.find(u => u.id === userId)!.associatePlanStatus = 'INACTIVE'; db.investments.filter(i => i.userId === userId).forEach(i => { i.status = 'Encerrado' }); writeDb(db)
    assert.equal((await request(`/admin/withdrawals/${pending.body.id}`, master.token, { status: 'Pago' }, 'PATCH')).status, 422)
    const active = readDb(); active.users.find(u => u.id === userId)!.associatePlanStatus = 'ACTIVE'; writeDb(active)
    assert.equal((await request(`/admin/withdrawals/${pending.body.id}`, master.token, { status: 'Pago' }, 'PATCH')).status, 200)
    assert.equal((await request(`/admin/withdrawals/${pending.body.id}`, master.token, { status: 'Pendente' }, 'PATCH')).status, 422)
    assert.equal((await request(`/admin/withdrawals/${pending.body.id}`, master.token, undefined, 'DELETE')).status, 422)
    wallets = (await request('/state', session.token)).body.business.wallets
    assert.equal(wallets.balanceCents, 29600)
    assert.equal(wallets.earningsCents, 5000)
    assert.equal(wallets.reservedCents, 0)
    assert.equal(wallets.withdrawableCents, 5000)
    assert.equal((await request('/withdrawals', session.token, { amount: 50, wallet: 'REDE', account: '99000000050' })).status, 422)
    assert.equal((await request('/state', session.token)).body.business.wallets.withdrawableCents, 5000)
    assert.equal(readDb().transactions.filter((t: any) => t.withdrawalId === pending.body.id).length, 1)
    assert.equal(readDb().transactions.filter((t: any) => t.depositId === created.body.id).length, 1)
  } finally { await new Promise<void>(resolve => provider.close(() => resolve())) }
})
