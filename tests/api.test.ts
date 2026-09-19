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
    globalThis.fetch=async()=>new Response(JSON.stringify({error:'2PP: Failed to create PIX',retryable:true,retryAfter:42}),{status:429,headers:{'content-type':'application/json'}})
    await assert.rejects(new ApiClient(null).post('/deposits',{}),error=>{
      assert.ok(error instanceof ApiError)
      assert.equal(error.message,'2PP: Failed to create PIX')
      assert.equal(error.retryable,true)
      assert.equal(error.retryAfter,42)
      assert.equal(error.status,429)
      return true
    })
    globalThis.fetch=async()=>new Response(JSON.stringify({error:'Resposta incerta'}),{status:502,headers:{'content-type':'application/json'}})
    await assert.rejects(new ApiClient(null).post('/deposits',{}),error=>error instanceof ApiError&&!error.retryable)
  }finally{globalThis.fetch=originalFetch}
})
