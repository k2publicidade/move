import { after, test } from 'node:test'
import { strict as assert } from 'node:assert'
import fs from 'node:fs'
import crypto from 'node:crypto'
import http, { type Server } from 'node:http'
import os from 'node:os'
import path from 'node:path'

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gomove-persistence-'))
const testFile = path.join(testDir, 'db.json')
process.env.NODE_ENV = 'test'
process.env.GOMOVE_DATA_FILE = testFile

const { app, readDb, writeDb } = await import('../server/index.js')

const listen = (server: Server) => new Promise<number>((resolve, reject) => {
  server.listen(0, '127.0.0.1', () => {
    const address = server.address()
    if (!address || typeof address === 'string') return reject(new Error('Porta indisponível'))
    resolve(address.port)
  })
})

type ProviderHarness = {
  calls: number
  requests: Array<Record<string, any>>
  beforeResponse?: (request: Record<string, any>) => Promise<void>
  dropConnection?: boolean
}

async function withCoinPaymentsServers(run: (baseUrl: string, provider: ProviderHarness) => Promise<void>) {
  const harness: ProviderHarness = { calls: 0, requests: [] }
  const provider = http.createServer((req, res) => {
    harness.calls += 1
    let body = ''
    req.setEncoding('utf8')
    req.on('data', chunk => { body += chunk })
    req.on('end', async () => {
      const request = JSON.parse(body) as Record<string, any> & { invoiceId: string }
      harness.requests.push(request)
      await harness.beforeResponse?.(request)
      if(harness.dropConnection){req.socket.destroy();return}
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ invoices: [{ id: `cp-${request.invoiceId}`, link: `https://pay.example/invoice/${request.invoiceId}`, checkoutLink: `https://pay.example/checkout/${request.invoiceId}` }] }))
    })
  })
  const providerPort = await listen(provider)
  process.env.COINPAYMENTS_CLIENT_ID = 'test-client'
  process.env.COINPAYMENTS_CLIENT_SECRET = 'test-secret'
  process.env.COINPAYMENTS_WEBHOOK_URL = 'https://gomove.example/api/webhooks/coinpayments'
  process.env.COINPAYMENTS_BASE_URL = `http://127.0.0.1:${providerPort}`
  process.env.APP_PUBLIC_URL = 'https://gomove.example'
  const server = app.listen(0)
  try {
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    await run(`http://127.0.0.1:${address.port}`, harness)
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    await new Promise<void>((resolve, reject) => provider.close(error => error ? reject(error) : resolve()))
  }
}

function signedWebhookHeaders(rawBody: string) {
  const timestamp = new Date().toISOString().split('.')[0]
  const message = `\ufeffPOST${process.env.COINPAYMENTS_WEBHOOK_URL}${process.env.COINPAYMENTS_CLIENT_ID}${timestamp}${rawBody}`
  return {
    'content-type': 'application/json',
    'x-coinpayments-client': process.env.COINPAYMENTS_CLIENT_ID!,
    'x-coinpayments-timestamp': timestamp,
    'x-coinpayments-signature': crypto.createHmac('sha256', process.env.COINPAYMENTS_CLIENT_SECRET!).update(message).digest('base64'),
  }
}

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

test('public registration creates an active authenticated session directly or through an eligible invite', async () => {
  const server = app.listen(0)
  try {
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const baseUrl = `http://127.0.0.1:${address.port}`
    const suffix = crypto.randomUUID().slice(0, 8)
    const invitedResponse = await fetch(`${baseUrl}/api/public/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Convidado Ativo', email: `invited-${suffix}@gomove.local`, username: `invited-${suffix}`, password: 'senha-segura', inviteCode: 'matheus01' }),
    })
    assert.equal(invitedResponse.status, 201)
    const invited = await invitedResponse.json() as { token: string; user: Record<string, any> }
    assert.match(invited.token, /^[A-Za-z0-9_-]{40,}$/)
    assert.equal(invited.user.status, 'ACTIVE')
    assert.equal(invited.user.associatePlanStatus, 'PENDING')

    const me = await fetch(`${baseUrl}/api/auth/me`, { headers: { authorization: `Bearer ${invited.token}` } })
    assert.equal(me.status, 200)
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: `invited-${suffix}`, password: 'senha-segura' }),
    })
    assert.equal(login.status, 200)

    const directResponse = await fetch(`${baseUrl}/api/public/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Cadastro Direto', email: `direct-${suffix}@gomove.local`, username: `direct-${suffix}`, password: 'senha-segura' }),
    })
    assert.equal(directResponse.status, 201)
    const direct = await directResponse.json() as { token: string; user: Record<string, any> }
    const master = readDb().users.find(user => user.role === 'ADMIN_MASTER' && user.status === 'ACTIVE')
    assert.ok(master)
    assert.equal(direct.user.sponsorId, master.id)
    assert.equal(direct.user.status, 'ACTIVE')
    assert.equal(direct.user.associatePlanStatus, 'PENDING')
    assert.ok(readDb().sessions[direct.token])
    const stateResponse = await fetch(`${baseUrl}/api/state`, { headers: { authorization: `Bearer ${direct.token}` } })
    assert.equal(stateResponse.status, 200)
    assert.equal(((await stateResponse.json()) as { business: { canReceiveFinancialResults: boolean } }).business.canReceiveFinancialResults, false)
    const inactiveInvite = await fetch(`${baseUrl}/api/public/invites/${direct.user.inviteCode}`)
    assert.equal(inactiveInvite.status, 404)

    const adminLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'gomove2026' }),
    })
    const { token: adminToken } = await adminLogin.json() as { token: string }
    const activeWithoutPlan = await fetch(`${baseUrl}/api/admin/associates/${direct.user.id}/status`, {
      method: 'PATCH', headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ status: 'ACTIVE' }),
    })
    assert.equal(activeWithoutPlan.status, 200)
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})

