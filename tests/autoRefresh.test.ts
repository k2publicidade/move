import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const apiSource = readFileSync(new URL('../src/api.ts', import.meta.url), 'utf8')

test('financial views refresh automatically while visible and when focus returns', () => {
  assert.match(source, /const AUTO_REFRESH_INTERVAL_MS = 5_000/)
  assert.match(source, /function useAutoRefresh/)
  assert.match(source, /document\.visibilityState === 'visible'/)
  assert.match(source, /addEventListener\('focus'/)
  assert.match(source, /usePortalState[\s\S]*?useAutoRefresh\(load\)/)
  assert.match(source, /function BonusesPage[\s\S]*?useAutoRefresh\(load\)/)
  assert.match(source, /function NetworkPage[\s\S]*?useAutoRefresh\(load\)/)
  assert.match(source, /function Commissions[\s\S]*?useAutoRefresh\(load\)/)
})

test('API reads bypass browser caches so refreshes receive current values', () => {
  assert.match(apiSource, /get<T>\(path:string\)\{ return this\.request<T>\(path,\{cache:'no-store'\}\) \}/)
})
