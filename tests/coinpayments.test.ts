import { after, test } from 'node:test'
import { strict as assert } from 'node:assert'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gomove-coinpayments-'))
process.env.NODE_ENV = 'test'
process.env.GOMOVE_DATA_FILE = path.join(testDir, 'db.json')
process.env.COINPAYMENTS_CLIENT_ID = 'test-client'
process.env.COINPAYMENTS_CLIENT_SECRET = 'test-secret'
process.env.COINPAYMENTS_WEBHOOK_URL = 'https://gomove.example/api/webhooks/coinpayments'

const { app, readDb, writeDb } = await import('../server/index.js')

after(() => fs.rmSync(testDir, { recursive: true, force: true }))

function signedHeaders(rawBody: string, timestamp: string) {
  const message = `\ufeffPOST${process.env.COINPAYMENTS_WEBHOOK_URL}${process.env.COINPAYMENTS_CLIENT_ID}${timestamp}${rawBody}`
  return {
    'content-type': 'application/json',
    'x-coinpayments-client': process.env.COINPAYMENTS_CLIENT_ID!,
    'x-coinpayments-timestamp': timestamp,
    'x-coinpayments-signature': crypto.createHmac('sha256', process.env.COINPAYMENTS_CLIENT_SECRET!).update(message).digest('base64'),
  }
}

test('signed InvoiceCompleted webhook confirms once and generates bonuses once', async () => {
  const db = readDb()
  const investor = db.users.find((user: { username: string }) => user.username === 'matheus')
  assert.ok(investor)
  db.investments.unshift({ id: 'ATV-CP-TEST', userId: investor.id, pack: 'Cotas GoMove', amount: 2500, amountCents: 250000, status: 'Aguardando pagamento', paymentStatus: 'PENDING', paymentProvider: 'COINPAYMENTS', coinPaymentsInvoiceId: 'cp-invoice-test' })
  writeDb(db)

  const server = app.listen(0)
  try {
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const rawBody = JSON.stringify({ id: 'cp-invoice-test', type: 'InvoiceCompleted', invoice: { id: 'cp-invoice-test', state: 'Completed', payments: [{ confirmations: 3, requiredConfirmations: 3 }] } })
    const timestamp = new Date().toISOString().split('.')[0]
    const url = `http://127.0.0.1:${address.port}/api/webhooks/coinpayments`
    const first = await fetch(url, { method: 'POST', headers: signedHeaders(rawBody, timestamp), body: rawBody })
    assert.equal(first.status, 200)
    assert.equal((await first.json() as { idempotent: boolean }).idempotent, false)
    const retry = await fetch(url, { method: 'POST', headers: signedHeaders(rawBody, timestamp), body: rawBody })
    assert.equal(retry.status, 200)
    assert.equal((await retry.json() as { idempotent: boolean }).idempotent, true)

    const updated = readDb()
    const investment = updated.investments.find((item: { id: string }) => item.id === 'ATV-CP-TEST')
    assert.equal(investment.status, 'Ativo')
    assert.equal(investment.paymentStatus, 'CONFIRMED')
    assert.equal(updated.commissionEvents.filter((event: { investmentId: string }) => event.investmentId === investment.id).length, 1)
    assert.equal(updated.coinPaymentsWebhookEvents.length, 1)
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})

test('webhook with an invalid signature is rejected', async () => {
  const server = app.listen(0)
  try {
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const response = await fetch(`http://127.0.0.1:${address.port}/api/webhooks/coinpayments`, {
      method: 'POST',
      headers: { ...signedHeaders('{}', new Date().toISOString().split('.')[0]), 'x-coinpayments-signature': 'invalid' },
      body: '{}',
    })
    assert.equal(response.status, 401)
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})