test('direct quota checkout and confirmation upgrades an unpaid account and includes it in daily profitability', async () => {
  await withCoinPaymentsServers(async baseUrl => {
    const suffix = crypto.randomUUID().slice(0, 8)
    const registrationResponse = await fetch(`${baseUrl}/api/public/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Cotista sem Plano', email: `share-${suffix}@gomove.local`, username: `share-${suffix}`, password: 'senha-segura' }),
    })
    assert.equal(registrationResponse.status, 201)
    const registration = await registrationResponse.json() as { token: string; user: Record<string, any> }
    const quotaResponse = await fetch(`${baseUrl}/api/investments`, {
      method: 'POST',
      headers: { authorization: `Bearer ${registration.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ amount: 500, preferredPaymentAsset: 'USDT', idempotencyKey: `quota-${suffix}` }),
    })
    assert.equal(quotaResponse.status, 201)
    const quota = await quotaResponse.json() as Record<string, any>
    assert.equal(quota.amountCents, 50_000)

    const adminLogin = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'gomove2026' }),
    })
    const adminToken = ((await adminLogin.json()) as { token: string }).token
    const headers = { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' }
    const confirmation = await fetch(`${baseUrl}/api/admin/investments/${quota.id}/confirm`, { method: 'POST', headers, body: '{}' })
    assert.equal(confirmation.status, 200)
    const account = readDb().users.find(user => user.id === registration.user.id)
    assert.equal(account?.membershipType, 'SHAREHOLDER')
    assert.equal(account?.associatePlanStatus, 'PENDING')
    const latePendingBody = JSON.stringify({ type: 'invoicePending', invoice: { id: quota.paymentReference, state: 'Pending', payments: [] } })
    const latePending = await fetch(`${baseUrl}/api/webhooks/coinpayments`, { method: 'POST', headers: signedWebhookHeaders(latePendingBody), body: latePendingBody })
    assert.equal(latePending.status, 200)
    assert.equal(readDb().investments.find((investment: any) => investment.id === quota.id)?.paymentStatus, 'CONFIRMED')
    const repeatedCompletedBody = JSON.stringify({ type: 'invoiceCompleted', invoice: { id: quota.paymentReference, state: 'Completed', payments: [{ confirmations: 9 }] } })
    const repeatedCompleted = await fetch(`${baseUrl}/api/webhooks/coinpayments`, { method: 'POST', headers: signedWebhookHeaders(repeatedCompletedBody), body: repeatedCompletedBody })
    assert.equal(repeatedCompleted.status, 200)
    assert.equal(readDb().investments.find((investment: any) => investment.id === quota.id)?.paymentStatus, 'CONFIRMED')

    const date = `2099-01-${String(10 + Math.floor(Math.random() * 10)).padStart(2, '0')}`
    const daily = await fetch(`${baseUrl}/api/admin/daily-profitabilities`, { method: 'POST', headers, body: JSON.stringify({ date, rateBps: 100 }) })
    assert.equal(daily.status, 201)
    const { run } = await daily.json() as { run: { id: string } }
    const processed = await fetch(`${baseUrl}/api/admin/daily-profitabilities/${run.id}/process`, { method: 'POST', headers, body: '{}' })
    assert.equal(processed.status, 200)
    const result = await processed.json() as { earnings: Array<{ userId: string; grossAmountCents: number }> }
    assert.equal(result.earnings.find(item => item.userId === registration.user.id)?.grossAmountCents, 500)
  })
})

