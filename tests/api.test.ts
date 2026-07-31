import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { apiErrorMessage, authHeaders } from '../src/api'

test('authHeaders emits bearer token only when present', () => {
  assert.deepEqual(authHeaders('abc'), { Authorization: 'Bearer abc' })
  assert.deepEqual(authHeaders(null), {})
})
test('apiErrorMessage preserves API and fallback errors', () => {
  assert.equal(apiErrorMessage({ error: 'Sem acesso' }, 'Falhou'), 'Sem acesso')
  assert.equal(apiErrorMessage({}, 'Falhou'), 'Falhou')
})
