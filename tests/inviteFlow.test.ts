import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'

test('successful affiliate registration redirects directly to login', () => {
  const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
  const invite = source.match(/function Invite\(\)[\s\S]*?const userLinks/)?.[0] ?? ''

  assert.match(invite, /await api\.post\('\/public\/register',[\s\S]*?\);\s*location\.replace\('\/'\)/)
  assert.doesNotMatch(invite, /setDone\(true\)/)
})
