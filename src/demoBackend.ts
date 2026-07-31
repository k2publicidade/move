import type { Bonus, CommissionRule, TreeUser, User } from './types'

type Row = Record<string, any> & { id: string }

export interface DemoDatabase {
  users: User[]
  vehicles: Row[]
  investments: Row[]
  orders: Row[]
  invoices: Row[]
  transactions: Row[]
  withdrawals: Row[]
  tickets: Row[]
  cart: Row[]
  profiles: Record<string, Record<string, any>>
  commissionRules: CommissionRule[]
  bonusEntries: Bonus[]
  auditLogs: Row[]
}

const databaseKey = 'gomove-demo-database-v3'
const credentials: Record<string, string> = {
  admin: 'gomove2026',
  master: 'gomove2026',
  matheus: 'gomove2026',
}

const today = () => new Date().toISOString()
const id = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

export function createDemoDatabase(): DemoDatabase {
  const users: User[] = [
    { id: 'usr-admin', name: 'Administrador GoMove', username: 'admin', email: 'admin@gomove.com.br', role: 'ADMIN_MASTER', status: 'ACTIVE', sponsorId: null, inviteCode: 'admin01' },
    { id: 'usr-matheus', name: 'Matheus Oliveira', username: 'matheus', email: 'matheus@gomove.com.br', role: 'ASSOCIATE', status: 'ACTIVE', sponsorId: 'usr-admin', inviteCode: 'matheus01' },
    { id: 'usr-ana', name: 'Ana Silva', username: 'ana', email: 'ana@gomove.com.br', role: 'ASSOCIATE', status: 'ACTIVE', sponsorId: 'usr-matheus', inviteCode: 'ana01' },
    { id: 'usr-bruno', name: 'Bruno Costa', username: 'bruno', email: 'bruno@gomove.com.br', role: 'ASSOCIATE', status: 'PENDING', sponsorId: 'usr-matheus', inviteCode: 'bruno01' },
    { id: 'usr-camila', name: 'Camila Rocha', username: 'camila', email: 'camila@gomove.com.br', role: 'ASSOCIATE', status: 'ACTIVE', sponsorId: 'usr-ana', inviteCode: 'camila01' },
  ]

  return {
    users,
    vehicles: [
      { id: 'VEI-1248', plate: 'GOM-1248', model: 'Scooter Urban E2', category: 'Scooter', status: 'Em operação', battery: 78, driver: 'Matheus Oliveira', location: 'São Paulo - SP' },
      { id: 'VEI-0931', plate: 'GOM-0931', model: 'GoMove SUV E', category: 'Automóvel', status: 'Disponível', battery: 96, driver: '—', location: 'Barueri - SP' },
      { id: 'VEI-0712', plate: 'GOM-0712', model: 'Scooter Cargo', category: 'Scooter', status: 'Manutenção', battery: 31, driver: 'Ana Silva', location: 'Osasco - SP' },
      { id: 'VEI-0455', plate: 'GOM-0455', model: 'GoMove Compact', category: 'Automóvel', status: 'Em operação', battery: 84, driver: 'Camila Rocha', location: 'São Paulo - SP' },
    ],
    investments: [
      { id: 'ATV-441', userId: 'usr-matheus', date: '15/03/2026', pack: 'Scooter Performance', amount: 8500, amountCents: 850000, profit: 1278.34, days: 138, status: 'Ativo' },
      { id: 'ATV-318', userId: 'usr-matheus', date: '08/01/2026', pack: 'Frota Essencial', amount: 5000, amountCents: 500000, profit: 943.12, days: 204, status: 'Ativo' },
      { id: 'ATV-502', userId: 'usr-ana', date: '28/07/2026', pack: 'Mobilidade Start', amount: 2500, amountCents: 250000, profit: 38.12, days: 3, status: 'Pendente' },
    ],
    orders: [
      { id: 'PED-2048', userId: 'usr-matheus', date: '28/07/2026', description: 'Capacete Urban Carbon', quantity: 1, total: 289, status: 'Em trânsito' },
      { id: 'PED-1984', userId: 'usr-matheus', date: '04/07/2026', description: 'Kit mobilidade GoMove', quantity: 1, total: 149, status: 'Entregue' },
      { id: 'PED-2072', userId: 'usr-ana', date: '30/07/2026', description: 'Carregador portátil', quantity: 1, total: 419, status: 'Processando' },
    ],
    invoices: [
      { id: 'INV-1084', userId: 'usr-matheus', due: '05/08/2026', description: 'Assinatura GoMove Pro', amount: 349, remaining: 349, status: 'Pendente' },
      { id: 'INV-1031', userId: 'usr-matheus', due: '05/07/2026', description: 'Adesão Scooter Urban', amount: 890, remaining: 0, status: 'Pago' },
      { id: 'INV-1102', userId: 'usr-ana', due: '10/08/2026', description: 'Mensalidade de plataforma', amount: 129, remaining: 129, status: 'Pendente' },
    ],
    transactions: [
      { id: 'MOV-9812', userId: 'usr-matheus', date: '30/07/2026', description: 'Rendimento operacional', amount: 184.2, status: 'Crédito' },
      { id: 'MOV-9801', userId: 'usr-matheus', date: '26/07/2026', description: 'Bônus de rede', amount: 92.5, status: 'Crédito' },
      { id: 'MOV-9742', userId: 'usr-matheus', date: '18/07/2026', description: 'Compra PED-2048', amount: -289, status: 'Débito' },
    ],
    withdrawals: [
      { id: 'SAQ-401', userId: 'usr-matheus', date: '12/07/2026', amount: 500, method: 'PIX', account: '***.982.***-**', paidAt: '13/07/2026', status: 'Pago' },
      { id: 'SAQ-419', userId: 'usr-ana', date: '30/07/2026', amount: 240, method: 'PIX', account: '***.441.***-**', paidAt: '—', status: 'Pendente' },
    ],
    tickets: [
      { id: 'TK-184', userId: 'usr-matheus', date: '29/07/2026', department: 'Financeiro', category: 'Fatura', subject: 'Confirmação de pagamento', priority: 'Média', status: 'Em análise' },
      { id: 'TK-163', userId: 'usr-matheus', date: '12/07/2026', department: 'Operações', category: 'Veículo', subject: 'Agendamento preventivo', priority: 'Baixa', status: 'Resolvido' },
      { id: 'TK-191', userId: 'usr-bruno', date: '31/07/2026', department: 'Cadastro', category: 'Ativação', subject: 'Validação de documentos', priority: 'Alta', status: 'Aberto' },
    ],
    cart: [{ id: 'PROD-01', userId: 'usr-matheus', name: 'Capacete Urban Carbon', price: 289, quantity: 1 }],
    profiles: {
      'usr-matheus': { name: 'Matheus Oliveira', email: 'matheus@gomove.com.br', phone: '(47) 99988-2040', birthdate: '1992-08-15', language: 'Português', country: 'Brasil', twoFactorLogin: false, twoFactorWithdraw: true, pixType: 'CPF' },
    },
    commissionRules: [{ id: 'rule-default', name: 'Unilevel padrão', eventType: 'INVESTMENT_CONFIRMED', active: true, levels: [{ level: 1, bps: 1000 }, { level: 2, bps: 500 }, { level: 3, bps: 300 }], createdAt: today() }],
    bonusEntries: [
      { id: 'BON-001', userId: 'usr-matheus', amountCents: 9250, status: 'APPROVED', type: 'UNILEVEL', reason: 'Bônus de indicação', level: 1, createdAt: today() },
      { id: 'BON-002', userId: 'usr-ana', amountCents: 25000, status: 'PENDING', type: 'UNILEVEL', reason: 'Investimento confirmado', level: 1, createdAt: today() },
    ],
    auditLogs: [{ id: 'AUD-001', actorId: 'usr-admin', action: 'DEMO_INITIALIZED', targetType: 'SYSTEM', targetId: 'gomove', details: { version: 3 }, createdAt: today() }],
  }
}