test('associate plan checkout is authenticated, idempotent and activated only by a signed completed invoice webhook', async () => {
  await withCoinPaymentsServers(async (baseUrl, provider) => {
    const unauthorized = await fetch(`${baseUrl}/api/associate-plan`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ idempotencyKey: 'unauthorized' }) })
    assert.equal(unauthorized.status, 401)
    const suffix = crypto.randomUUID().slice(0, 8)
    const registrationResponse = await fetch(`${baseUrl}/api/public/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Associado Checkout', email: `plan-${suffix}@gomove.local`, username: `plan-${suffix}`, password: 'senha-segura' }),
    })
    const registration = await registrationResponse.json() as { token: string; user: Record<string, any> }
    const headers = { authorization: `Bearer ${registration.token}`, 'content-type': 'application/json' }
    const firstResponse = await fetch(`${baseUrl}/api/associate-plan`, { method: 'POST', headers, body: JSON.stringify({ idempotencyKey: `plan-${suffix}`, preferredPaymentAsset: 'USDT' }) })
    assert.equal(firstResponse.status, 201)
    const first = await firstResponse.json() as Record<string, any>
    assert.equal(first.amount, 55)
    assert.equal(first.paymentStatus, 'PENDING')
    assert.ok(first.paymentUrl)
    assert.ok(first.paymentReference)
    const retryResponse = await fetch(`${baseUrl}/api/associate-plan`, { method: 'POST', headers, body: JSON.stringify({ idempotencyKey: `plan-${suffix}`, preferredPaymentAsset: 'USDT' }) })
    assert.equal(retryResponse.status, 200)
    const retry = await retryResponse.json() as Record<string, any>
    assert.equal(retry.id, first.id)
    assert.equal(provider.calls, 1)
    assert.equal(provider.requests[0].successUrl, 'https://gomove.example/activation?payment=success')
    assert.equal(provider.requests[0].cancelUrl, 'https://gomove.example/activation?payment=cancelled')
    assert.equal(readDb().users.find(user => user.id === registration.user.id)?.associatePlanStatus, 'PENDING')

    const rawBody = JSON.stringify({ type: 'invoiceCompleted', invoice: { id: first.paymentReference, state: 'Completed', payments: [{ confirmations: 3 }] } })
    const webhook = await fetch(`${baseUrl}/api/webhooks/coinpayments`, { method: 'POST', headers: signedWebhookHeaders(rawBody), body: rawBody })
    assert.equal(webhook.status, 200)
    assert.equal(readDb().users.find(user => user.id === registration.user.id)?.associatePlanStatus, 'ACTIVE')
    const latePendingBody = JSON.stringify({ type: 'invoicePending', invoice: { id: first.paymentReference, state: 'Pending', payments: [] } })
    const latePending = await fetch(`${baseUrl}/api/webhooks/coinpayments`, { method: 'POST', headers: signedWebhookHeaders(latePendingBody), body: latePendingBody })
    assert.equal(latePending.status, 200)
    assert.equal(readDb().invoices.find((invoice: any) => invoice.id === first.id)?.paymentStatus, 'CONFIRMED')
    const duplicate = await fetch(`${baseUrl}/api/webhooks/coinpayments`, { method: 'POST', headers: signedWebhookHeaders(rawBody), body: rawBody })
    assert.equal(duplicate.status, 200)
    assert.equal(((await duplicate.json()) as { idempotent: boolean }).idempotent, true)
    assert.equal(readDb().invoices.filter((invoice: any) => invoice.id === first.id).length, 1)
  })
})

test('concurrent associate-plan requests reserve one open invoice and reuse it across idempotency keys', async () => {
  await withCoinPaymentsServers(async (baseUrl, provider) => {
    const suffix = crypto.randomUUID().slice(0, 8)
    const registrationResponse = await fetch(`${baseUrl}/api/public/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Concorrência Plano', email: `concurrent-${suffix}@gomove.local`, username: `concurrent-${suffix}`, password: 'senha-segura' }),
    })
    const registration = await registrationResponse.json() as { token: string; user: Record<string, any> }
    const headers = { authorization: `Bearer ${registration.token}`, 'content-type': 'application/json' }
    const [first, competing] = await Promise.all([
      fetch(`${baseUrl}/api/associate-plan`, { method: 'POST', headers, body: JSON.stringify({ idempotencyKey: `first-${suffix}` }) }),
      fetch(`${baseUrl}/api/associate-plan`, { method: 'POST', headers, body: JSON.stringify({ idempotencyKey: `second-${suffix}` }) }),
    ])
    assert.ok([200, 201, 409].includes(first.status))
    assert.ok([200, 201, 409].includes(competing.status))
    assert.equal(provider.calls, 1)
    const open = readDb().invoices.filter((invoice: any) => invoice.userId === registration.user.id && invoice.productType === 'ASSOCIATE_PLAN' && ['INVOICE_CREATING', 'PENDING', 'PAID', 'CONFIRMED'].includes(invoice.paymentStatus))
    assert.equal(open.length, 1)
    const retry = await fetch(`${baseUrl}/api/associate-plan`, { method: 'POST', headers, body: JSON.stringify({ idempotencyKey: `third-${suffix}` }) })
    assert.equal(retry.status, 200)
    assert.equal(((await retry.json()) as { id: string }).id, open[0].id)
    assert.equal(provider.calls, 1)
  })
})

test('an early completed webhook resolves the local invoice reference and checkout never downgrades confirmation', async () => {
  await withCoinPaymentsServers(async (baseUrl, provider) => {
    const suffix = crypto.randomUUID().slice(0, 8)
    const registrationResponse = await fetch(`${baseUrl}/api/public/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Webhook Precoce', email: `early-${suffix}@gomove.local`, username: `early-${suffix}`, password: 'senha-segura' }),
    })
    const registration = await registrationResponse.json() as { token: string; user: Record<string, any> }
    provider.beforeResponse = async request => {
      const rawBody = JSON.stringify({ type: 'invoiceCompleted', invoice: { id: `cp-${request.invoiceId}`, state: 'Completed', customData: { investmentId: request.invoiceId }, items: [{ customId: request.invoiceId }], payments: [{ confirmations: 3 }] } })
      const webhook = await fetch(`${baseUrl}/api/webhooks/coinpayments`, { method: 'POST', headers: signedWebhookHeaders(rawBody), body: rawBody })
      assert.equal(webhook.status, 200)
    }
    const checkout = await fetch(`${baseUrl}/api/associate-plan`, {
      method: 'POST', headers: { authorization: `Bearer ${registration.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ idempotencyKey: `early-${suffix}` }),
    })
    assert.equal(checkout.status, 201)
    const invoice = await checkout.json() as Record<string, any>
    assert.equal(invoice.paymentStatus, 'CONFIRMED')
    assert.equal(invoice.status, 'Pago')
    assert.equal(readDb().users.find(user => user.id === registration.user.id)?.associatePlanStatus, 'ACTIVE')
  })
})

