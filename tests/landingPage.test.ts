import test from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { ASSOCIATE_PLAN_PRICE_CENTS, ASSOCIATE_BONUS_CAP_CENTS, SHAREHOLDER_MIN_QUOTA_CENTS, ASSOCIATE_UPGRADE_MIN_QUOTA_CENTS, SHAREHOLDER_TOTAL_CAP_BPS, DIRECT_REFERRAL_BPS, UNILEVEL_LEVELS } from '../src/businessPlan.js'
import { readFile } from 'node:fs/promises'
import { renderToStaticMarkup } from 'react-dom/server'

async function markup() {
  const module = await import('../src/LandingPage.js').catch(() => null)
  assert.ok(module?.default, 'LandingPage deve existir e exportar o site institucional')
  return renderToStaticMarkup(createElement(module.default))
}

test('site público oferece marca, quatro operações e caminhos reais acessíveis', async () => {
  const html = await markup()
  for (const text of ['Movendo pessoas.', 'Estruturando oportunidades.', 'Mobilidade', 'Turismo', 'E-mobility', 'Infra', 'Matheus Soares']) assert.ok(html.includes(text), text)
  for (const link of ['/cadastro', '/login', '#gm-conteudo', '/brand/institucional/GoMove-Apresentacao.pdf']) assert.ok(html.includes(`href="${link}"`), link)
  assert.match(html, /aria-expanded="false"/)
  assert.match(html, /aria-controls="gm-mobile-nav"/)
  assert.match(html, /id="gm-mobile-nav"[^>]*hidden=""/)
  assert.match(html, /<main id="gm-conteudo"/)
  assert.match(html, /<details/)
  assert.match(html, /<summary/)
  assert.match(html, /gomove-logo-oficial\.png/)
  assert.match(html, /Imagem conceitual/)
  assert.doesNotMatch(html, /wa\.me|mailto:|<form|hero\.jpeg|preload[^>]*pdf/)
})

test('modalidades refletem as constantes do negócio, elegibilidade, carteiras e limites sem promessas', async () => {
  const html = await markup()
  const money = (cents: number) => `R$ ${(cents / 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`
  for (const cents of [ASSOCIATE_PLAN_PRICE_CENTS, ASSOCIATE_BONUS_CAP_CENTS, SHAREHOLDER_MIN_QUOTA_CENTS, ASSOCIATE_UPGRADE_MIN_QUOTA_CENTS]) assert.ok(html.includes(money(cents)), money(cents))
  for (const text of ['Cotista / SCP', 'Frota de terceiros', 'Carteira Cota', 'Carteira Rede', 'não gera bônus de rede', 'não recebe resultado diário', 'cota elegível ativada', 'sobre o rendimento', 'não sobre a compra', 'principal', 'ganhos de rede', 'limite único', 'Sem garantia']) assert.ok(html.includes(text), text)
  assert.ok(html.includes(`${SHAREHOLDER_TOTAL_CAP_BPS / 100}%`))
  assert.ok(html.includes(`${DIRECT_REFERRAL_BPS / 100}%`))
  for (const { level, bps } of UNILEVEL_LEVELS) assert.match(html, new RegExp(`<th scope="row">${level}º nível</th><td>${bps / 100}%</td>`))
  assert.match(html, /R\$ 300.*R\$ 30/)
  assert.doesNotMatch(html, /R\$ 65|retorno garantido|renda garantida/)
})

test('CSS é isolado do portal e oferece mobile, foco, reduced motion e revelação progressiva', async () => {
  const css = await readFile(new URL('../src/landing.css', import.meta.url), 'utf8').catch(() => '')
  assert.ok(css.length > 0, 'landing.css deve existir')
  // Each leaf rule must stay inside the institutional root; at-rules are wrappers.
  for (const match of css.matchAll(/([^{}]+)\{[^{}]*\}/g)) {
    const selectors = match[1].trim()
    if (selectors.startsWith('@')) continue
    for (const selector of selectors.split(',')) assert.ok(selector.trim().startsWith('.gm-site'), `Regra fora do escopo: ${selector}`)
  }
  assert.match(css, /prefers-reduced-motion:\s*reduce/)
  assert.match(css, /\.gm-site\.gm-observer-ready/)
  assert.match(css, /scroll-margin-top/)
  assert.match(css, /focus-visible/)
  assert.match(css, /\[hidden\]/)
  assert.match(css, /max-width:\s*400px/)
  assert.doesNotMatch(css, /backdrop-filter|linear-gradient|radial-gradient/)
})
