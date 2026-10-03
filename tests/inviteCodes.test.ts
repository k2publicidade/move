import { test } from 'node:test'
import assert from 'node:assert/strict'
import { inviteCodeFromLocation, normalizeInviteCode } from '../src/invites.js'

test('invite links preserve the sponsor through trailing slashes, encoding and query parameters', () => {
  for (const pathname of ['/convite/Matheus01', '/convite/Matheus01/', '/convite/%20MATHEUS01%20/']) {
    assert.equal(inviteCodeFromLocation({ pathname, search: '?utm_source=whatsapp' }), 'matheus01')
  }
  assert.equal(inviteCodeFromLocation({ pathname: '/cadastro', search: '?inviteCode=MATHEUS01' }), 'matheus01')
  assert.equal(inviteCodeFromLocation({ pathname: '/cadastro/', search: '?convite=matheus01' }), 'matheus01')
  assert.equal(normalizeInviteCode(' https://example.com/convite/Matheus01/?utm_source=whatsapp '), 'matheus01')
  assert.equal(normalizeInviteCode(' MATHEUS01 '), 'matheus01')
  assert.equal(inviteCodeFromLocation({ pathname: '/convite/', search: '' }), '')
  assert.equal(inviteCodeFromLocation({ pathname: '/convite/%ZZ', search: '' }), '')
  assert.equal(normalizeInviteCode('https://example.com/sem-convite'), '')
})

test('pasted registration URLs retain query invitations and malformed extra path segments are rejected', () => {
  assert.equal(normalizeInviteCode('https://example.com/cadastro?convite=MATHEUS01'), 'matheus01')
  assert.equal(normalizeInviteCode('/convite/Matheus01/?utm_source=whatsapp'), 'matheus01')
  assert.equal(normalizeInviteCode('https://example.com/convite/matheus01/extra'), '')
})
