import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { restoreApiRequestUrl } from '../server/requestRouting.js'
import { normalizeInviteCode } from '../src/invites.js'

test('Vercel invite rewrites keep complete URLs in one Express route parameter', async () => {
  const app = express()
  app.get('/api/public/invites/:inviteCode', (req, res) => res.json({ code: normalizeInviteCode(req.params.inviteCode) }))
  const server = app.listen(0)
  try {
    const address = server.address()
    assert.ok(address && typeof address !== 'string')
    for (const input of ['gomove', 'https://example.com/convite/gomove/', 'https://example.com/cadastro?inviteCode=gomove', 'https%3A%2F%2Fexample.com%2Fconvite%2Fgomove%2F']) {
      const query = new URLSearchParams({ path: `public/invites/${input}` })
      const url = restoreApiRequestUrl(`/api/index?${query}`)
      const response = await fetch(`http://127.0.0.1:${address.port}${url}`)
      assert.equal(response.status, 200, input)
      assert.deepEqual(await response.json(), { code: 'gomove' })
    }
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) }
})

test('ordinary rewritten routes retain pagination, and original encoded paths are unchanged', () => {
  assert.equal(restoreApiRequestUrl('/api/index?path=bonuses&page=2&limit=100'), '/api/bonuses?page=2&limit=100')
  assert.equal(restoreApiRequestUrl('/api/public/invites/https%3A%2F%2Fexample.com%2Fconvite%2Fgomove%2F'), '/api/public/invites/https%3A%2F%2Fexample.com%2Fconvite%2Fgomove%2F')
})
