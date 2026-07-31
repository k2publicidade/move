import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react'
import {
  Activity, BarChart3, Car, Check, CircleDollarSign, Copy, FileText, GitBranch,
  Headphones, LayoutDashboard, LogOut, Menu, Network, Package, Plus, RotateCcw, Search,
  Settings, ShieldCheck, ShoppingBag, TicketCheck, UserRound, UsersRound, Wallet,
  WalletCards, Wrench, X,
} from 'lucide-react'
import { ApiClient, clearSession, loadSession, saveSession, type Session } from './api'
import { resetDemoDatabase } from './demoBackend'
import type { Bonus, CommissionRule, Page as ApiPage, TreeUser, User } from './types'
import './styles.css'

type Row = Record<string, any> & { id: string }
type PortalState = {
  vehicles: Row[]; investments: Row[]; orders: Row[]; invoices: Row[]; transactions: Row[]
  withdrawals: Row[]; tickets: Row[]; cart: Row[]; profile: Record<string, any>
}

const emptyState: PortalState = { vehicles: [], investments: [], orders: [], invoices: [], transactions: [], withdrawals: [], tickets: [], cart: [], profile: {} }
const brl = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0)
const cents = (value: number) => brl((value || 0) / 100)
const initials = (name: string) => name.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase()
const status = (value: string) => <span className={`status status-${String(value).toLowerCase().replaceAll(' ', '-')}`}>{value}</span>
const go = (path: string) => { history.pushState({}, '', path); dispatchEvent(new PopStateEvent('popstate')) }

function usePath() {
  const [path, setPath] = useState(location.pathname)
  useEffect(() => {
    const update = () => setPath(location.pathname)
    addEventListener('popstate', update)
    return () => removeEventListener('popstate', update)
  }, [])
  return path
}

function useApi(session: Session | null, logout?: () => void) {
  return useMemo(() => new ApiClient(session?.token || null, logout), [session?.token])
}

function usePortalState(session: Session) {
  const api = useApi(session)
  const [data, setData] = useState<PortalState>()
  const [error, setError] = useState('')
  const load = () => api.get<PortalState>('/state').then(value => setData({ ...emptyState, ...value })).catch(reason => setError(reason.message))
  useEffect(() => { void load() }, [])
  return { api, data, error, load }
}

function NavLink({ to, icon: Icon, children, current, onNavigate }: { to: string; icon: any; children: ReactNode; current: string; onNavigate?: () => void }) {
  const active = current === to || (to !== '/dashboard' && current.startsWith(`${to}/`))
  return <a href={to} className={active ? 'active' : ''} onClick={event => { event.preventDefault(); go(to); onNavigate?.() }}><Icon /><span>{children}</span></a>
}

function Loader() { return <div className="loading-screen"><div className="loader-mark">G</div><p>Carregando a operação…</p></div> }
function ErrorBox({ error }: { error: string }) { return error ? <div className="form-error">{error}</div> : null }
function Page({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  return <><div className="page-heading"><div><span className="eyebrow">ECOSSISTEMA GOMOVE</span><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{action}</div>{children}</>
}
function Metric({ label, value, icon: Icon, note }: { label: string; value: string; icon: any; note?: string }) {
  return <article className="metric-card tone-lime"><div className="metric-top"><span>{label}</span><i><Icon /></i></div><strong>{value}</strong>{note && <small>{note}</small>}</article>
}
function Modal({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  return <div className="modal-backdrop" onClick={close}><section className="modal" onClick={event => event.stopPropagation()}><div className="modal-head"><h2>{title}</h2><button className="icon-btn" onClick={close}><X /></button></div>{children}</section></div>
}
type TableColumn = [string, string, ((row: Row) => ReactNode)?]
function DataTable({ columns, rows, empty = 'Nenhum registro encontrado.', action }: { columns: TableColumn[]; rows: Row[]; empty?: string; action?: (row: Row) => ReactNode }) {
  return <div className="table-card"><div className="table-scroll"><table><thead><tr>{columns.map(([, label]) => <th key={label}>{label}</th>)}{action && <th>AÇÕES</th>}</tr></thead><tbody>{rows.length ? rows.map(row => <tr key={row.id}>{columns.map(([key, , render]) => <td key={key}>{render ? render(row) : String(row[key] ?? '—')}</td>)}{action && <td>{action(row)}</td>}</tr>) : <tr><td colSpan={columns.length + (action ? 1 : 0)}>{empty}</td></tr>}</tbody></table></div></div>
}

function Login({ setSession }: { setSession: (session: Session) => void }) {
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('gomove2026')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true); setError('')
    try {
      const session = await new ApiClient(null).post<Session>('/auth/login', { username, password })
      saveSession(session); setSession(session)
      go(session.user.role === 'ADMIN_MASTER' ? '/admin' : '/dashboard')
    } catch (reason: any) { setError(reason.message) } finally { setLoading(false) }
  }
  return <main className="login-shell"><div className="login-visual"><img src="/brand/gomove-hero.jpeg" alt="Mobilidade inteligente GoMove" /></div><section className="login-panel"><div className="login-form-wrap"><img className="login-logo" src="/brand/gomove-logo-oficial.png" alt="GoMove" /><span className="eyebrow">ACESSO RESTRITO</span><h1>Bem-vindo <em>de volta.</em></h1><p>Entre no ambiente correspondente ao seu perfil.</p><form onSubmit={submit}><label>Usuário<input autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} /></label><label>Senha<input autoComplete="current-password" type="password" value={password} onChange={event => setPassword(event.target.value)} /></label><ErrorBox error={error} /><button className="primary-btn login-btn" disabled={loading}>{loading ? 'Autenticando…' : 'Entrar na plataforma'}</button></form><div className="demo-credentials"><b>Acessos de demonstração</b><span>MASTER: admin / gomove2026</span><span>USUÁRIO: matheus / gomove2026</span></div></div></section></main>
}

