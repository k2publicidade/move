import { after, test } from 'node:test'
import { strict as assert } from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gomove-viewers-'))
process.env.NODE_ENV = 'test'
process.env.GOMOVE_DATA_FILE = path.join(dir, 'db.json')

const { app, readDb, writeDb } = await import('../server/index.js')
const { ensureConfiguredViewerAdmins, parseViewerAdminConfig, VIEWER_ADMIN_ROLE } = await import('../src/viewerAdmins.js')

const server = app.listen(0)
await new Promise<void>(resolve => server.listening ? resolve() : server.once('listening', resolve))
const address = server.address() as { port: number }

const request = async (route: string, token?: string, body?: unknown, method = body === undefined ? 'GET' : 'POST') => {
  const response = await fetch(`http://127.0.0.1:${address.port}/api${route}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  return { status: response.status, body: await response.json() as any }
}

const VIEWERS = [
  { name: 'Auditoria Um', username: 'auditoria1', email: 'auditoria1@gomove.local' },
  { name: 'Auditoria Dois', username: 'auditoria2', email: 'auditoria2@gomove.local' },
  { name: 'Auditoria Três', username: 'auditoria3', email: 'auditoria3@gomove.local' },
]
const PASSWORD = 'leitura2026'

after(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()))
  fs.rmSync(dir, { recursive: true, force: true })
})

test('administradores de visualização: consultam todo o sistema e não alteram nada', async () => {
  const master = (await request('/auth/login', undefined, { username: 'admin', password: 'gomove2026' })).body
  assert.ok(master.token)

  // 1. Só o MASTER cria, e cada conta é independente.
  assert.equal((await request('/admin/viewers', master.token, VIEWERS[0])).status, 422, 'sem senha não cria')
  for (const viewer of VIEWERS) {
    const created = await request('/admin/viewers', master.token, { ...viewer, password: PASSWORD })
    assert.equal(created.status, 201, JSON.stringify(created.body))
    assert.equal(created.body.role, 'ADMIN_VIEWER')
    assert.equal(created.body.status, 'ACTIVE')
    assert.equal(created.body.passwordHash, undefined)
    assert.equal(created.body.sponsorId, null)
  }
  assert.equal((await request('/admin/viewers', master.token, { ...VIEWERS[0], password: PASSWORD })).status, 409)
  assert.equal((await request('/admin/viewers', master.token, { name: 'X', username: 'auditoria4', email: 'novo@gomove.local', password: '123' })).status, 422)
  assert.equal((await request('/admin/viewers', master.token, { name: 'X', username: 'ab', email: 'novo2@gomove.local', password: PASSWORD })).status, 422)
  const listed = await request('/admin/viewers?pageSize=100', master.token)
  assert.equal(listed.body.total, 3)
  assert.ok(listed.body.items.every((item: any) => item.role === 'ADMIN_VIEWER' && !item.passwordHash))
  assert.ok(listed.body.items.every((item: any) => !readDb().users.find((user: any) => user.role === 'ASSOCIATE' && user.id === item.id)))
  // Auditoria registra a criação sem guardar senha.
  const created = readDb().auditLogs.filter((log: any) => log.action === 'VIEWER_ADMIN_CREATE')
  assert.equal(created.length, 3)
  assert.ok(!JSON.stringify(created).includes(PASSWORD))

  // 2. O perfil entra normalmente e enxerga todo o painel administrativo.
  const auditor = (await request('/auth/login', undefined, { username: 'auditoria1', password: PASSWORD })).body
  assert.equal(auditor.user.role, 'ADMIN_VIEWER')
  assert.ok(auditor.token)
  const participant = (await request('/auth/login', undefined, { username: 'matheus', password: 'gomove2026' })).body
  const reads: Array<[string, string]> = [
    ['/admin/dashboard', 'dash'],
    ['/admin/associates?pageSize=100', 'usuários'],
    ['/admin/investments?pageSize=100', 'cotas'],
    ['/admin/orders?pageSize=100', 'pedidos'],
    ['/admin/invoices?pageSize=100', 'faturas'],
    ['/admin/withdrawals?pageSize=100', 'saques'],
    ['/admin/tickets?pageSize=100', 'tickets'],
    ['/admin/vehicles?pageSize=100', 'frota'],
    ['/admin/commission-rules?pageSize=100', 'regras'],
    ['/admin/bonus-entries?pageSize=100', 'bônus'],
    ['/admin/daily-profitabilities?pageSize=100', 'Diários'],
    ['/admin/audit-logs?pageSize=100', 'auditoria'],
    ['/admin/network/tree?depth=3', 'rede'],
    ['/admin/viewers?pageSize=100', 'acessos de visualização'],
    [`/admin/associates/${participant.user.id}/account`, 'saldo do participante'],
    ['/state', 'portal próprio'],
  ]
  for (const [route, label] of reads) assert.equal((await request(route, auditor.token)).status, 200, `leitura de ${label} deveria funcionar`)

  // 3. Nenhuma escrita passa — nem com a frase de confirmação correta.
  const blocked: Array<[string, string, string, unknown]> = [
    ['/admin/financial-reset', 'POST', 'zerar saldos', { confirmation: 'ZERAR SALDOS' }],
    ['/admin/viewers', 'POST', 'criar outro administrador', { name: 'Clone', username: 'clone1', email: 'clone@gomove.local', password: PASSWORD }],
    ['/admin/viewers/' + listed.body.items[1].id, 'PATCH', 'trocar senha de outro acesso', { password: PASSWORD }],
    ['/admin/viewers/' + listed.body.items[1].id, 'DELETE', 'remover outro acesso', undefined],
    ['/admin/associates', 'POST', 'cadastrar associado', { name: 'Teste', username: 'teste1', email: 'teste@gomove.local', password: PASSWORD, cpf: '52998224725', associatePlanStatus: 'PENDING', status: 'ACTIVE' }],
    [`/admin/associates/${participant.user.id}`, 'PATCH', 'editar cadastro', { name: 'Alterado' }],
    [`/admin/associates/${participant.user.id}`, 'DELETE', 'excluir conta', undefined],
    [`/admin/associates/${participant.user.id}/status`, 'PATCH', 'mudar status', { status: 'BLOCKED', reason: 'teste' }],
    [`/admin/associates/${participant.user.id}/access`, 'POST', 'entrar na conta', {}],
    [`/admin/associates/${participant.user.id}/balance-adjustments`, 'POST', 'ajustar saldo', { amountCents: 1_000, reason: 'teste', reference: 'viewer-1' }],
    [`/admin/associates/${participant.user.id}/reconcile`, 'POST', 'conciliar pagamento', { recordId: 'x', kind: 'invoices', reason: 'teste', reference: 'viewer-2' }],
    ['/admin/commission-rules', 'POST', 'criar regra', { name: 'Regra pirata', directReferralBps: 1_000, levels: [{ level: 1, bps: 1_000 }], active: false }],
    ['/admin/daily-profitabilities', 'POST', 'cadastrar Diário', { date: '2026-09-15', rateBps: 100 }],
    ['/admin/bonus-entries/manual-credit', 'POST', 'creditar bônus', { userId: participant.user.id, amountCents: 1_000, reason: 'teste' }],
    ['/admin/orders', 'POST', 'cadastrar pedido', { userId: participant.user.id, description: 'Pedido', total: 10, status: 'Processando' }],
    ['/admin/invoices', 'POST', 'cadastrar fatura', { userId: participant.user.id, description: 'Fatura', amount: 10, status: 'Pendente' }],
    ['/admin/withdrawals', 'POST', 'cadastrar saque', { userId: participant.user.id, amount: 60, status: 'Pendente' }],
    ['/admin/tickets', 'POST', 'abrir ticket', { userId: participant.user.id, subject: 'Assunto', status: 'Em análise' }],
    ['/admin/vehicles', 'POST', 'cadastrar veículo', { plate: 'GOM-0001', model: 'Scooter' }],
    ['/profile', 'PUT', 'editar perfil', { name: 'Novo nome' }],
    ['/deposits', 'POST', 'gerar depósito', { amount: 100, idempotencyKey: 'viewer-dep-1', paymentMethod: 'PIX', customerDocument: '52998224725' }],
    ['/withdrawals', 'POST', 'pedir saque', { amount: 60, wallet: 'REDE' }]
  ]
  for (const [route, method, label, body] of blocked) {
    const result = await request(route, auditor.token, body, method)
    assert.equal(result.status, 403, `${label} deveria ser recusado (${route})`)
    assert.match(String(result.body.error), /visualização/i, `mensagem de ${label} precisa explicar o perfil`)
  }
  // Nada foi alterado no estado.
  const afterAttempts = readDb()
  assert.equal(afterAttempts.users.find((user: any) => user.id === participant.user.id).name, 'Matheus Oliveira')
  assert.equal(afterAttempts.withdrawals.filter((item: any) => item.userId === participant.user.id).length, 1)
  assert.equal(afterAttempts.transactions.some((item: any) => item.adjustmentReference === 'viewer-1'), false)
  assert.equal(afterAttempts.commissionRules.some((rule: any) => rule.name === 'Regra pirata'), false)
  assert.equal(afterAttempts.dailyProfitabilityRuns.some((run: any) => run.date === '2026-09-15'), false)
  assert.equal((await request('/admin/viewers?pageSize=100', master.token)).body.total, 3)

  // 4. A sessão do perfil de visualização continua útil: encerrar é permitido.
  assert.equal((await request('/auth/logout', auditor.token, {})).status, 200)
  assert.equal((await request('/auth/me', auditor.token)).status, 401)

  // 5. O MASTER troca a senha e o acesso antigo cai; remover o acesso tira o login.
  const second = (await request('/auth/login', undefined, { username: 'auditoria2', password: PASSWORD })).body
  const changed = await request(`/admin/viewers/${listed.body.items.find((item: any) => item.username === 'auditoria2').id}`, master.token, { password: 'leitura2027' }, 'PATCH')
  assert.equal(changed.status, 200, JSON.stringify(changed.body))
  assert.equal((await request('/auth/me', second.token)).status, 401, 'sessões do acesso alterado precisam cair')
  assert.equal((await request('/auth/login', undefined, { username: 'auditoria2', password: PASSWORD })).status, 401)
  const relogin = (await request('/auth/login', undefined, { username: 'auditoria2', password: 'leitura2027' })).body
  assert.ok(relogin.token)
  const thirdId = listed.body.items.find((item: any) => item.username === 'auditoria3').id
  assert.equal((await request(`/admin/viewers/${thirdId}`, master.token, undefined, 'DELETE')).status, 200)
  assert.equal((await request('/auth/login', undefined, { username: 'auditoria3', password: PASSWORD })).status, 401)
  assert.equal((await request('/admin/viewers?pageSize=100', master.token)).body.total, 2)
  assert.equal((await request('/admin/viewers', auditor.token, { name: 'X', username: 'x1y', email: 'x1y@gomove.local', password: PASSWORD })).status, 401)
  assert.ok(readDb().auditLogs.some((log: any) => log.action === 'VIEWER_ADMIN_DELETE'))
  // O MASTER segue com todos os poderes.
  assert.equal((await request('/admin/financial-reset', master.token, { confirmation: 'frase errada' })).status, 422)
  assert.equal((await request('/admin/dashboard', master.token)).status, 200)
})

test('acessos de visualização declarados em ambiente são criados uma única vez', () => {
  const config = parseViewerAdminConfig(JSON.stringify([
    { name: 'Admin 2', username: 'admin2', email: 'admin2@gomove.local', password: 'leitura2026' },
    { name: 'Admin 3', username: 'admin3', email: 'admin3@gomove.local', password: 'leitura2026' },
    { name: 'Admin 4', username: 'admin4', email: 'admin4@gomove.local', password: 'leitura2026' },
  ]))
  assert.equal(config.length, 3)
  assert.equal(parseViewerAdminConfig('').length, 0)
  assert.equal(parseViewerAdminConfig(undefined).length, 0)
  assert.throws(() => parseViewerAdminConfig('nao-e-json'), /GOMOVE_VIEWER_ADMINS/)
  assert.throws(() => parseViewerAdminConfig('[{"name":"X","username":"ab","email":"x@gomove.local","password":"leitura2026"}]'), /usuário válido/)
  assert.throws(() => parseViewerAdminConfig('[{"name":"X","username":"xxx1","email":"x@gomove.local","password":"123"}]'), /senha de 6 a 128/)
  assert.throws(() => parseViewerAdminConfig(JSON.stringify([{ name: 'A', username: 'igual', email: 'a@gomove.local', password: 'leitura2026' }, { name: 'B', username: 'igual', email: 'b@gomove.local', password: 'leitura2026' }])), /repetido/)

  const db: any = readDb()
  const options = { createId: () => `id-${Math.random().toString(36).slice(2)}`, hashPassword: (password: string) => `hash:${password}`, timestamp: () => '2026-09-19T00:00:00.000Z' }
  const usersBefore = readDb().users.length
  const created = ensureConfiguredViewerAdmins(db, config, options)
  writeDb(db)
  assert.equal(created.length, 3, 'cria os três acessos configurados')
  assert.equal(db.users.length, usersBefore + 3)
  for (const username of ['admin2', 'admin3', 'admin4']) {
    const viewer = db.users.find((user: any) => user.username === username)
    assert.equal(viewer.role, VIEWER_ADMIN_ROLE)
    assert.equal(viewer.status, 'ACTIVE')
    assert.equal(viewer.sponsorId, null)
    assert.equal(viewer.membershipType, undefined)
    assert.ok(db.profiles[viewer.id])
    assert.equal(db.auditLogs.filter((log: any) => log.action === 'VIEWER_ADMIN_CREATE' && log.details.username === username).length, 1)
  }
  // Segunda execução (todo boot/leitura) não duplica nada e preserva a senha já definida.
  const before = readDb()
  assert.equal(ensureConfiguredViewerAdmins(before, config, options).length, 0)
  assert.equal(before.users.filter((user: any) => ['admin2', 'admin3', 'admin4'].includes(user.username)).length, 3)
  const renamed = before.users.find((user: any) => user.username === 'admin2')
  renamed.passwordHash = 'scrypt$trocada$depois'
  ensureConfiguredViewerAdmins(before, config, options)
  assert.equal(renamed.passwordHash, 'scrypt$trocada$depois', 'a senha trocada no painel não é sobrescrita pela configuração')
})