test('a signed webhook for an unknown invoice is rejected without consuming its event key', async () => {
  await withCoinPaymentsServers(async baseUrl => {
    const before = readDb().coinPaymentsWebhookEvents.length
    const rawBody = JSON.stringify({ type: 'invoiceCompleted', invoice: { id: 'unknown-provider-id', state: 'Completed', customData: { investmentId: 'unknown-local-id' } } })
    const webhook = await fetch(`${baseUrl}/api/webhooks/coinpayments`, { method: 'POST', headers: signedWebhookHeaders(rawBody), body: rawBody })
    assert.equal(webhook.status, 404)
    assert.equal(readDb().coinPaymentsWebhookEvents.length, before)
  })
})

test('MASTER can keep an account ACTIVE with a pending plan but cannot assign it as sponsor', async () => {
  const server = app.listen(0)
  try {
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const baseUrl = `http://127.0.0.1:${address.port}`
    const login = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'gomove2026' }) })
    const { token, user: master } = await login.json() as { token: string; user: Record<string, any> }
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
    const suffix = crypto.randomUUID().slice(0, 8)
    const unpaidResponse = await fetch(`${baseUrl}/api/admin/associates`, {
      method: 'POST', headers, body: JSON.stringify({ name: 'Ativo sem Plano', username: `unpaid-admin-${suffix}`, email: `unpaid-admin-${suffix}@gomove.local`, password: 'senha-segura', sponsorId: master.id, status: 'ACTIVE', associatePlanStatus: 'PENDING' }),
    })
    assert.equal(unpaidResponse.status, 201)
    const unpaid = await unpaidResponse.json() as Record<string, any>
    assert.equal(unpaid.status, 'ACTIVE')
    assert.equal(unpaid.associatePlanStatus, 'PENDING')

    const invalidChild = await fetch(`${baseUrl}/api/admin/associates`, {
      method: 'POST', headers, body: JSON.stringify({ name: 'Filho Inválido', username: `invalid-child-${suffix}`, email: `invalid-child-${suffix}@gomove.local`, password: 'senha-segura', sponsorId: unpaid.id, status: 'ACTIVE', associatePlanStatus: 'PENDING' }),
    })
    assert.equal(invalidChild.status, 422)

    const childResponse = await fetch(`${baseUrl}/api/admin/associates`, {
      method: 'POST', headers, body: JSON.stringify({ name: 'Filho Válido', username: `valid-child-${suffix}`, email: `valid-child-${suffix}@gomove.local`, password: 'senha-segura', sponsorId: master.id, status: 'PENDING', associatePlanStatus: 'PENDING' }),
    })
    assert.equal(childResponse.status, 201)
    const child = await childResponse.json() as Record<string, any>
    const activation = await fetch(`${baseUrl}/api/admin/associates/${child.id}`, { method: 'PATCH', headers, body: JSON.stringify({ status: 'ACTIVE', associatePlanStatus: 'PENDING', sponsorId: master.id }) })
    assert.equal(activation.status, 200)
    const invalidSponsorEdit = await fetch(`${baseUrl}/api/admin/associates/${child.id}`, { method: 'PATCH', headers, body: JSON.stringify({ sponsorId: unpaid.id }) })
    assert.equal(invalidSponsorEdit.status, 422)
    const invalidSponsorRoute = await fetch(`${baseUrl}/api/admin/associates/${child.id}/sponsor`, { method: 'PATCH', headers, body: JSON.stringify({ sponsorId: unpaid.id, reason: 'Teste de elegibilidade' }) })
    assert.equal(invalidSponsorRoute.status, 422)
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})

test('onboarding migration activates only legacy REGISTER accounts affected by the pending-status bug', () => {
  const db = readDb()
  const suffix = crypto.randomUUID().slice(0, 8)
  const master = db.users.find(user => user.role === 'ADMIN_MASTER')!
  const base = { name: 'Legado', passwordHash: 'hash', role: 'ASSOCIATE' as const, status: 'PENDING' as const, sponsorId: master.id, membershipType: 'ASSOCIATE' as const, associatePlanStatus: 'PENDING' as const, associatePlanAmountCents: 5_500, bonusCapCents: 50_000 }
  const legacy = { ...base, id: `legacy-${suffix}`, username: `legacy-${suffix}`, email: `legacy-${suffix}@gomove.local`, inviteCode: `legacy${suffix}` }
  const intentional = { ...base, id: `intentional-${suffix}`, username: `intentional-${suffix}`, email: `intentional-${suffix}@gomove.local`, inviteCode: `intentional${suffix}` }
  db.users.push(legacy, intentional)
  db.auditLogs.unshift({ id: `audit-${suffix}`, actorId: legacy.id, action: 'REGISTER', targetType: 'USER', targetId: legacy.id, details: { sponsorId: master.id }, createdAt: new Date().toISOString() })
  delete db.accountOnboardingVersion
  writeDb(db)
  const migrated = readDb()
  assert.equal(migrated.users.find(user => user.id === legacy.id)?.status, 'ACTIVE')
  assert.equal(migrated.users.find(user => user.id === intentional.id)?.status, 'PENDING')
  assert.ok(Number(migrated.accountOnboardingVersion) >= 1)

  const future = { ...base, id: `future-${suffix}`, username: `future-${suffix}`, email: `future-${suffix}@gomove.local`, inviteCode: `future${suffix}` }
  migrated.users.push(future)
  migrated.auditLogs.unshift({ id: `future-audit-${suffix}`, actorId: future.id, action: 'REGISTER', targetType: 'USER', targetId: future.id, details: {}, createdAt: new Date().toISOString() })
  writeDb(migrated)
  assert.equal(readDb().users.find(user => user.id === future.id)?.status, 'PENDING')
})