function Invite() {
  const code = location.pathname.split('/').pop() || ''
  const api = useApi(null)
  const [invite, setInvite] = useState<any>()
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', username: '', password: '' })
  useEffect(() => { api.get(`/public/invites/${code}`).then(setInvite).catch(reason => setError(reason.message)) }, [code])
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    try { await api.post('/public/register', { ...form, inviteCode: code }); setDone(true) } catch (reason: any) { setError(reason.message) }
  }
  return <main className="login-shell invite-shell"><section className="login-panel compact-login"><div className="login-form-wrap"><img className="login-logo" src="/brand/gomove-logo-oficial.png" alt="GoMove" /><span className="eyebrow">CONVITE GOMOVE</span>{done ? <><h1>Cadastro recebido.</h1><p>Sua conta aguarda ativação pelo administrador MASTER.</p><button className="primary-btn" onClick={() => go('/')}>Ir para o login</button></> : <><h1>Entre para a rede.</h1><p>{invite ? `Indicado por ${invite.sponsor.name}.` : 'Verificando convite…'}</p><form onSubmit={submit}><label>Nome<input required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label><label>E-mail<input required type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></label><label>Usuário<input required value={form.username} onChange={event => setForm({ ...form, username: event.target.value })} /></label><label>Senha<input required minLength={6} type="password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} /></label><ErrorBox error={error} /><button className="primary-btn" disabled={!invite}>Criar conta</button></form></>}</div></section></main>
}

const userLinks = [
  ['/dashboard', 'Visão geral', LayoutDashboard], ['/fleet', 'Minha mobilidade', Car], ['/investments', 'Investimentos', BarChart3],
  ['/store', 'Loja e pedidos', ShoppingBag], ['/finance', 'Financeiro', Wallet], ['/network', 'Minha rede', Network],
  ['/support', 'Atendimento', Headphones], ['/profile', 'Meu perfil', UserRound],
] as const
const adminLinks = [
  ['/admin', 'Dashboard MASTER', LayoutDashboard], ['/admin/associates', 'Usuários', UsersRound], ['/admin/fleet', 'Frota', Car],
  ['/admin/investments', 'Investimentos', BarChart3], ['/admin/orders', 'Pedidos', Package], ['/admin/finance', 'Financeiro', Wallet],
  ['/admin/network', 'Rede completa', GitBranch], ['/admin/commissions', 'Comissões', CircleDollarSign], ['/admin/support', 'Suporte', TicketCheck],
  ['/admin/audit', 'Auditoria', ShieldCheck], ['/admin/settings', 'Configurações', Settings],
] as const

function Shell({ session, logout }: { session: Session; logout: () => void }) {
  const path = usePath()
  const [mobileOpen, setMobileOpen] = useState(false)
  const isAdmin = session.user.role === 'ADMIN_MASTER'
  const links = isAdmin ? adminLinks : userLinks
  return <div className="app-shell">{mobileOpen && <button className="mobile-overlay" aria-label="Fechar menu" onClick={() => setMobileOpen(false)} />}<aside className={`sidebar ${mobileOpen ? 'is-mobile-open' : ''}`}><div className="sidebar-top"><img src="/brand/gomove-logo-oficial.png" alt="GoMove" /></div><nav><div className="nav-group"><span className="nav-label">{isAdmin ? 'ADMINISTRAÇÃO MASTER' : 'MINHA CONTA'}</span>{links.map(([to, label, Icon]) => <NavLink key={to} to={to} icon={Icon} current={path} onNavigate={() => setMobileOpen(false)}>{label}</NavLink>)}</div></nav><div className="sidebar-profile"><span className="avatar">{initials(session.user.name)}</span><span><b>{session.user.name}</b><small>{isAdmin ? 'Administrador MASTER' : 'Usuário GoMove'}</small></span></div></aside><div className="app-main"><header className="topbar"><button className="icon-btn mobile-menu" aria-label="Abrir menu" onClick={() => setMobileOpen(true)}><Menu /></button><span className="environment-pill"><span /> Sistema operacional</span><div className="topbar-spacer" /><div className="user-chip"><span className="avatar">{initials(session.user.name)}</span><span><b>{session.user.name}</b><small>{isAdmin ? 'MASTER' : 'USUÁRIO'}</small></span></div><button className="icon-btn" aria-label="Sair" onClick={logout}><LogOut /></button></header><main className="page-content"><Router session={session} path={path} /></main></div></div>
}

