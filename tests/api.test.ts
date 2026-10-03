import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { ApiClient, ApiError, apiErrorMessage, authHeaders } from '../src/api'

test('authHeaders emits bearer token only when present', () => {
  assert.deepEqual(authHeaders('abc'), { Authorization: 'Bearer abc' })
  assert.deepEqual(authHeaders(null), {})
})
test('apiErrorMessage preserves API and fallback errors', () => {
  assert.equal(apiErrorMessage({ error: 'Sem acesso' }, 'Falhou'), 'Sem acesso')
  assert.equal(apiErrorMessage({}, 'Falhou'), 'Falhou')
})

test('client preserves gateway failure details and only allows explicitly safe retries', async () => {
  const originalFetch=globalThis.fetch
  try {
    globalThis.fetch=async()=>new Response(JSON.stringify({error:'2PP: Failed to create PIX',retryable:true,retryAfter:42,paymentId:'payment-to-resume'}),{status:429,headers:{'content-type':'application/json'}})
    await assert.rejects(new ApiClient(null).post('/deposits',{}),error=>{
      assert.ok(error instanceof ApiError)
      assert.equal(error.message,'2PP: Failed to create PIX')
      assert.equal(error.retryable,true)
      assert.equal(error.retryAfter,42)
      assert.equal(error.status,429)
      assert.equal(error.paymentId,'payment-to-resume')
      return true
    })
    globalThis.fetch=async()=>new Response(JSON.stringify({error:'Resposta incerta'}),{status:502,headers:{'content-type':'application/json'}})
    await assert.rejects(new ApiClient(null).post('/deposits',{}),error=>error instanceof ApiError&&!error.retryable)
  }finally{globalThis.fetch=originalFetch}
})

test('a full financial history loads every API page instead of stopping at the first hundred entries', async () => {
  const originalFetch = globalThis.fetch
  const requests: string[] = []
  try {
    globalThis.fetch = async input => {
      const url = String(input); requests.push(url)
      const page = Number(new URL(url, 'https://gomove.example').searchParams.get('page') || 1)
      const items = Array.from({ length: page === 1 ? 100 : 5 }, (_, i) => ({ id: String((page - 1) * 100 + i) }))
      return new Response(JSON.stringify({ items, page, pageSize: 100, total: 105 }), { headers: { 'content-type': 'application/json' } })
    }
    const result = await new ApiClient(null).getAll<{ id: string }>('/bonuses/me?pageSize=100')
    assert.equal(result.items.length, 105)
    assert.equal(result.items.at(-1)?.id, '104')
    assert.equal(requests.length, 2)
  } finally { globalThis.fetch = originalFetch }
})

test('anonymous and obsolete unauthorized requests preserve a newer session; support expiry preserves MASTER', async () => {
  const originalFetch = globalThis.fetch
  const originals = ['localStorage', 'sessionStorage'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const)
  const local = new Map<string, string>(), support = new Map<string, string>()
  const storage = (values: Map<string, string>) => ({ getItem: (key: string) => values.get(key) ?? null, removeItem: (key: string) => values.delete(key) })
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage(local) })
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: storage(support) })
    globalThis.fetch = async () => new Response(JSON.stringify({ error: 'Sessão inválida' }), { status: 401, headers: { 'content-type': 'application/json' } })
    local.set('gomove-session', JSON.stringify({ token: 'new-session', user: { id: 'u' } }))
    await assert.rejects(new ApiClient(null).post('/auth/login', {}))
    assert.ok(local.has('gomove-session'))
    await assert.rejects(new ApiClient('obsolete-session').get('/auth/me'))
    assert.ok(local.has('gomove-session'))
    support.set('gomove-support-session', JSON.stringify({ token: 'support-session', user: { id: 'participant' }, supportActor: { id: 'master' } }))
    await assert.rejects(new ApiClient('support-session').get('/auth/me'))
    assert.equal(support.size, 0)
    assert.ok(local.has('gomove-session'))
    await assert.rejects(new ApiClient('new-session').get('/auth/me'))
    assert.equal(local.size, 0)
  } finally {
    globalThis.fetch = originalFetch
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
})