test('registration rejects oversized passwords and login rate limiting returns a generic response', async () => {
  const server = app.listen(0)
  try {
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const baseUrl = `http://127.0.0.1:${address.port}`
    const suffix = crypto.randomUUID().slice(0, 8)
    const oversized = await fetch(`${baseUrl}/api/public/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Senha Grande', email: `oversized-${suffix}@gomove.local`, username: `oversized-${suffix}`, password: 'x'.repeat(129) }),
    })
    assert.equal(oversized.status, 422)
    assert.equal(readDb().users.some(user => user.username === `oversized-${suffix}`), false)

    process.env.GOMOVE_PUBLIC_RATE_LIMIT = '2'
    process.env.GOMOVE_PUBLIC_RATE_WINDOW_MS = '60000'
    for(const loginPath of ['/api/login','/api/auth/login']) {
      const rejected = await fetch(`${baseUrl}${loginPath}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: `unknown-${suffix}`, password: 'senha-incorreta' }) })
      assert.equal(rejected.status, 401)
    }
    const limited = await fetch(`${baseUrl}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'gomove2026' }) })
    assert.equal(limited.status, 429)
    assert.deepEqual(await limited.json(), { error: 'Muitas tentativas; aguarde antes de tentar novamente' })
  } finally {
    delete process.env.GOMOVE_PUBLIC_RATE_LIMIT
    delete process.env.GOMOVE_PUBLIC_RATE_WINDOW_MS
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})

test('quota checkout rejects unsafe or over-precise values before contacting CoinPayments', async () => {
  await withCoinPaymentsServers(async (baseUrl, provider) => {
    const suffix = crypto.randomUUID().slice(0, 8)
    const registrationResponse = await fetch(`${baseUrl}/api/public/register`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Validação Cota', email: `amount-${suffix}@gomove.local`, username: `amount-${suffix}`, password: 'senha-segura' }),
    })
    const { token } = await registrationResponse.json() as { token: string }
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
    const huge = await fetch(`${baseUrl}/api/investments`, { method: 'POST', headers, body: JSON.stringify({ amount: 1e100, idempotencyKey: `huge-${suffix}` }) })
    assert.equal(huge.status, 422)
    const imprecise = await fetch(`${baseUrl}/api/investments`, { method: 'POST', headers, body: JSON.stringify({ amount: 500.001, idempotencyKey: `imprecise-${suffix}` }) })
    assert.equal(imprecise.status, 422)
    process.env.GOMOVE_MAX_QUOTA_CENTS = '60000'
    const overLimit = await fetch(`${baseUrl}/api/investments`, { method: 'POST', headers, body: JSON.stringify({ amount: 600.01, idempotencyKey: `limit-${suffix}` }) })
    delete process.env.GOMOVE_MAX_QUOTA_CENTS
    assert.equal(overLimit.status, 422)
    assert.equal(provider.calls, 0)
  })
})

test('manual credit requires financial eligibility but accepts a shareholder without associate plan', async () => {
  const server = app.listen(0)
  try {
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const baseUrl = `http://127.0.0.1:${address.port}`
    const suffix = crypto.randomUUID().slice(0, 8)
    const registrationResponse = await fetch(`${baseUrl}/api/public/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Crédito Elegível', email: `credit-${suffix}@gomove.local`, username: `credit-${suffix}`, password: 'senha-segura' }) })
    const registration = await registrationResponse.json() as { user: Record<string, any> }
    const login = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'gomove2026' }) })
    const { token } = await login.json() as { token: string }
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
    const blocked = await fetch(`${baseUrl}/api/admin/bonus-entries/manual-credit`, { method: 'POST', headers, body: JSON.stringify({ userId: registration.user.id, amountCents: 1_000, reason: 'Teste de elegibilidade' }) })
    assert.equal(blocked.status, 422)

    const investmentResponse = await fetch(`${baseUrl}/api/admin/investments`, { method: 'POST', headers, body: JSON.stringify({ userId: registration.user.id, amount: 500, paymentStatus: 'PENDING', status: 'Aguardando pagamento' }) })
    assert.equal(investmentResponse.status, 201)
    const investment = await investmentResponse.json() as { id: string }
    const confirmation = await fetch(`${baseUrl}/api/admin/investments/${investment.id}/confirm`, { method: 'POST', headers, body: '{}' })
    assert.equal(confirmation.status, 200)
    assert.equal(readDb().users.find(user => user.id === registration.user.id)?.associatePlanStatus, 'PENDING')
    const allowed = await fetch(`${baseUrl}/api/admin/bonus-entries/manual-credit`, { method: 'POST', headers, body: JSON.stringify({ userId: registration.user.id, amountCents: 1_000, reason: 'Cotista elegível' }) })
    assert.equal(allowed.status, 201)
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})

test('MASTER investment create and patch reject unsafe amounts without mutating the record', async () => {
  const server = app.listen(0)
  try {
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const baseUrl = `http://127.0.0.1:${address.port}`
    const login = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'gomove2026' }) })
    const { token } = await login.json() as { token: string }
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
    const participant = readDb().users.find(user => user.username === 'matheus')!
    const huge = await fetch(`${baseUrl}/api/admin/investments`, { method: 'POST', headers, body: JSON.stringify({ userId: participant.id, amount: 1e100 }) })
    assert.equal(huge.status, 422)
    const imprecise = await fetch(`${baseUrl}/api/admin/investments`, { method: 'POST', headers, body: JSON.stringify({ userId: participant.id, amount: 500.001 }) })
    assert.equal(imprecise.status, 422)
    const valid = await fetch(`${baseUrl}/api/admin/investments`, { method: 'POST', headers, body: JSON.stringify({ userId: participant.id, amount: 500 }) })
    assert.equal(valid.status, 201)
    const investment = await valid.json() as Record<string, any>
    const invalidPatch = await fetch(`${baseUrl}/api/admin/investments/${investment.id}`, { method: 'PATCH', headers, body: JSON.stringify({ amount: 1e100, status: 'Ativo adulterado' }) })
    assert.equal(invalidPatch.status, 422)
    const unchanged = readDb().investments.find((item: any) => item.id === investment.id)
    assert.equal(unchanged.amount, 500)
    assert.equal(unchanged.amountCents, 50_000)
    assert.notEqual(unchanged.status, 'Ativo adulterado')
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})