function Router({ session, path }: { session: Session; path: string }) {
  const admin = session.user.role === 'ADMIN_MASTER'
  if (admin) {
    if (!path.startsWith('/admin')) { go('/admin'); return <Loader /> }
    if (path === '/admin') return <AdminDashboard session={session} />
    if (path === '/admin/associates') return <Associates session={session} />
    if (path === '/admin/fleet') return <AdminCollection session={session} type="vehicles" />
    if (path === '/admin/investments') return <AdminCollection session={session} type="investments" />
    if (path === '/admin/orders') return <AdminCollection session={session} type="orders" />
    if (path === '/admin/finance') return <AdminFinance session={session} />
    if (path === '/admin/network') return <AdminNetwork session={session} />
    if (path === '/admin/commissions') return <Commissions session={session} />
    if (path === '/admin/support') return <AdminCollection session={session} type="tickets" />
    if (path === '/admin/audit') return <Audit session={session} />
    if (path === '/admin/settings') return <AdminSettings />
    return <AdminDashboard session={session} />
  }
  if (path.startsWith('/admin')) { go('/dashboard'); return <Loader /> }
  if (path === '/dashboard' || path === '/') return <UserDashboard session={session} />
  if (path === '/fleet') return <UserFleet session={session} />
  if (path === '/investments' || path === '/my-investments') return <UserInvestments session={session} />
  if (path === '/store' || path === '/orders') return <Store session={session} />
  if (['/finance', '/invoices', '/statement', '/withdraw', '/withdrawals', '/pay'].includes(path)) return <UserFinance session={session} />
  if (['/network', '/referrals', '/unilevel', '/genealogy', '/bonuses'].includes(path)) return <NetworkPage session={session} />
  if (path === '/support' || path === '/tickets') return <Support session={session} />
  if (path === '/profile') return <Profile session={session} />
  return <UserDashboard session={session} />
}

function UserDashboard({ session }: { session: Session }) {
  const { data, error } = usePortalState(session)
  if (!data && !error) return <Loader />
  const state = data || emptyState
  const invested = state.investments.reduce((sum, item) => sum + Number(item.amount || 0), 0)
  const earnings = state.investments.reduce((sum, item) => sum + Number(item.profit || 0), 0)
  const balance = state.transactions.reduce((sum, item) => sum + Number(item.amount || 0), 0)
  return <Page title={`Olá, ${session.user.name.split(' ')[0]}.`} subtitle="Aqui está o resumo da sua jornada GoMove."><ErrorBox error={error} /><section className="metric-grid"><Metric label="SALDO DISPONÍVEL" value={brl(balance)} icon={Wallet} note="Atualizado agora" /><Metric label="TOTAL INVESTIDO" value={brl(invested)} icon={BarChart3} note={`${state.investments.length} contratos`} /><Metric label="RENDIMENTOS" value={brl(earnings)} icon={CircleDollarSign} note="Acumulado" /><Metric label="VEÍCULOS VINCULADOS" value={String(state.vehicles.filter(item => item.driver === session.user.name).length)} icon={Car} note="Mobilidade ativa" /></section><section className="dashboard-split"><div className="panel"><div className="panel-title"><h2>Movimentações recentes</h2><button className="text-btn" onClick={() => go('/finance')}>Ver financeiro</button></div>{state.transactions.slice(0, 5).map(item => <div className="activity-row" key={item.id}><i className={item.amount >= 0 ? 'positive' : 'negative'}><WalletCards /></i><span><b>{item.description}</b><small>{item.date}</small></span><strong className={item.amount >= 0 ? 'positive-text' : ''}>{brl(item.amount)}</strong></div>)}</div><div className="panel quick-panel"><h2>Acesso rápido</h2><button onClick={() => go('/investments')}><BarChart3 /><span><b>Novo investimento</b><small>Conheça os planos disponíveis</small></span></button><button onClick={() => go('/store')}><ShoppingBag /><span><b>Loja GoMove</b><small>Equipamentos e acessórios</small></span></button><button onClick={() => go('/support')}><Headphones /><span><b>Solicitar suporte</b><small>Atendimento especializado</small></span></button></div></section></Page>
}

function UserFleet({ session }: { session: Session }) {
  const { data, error } = usePortalState(session)
  const vehicles = data?.vehicles.filter(item => item.driver === session.user.name) || []
  return <Page title="Minha mobilidade" subtitle="Acompanhe veículos, bateria e disponibilidade em tempo real."><ErrorBox error={error} />{data ? <div className="vehicle-grid">{vehicles.length ? vehicles.map(vehicle => <article className="vehicle-card" key={vehicle.id}><div className="vehicle-icon"><Car /></div><div><span>{vehicle.category}</span><h2>{vehicle.model}</h2><p>{vehicle.plate} · {vehicle.location}</p></div><div className="vehicle-stats"><span>Bateria <b>{vehicle.battery}%</b></span>{status(vehicle.status)}</div></article>) : <div className="empty-panel"><Car /><h2>Nenhum veículo vinculado</h2><p>Fale com a operação GoMove para ativar sua mobilidade.</p></div>}</div> : <Loader />}</Page>
}

const plans = [
  { name: 'Mobilidade Start', amount: 2500, returnRate: '1,2% a.m.', icon: Car },
  { name: 'Frota Essencial', amount: 5000, returnRate: '1,45% a.m.', icon: Package },
  { name: 'Scooter Performance', amount: 8500, returnRate: '1,7% a.m.', icon: Activity },
]
function UserInvestments({ session }: { session: Session }) {
  const { api, data, error, load } = usePortalState(session)
  const [busy, setBusy] = useState('')
  const invest = async (plan: typeof plans[number]) => { setBusy(plan.name); await api.post('/investments', { pack: plan.name, amount: plan.amount, amountCents: plan.amount * 100, profit: 0, days: 0, status: 'Pendente' }); await load(); setBusy('') }
  return <Page title="Investimentos" subtitle="Ativos de mobilidade com acompanhamento transparente."><ErrorBox error={error} /><div className="plan-grid">{plans.map(plan => <article className="plan-card" key={plan.name}><plan.icon /><span>PLANO GOMOVE</span><h2>{plan.name}</h2><strong>{brl(plan.amount)}</strong><p>Retorno projetado: {plan.returnRate}</p><button className="primary-btn" disabled={!!busy} onClick={() => void invest(plan)}>{busy === plan.name ? 'Solicitando…' : 'Solicitar investimento'}</button></article>)}</div><h2 className="section-title">Meus contratos</h2>{data ? <DataTable rows={data.investments} columns={[["id", "CONTRATO"], ["date", "DATA"], ["pack", "PLANO"], ["amount", "VALOR", row => brl(row.amount)], ["profit", "RENDIMENTO", row => brl(row.profit)], ["status", "STATUS", row => status(row.status)]]} /> : <Loader />}</Page>
}

