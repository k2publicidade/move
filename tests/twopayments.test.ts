import { after, test } from 'node:test'
import { strict as assert } from 'node:assert'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gomove-2pp-'))
process.env.NODE_ENV = 'test'
process.env.GOMOVE_DATA_FILE = path.join(testDir, 'db.json')
process.env.APP_PUBLIC_URL = 'https://gomove.example'
const WEBHOOK_TOKEN = 'twop-test-token-with-at-least-32-characters'
process.env.TWOPP_API_KEY = 'twop-test-key'
process.env.TWOPP_API_SECRET = 'twop-test-secret'
process.env.TWOPP_WEBHOOK_TOKEN = WEBHOOK_TOKEN

const { TWO_PP_CRYPTO_CURRENCIES, TwoPpRequestError, createTwoPpCryptoTransaction, createTwoPpPixTransaction, isTwoPpCryptoCurrency } = await import('../server/twopayments.js')
const { app, readDb, writeDb } = await import('../server/index.js')

after(() => fs.rmSync(testDir, { recursive: true, force: true }))

async function withProvider(respond: (body: Record<string, any>) => Record<string, any>, run: (requests: Array<{ url: string; headers: http.IncomingHttpHeaders; body: Record<string, any> }>) => Promise<void>, options: { status?: number; raw?: boolean } = {}) {
  const requests: Array<{ url: string; headers: http.IncomingHttpHeaders; body: Record<string, any> }> = []
  const provider = http.createServer((request, response) => {
    let raw = ''
    request.setEncoding('utf8')
    request.on('data', chunk => { raw += chunk })
    request.on('end', () => {
      const body = JSON.parse(raw) as Record<string, any>
      requests.push({ url: String(request.url), headers: request.headers, body })
      response.writeHead(options.status ?? 201, { 'content-type': 'application/json' })
      response.end(JSON.stringify(options.raw ? respond(body) : { status: 'success', data: respond(body) }))
    })
  })
  await new Promise<void>(resolve => provider.listen(0, '127.0.0.1', resolve))
  try {
    const address = provider.address()
    assert.ok(address && typeof address === 'object')
    process.env.TWOPP_BASE_URL = `http://127.0.0.1:${address.port}`
    await run(requests)
  } finally {
    await new Promise<void>((resolve, reject) => provider.close(error => error ? reject(error) : resolve()))
  }
}

test('PIX charge sends credentials, customer data and a token-protected webhook URL', async () => {
  await withProvider(() => ({ transactionId: '2pp-pix-create', qrCode: '000201-2pp-copy-paste', paymentUrl: '000201-2pp-copy-paste', status: 'PENDING' }), async requests => {
    const transaction = await createTwoPpPixTransaction({ localId: 'INV-2PP-1', amount: 55, customerName: 'Cliente GoMove', customerEmail: 'cliente@example.com', customerDocument: '123.456.789-01' })
    assert.equal(transaction.id, '2pp-pix-create')
    assert.equal(transaction.pixQrCode, '000201-2pp-copy-paste')
    assert.equal(transaction.paymentMethod, 'pix')
    assert.equal(transaction.paymentUrl, null)
    assert.equal(requests[0].url, '/api/v1/transactions/pix')
    assert.equal(requests[0].headers['x-api-key'], 'twop-test-key')
    assert.equal(requests[0].headers['x-api-secret'], 'twop-test-secret')
    assert.deepEqual(requests[0].body, {
      amount: 55,
      customerName: 'Cliente GoMove',
      customerEmail: 'cliente@example.com',
      customerDocument: '12345678901',
      webhookUrl: `https://gomove.example/api/webhooks/2pp/INV-2PP-1?token=${encodeURIComponent(WEBHOOK_TOKEN)}`,
    })
  })
})

test('crypto charge prices in BRL, returns the wallet address and rejects unsupported currencies', async () => {
  await withProvider(body => ({ transactionId: '2pp-crypto-create', payAddress: '0xabc2pp', payAmount: '9.26', payCurrency: body.payCurrency, status: 'PENDING' }), async requests => {
    const transaction = await createTwoPpCryptoTransaction({ localId: 'ATV-2PP-1', amount: 50, payCurrency: 'usdt-trc20', customerName: 'Cliente GoMove', customerEmail: 'cliente@example.com' })
    assert.equal(transaction.id, '2pp-crypto-create')
    assert.equal(transaction.paymentMethod, 'crypto')
    assert.equal(transaction.payAddress, '0xabc2pp')
    assert.equal(transaction.payAmount, '9.26')
    assert.equal(transaction.payCurrency, 'usdt-trc20')
    assert.equal(requests[0].url, '/api/v1/transactions/crypto')
    assert.equal(requests[0].body.priceCurrency, 'BRL')
    assert.equal(requests[0].body.payCurrency, 'usdt-trc20')
    assert.deepEqual([...TWO_PP_CRYPTO_CURRENCIES], ['usdt-trc20', 'usdt-bep20'])
    assert.equal(isTwoPpCryptoCurrency('usdt-bep20'), true)
    assert.equal(isTwoPpCryptoCurrency('btc'), false)
  })
})

const pixInput = { localId: 'pix-error-tests', amount: 100, customerName: 'Cliente GoMove', customerEmail: 'cliente@example.com', customerDocument: '12345678901' }

