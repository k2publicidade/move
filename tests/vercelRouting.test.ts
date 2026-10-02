import { after, test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gomove-serverless-routing-'))
process.env.NODE_ENV = 'test'
process.env.GOMOVE_DATA_FILE = path.join(directory, 'db.json')
process.env.APP_PUBLIC_URL = 'https://gomove.example'
process.env.TWOPP_API_KEY = 'test-key'
process.env.TWOPP_API_SECRET = 'test-secret'
process.env.TWOPP_WEBHOOK_TOKEN = 'serverless-routing-webhook-at-least-32-chars'
const { default: handler } = await import('../api/index.js')
const { readDb, writeDb } = await import('../server/index.js')
const server = http.createServer(handler)
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
after(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()))
  fs.rmSync(directory, { recursive: true, force: true })
})

test('serverless entry resolves both rewrite parameters and original invitation URLs', async () => {
  for (const url of ['/api/index?path=public/invites/matheus01', '/api/public/invites/matheus01']) {
    const response = await fetch(`${base}${url}`)
    assert.equal(response.status, 200, url)
    assert.match(response.headers.get('content-type') ?? '', /application\/json/, url)
    assert.equal((await response.json() as any).sponsor.inviteCode, 'matheus01')
  }
})

test('serverless entry preserves webhook authentication and raw JSON through the rewrite', async () => {
  const db = readDb(), user = db.users.find(u => u.username === 'matheus')!
  db.invoices.push({ id: 'serverless-deposit', userId: user.id, productType: 'DEPOSIT', paymentProvider: '2PP', paymentAsset: 'PIX', amount: 100, amountCents: 10000, paymentStatus: 'PENDING', twoPpTransactionId: 'serverless-provider-id' })
  writeDb(db)
  const body = JSON.stringify({ data: { transactionId: 'serverless-provider-id', paymentMethod: 'pix', amount: '100.00', status: 'COMPLETED' } })
  const send = (token: string, direct = false) => fetch(direct ? `${base}/api/webhooks/2pp/serverless-deposit?token=${token}` : `${base}/api/index?path=webhooks/2pp/serverless-deposit&token=${token}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body })
  assert.equal((await send('wrong')).status, 401)
  assert.equal((await send('wrong', true)).status, 401)
  assert.equal((await send(process.env.TWOPP_WEBHOOK_TOKEN!, true)).status, 200)
  assert.equal((await send(process.env.TWOPP_WEBHOOK_TOKEN!)).status, 200)
  const confirmed = readDb()
  assert.equal(confirmed.invoices.find((item: any) => item.id === 'serverless-deposit').paymentStatus, 'CONFIRMED')
  assert.equal(confirmed.transactions.filter((item: any) => item.depositId === 'serverless-deposit').length, 1)
})
