import test from 'node:test'
import assert from 'node:assert/strict'
import { summarizeParticipantEarnings } from '../src/participantSummary.js'
import * as report from '../src/participantSummary.js'

test('dashboard indicators expose actual earnings, separate balances and eligible withdrawals', () => {
  assert.equal(typeof (report as any).participantIndicators, 'function')
  const indicators = (report as any).participantIndicators({ directReferralBonusCents: 8000, unilevelBonusCents: 5000, dailyEarningCents: 1234, wallets: { balanceCents: 10000, cotaCents: 9000, redeCents: 5000, balanceWithdrawableCents: 8000, cotaWithdrawableCents: 9000, cotaAvailableForWithdrawalCents: 0, redeWithdrawableCents: 3000 } }, { directs: 2, networkSize: 7, activeNetwork: 4 })
  const value = (label: string) => indicators.find((item: any) => item.label === label)?.value
  assert.equal(value('INDICAÇÃO DIRETA'), 8000)
  assert.equal(value('UNILEVEL'), 5000)
  assert.equal(value('DIÁRIO CREDITADO'), 1234)
  assert.equal(value('REDE TOTAL'), 7)
  assert.equal(value('REDE ATIVA'), 4)
  assert.equal(value('CARTEIRA COTA'), 9000)
  assert.equal(value('DISPONÍVEL PARA SAQUE'), 11000)
  assert.equal(value('PONTUAÇÃO'), 'Não definida')
})

const user = { id: 'u', role: 'ASSOCIATE' as const, status: 'ACTIVE' as const, membershipType: 'SHAREHOLDER' as const }
test('earnings split direct and Unilevel net of their own approved reversals', () => {
  const entries = [
    { id: 'direct', userId: 'u', type: 'DIRECT_REFERRAL', status: 'APPROVED', amountCents: 10000 },
    { id: 'unilevel', userId: 'u', type: 'UNILEVEL_PROFITABILITY', status: 'APPROVED', amountCents: 5000 },
    { id: 'reverse', userId: 'u', type: 'REVERSAL', reversalOfId: 'direct', status: 'APPROVED', amountCents: -2000 },
    { id: 'pending', userId: 'u', type: 'DIRECT_REFERRAL', status: 'PENDING', amountCents: 9000 },
    { id: 'other', userId: 'other', type: 'DIRECT_REFERRAL', status: 'APPROVED', amountCents: 9999 },
  ]
  const summary: any = summarizeParticipantEarnings(user, entries, [{ userId: 'u', creditedAmountCents: 1234 }], [])
  assert.equal(summary.directReferralBonusCents, 8000)
  assert.equal(summary.unilevelBonusCents, 5000)
  assert.equal(summary.approvedBonusCents, 13000)
  assert.equal(summary.dailyEarningCents, 1234)
})