const products = [
  { id: 'PROD-01', name: 'Capacete Urban Carbon', price: 289, category: 'Segurança' },
  { id: 'PROD-02', name: 'Carregador portátil GoMove', price: 419, category: 'Energia' },
  { id: 'PROD-03', name: 'Kit mobilidade premium', price: 149, category: 'Acessórios' },
]
function Store({ session }: { session: Session }) {
  const { api, data, error, load } = usePortalState(session)
  const [notice, setNotice] = useState('')
  const buy = async (product: typeof products[number]) => { await api.post('/orders', { description: product.name, quantity: 1, total: product.price, status: 'Processando' }); setNotice(`${product.name} adicionado aos seus pedidos.`); await load() }
  return <Page title="Loja e pedidos" subtitle="Produtos selecionados para sua experiência GoMove."><ErrorBox error={error} />{notice && <div className="success-box"><Check />{notice}</div>}<div className="product-grid">{products.map(product => <article className="product-card" key={product.id}><div className="product-art"><ShoppingBag /></div><span>{product.category}</span><h2>{product.name}</h2><strong>{brl(product.price)}</strong><button className="primary-btn" onClick={() => void buy(product)}>Comprar agora</button></article>)}</div><h2 className="section-title">Meus pedidos</h2>{data ? <DataTable rows={data.orders} columns={[["id", "PEDIDO"], ["date", "DATA"], ["description", "ITEM"], ["total", "TOTAL", row => brl(row.total)], ["status", "STATUS", row => status(row.status)]]} /> : <Loader />}</Page>
}

function UserFinance({ session }: { session: Session }) {
  const { api, data, error, load } = usePortalState(session)
  const [amount, setAmount] = useState('')
  const [notice, setNotice] = useState('')
  const withdraw = async (event: FormEvent) => { event.preventDefault(); await api.post('/withdrawals', { amount: Number(amount), method: 'PIX', account: data?.profile.pixType || 'CPF', status: 'Pendente', paidAt: '—' }); setAmount(''); setNotice('Solicitação de saque enviada para análise.'); await load() }
  if (!data && !error) return <Loader />
  const state = data || emptyState
  return <Page title="Financeiro" subtitle="Faturas, extrato e saques em um só lugar."><ErrorBox error={error} />{notice && <div className="success-box"><Check />{notice}</div>}<section className="metric-grid"><Metric label="CRÉDITOS" value={brl(state.transactions.filter(item => item.amount > 0).reduce((sum, item) => sum + item.amount, 0))} icon={CircleDollarSign} /><Metric label="FATURAS PENDENTES" value={String(state.invoices.filter(item => item.status === 'Pendente').length)} icon={FileText} /><Metric label="SAQUES" value={brl(state.withdrawals.reduce((sum, item) => sum + item.amount, 0))} icon={WalletCards} /></section><section className="dashboard-split"><div><h2 className="section-title">Faturas</h2><DataTable rows={state.invoices} columns={[["id", "FATURA"], ["due", "VENCIMENTO"], ["description", "DESCRIÇÃO"], ["remaining", "SALDO", row => brl(row.remaining)], ["status", "STATUS", row => status(row.status)]]} /></div><form className="form-panel withdrawal-form" onSubmit={withdraw}><h2>Solicitar saque</h2><label>Valor disponível para saque<input required min="50" step="0.01" type="number" value={amount} onChange={event => setAmount(event.target.value)} placeholder="R$ 0,00" /></label><p>O pedido será revisado pelo financeiro MASTER.</p><button className="primary-btn">Enviar solicitação</button></form></section><h2 className="section-title">Extrato</h2><DataTable rows={state.transactions} columns={[["date", "DATA"], ["description", "DESCRIÇÃO"], ["status", "TIPO"], ["amount", "VALOR", row => <strong className={row.amount >= 0 ? 'positive-text' : ''}>{brl(row.amount)}</strong>]]} /></Page>
}

function NetworkPage({ session }: { session: Session }) {
  const api = useApi(session)
  const [summary, setSummary] = useState<any>()
  const [directs, setDirects] = useState<User[]>([])
  const [bonuses, setBonuses] = useState<Bonus[]>([])
  const [error, setError] = useState('')
  useEffect(() => { Promise.all([api.get<any>('/network/summary'), api.get<ApiPage<User>>('/network/directs?pageSize=100'), api.get<ApiPage<Bonus>>('/bonuses/me?pageSize=100')]).then(([a, b, c]) => { setSummary(a); setDirects(b.items); setBonuses(c.items) }).catch(reason => setError(reason.message)) }, [])
  if (!summary && !error) return <Loader />
  const referral = `${location.origin}/convite/${session.user.inviteCode}`
  return <Page title="Minha rede" subtitle="Acompanhe indicações, crescimento e bônus unilevel."><ErrorBox error={error} /><section className="metric-grid"><Metric label="DIRETOS" value={String(summary?.directs || 0)} icon={UsersRound} /><Metric label="REDE TOTAL" value={String(summary?.networkSize || 0)} icon={Network} /><Metric label="REDE ATIVA" value={String(summary?.activeNetwork || 0)} icon={Check} /><Metric label="BÔNUS APROVADOS" value={cents(bonuses.filter(item => item.status === 'APPROVED').reduce((sum, item) => sum + item.amountCents, 0))} icon={WalletCards} /></section><div className="referral-banner"><div><span>SEU LINK DE INDICAÇÃO</span><strong>{referral}</strong></div><button className="primary-btn" onClick={() => void navigator.clipboard.writeText(referral)}><Copy />Copiar link</button></div><section className="dashboard-split"><div><h2 className="section-title">Meus diretos</h2><UserTable users={directs} /></div><div><h2 className="section-title">Bônus recentes</h2><BonusTable rows={bonuses} /></div></section></Page>
}

