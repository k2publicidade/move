import { test } from 'node:test'
import assert from 'node:assert/strict'
import { publicSurface } from '../src/siteRouting'

test('institutional homepage is public and does not depend on a stored session', () => {
  assert.equal(publicSurface({ pathname: '/', search: '' }), 'website')
  assert.equal(publicSurface({ pathname: '/', search: '?utm_source=campaign' }), 'website')
})

test('new and legacy invitations retain registration instead of being swallowed by the website', () => {
  for (const location of [
    { pathname: '/cadastro', search: '' },
    { pathname: '/cadastro/', search: '?ref=ana' },
    { pathname: '/convite/ana01', search: '' },
    { pathname: '/', search: '?ref=ana' },
    { pathname: '/', search: '?inviteCode=ana01' },
    { pathname: '/', search: '?convite=12345' },
    { pathname: '/', search: '?ref=invalid%2Ftoken' },
    { pathname: '/', search: '?ref=' },
  ]) assert.equal(publicSurface(location), 'registration', JSON.stringify(location))
})

test('portal, login and protected account routes stay outside the institutional surface', () => {
  for (const pathname of ['/login', '/login/', '/portal', '/dashboard', '/admin', '/finance', '/support']) {
    assert.equal(publicSurface({ pathname, search: '' }), 'portal')
  }
})