test('PIX uses a copia-e-cola paymentUrl when qrCode is empty, without treating a checkout URL as PIX', async () => {
  await withProvider(() => ({ transactionId: 'pix-fallback', qrCode: '', paymentUrl: '000201-fallback-pix', status: 'PENDING' }), async () => {
    const result = await createTwoPpPixTransaction(pixInput)
    assert.equal(result.pixQrCode, '000201-fallback-pix')
    assert.equal(result.paymentUrl, null)
  })
  await withProvider(() => ({ transactionId: 'pix-no-code', paymentUrl: 'https://example.com/checkout', status: 'PENDING' }), async () => {
    await assert.rejects(createTwoPpPixTransaction(pixInput), error => error instanceof TwoPpRequestError && error.details.outcome === 'unknown' && error.details.transactionId === 'pix-no-code')
  })
})

test('gateway rejection preserves a redacted reason and never retries the POST', async () => {
  await withProvider(body => ({ message: `Documento inválido: ${body.customerDocument}, ${body.customerEmail}, ${body.customerName}; twop-test-secret ${body.webhookUrl}` }), async requests => {
    await assert.rejects(createTwoPpPixTransaction(pixInput), error => {
      assert.ok(error instanceof TwoPpRequestError)
      assert.equal(error.details.outcome, 'rejected')
      assert.equal(error.details.httpStatus, 422)
      assert.match(error.message, /Documento inválido/)
      for (const secret of [pixInput.customerDocument, pixInput.customerEmail, pixInput.customerName, 'twop-test-secret', WEBHOOK_TOKEN]) assert.ok(!error.message.includes(secret))
      return true
    })
    assert.equal(requests.length, 1)
  }, { status: 422, raw: true })
})

test('failed transactions keep their reference; a generic 500 remains uncertain', async () => {
  await withProvider(() => ({ message: 'Provedor recusou a cobrança', data: { transactionId: 'failed-pix', status: 'FAILED' } }), async () => {
    await assert.rejects(createTwoPpPixTransaction(pixInput), error => error instanceof TwoPpRequestError && error.details.outcome === 'rejected' && error.details.transactionId === 'failed-pix')
  }, { status: 500, raw: true })
  await withProvider(() => ({ message: 'Gateway indisponível' }), async () => {
    await assert.rejects(createTwoPpPixTransaction(pixInput), error => error instanceof TwoPpRequestError && error.details.outcome === 'unknown')
  }, { status: 500, raw: true })
})

test('rate limiting preserves the provider wait time without retrying automatically', async () => {
  await withProvider(() => ({ status: 'error', message: 'Rate limit exceeded', retryAfter: 42 }), async requests => {
    await assert.rejects(createTwoPpPixTransaction(pixInput), error => error instanceof TwoPpRequestError && error.details.outcome === 'rejected' && error.details.retryAfter === 42)
    assert.equal(requests.length, 1)
  }, { status: 429, raw: true })
})

test('completed PIX webhook confirms a quota once and rejects a wrong token or mismatched amount', async () => {
  const db = readDb()
  const investor = db.users.find((user: { username: string }) => user.username === 'matheus')
  assert.ok(investor)
  db.investments.unshift({ id: 'ATV-2PP-TEST', userId: investor.id, pack: 'Cotas GoMove', amount: 500, amountCents: 50000, status: 'Aguardando pagamento', paymentStatus: 'PENDING', paymentProvider: '2PP', paymentMethod: 'PIX', paymentAsset: 'PIX', twoPpTransactionId: '2pp-tx-webhook' })
  writeDb(db)

  const server = app.listen(0)
  try {
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const rawBody = JSON.stringify({ status: 'success', data: { transactionId: '2pp-tx-webhook', amount: '500.00', netAmount: '475.00', status: 'COMPLETED', paymentMethod: 'pix' } })
    const baseUrl = `http://127.0.0.1:${address.port}/api/webhooks/2pp`
    const rejected = await fetch(`${baseUrl}?token=wrong`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: rawBody })
    assert.equal(rejected.status, 401)
    const mismatch = await fetch(`${baseUrl}?token=${encodeURIComponent(WEBHOOK_TOKEN)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: { transactionId: '2pp-tx-webhook', amount: '499.99', status: 'COMPLETED', paymentMethod: 'pix' } }) })
    assert.equal(mismatch.status, 422)
    const otherRail = await fetch(`${baseUrl}?token=${encodeURIComponent(WEBHOOK_TOKEN)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ data: { transactionId: '2pp-tx-webhook', amount: '500.00', status: 'COMPLETED', paymentMethod: 'crypto' } }) })
    assert.equal(otherRail.status, 422)
    const first = await fetch(`${baseUrl}?token=${encodeURIComponent(WEBHOOK_TOKEN)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: rawBody })
    assert.equal(first.status, 200)
    assert.equal((await first.json() as { idempotent: boolean }).idempotent, false)
    const retry = await fetch(`${baseUrl}?token=${encodeURIComponent(WEBHOOK_TOKEN)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: rawBody })
    assert.equal(retry.status, 200)
    assert.equal((await retry.json() as { idempotent: boolean }).idempotent, true)
    const updated = readDb()
    const investment = updated.investments.find((item: { id: string }) => item.id === 'ATV-2PP-TEST')
    assert.equal(investment.paymentStatus, 'CONFIRMED')
    assert.equal(investment.status, 'Ativo')
    assert.equal(updated.commissionEvents.filter((event: { investmentId: string }) => event.investmentId === investment.id).length, 1)
    assert.equal(updated.twoPpWebhookEvents.length, 1)
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})