function Support({ session }: { session: Session }) {
  const { api, data, error, load } = usePortalState(session)
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const submit = async (event: FormEvent) => { event.preventDefault(); await api.post('/tickets', { department: 'Atendimento', category: 'Solicitação', subject, message, priority: 'Média', status: 'Aberto' }); setSubject(''); setMessage(''); await load() }
  return <Page title="Atendimento" subtitle="Nossa equipe acompanha cada solicitação."><ErrorBox error={error} /><form className="form-panel" onSubmit={submit}><h2>Abrir novo ticket</h2><div className="form-grid"><label>Assunto<input required value={subject} onChange={event => setSubject(event.target.value)} /></label><label>Prioridade<select><option>Baixa</option><option>Média</option><option>Alta</option></select></label></div><label>Mensagem<textarea required value={message} onChange={event => setMessage(event.target.value)} /></label><button className="primary-btn"><Plus />Enviar ticket</button></form><h2 className="section-title">Meus atendimentos</h2>{data ? <DataTable rows={data.tickets} columns={[["id", "TICKET"], ["date", "DATA"], ["subject", "ASSUNTO"], ["priority", "PRIORIDADE"], ["status", "STATUS", row => status(row.status)]]} /> : <Loader />}</Page>
}

function Profile({ session }: { session: Session }) {
  const { api, data, error, load } = usePortalState(session)
  const [form, setForm] = useState<Record<string, any>>()
  const [saved, setSaved] = useState(false)
  useEffect(() => { if (data && !form) setForm(data.profile) }, [data])
  if (!form && !error) return <Loader />
  const update = (key: string, value: any) => setForm({ ...form, [key]: value })
  const submit = async (event: FormEvent) => { event.preventDefault(); await api.put('/profile', form); await load(); setSaved(true) }
  return <Page title="Meu perfil" subtitle="Mantenha seus dados e preferências de segurança atualizados."><ErrorBox error={error} />{saved && <div className="success-box"><Check />Perfil salvo com sucesso.</div>}<form className="form-panel profile-form" onSubmit={submit}><div className="profile-identity"><span className="avatar large">{initials(form?.name || session.user.name)}</span><div><h2>{form?.name || session.user.name}</h2><p>@{session.user.username}</p></div></div><div className="form-grid"><label>Nome completo<input value={form?.name || ''} onChange={event => update('name', event.target.value)} /></label><label>E-mail<input type="email" value={form?.email || ''} onChange={event => update('email', event.target.value)} /></label><label>Telefone<input value={form?.phone || ''} onChange={event => update('phone', event.target.value)} /></label><label>País<input value={form?.country || ''} onChange={event => update('country', event.target.value)} /></label></div><div className="toggle-row"><span><b>2FA no login</b><small>Proteção adicional para acessar a conta</small></span><input type="checkbox" checked={!!form?.twoFactorLogin} onChange={event => update('twoFactorLogin', event.target.checked)} /></div><div className="toggle-row"><span><b>2FA nos saques</b><small>Confirmação extra para movimentações</small></span><input type="checkbox" checked={!!form?.twoFactorWithdraw} onChange={event => update('twoFactorWithdraw', event.target.checked)} /></div><button className="primary-btn">Salvar alterações</button></form></Page>
}

function UserTable({ users, onSelect }: { users: User[]; onSelect?: (user: User) => void }) {
  return <DataTable rows={users} columns={[["name", "ASSOCIADO"], ["username", "USUÁRIO", row => `@${row.username}`], ["email", "E-MAIL"], ["status", "STATUS", row => status(row.status)]]} action={onSelect ? row => <button className="outline-btn" onClick={() => onSelect(row as User)}>Gerenciar</button> : undefined} />
}
function BonusTable({ rows }: { rows: Bonus[] }) {
  return <DataTable rows={rows as Row[]} columns={[["type", "TIPO"], ["amountCents", "VALOR", row => cents(row.amountCents)], ["level", "NÍVEL"], ["status", "STATUS", row => status(row.status)], ["reason", "MOTIVO"]]} />
}