export function loadDemoDatabase(): DemoDatabase {
  try {
    const stored = localStorage.getItem(databaseKey)
    return stored ? { ...createDemoDatabase(), ...JSON.parse(stored) } : createDemoDatabase()
  } catch {
    return createDemoDatabase()
  }
}

export function resetDemoDatabase() {
  localStorage.removeItem(databaseKey)
}

function save(db: DemoDatabase) {
  localStorage.setItem(databaseKey, JSON.stringify(db))
}

function currentUser(db: DemoDatabase, token: string | null) {
  const username = token?.startsWith('demo:') ? token.slice(5) : ''
  return db.users.find(user => user.username === username) ?? null
}

function paged<T>(items: T[]) {
  return { items, page: 1, pageSize: items.length || 20, total: items.length }
}

function descendants(db: DemoDatabase, rootId: string) {
  const found = new Set([rootId])
  let changed = true
  while (changed) {
    changed = false
    for (const user of db.users) {
      if (user.sponsorId && found.has(user.sponsorId) && !found.has(user.id)) {
        found.add(user.id)
        changed = true
      }
    }
  }
  return found
}

function tree(db: DemoDatabase, userId: string, depth: number): TreeUser {
  const user = db.users.find(item => item.id === userId)
  if (!user) throw new Error('Usuário não encontrado')
  return { ...user, children: depth > 0 ? db.users.filter(item => item.sponsorId === userId).map(item => tree(db, item.id, depth - 1)) : [] }
}