test('webhook rejects provider-id conflicts and mismatched amount or currency without consuming events', async () => {
  await withCoinPaymentsServers(async (baseUrl) => {
    const suffix = crypto.randomUUID().slice(0, 8)
    const registrationResponse = await fetch(`${baseUrl}/api/public/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Webhook Seguro', email: `secure-hook-${suffix}@gomove.local`, username: `secure-hook-${suffix}`, password: 'senha-segura' }) })
    const registration = await registrationResponse.json() as { token: string; user: Record<string, any> }
    const checkoutResponse = await fetch(`${baseUrl}/api/associate-plan`, { method: 'POST', headers: { authorization: `Bearer ${registration.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ idempotencyKey: `secure-${suffix}` }) })
    const checkout = await checkoutResponse.json() as Record<string, any>
    const before = readDb().coinPaymentsWebhookEvents.length

    const conflictBody = JSON.stringify({ type: 'invoiceCompleted', invoice: { id: 'different-provider-id', customData: { investmentId: checkout.id }, amount: { total: '55.00' }, currency: '5203' } })
    const conflict = await fetch(`${baseUrl}/api/webhooks/coinpayments`, { method: 'POST', headers: signedWebhookHeaders(conflictBody), body: conflictBody })
    assert.equal(conflict.status, 404)
    const amountBody = JSON.stringify({ type: 'invoiceCompleted', invoice: { id: checkout.paymentReference, customData: { investmentId: checkout.id }, amount: { total: '54.99' }, currency: '5203' } })
    const amountMismatch = await fetch(`${baseUrl}/api/webhooks/coinpayments`, { method: 'POST', headers: signedWebhookHeaders(amountBody), body: amountBody })
    assert.equal(amountMismatch.status, 422)
    const currencyBody = JSON.stringify({ type: 'invoiceCompleted', invoice: { id: checkout.paymentReference, customData: { investmentId: checkout.id }, amount: { total: '55.00' }, currency: '9999' } })
    const currencyMismatch = await fetch(`${baseUrl}/api/webhooks/coinpayments`, { method: 'POST', headers: signedWebhookHeaders(currencyBody), body: currencyBody })
    assert.equal(currencyMismatch.status, 422)
    assert.equal(readDb().coinPaymentsWebhookEvents.length, before)
    assert.equal(readDb().users.find(user => user.id === registration.user.id)?.associatePlanStatus, 'PENDING')
  })
})

test('ambiguous provider failure is reconciled without creating a second invoice', async () => {
  await withCoinPaymentsServers(async (baseUrl, provider) => {
    const suffix = crypto.randomUUID().slice(0, 8)
    const registrationResponse = await fetch(`${baseUrl}/api/public/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Reconciliação', email: `reconcile-${suffix}@gomove.local`, username: `reconcile-${suffix}`, password: 'senha-segura' }) })
    const registration = await registrationResponse.json() as { token: string; user: Record<string, any> }
    const headers = { authorization: `Bearer ${registration.token}`, 'content-type': 'application/json' }
    provider.beforeResponse = async request => {
      const paidBody = JSON.stringify({ type: 'invoicePaid', invoice: { id: `cp-${request.invoiceId}`, customData: { investmentId: request.invoiceId }, amount: { total: '55.00' }, currency: '5203' } })
      const paid = await fetch(`${baseUrl}/api/webhooks/coinpayments`, { method: 'POST', headers: signedWebhookHeaders(paidBody), body: paidBody })
      assert.equal(paid.status, 200)
    }
    provider.dropConnection = true
    const failed = await fetch(`${baseUrl}/api/associate-plan`, { method: 'POST', headers, body: JSON.stringify({ idempotencyKey: `reconcile-${suffix}` }) })
    assert.equal(failed.status, 502)
    const invoice = readDb().invoices.find((item: any) => item.userId === registration.user.id && item.productType === 'ASSOCIATE_PLAN')
    assert.equal(invoice.paymentStatus, 'PAID')
    assert.equal(invoice.reconciliationRequired, true)
    const retry = await fetch(`${baseUrl}/api/associate-plan`, { method: 'POST', headers, body: JSON.stringify({ idempotencyKey: `retry-${suffix}` }) })
    assert.equal(retry.status, 409)
    assert.equal(provider.calls, 1)

    const completedBody = JSON.stringify({ type: 'invoiceCompleted', invoice: { id: `cp-${invoice.id}`, customData: { investmentId: invoice.id }, amount: { total: '55.00' }, currency: '5203' } })
    const completed = await fetch(`${baseUrl}/api/webhooks/coinpayments`, { method: 'POST', headers: signedWebhookHeaders(completedBody), body: completedBody })
    assert.equal(completed.status, 200)
    assert.equal(readDb().users.find(user => user.id === registration.user.id)?.associatePlanStatus, 'ACTIVE')
    const reconciled = readDb().invoices.find((item: any) => item.id === invoice.id)
    assert.equal(reconciled.paymentStatus, 'CONFIRMED')
    assert.equal(reconciled.reconciliationRequired, false)
  })
})

test('CoinPayments checkout requires a valid public HTTP URL before contacting the provider', async () => {
  await withCoinPaymentsServers(async (baseUrl, provider) => {
    const suffix = crypto.randomUUID().slice(0, 8)
    const registrationResponse = await fetch(`${baseUrl}/api/public/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'URL Pública', email: `public-url-${suffix}@gomove.local`, username: `public-url-${suffix}`, password: 'senha-segura' }) })
    const { token } = await registrationResponse.json() as { token: string }
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
    delete process.env.APP_PUBLIC_URL
    const missing = await fetch(`${baseUrl}/api/associate-plan`, { method: 'POST', headers, body: JSON.stringify({ idempotencyKey: `missing-${suffix}` }) })
    assert.equal(missing.status, 503)
    process.env.APP_PUBLIC_URL = 'javascript:alert(1)'
    const invalid = await fetch(`${baseUrl}/api/associate-plan`, { method: 'POST', headers, body: JSON.stringify({ idempotencyKey: `invalid-${suffix}` }) })
    assert.equal(invalid.status, 503)
    assert.equal(provider.calls, 0)
    process.env.APP_PUBLIC_URL = 'https://gomove.example'
  })
})

