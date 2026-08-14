import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const page = source.match(/function BonusesPage\([\s\S]*?function NetworkPage/)?.[0] ?? ''

test('user menu exposes a dedicated bonuses route', () => {
  assert.match(source, /\['\/bonuses', 'Bonificações', CircleDollarSign\]/)
  assert.match(source, /if \(path === '\/bonuses'\) return <BonusesPage session=\{session\} \/>/)
})

test('bonuses page shows period totals, statuses and detailed history', () => {
  assert.match(page, /<BonusPeriodSummary/)
  assert.match(page, /TOTAL APROVADO/)
  assert.match(page, /AGUARDANDO APROVAÇÃO/)
  assert.match(page, /VALOR BLOQUEADO/)
  assert.match(page, /Detalhes das bonificações/)
  assert.match(page, /<BonusTable rows=\{bonuses\} detailed \/>/)
})