function audit(db: DemoDatabase, actorId: string, action: string, targetType: string, targetId: string, details: Record<string, any> = {}) {
  db.auditLogs.unshift({ id: id('AUD'), actorId, action, targetType, targetId, details, createdAt: today() })
}

function requireUser(db: DemoDatabase, token: string | null) {
  const user = currentUser(db, token)
  if (!user) throw Object.assign(new Error('Autenticação obrigatória'), { status: 401 })
  return user
}

export async function demoRequest<T>(path: string, method = 'GET', body?: any, token: string | null = null): Promise<T> {
  const db = loadDemoDatabase()
  const url = new URL(path, 'https://demo.gomove.local')
  const route = url.pathname

  if (method === 'POST' && route === '/auth/login') {
    const suppliedUsername = String(body?.username ?? '').toLowerCase()
    const username = suppliedUsername === 'master' ? 'admin' : suppliedUsername
    const user = db.users.find(item => item.username === username)
    const expectedPassword = credentials[suppliedUsername] ?? (user as Row | undefined)?.demoPassword
    if (!user || expectedPassword !== body?.password || user.status !== 'ACTIVE') {
      throw Object.assign(new Error('Usuário ou senha inválidos'), { status: 401 })
    }
    return { token: `demo:${user.username}`, user } as T
  }

  if (method === 'GET' && route.startsWith('/public/invites/')) {
    const code = route.split('/').pop()
    const sponsor = db.users.find(item => item.inviteCode === code && item.status === 'ACTIVE')
    if (!sponsor) throw new Error('Convite indisponível')
    return { sponsor: { name: sponsor.name, inviteCode: sponsor.inviteCode } } as T
  }

  if (method === 'POST' && route === '/public/register') {
    const sponsor = db.users.find(item => item.inviteCode === body?.inviteCode && item.status === 'ACTIVE')
    if (!sponsor) throw new Error('Convite indisponível')
    if (db.users.some(item => item.username === body.username || item.email === body.email)) throw new Error('Usuário ou e-mail já cadastrado')
    const user: User & { demoPassword: string } = { id: id('USR'), name: body.name, username: body.username, email: body.email, role: 'ASSOCIATE', status: 'PENDING', sponsorId: sponsor.id, inviteCode: `${body.username}01`, demoPassword: body.password }
    db.users.push(user)
    audit(db, user.id, 'REGISTER', 'USER', user.id, { sponsorId: sponsor.id })
    save(db)
    return { user } as T
  }

  const user = requireUser(db, token)
  const isAdmin = user.role === 'ADMIN_MASTER'
  if (route.startsWith('/admin/') && !isAdmin) throw Object.assign(new Error('Acesso administrativo obrigatório'), { status: 403 })
  if (method === 'GET' && route === '/auth/me') return { user } as T

  if (method === 'GET' && route === '/state') {
    const owned = (rows: Row[]) => rows.filter(row => !row.userId || row.userId === user.id)
    return { vehicles: db.vehicles, investments: owned(db.investments), orders: owned(db.orders), invoices: owned(db.invoices), transactions: owned(db.transactions), withdrawals: owned(db.withdrawals), tickets: owned(db.tickets), cart: owned(db.cart), profile: db.profiles[user.id] ?? { name: user.name, email: user.email } } as T
  }

  const ids = descendants(db, user.id)
  if (method === 'GET' && route === '/network/summary') return { directs: db.users.filter(item => item.sponsorId === user.id).length, networkSize: ids.size - 1, activeNetwork: db.users.filter(item => ids.has(item.id) && item.status === 'ACTIVE').length - 1, pendingDirects: db.users.filter(item => item.sponsorId === user.id && item.status === 'PENDING').length } as T
  if (method === 'GET' && route === '/network/directs') return paged(db.users.filter(item => item.sponsorId === user.id)) as T
  if (method === 'GET' && route === '/network/tree') return tree(db, user.id, Number(url.searchParams.get('depth') ?? 5)) as T
  if (method === 'GET' && route === '/network/unilevel') {
    let frontier = [user.id]
    const rows: Array<User & { level: number }> = []
    for (let level = 1; level <= Number(url.searchParams.get('depth') ?? 10); level += 1) {
      const next = db.users.filter(item => item.sponsorId && frontier.includes(item.sponsorId))
      rows.push(...next.map(item => ({ ...item, level })))
      frontier = next.map(item => item.id)
    }
    return rows as T
  }
  if (method === 'GET' && route === '/bonuses/me') return paged(db.bonusEntries.filter(item => item.userId === user.id)) as T

  if (method === 'GET' && route === '/admin/dashboard') {
    return { users: db.users.length, active: db.users.filter(item => item.status === 'ACTIVE').length, pending: db.users.filter(item => item.status === 'PENDING').length, vehicles: db.vehicles.length, activeVehicles: db.vehicles.filter(item => item.status === 'Em operação').length, revenue: db.invoices.filter(item => item.status === 'Pago').reduce((sum, item) => sum + item.amount, 0), pendingWithdrawals: db.withdrawals.filter(item => item.status === 'Pendente').length, openTickets: db.tickets.filter(item => item.status !== 'Resolvido').length, bonusPendingCents: db.bonusEntries.filter(item => item.status === 'PENDING').reduce((sum, item) => sum + item.amountCents, 0) } as T
  }
  if (method === 'GET' && route === '/admin/associates') return paged(db.users.filter(item => item.role === 'ASSOCIATE')) as T
  if (method === 'GET' && route === '/admin/network/tree') return tree(db, url.searchParams.get('rootUserId') || 'usr-admin', Number(url.searchParams.get('depth') ?? 5)) as T
  if (method === 'GET' && route === '/admin/commission-rules') return paged(db.commissionRules) as T
  if (method === 'GET' && route === '/admin/bonus-entries') return paged(db.bonusEntries) as T
  if (method === 'GET' && route === '/admin/audit-logs') return paged(db.auditLogs) as T

  const adminCollection = route.match(/^\/admin\/(vehicles|investments|orders|invoices|withdrawals|tickets)$/)?.[1] as keyof DemoDatabase | undefined
  if (method === 'GET' && adminCollection) return paged(db[adminCollection] as Row[]) as T

  const associateStatus = route.match(/^\/admin\/associates\/([^/]+)\/status$/)
  if (method === 'PATCH' && associateStatus) {
    const target = db.users.find(item => item.id === associateStatus[1])
    if (!target || !['ACTIVE', 'PENDING', 'BLOCKED'].includes(body?.status)) throw new Error('Alteração inválida')
    target.status = body.status
    audit(db, user.id, 'STATUS_CHANGE', 'USER', target.id, { status: body.status, reason: body.reason })
    save(db)
    return target as T
  }

  const associateSponsor = route.match(/^\/admin\/associates\/([^/]+)\/sponsor$/)
  if (method === 'PATCH' && associateSponsor) {
    const target = db.users.find(item => item.id === associateSponsor[1])
    if (!target || !db.users.some(item => item.id === body?.sponsorId) || descendants(db, target.id).has(body.sponsorId)) throw new Error('Patrocinador inválido')
    target.sponsorId = body.sponsorId
    audit(db, user.id, 'SPONSOR_CHANGE', 'USER', target.id, { sponsorId: body.sponsorId, reason: body.reason })
    save(db)
    return target as T
  }

  if (method === 'POST' && route === '/admin/commission-rules') {
    const rule: CommissionRule = { id: id('REG'), name: body.name, eventType: 'INVESTMENT_CONFIRMED', active: false, levels: body.levels, createdAt: today() }
    db.commissionRules.push(rule)
    audit(db, user.id, 'RULE_CREATE', 'RULE', rule.id)
    save(db)
    return rule as T
  }

  const rulePatch = route.match(/^\/admin\/commission-rules\/([^/]+)$/)
  if (method === 'PATCH' && rulePatch) {
    const rule = db.commissionRules.find(item => item.id === rulePatch[1])
    if (!rule) throw new Error('Regra não encontrada')
    Object.assign(rule, body)
    if (rule.active) db.commissionRules.filter(item => item.id !== rule.id).forEach(item => { item.active = false })
    audit(db, user.id, 'RULE_UPDATE', 'RULE', rule.id)
    save(db)
    return rule as T
  }

  if (method === 'POST' && route === '/admin/bonus-entries/manual-credit') {
    const entry: Bonus = { id: id('BON'), userId: body.userId, amountCents: body.amountCents, status: 'PENDING', type: 'MANUAL', reason: body.reason, createdAt: today() }
    db.bonusEntries.unshift(entry)
    audit(db, user.id, 'BONUS_MANUAL', 'BONUS', entry.id)
    save(db)
    return entry as T
  }

  const bonusAction = route.match(/^\/admin\/bonus-entries\/([^/]+)\/(approve|cancel|reverse)$/)
  if (method === 'POST' && bonusAction) {
    const entry = db.bonusEntries.find(item => item.id === bonusAction[1])
    if (!entry) throw new Error('Bônus não encontrado')
    if (bonusAction[2] === 'reverse') {
      const reversal: Bonus = { id: id('BON'), userId: entry.userId, amountCents: -Math.abs(entry.amountCents), status: 'APPROVED', type: 'REVERSAL', reason: body.reason, reversalOfId: entry.id, createdAt: today() }
      db.bonusEntries.unshift(reversal)
      save(db)
      return reversal as T
    }
    entry.status = bonusAction[2] === 'approve' ? 'APPROVED' : 'CANCELLED'
    audit(db, user.id, `BONUS_${bonusAction[2].toUpperCase()}`, 'BONUS', entry.id)
    save(db)
    return entry as T
  }

  const adminPatch = route.match(/^\/admin\/(vehicles|investments|orders|invoices|withdrawals|tickets)\/([^/]+)$/)
  if (method === 'PATCH' && adminPatch) {
    const collection = db[adminPatch[1] as keyof DemoDatabase] as Row[]
    const item = collection.find(row => row.id === adminPatch[2])
    if (!item) throw new Error('Registro não encontrado')
    Object.assign(item, body, { id: item.id })
    audit(db, user.id, 'RECORD_UPDATE', adminPatch[1].toUpperCase(), item.id, body)
    save(db)
    return item as T
  }

  const userCollection = route.match(/^\/(investments|orders|withdrawals|tickets)$/)?.[1] as 'investments' | 'orders' | 'withdrawals' | 'tickets' | undefined
  if (method === 'POST' && userCollection) {
    const prefix = { investments: 'ATV', orders: 'PED', withdrawals: 'SAQ', tickets: 'TK' }[userCollection]
    const item = { ...body, id: id(prefix), userId: user.id, date: new Date().toLocaleDateString('pt-BR'), createdAt: today() }
    db[userCollection].unshift(item)
    save(db)
    return item as T
  }

  if (method === 'PUT' && route === '/profile') {
    db.profiles[user.id] = { ...(db.profiles[user.id] ?? {}), ...body }
    const account = db.users.find(item => item.id === user.id)
    if (account && body.name) account.name = body.name
    save(db)
    return db.profiles[user.id] as T
  }

  throw Object.assign(new Error('Recurso não disponível'), { status: 404 })
}
