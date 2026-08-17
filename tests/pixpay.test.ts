import { after, test } from 'node:test'
import { strict as assert } from 'node:assert'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gomove-pixpay-'))
process.env.NODE_ENV = 'test'
process.env.GOMOVE_DATA_FILE = path.join(testDir, 'db.json')
process.env.APP_PUBLIC_URL = 'https://gomove.example'
process.env.PIXPAY_API_KEY = 'pixpay-test-key'
process.env.PIXPAY_API_SECRET = 'pixpay-test-secret'
process.env.PIXPAY_WEBHOOK_TOKEN = 'pixpay-webhook-token-with-at-least-32-characters'

const { createPixPayTransaction } = await import('../server/pixpay.js')
const { app, readDb, writeDb } = await import('../server/index.js')

after(() => fs.rmSync(testDir, { recursive: true, force: true }))

test('PIXPAY charge sends credentials, customer data and a protected webhook URL', async () => {
  let received: { headers: http.IncomingHttpHeaders; body: any } | undefined
  const provider = http.createServer((request, response) => {
    let raw = ''
    request.setEncoding('utf8')
    request.on('data', chunk => { raw += chunk })
    request.on('end', () => {
      received = { headers: request.headers, body: JSON.parse(raw) }
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ data: { transactionId: 'pixpay-tx-create', paymentUrl: null, qrCode: '000201-pix-copy-paste', status: 'PENDING' } }))
    })
  })
  await new Promise<void>(resolve => provider.listen(0, '127.0.0.1', resolve))
  try {
    const address = provider.address()
    assert.ok(address && typeof address === 'object')
    process.env.PIXPAY_BASE_URL = `http://127.0.0.1:${address.port}`
    const transaction = await createPixPayTransaction({ amount: 55, customerName: 'Cliente GoMove', customerEmail: 'cliente@example.com', customerDocument: '123.456.789-01' })
    assert.equal(transaction.id, 'pixpay-tx-create')
    assert.equal(transaction.qrCode, '000201-pix-copy-paste')
    assert.equal(received?.headers['x-api-key'], 'pixpay-test-key')
    assert.equal(received?.headers['x-api-secret'], 'pixpay-test-secret')
    assert.deepEqual(received?.body, {
      amount: 55,
      customerName: 'Cliente GoMove',
      customerEmail: 'cliente@example.com',
      customerDocument: '12345678901',
      webhookUrl: `https://gomove.example/api/webhooks/pixpay?token=${encodeURIComponent(process.env.PIXPAY_WEBHOOK_TOKEN!)}`,
    })
  } finally {
    await new Promise<void>((resolve, reject) => provider.close(error => error ? reject(error) : resolve()))
  }
})

test('PIXPAY completed webhook confirms a quota once and rejects a wrong token', async () => {
  const db = readDb()
  const investor = db.users.find((user: { username: string }) => user.username === 'matheus')
  assert.ok(investor)
  db.investments.unshift({ id: 'ATV-PIXPAY-TEST', userId: investor.id, pack: 'Cotas GoMove', amount: 500, amountCents: 50000, status: 'Aguardando pagamento', paymentStatus: 'PENDING', paymentProvider: 'PIXPAY', paymentMethod: 'PIX', pixPayTransactionId: 'pixpay-tx-webhook' })
  writeDb(db)

  const server = app.listen(0)
  try {
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const rawBody = JSON.stringify({ status: 'success', data: { transactionId: 'pixpay-tx-webhook', amount: '500.00', netAmount: '475.00', status: 'COMPLETED', paymentMethod: 'pix' } })
    const baseUrl = `http://127.0.0.1:${address.port}/api/webhooks/pixpay`
    const rejected = await fetch(`${baseUrl}?token=wrong`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: rawBody })
    assert.equal(rejected.status, 401)
    const first = await fetch(`${baseUrl}?token=${encodeURIComponent(process.env.PIXPAY_WEBHOOK_TOKEN!)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: rawBody })
    assert.equal(first.status, 200)
    assert.equal((await first.json() as { idempotent: boolean }).idempotent, false)
    const retry = await fetch(`${baseUrl}?token=${encodeURIComponent(process.env.PIXPAY_WEBHOOK_TOKEN!)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: rawBody })
    assert.equal(retry.status, 200)
    assert.equal((await retry.json() as { idempotent: boolean }).idempotent, true)
    const updated = readDb()
    const investment = updated.investments.find((item: { id: string }) => item.id === 'ATV-PIXPAY-TEST')
    assert.equal(investment.paymentStatus, 'CONFIRMED')
    assert.equal(investment.status, 'Ativo')
    assert.equal(updated.commissionEvents.filter((event: { investmentId: string }) => event.investmentId === investment.id).length, 1)
    assert.equal(updated.pixPayWebhookEvents.length, 1)
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})