function AdminDashboard({ session }: { session: Session }) {
  const api = useApi(session)
  const [data, setData] = useState<any>()
  const [error, setError] = useState('')
  useEffect(() => { api.get('/admin/dashboard').then(setData).catch(reason => setError(reason.message)) }, [])
  return <Page title="Central MASTER" subtitle="Visão executiva de toda a operação GoMove."><ErrorBox error={error} />{data ? <><section className="metric-grid admin-grid"><Metric label="USUÁRIOS" value={String(data.users)} icon={UsersRound} note={`${data.active} ativos`} /><Metric label="FROTA TOTAL" value={String(data.vehicles || 0)} icon={Car} note={`${data.activeVehicles || 0} em operação`} /><Metric label="RECEITA PROCESSADA" value={brl(data.revenue || 0)} icon={CircleDollarSign} note="Faturas pagas" /><Metric label="SAQUES PENDENTES" value={String(data.pendingWithdrawals || 0)} icon={WalletCards} note="Exigem revisão" /><Metric label="TICKETS ABERTOS" value={String(data.openTickets || 0)} icon={Headphones} note="Fila de atendimento" /><Metric label="BÔNUS PENDENTES" value={cents(data.bonusPendingCents)} icon={Activity} note="Comissionamento" /></section><section className="dashboard-split"><div className="panel"><h2>Prioridades operacionais</h2><div className="admin-alert"><UsersRound /><span><b>{data.pending} cadastros pendentes</b><small>Revise documentos e ative os novos usuários.</small></span><button onClick={() => go('/admin/associates')}>Abrir</button></div><div className="admin-alert"><Wallet /><span><b>{data.pendingWithdrawals || 0} saques aguardando</b><small>Valide e processe as solicitações financeiras.</small></span><button onClick={() => go('/admin/finance')}>Abrir</button></div><div className="admin-alert"><Headphones /><span><b>{data.openTickets || 0} tickets ativos</b><small>Acompanhe os SLAs da equipe de suporte.</small></span><button onClick={() => go('/admin/support')}>Abrir</button></div></div><div className="panel operation-health"><h2>Saúde da plataforma</h2><div><span>API e autenticação</span><b>Operacional</b></div><div><span>Motor de comissões</span><b>Operacional</b></div><div><span>Persistência do demo</span><b>Operacional</b></div><div><span>Auditoria administrativa</span><b>Ativa</b></div></div></section></> : <Loader />}</Page>
}