test('MASTER status and sponsor routes cannot mutate the ADMIN_MASTER account', async () => {
  const server = app.listen(0)
  try {
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const baseUrl = `http://127.0.0.1:${address.port}`
    const login = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'gomove2026' }) })
    const { token, user: master } = await login.json() as { token: string; user: Record<string, any> }
    const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
    const statusMutation = await fetch(`${baseUrl}/api/admin/associates/${master.id}/status`, { method: 'PATCH', headers, body: JSON.stringify({ status: 'BLOCKED', reason: 'Não permitido' }) })
    assert.equal(statusMutation.status, 404)
    const sponsorMutation = await fetch(`${baseUrl}/api/admin/associates/${master.id}/sponsor`, { method: 'PATCH', headers, body: JSON.stringify({ sponsorId: master.id, reason: 'Não permitido' }) })
    assert.equal(sponsorMutation.status, 404)
    assert.equal(readDb().users.find(user => user.id === master.id)?.status, 'ACTIVE')
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})

test('associate-plan terminal idempotency preserves a cancelled invoice and requires a new key', async () => {
  await withCoinPaymentsServers(async (baseUrl, provider) => {
    const suffix = crypto.randomUUID().slice(0, 8)
    const registrationResponse = await fetch(`${baseUrl}/api/public/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Plano Terminal', email: `plan-terminal-${suffix}@gomove.local`, username: `plan-terminal-${suffix}`, password: 'senha-segura' }) })
    const registration = await registrationResponse.json() as { token: string; user: Record<string, any> }
    const headers = { authorization: `Bearer ${registration.token}`, 'content-type': 'application/json' }
    const firstResponse = await fetch(`${baseUrl}/api/associate-plan`, { method: 'POST', headers, body: JSON.stringify({ idempotencyKey: `plan-old-${suffix}` }) })
    assert.equal(firstResponse.status, 201)
    const first = await firstResponse.json() as Record<string, any>
    const providerId = first.paymentReference
    const cancelledBody = JSON.stringify({ type: 'invoiceCancelled', invoice: { id: providerId, state: 'Cancelled', amount: { total: '55.00' }, currency: '5203' } })
    const cancelled = await fetch(`${baseUrl}/api/webhooks/coinpayments`, { method: 'POST', headers: signedWebhookHeaders(cancelledBody), body: cancelledBody })
    assert.equal(cancelled.status, 200)

    const sameKey = await fetch(`${baseUrl}/api/associate-plan`, { method: 'POST', headers, body: JSON.stringify({ idempotencyKey: `plan-old-${suffix}` }) })
    assert.equal(sameKey.status, 409)
    assert.equal(provider.calls, 1)
    const preserved = readDb().invoices.find((invoice: any) => invoice.id === first.id)
    assert.equal(preserved.paymentStatus, 'CANCELLED')
    assert.equal(preserved.coinPaymentsInvoiceId, providerId)

    const newKeyResponse = await fetch(`${baseUrl}/api/associate-plan`, { method: 'POST', headers, body: JSON.stringify({ idempotencyKey: `plan-new-${suffix}` }) })
    assert.equal(newKeyResponse.status, 201)
    const replacement = await newKeyResponse.json() as Record<string, any>
    assert.notEqual(replacement.id, first.id)
    assert.equal(provider.calls, 2)
    assert.equal(readDb().invoices.find((invoice: any) => invoice.id === first.id)?.coinPaymentsInvoiceId, providerId)

    const lateCompletedBody = JSON.stringify({ type: 'invoiceCompleted', invoice: { id: providerId, state: 'Completed', amount: { total: '55.00' }, currency: '5203' } })
    const lateCompleted = await fetch(`${baseUrl}/api/webhooks/coinpayments`, { method: 'POST', headers: signedWebhookHeaders(lateCompletedBody), body: lateCompletedBody })
    assert.equal(lateCompleted.status, 200)
    assert.equal(readDb().invoices.find((invoice: any) => invoice.id === first.id)?.paymentStatus, 'CONFIRMED')
    assert.equal(readDb().users.find(user => user.id === registration.user.id)?.associatePlanStatus, 'ACTIVE')
  })
})

test('quota terminal idempotency preserves a timed-out acquisition and requires a new key', async () => {
  await withCoinPaymentsServers(async (baseUrl, provider) => {
    const suffix = crypto.randomUUID().slice(0, 8)
    const registrationResponse = await fetch(`${baseUrl}/api/public/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Cota Terminal', email: `quota-terminal-${suffix}@gomove.local`, username: `quota-terminal-${suffix}`, password: 'senha-segura' }) })
    const registration = await registrationResponse.json() as { token: string; user: Record<string, any> }
    const headers = { authorization: `Bearer ${registration.token}`, 'content-type': 'application/json' }
    const firstResponse = await fetch(`${baseUrl}/api/investments`, { method: 'POST', headers, body: JSON.stringify({ amount: 500, idempotencyKey: `quota-old-${suffix}` }) })
    assert.equal(firstResponse.status, 201)
    const first = await firstResponse.json() as Record<string, any>
    const providerId = first.paymentReference
    const timedOutBody = JSON.stringify({ type: 'invoiceTimedOut', invoice: { id: providerId, state: 'TimedOut', amount: { total: '500.00' }, currency: '5203' } })
    const timedOut = await fetch(`${baseUrl}/api/webhooks/coinpayments`, { method: 'POST', headers: signedWebhookHeaders(timedOutBody), body: timedOutBody })
    assert.equal(timedOut.status, 200)

    const sameKey = await fetch(`${baseUrl}/api/investments`, { method: 'POST', headers, body: JSON.stringify({ amount: 500, idempotencyKey: `quota-old-${suffix}` }) })
    assert.equal(sameKey.status, 409)
    assert.equal(provider.calls, 1)
    const preserved = readDb().investments.find((investment: any) => investment.id === first.id)
    assert.equal(preserved.paymentStatus, 'TIMED_OUT')
    assert.equal(preserved.coinPaymentsInvoiceId, providerId)

    const newKeyResponse = await fetch(`${baseUrl}/api/investments`, { method: 'POST', headers, body: JSON.stringify({ amount: 500, idempotencyKey: `quota-new-${suffix}` }) })
    assert.equal(newKeyResponse.status, 201)
    const replacement = await newKeyResponse.json() as Record<string, any>
    assert.notEqual(replacement.id, first.id)
    assert.equal(provider.calls, 2)

    const lateCompletedBody = JSON.stringify({ type: 'invoiceCompleted', invoice: { id: providerId, state: 'Completed', amount: { total: '500.00' }, currency: '5203' } })
    const lateCompleted = await fetch(`${baseUrl}/api/webhooks/coinpayments`, { method: 'POST', headers: signedWebhookHeaders(lateCompletedBody), body: lateCompletedBody })
    assert.equal(lateCompleted.status, 200)
    assert.equal(readDb().investments.find((investment: any) => investment.id === first.id)?.paymentStatus, 'CONFIRMED')
    assert.equal(readDb().users.find(user => user.id === registration.user.id)?.membershipType, 'SHAREHOLDER')
  })
})

test('master username is reserved while login prefers an exact legacy account before the admin alias', async () => {
  const server = app.listen(0)
  const suffix = crypto.randomUUID().slice(0, 8)
  const legacyId = `legacy-master-${suffix}`
  try {
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const baseUrl = `http://127.0.0.1:${address.port}`
    const publicRegistration = await fetch(`${baseUrl}/api/public/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Master Público', email: `public-master-${suffix}@gomove.local`, username: 'master', password: 'senha-segura' }) })
    assert.equal(publicRegistration.status, 422)

    const adminLogin = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'gomove2026' }) })
    const adminSession = await adminLogin.json() as { token: string; user: Record<string, any> }
    const adminCreate = await fetch(`${baseUrl}/api/admin/associates`, { method: 'POST', headers: { authorization: `Bearer ${adminSession.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Master Admin', email: `admin-master-${suffix}@gomove.local`, username: 'master', password: 'senha-segura', status: 'ACTIVE', associatePlanStatus: 'ACTIVE', sponsorId: adminSession.user.id }) })
    assert.equal(adminCreate.status, 422)

    const db = readDb()
    const admin = db.users.find(user => user.id === adminSession.user.id)!
    db.users.push({ ...admin, id: legacyId, username: 'master', email: `legacy-master-${suffix}@gomove.local`, name: 'Master Legado', role: 'ASSOCIATE', sponsorId: admin.id, inviteCode: `legacymaster${suffix}`, membershipType: 'SHAREHOLDER', associatePlanStatus: 'PENDING' })
    writeDb(db)
    const legacyLogin = await fetch(`${baseUrl}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'master', password: 'gomove2026' }) })
    assert.equal(legacyLogin.status, 200)
    assert.equal(((await legacyLogin.json()) as { user: { id: string } }).user.id, legacyId)
  } finally {
    const db = readDb();db.users = db.users.filter(user => user.id !== legacyId);for(const [token,session] of Object.entries(db.sessions))if(session.userId===legacyId)delete db.sessions[token];writeDb(db)
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  }
})
