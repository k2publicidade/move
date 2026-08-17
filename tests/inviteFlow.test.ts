import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8')
const registration = source.match(/function Registration\([\s\S]*?const userLinks/)?.[0] ?? ''
const login = source.match(/function Login\([\s\S]*?function Registration/)?.[0] ?? ''
const activation = source.match(/function ActivationOnboarding\([\s\S]*?function UserDashboard/)?.[0] ?? ''
const investments = source.match(/function UserInvestments\([\s\S]*?const products/)?.[0] ?? ''
const commissions = source.match(/function Commissions\([\s\S]*?function Audit/)?.[0] ?? ''
const associates = source.match(/function Associates\([\s\S]*?type CrudField/)?.[0] ?? ''

test('registration works directly and through an affiliate invite', () => {
  assert.match(source, /location\.pathname === '\/cadastro'/)
  assert.match(source, /location\.pathname\.startsWith\('\/convite\/'\)/)
  assert.match(registration, /const inviteCode = invited \? location\.pathname\.split\('\/'\)\.pop\(\) \|\| '' : ''/)
  assert.match(registration, /inviteCode: inviteCode \|\| undefined/)
})

test('successful registration stores the returned session and enters the dashboard', () => {
  assert.match(registration, /const session = await api\.post<Session>\('\/public\/register'/)
  assert.match(registration, /saveSession\(session\)/)
  assert.match(registration, /setSession\(session\)/)
  assert.match(registration, /location\.replace\('\/dashboard'\)/)
})

test('login offers an accessible create-account route', () => {
  assert.match(login, /href="\/cadastro"/)
  assert.match(login, />Criar conta</)
  assert.doesNotMatch(login, /href="\/cadastro" onClick=/)
})

test('financially inactive accounts are routed to activation inside the authenticated shell', () => {
  assert.match(source, /const needsActivation =[^\n]*associatePlanStatus !== 'ACTIVE'/)
  assert.match(source, /needsActivation && !\['\/activation', '\/investments', '\/my-investments', '\/profile', '\/support'\]\.includes\(path\)/)
  assert.match(source, /return needsActivation \? <ActivationOnboarding session=\{session\} \/>/)
})

test('activation offers either the R$55 associate plan or direct quotas from R$500', () => {
  assert.match(activation, /Escolha como ativar sua conta/)
  assert.match(activation, /Plano de Associado/)
  assert.match(activation, /const \[planCheckoutKey\] = useState\(\(\) => crypto\.randomUUID\(\)\)/)
  assert.match(activation, /api\.post<Row>\('\/associate-plan', \{ idempotencyKey: planCheckoutKey, preferredPaymentAsset: planPaymentAsset, paymentMethod: planPaymentAsset/)
  assert.match(activation, /<option value="PIX">PIX<\/option>/)
  assert.match(activation, /Compra direta de cotas/)
  assert.match(activation, /go\('\/investments'\)/)
  assert.match(activation, /não exige o Plano de Associado de R\$ 55/)
})

test('direct quota checkout never requires the associate plan', () => {
  assert.match(investments, /A compra direta de cotas dispensa o Plano de Associado de/)
  assert.doesNotMatch(investments, /disabled=\{!planActive\}/)
  assert.doesNotMatch(investments, /Ative primeiro o Plano de Associado/)
  assert.doesNotMatch(investments, /manutenção do Plano de Associado ativo/)
})

test('manual MASTER credits list only financially eligible participants', () => {
  assert.match(source, /isBonusEligibleParticipant[^\n]*from '\.\/businessPlan'/)
  assert.match(commissions, /const eligibleUsers = users\.filter\(isBonusEligibleParticipant\)/)
  assert.match(commissions, /\{eligibleUsers\.map\(user => <option/)
  assert.doesNotMatch(commissions, /users\.filter\(user => user\.status === 'ACTIVE'\)/)
})

test('MASTER sponsor selector excludes active accounts without a financial product', () => {
  assert.match(associates, /const masterSponsorEligible = session\.user\.role === 'ADMIN_MASTER' && session\.user\.status === 'ACTIVE'/)
  assert.match(associates, /const eligibleSponsors = rows\.filter\(item => item\.id !== selected\?\.id && isBonusEligibleParticipant\(item\)\)/)
  assert.match(associates, /\{masterSponsorEligible && <option value="__MASTER__">Administrador MASTER<\/option>\}/)
  assert.match(associates, /\{eligibleSponsors\.map\(item => <option/)
  assert.doesNotMatch(associates, /rows\.filter\(item => item\.id !== selected\?\.id\)\.map/)
})

test('demo associate checkout can be explicitly confirmed and refreshes the saved session', () => {
  assert.match(activation, /if \(result\.demo\) setCheckout\(result\)/)
  assert.match(activation, /api\.post<\{ user: User \}>\(`\/associate-plan\/\$\{checkout\.id\}\/confirm-demo`, \{\}\)/)
  assert.match(activation, /const nextSession = \{ \.\.\.session, user: result\.user \}/)
  assert.match(activation, /saveSession\(nextSession\)/)
  assert.match(activation, /location\.replace\('\/dashboard'\)/)
  assert.match(activation, /checkout\.demo &&[\s\S]*Confirmar pagamento de demonstração/)
})