function Associates({ session }: { session: Session }) {
  const api = useApi(session)
  const [rows, setRows] = useState<User[]>([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<User>()
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const load = () => api.get<ApiPage<User>>('/admin/associates?pageSize=100').then(value => setRows(value.items)).catch(reason => setError(reason.message))
  useEffect(() => { void load() }, [])
  const changeStatus = async (next: string) => { if (!selected || (next === 'BLOCKED' && !reason)) return; await api.patch(`/admin/associates/${selected.id}/status`, { status: next, reason: reason || 'Ativação administrativa' }); setSelected(undefined); setReason(''); await load() }
  const filtered = rows.filter(item => `${item.name} ${item.username} ${item.email} ${item.status}`.toLowerCase().includes(query.toLowerCase()))
  return <Page title="Gestão de usuários" subtitle="Cadastros, acessos, patrocinadores e status da rede."><ErrorBox error={error} /><div className="table-tools"><div className="search-box"><Search /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar usuário, e-mail ou status" /></div><span>{filtered.length} usuários encontrados</span></div><UserTable users={filtered} onSelect={setSelected} />{selected && <Modal title={`Gerenciar ${selected.name}`} close={() => setSelected(undefined)}><div className="modal-form"><div className="user-summary"><span className="avatar large">{initials(selected.name)}</span><div><h3>{selected.name}</h3><p>@{selected.username} · {selected.email}</p>{status(selected.status)}</div></div><label>Justificativa administrativa<textarea value={reason} onChange={event => setReason(event.target.value)} placeholder="Obrigatória para bloqueios" /></label><div className="modal-actions"><button className="outline-btn" onClick={() => void changeStatus('PENDING')}>Deixar pendente</button><button className="outline-btn" onClick={() => void changeStatus('BLOCKED')}>Bloquear</button><button className="primary-btn" onClick={() => void changeStatus('ACTIVE')}>Ativar usuário</button></div></div></Modal>}</Page>
}

const collectionConfig: Record<string, { title: string; subtitle: string; columns: TableColumn[]; statuses: string[] }> = {
  vehicles: { title: 'Gestão de frota', subtitle: 'Disponibilidade, localização e manutenção dos ativos.', columns: [["plate", "PLACA"], ["model", "MODELO"], ["category", "CATEGORIA"], ["driver", "MOTORISTA"], ["battery", "BATERIA", row => `${row.battery}%`], ["status", "STATUS", row => status(row.status)]], statuses: ['Em operação', 'Disponível', 'Manutenção', 'Indisponível'] },
  investments: { title: 'Gestão de investimentos', subtitle: 'Contratos, aportes e aprovação operacional.', columns: [["id", "CONTRATO"], ["pack", "PLANO"], ["amount", "VALOR", row => brl(row.amount)], ["date", "DATA"], ["status", "STATUS", row => status(row.status)]], statuses: ['Pendente', 'Ativo', 'Encerrado', 'Cancelado'] },
  orders: { title: 'Gestão de pedidos', subtitle: 'Separação, entrega e histórico comercial.', columns: [["id", "PEDIDO"], ["description", "ITEM"], ["quantity", "QTD."], ["total", "TOTAL", row => brl(row.total)], ["status", "STATUS", row => status(row.status)]], statuses: ['Processando', 'Separação', 'Em trânsito', 'Entregue', 'Cancelado'] },
  tickets: { title: 'Central de suporte', subtitle: 'Fila completa de atendimento e resolução.', columns: [["id", "TICKET"], ["subject", "ASSUNTO"], ["department", "ÁREA"], ["priority", "PRIORIDADE"], ["status", "STATUS", row => status(row.status)]], statuses: ['Aberto', 'Em análise', 'Aguardando usuário', 'Resolvido'] },
}
function AdminCollection({ session, type }: { session: Session; type: 'vehicles' | 'investments' | 'orders' | 'tickets' }) {
  const api = useApi(session)
  const config = collectionConfig[type]
  const [rows, setRows] = useState<Row[]>([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const load = () => api.get<ApiPage<Row>>(`/admin/${type}?pageSize=100`).then(value => setRows(value.items)).catch(reason => setError(reason.message))
  useEffect(() => { void load() }, [type])
  const update = async (row: Row, value: string) => { await api.patch(`/admin/${type}/${row.id}`, { status: value }); await load() }
  const filtered = rows.filter(row => JSON.stringify(row).toLowerCase().includes(query.toLowerCase()))
  return <Page title={config.title} subtitle={config.subtitle}><ErrorBox error={error} /><div className="table-tools"><div className="search-box"><Search /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar nesta área" /></div><span>{filtered.length} registros</span></div><DataTable rows={filtered} columns={config.columns} action={row => <select className="table-select" value={row.status} onChange={event => void update(row, event.target.value)}>{config.statuses.map(value => <option key={value}>{value}</option>)}</select>} /></Page>
}

function AdminFinance({ session }: { session: Session }) {
  const api = useApi(session)
  const [invoices, setInvoices] = useState<Row[]>([])
  const [withdrawals, setWithdrawals] = useState<Row[]>([])
  const load = () => Promise.all([api.get<ApiPage<Row>>('/admin/invoices'), api.get<ApiPage<Row>>('/admin/withdrawals')]).then(([a, b]) => { setInvoices(a.items); setWithdrawals(b.items) })
  useEffect(() => { void load() }, [])
  const update = async (collection: string, row: Row, statusValue: string) => { await api.patch(`/admin/${collection}/${row.id}`, { status: statusValue, paidAt: statusValue === 'Pago' ? new Date().toLocaleDateString('pt-BR') : row.paidAt }); await load() }
  return <Page title="Operação financeira" subtitle="Controle de recebíveis e solicitações de saque."><section className="metric-grid"><Metric label="FATURAS PENDENTES" value={String(invoices.filter(item => item.status === 'Pendente').length)} icon={FileText} /><Metric label="RECEBIDO" value={brl(invoices.filter(item => item.status === 'Pago').reduce((sum, item) => sum + item.amount, 0))} icon={CircleDollarSign} /><Metric label="SAQUES PENDENTES" value={String(withdrawals.filter(item => item.status === 'Pendente').length)} icon={WalletCards} /></section><h2 className="section-title">Faturas</h2><DataTable rows={invoices} columns={[["id", "FATURA"], ["description", "DESCRIÇÃO"], ["due", "VENCIMENTO"], ["amount", "VALOR", row => brl(row.amount)], ["status", "STATUS", row => status(row.status)]]} action={row => <select className="table-select" value={row.status} onChange={event => void update('invoices', row, event.target.value)}><option>Pendente</option><option>Pago</option><option>Vencido</option><option>Cancelado</option></select>} /><h2 className="section-title">Saques</h2><DataTable rows={withdrawals} columns={[["id", "SAQUE"], ["date", "DATA"], ["method", "MÉTODO"], ["amount", "VALOR", row => brl(row.amount)], ["status", "STATUS", row => status(row.status)]]} action={row => <select className="table-select" value={row.status} onChange={event => void update('withdrawals', row, event.target.value)}><option>Pendente</option><option>Em análise</option><option>Pago</option><option>Recusado</option></select>} /></Page>
}

function AdminNetwork({ session }: { session: Session }) {
  const api = useApi(session)
  const [treeData, setTreeData] = useState<TreeUser>()
  const [users, setUsers] = useState<User[]>([])
  const [root, setRoot] = useState('')
  const [depth, setDepth] = useState(5)
  useEffect(() => { api.get<ApiPage<User>>('/admin/associates?pageSize=100').then(value => setUsers(value.items)) }, [])
  useEffect(() => { api.get<TreeUser>(`/admin/network/tree?depth=${depth}${root ? `&rootUserId=${root}` : ''}`).then(setTreeData) }, [root, depth])
  const flatten = (node: TreeUser, level = 0): Array<TreeUser & { level: number }> => [{ ...node, level }, ...node.children.flatMap(child => flatten(child, level + 1))]
  return <Page title="Rede completa" subtitle="Explore a genealogia de qualquer usuário, com profundidade controlada."><div className="table-tools"><select value={root} onChange={event => setRoot(event.target.value)}><option value="">Raiz global MASTER</option>{users.map(user => <option value={user.id} key={user.id}>{user.name}</option>)}</select><select value={depth} onChange={event => setDepth(Number(event.target.value))}>{[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(value => <option value={value} key={value}>{value} níveis</option>)}</select></div>{treeData ? <div className="tree-panel">{flatten(treeData).map(user => <div className="person-node" style={{ marginLeft: `${user.level * 28}px` }} key={user.id}><span>{initials(user.name)}</span><div><b>{user.name}</b><small>@{user.username} · nível {user.level}</small></div>{status(user.status)}</div>)}</div> : <Loader />}</Page>
}

function Commissions({ session }: { session: Session }) {
  const api = useApi(session)
  const [rules, setRules] = useState<CommissionRule[]>([])
  const [bonuses, setBonuses] = useState<Bonus[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [form, setForm] = useState({ userId: '', amount: '', reason: '' })
  const load = () => Promise.all([api.get<ApiPage<CommissionRule>>('/admin/commission-rules'), api.get<ApiPage<Bonus>>('/admin/bonus-entries'), api.get<ApiPage<User>>('/admin/associates')]).then(([a, b, c]) => { setRules(a.items); setBonuses(b.items); setUsers(c.items) })
  useEffect(() => { void load() }, [])
  const manual = async (event: FormEvent) => { event.preventDefault(); await api.post('/admin/bonus-entries/manual-credit', { userId: form.userId, amountCents: Math.round(Number(form.amount) * 100), reason: form.reason }); setForm({ userId: '', amount: '', reason: '' }); await load() }
  const transition = async (entry: Bonus, action: string) => { await api.post(`/admin/bonus-entries/${entry.id}/${action}`, action === 'reverse' ? { reason: 'Estorno administrativo' } : {}); await load() }
  return <Page title="Comissões e bônus" subtitle="Regras unilevel, aprovações e lançamentos manuais auditáveis."><div className="panel rules-panel"><h2>Regra ativa</h2>{rules.map(rule => <div className="rule-row" key={rule.id}><span><b>{rule.name}</b><small>{rule.levels.map(level => `N${level.level}: ${level.bps / 100}%`).join(' · ')}</small></span>{status(rule.active ? 'ACTIVE' : 'INACTIVE')}</div>)}</div><form className="form-panel" onSubmit={manual}><h2>Novo crédito manual</h2><div className="form-grid"><select required value={form.userId} onChange={event => setForm({ ...form, userId: event.target.value })}><option value="">Selecione o usuário</option>{users.map(user => <option value={user.id} key={user.id}>{user.name}</option>)}</select><input required min="0.01" step="0.01" type="number" placeholder="Valor em R$" value={form.amount} onChange={event => setForm({ ...form, amount: event.target.value })} /><input required placeholder="Justificativa" value={form.reason} onChange={event => setForm({ ...form, reason: event.target.value })} /></div><button className="primary-btn">Criar crédito pendente</button></form><h2 className="section-title">Lançamentos</h2><DataTable rows={bonuses as Row[]} columns={[["type", "TIPO"], ["amountCents", "VALOR", row => cents(row.amountCents)], ["reason", "MOTIVO"], ["status", "STATUS", row => status(row.status)]]} action={row => row.status === 'PENDING' ? <div className="inline-actions"><button onClick={() => void transition(row as Bonus, 'approve')}>Aprovar</button><button onClick={() => void transition(row as Bonus, 'cancel')}>Cancelar</button></div> : row.status === 'APPROVED' && row.type !== 'REVERSAL' ? <button className="outline-btn" onClick={() => void transition(row as Bonus, 'reverse')}>Estornar</button> : <span>—</span>} /></Page>
}

function Audit({ session }: { session: Session }) {
  const api = useApi(session)
  const [rows, setRows] = useState<Row[]>([])
  useEffect(() => { api.get<ApiPage<Row>>('/admin/audit-logs?pageSize=100').then(value => setRows(value.items)) }, [])
  return <Page title="Auditoria administrativa" subtitle="Trilha imutável das decisões sensíveis do MASTER."><DataTable rows={rows} columns={[["createdAt", "DATA", row => new Date(row.createdAt).toLocaleString('pt-BR')], ["action", "AÇÃO"], ["targetType", "TIPO"], ["targetId", "ALVO"], ["details", "DETALHES", row => JSON.stringify(row.details)]]} /></Page>
}

function AdminSettings() {
  const [confirming, setConfirming] = useState(false)
  const [notice, setNotice] = useState('')
  const reset = () => { resetDemoDatabase(); setConfirming(false); setNotice('Dados de demonstração restaurados. Recarregue para visualizar a base inicial.') }
  return <Page title="Configurações MASTER" subtitle="Parâmetros globais, segurança e manutenção do ambiente.">{notice && <div className="success-box"><Check />{notice}</div>}<section className="settings-grid"><div className="panel"><h2>Segurança</h2><div className="toggle-row"><span><b>Exigir 2FA dos administradores</b><small>Protege operações sensíveis</small></span><input type="checkbox" defaultChecked /></div><div className="toggle-row"><span><b>Auditar mudanças financeiras</b><small>Registra autor, data e justificativa</small></span><input type="checkbox" defaultChecked disabled /></div></div><div className="panel"><h2>Ambiente de demonstração</h2><p>As mudanças feitas no deploy ficam salvas neste navegador, permitindo demonstrar todos os fluxos sem infraestrutura externa.</p><button className="outline-btn danger-btn" onClick={() => setConfirming(true)}><RotateCcw />Restaurar dados iniciais</button></div></section>{confirming && <Modal title="Restaurar demonstração?" close={() => setConfirming(false)}><div className="modal-form"><p>Cadastros, status e solicitações criados neste navegador serão removidos.</p><div className="modal-actions"><button className="outline-btn" onClick={() => setConfirming(false)}>Cancelar</button><button className="primary-btn" onClick={reset}>Restaurar</button></div></div></Modal>}</Page>
}

function Root() {
  const [session, setSession] = useState<Session | null>(loadSession())
  const [validating, setValidating] = useState(!!loadSession())
  useEffect(() => {
    if (!session) { setValidating(false); return }
    new ApiClient(session.token, () => setSession(null)).get<{ user: User }>('/auth/me').then(({ user }) => { const next = { ...session, user }; saveSession(next); setSession(next) }).catch(() => { clearSession(); setSession(null) }).finally(() => setValidating(false))
  }, [])
  const logout = () => { clearSession(); setSession(null); go('/') }
  if (location.pathname.startsWith('/convite/')) return <Invite />
  if (validating) return <Loader />
  return session ? <Shell session={session} logout={logout} /> : <Login setSession={setSession} />
}

export default function App() { return <Root /> }
