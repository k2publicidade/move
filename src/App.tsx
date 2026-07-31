import { FormEvent, ReactNode, useEffect, useMemo, useState } from 'react'
import {
  Activity, AlertCircle, BarChart3, Bitcoin, Car, Check, CircleDollarSign, Copy, FileText, GitBranch,
  Headphones, LayoutDashboard, LogOut, Menu, Network, Package, Pencil, Plus, RotateCcw, Search,
  QrCode, Settings, ShieldCheck, ShoppingBag, TicketCheck, UserRound, UsersRound, Wallet,
  Trash2, WalletCards, Wrench, X,
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
const statusLabels: Record<string, string> = {
  ACTIVE: 'Ativo', INACTIVE: 'Inativo', PENDING: 'Pendente', BLOCKED: 'Bloqueado',
  APPROVED: 'Aprovado', CANCELLED: 'Cancelado', REVERSAL: 'Estorno',
}
const status = (value: string) => {
  const label = statusLabels[value] || value
  return <span className={`status status-${String(label).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replaceAll(' ', '-')}`}>{label}</span>
}
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
  const active = current === to || (!['/dashboard', '/admin'].includes(to) && current.startsWith(`${to}/`))
  return <a href={to} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined} onClick={event => { event.preventDefault(); go(to); onNavigate?.() }}><Icon aria-hidden="true" /><span>{children}</span></a>
}

function Loader() { return <div className="loading-screen" role="status" aria-live="polite"><div className="loader-mark" aria-hidden="true">G</div><p>Carregando a operação…</p></div> }
function ErrorBox({ error }: { error: string }) { return error ? <div className="form-error" role="alert"><AlertCircle aria-hidden="true" />{error}</div> : null }
function Page({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
  return <><header className="page-heading"><div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{action}</header>{children}</>
}
function Metric({ label, value, icon: Icon, note }: { label: string; value: string; icon: any; note?: string }) {
  return <article className="metric-card tone-lime"><div className="metric-top"><span>{label}</span><i><Icon /></i></div><strong>{value}</strong>{note && <small>{note}</small>}</article>
}
function Modal({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    addEventListener('keydown', onKeyDown)
    return () => removeEventListener('keydown', onKeyDown)
  }, [close])
  return <div className="modal-backdrop" onClick={close}><section className="modal" role="dialog" aria-modal="true" aria-label={title} onClick={event => event.stopPropagation()}><div className="modal-head"><h2>{title}</h2><button type="button" className="icon-btn" aria-label="Fechar janela" onClick={close}><X aria-hidden="true" /></button></div>{children}</section></div>
}
type TableColumn = [string, string, ((row: Row) => ReactNode)?]
function DataTable({ columns, rows, empty = 'Nenhum registro encontrado.', action }: { columns: TableColumn[]; rows: Row[]; empty?: string; action?: (row: Row) => ReactNode }) {
  return <div className="table-card"><div className="table-scroll"><table><thead><tr>{columns.map(([, label]) => <th scope="col" key={label}>{label}</th>)}{action && <th scope="col">AÇÕES</th>}</tr></thead><tbody>{rows.length ? rows.map(row => <tr key={row.id}>{columns.map(([key, label, render]) => <td data-label={label} key={key}>{render ? render(row) : String(row[key] ?? '—')}</td>)}{action && <td data-label="AÇÕES" className="table-actions">{action(row)}</td>}</tr>) : <tr className="empty-table-row"><td colSpan={columns.length + (action ? 1 : 0)}><span>{empty}</span><small>Os novos registros aparecerão aqui.</small></td></tr>}</tbody></table></div></div>
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
  return <main className="login-shell"><div className="login-visual"><img src="/brand/gomove-hero.jpeg" alt="Mobilidade inteligente GoMove" /></div><section className="login-panel"><div className="login-form-wrap"><img className="login-logo" src="/brand/gomove-logo-oficial.png" alt="GoMove" /><h1>Bem-vindo <em>de volta.</em></h1><p>Entre no ambiente correspondente ao seu perfil.</p><form onSubmit={submit} aria-busy={loading}><label>Usuário<input autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} /></label><label>Senha<input autoComplete="current-password" type="password" value={password} onChange={event => setPassword(event.target.value)} /></label><ErrorBox error={error} /><button className="primary-btn login-btn" disabled={loading}>{loading ? 'Autenticando…' : 'Entrar na plataforma'}</button></form><div className="demo-credentials"><b>Acessos de demonstração</b><span>MASTER: admin / gomove2026</span><span>USUÁRIO: matheus / gomove2026</span></div></div></section></main>
}

function Invite() {
  const code = location.pathname.split('/').pop() || ''
  const api = useApi(null)
  const [invite, setInvite] = useState<any>()
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', username: '', password: '' })
  useEffect(() => { api.get(`/public/invites/${code}`).then(setInvite).catch(reason => setError(reason.message)) }, [code])
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true); setError('')
    try { await api.post('/public/register', { ...form, inviteCode: code }); setDone(true) } catch (reason: any) { setError(reason.message) } finally { setBusy(false) }
  }
  return <main className="login-shell invite-shell"><section className="login-panel compact-login"><div className="login-form-wrap"><img className="login-logo" src="/brand/gomove-logo-oficial.png" alt="GoMove" />{done ? <><h1>Cadastro recebido.</h1><p>Sua conta aguarda ativação pelo administrador MASTER.</p><button type="button" className="primary-btn" onClick={() => go('/')}>Ir para o login</button></> : <><h1>Entre para a rede.</h1><p>{invite ? `Indicado por ${invite.sponsor.name}.` : 'Verificando convite…'}</p><form onSubmit={submit} aria-busy={busy}><label>Nome<input required autoComplete="name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label><label>E-mail<input required autoComplete="email" type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></label><label>Usuário<input required autoComplete="username" value={form.username} onChange={event => setForm({ ...form, username: event.target.value })} /></label><label>Senha<input required autoComplete="new-password" minLength={6} type="password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} /></label><ErrorBox error={error} /><button className="primary-btn" disabled={!invite || busy}>{busy ? 'Criando conta…' : 'Criar conta'}</button></form></>}</div></section></main>
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
  return <div className="app-shell">{mobileOpen && <button type="button" className="mobile-overlay" aria-label="Fechar menu" onClick={() => setMobileOpen(false)} />}<aside className={`sidebar ${mobileOpen ? 'is-mobile-open' : ''}`} aria-label={isAdmin ? 'Navegação MASTER' : 'Navegação do usuário'}><div className="sidebar-top"><img src="/brand/gomove-logo-oficial.png" alt="GoMove" /></div><nav aria-label="Menu principal"><div className="nav-group"><span className="nav-label">{isAdmin ? 'ADMINISTRAÇÃO MASTER' : 'MINHA CONTA'}</span>{links.map(([to, label, Icon]) => <NavLink key={to} to={to} icon={Icon} current={path} onNavigate={() => setMobileOpen(false)}>{label}</NavLink>)}</div></nav><div className="sidebar-profile"><span className="avatar">{initials(session.user.name)}</span><span><b>{session.user.name}</b><small>{isAdmin ? 'Administrador MASTER' : 'Usuário GoMove'}</small></span></div></aside><div className="app-main"><header className="topbar"><button type="button" className="icon-btn mobile-menu" aria-label="Abrir menu" onClick={() => setMobileOpen(true)}><Menu aria-hidden="true" /></button><span className="environment-pill"><span /> Sistema operacional</span><div className="topbar-spacer" /><div className="user-chip"><span className="avatar">{initials(session.user.name)}</span><span><b>{session.user.name}</b><small>{isAdmin ? 'MASTER' : 'USUÁRIO'}</small></span></div><button type="button" className="icon-btn" aria-label="Sair" onClick={logout}><LogOut aria-hidden="true" /></button></header><main className="page-content" id="conteudo-principal"><Router session={session} path={path} /></main></div></div>
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
  return <Page title={`Olá, ${session.user.name.split(' ')[0]}.`} subtitle="Aqui está o resumo da sua jornada GoMove."><ErrorBox error={error} /><section className="metric-grid"><Metric label="SALDO DISPONÍVEL" value={brl(balance)} icon={Wallet} note="Atualizado agora" /><Metric label="TOTAL INVESTIDO" value={brl(invested)} icon={BarChart3} note={`${state.investments.length} contratos`} /><Metric label="RENDIMENTOS" value={brl(earnings)} icon={CircleDollarSign} note="Acumulado" /><Metric label="VEÍCULOS VINCULADOS" value={String(state.vehicles.filter(item => item.userId === session.user.id || item.driver === session.user.name).length)} icon={Car} note="Mobilidade ativa" /></section><section className="dashboard-split"><div className="panel"><div className="panel-title"><h2>Movimentações recentes</h2><button className="text-btn" onClick={() => go('/finance')}>Ver financeiro</button></div>{state.transactions.slice(0, 5).map(item => <div className="activity-row" key={item.id}><i className={item.amount >= 0 ? 'positive' : 'negative'}><WalletCards /></i><span><b>{item.description}</b><small>{item.date}</small></span><strong className={item.amount >= 0 ? 'positive-text' : ''}>{brl(item.amount)}</strong></div>)}</div><div className="panel quick-panel"><h2>Acesso rápido</h2><button onClick={() => go('/investments')}><BarChart3 /><span><b>Novo investimento</b><small>Conheça os planos disponíveis</small></span></button><button onClick={() => go('/store')}><ShoppingBag /><span><b>Loja GoMove</b><small>Equipamentos e acessórios</small></span></button><button onClick={() => go('/support')}><Headphones /><span><b>Solicitar suporte</b><small>Atendimento especializado</small></span></button></div></section></Page>
}

function UserFleet({ session }: { session: Session }) {
  const { data, error } = usePortalState(session)
  const vehicles = data?.vehicles.filter(item => item.userId === session.user.id || item.driver === session.user.name) || []
  return <Page title="Minha mobilidade" subtitle="Acompanhe veículos, bateria e disponibilidade em tempo real."><ErrorBox error={error} />{data ? <div className="vehicle-grid">{vehicles.length ? vehicles.map(vehicle => <article className="vehicle-card" key={vehicle.id}><div className="vehicle-icon"><Car /></div><div><span>{vehicle.category}</span><h2>{vehicle.model}</h2><p>{vehicle.plate} · {vehicle.location}</p></div><div className="vehicle-stats"><span>Bateria <b>{vehicle.battery}%</b></span>{status(vehicle.status)}</div></article>) : <div className="empty-panel"><Car /><h2>Nenhum veículo vinculado</h2><p>Fale com a operação GoMove para ativar sua mobilidade.</p></div>}</div> : <Loader />}</Page>
}

const plans = [
  { name: 'Mobilidade Start', amount: 2500, returnRate: '1,2% a.m.', icon: Car },
  { name: 'Frota Essencial', amount: 5000, returnRate: '1,45% a.m.', icon: Package },
  { name: 'Scooter Performance', amount: 8500, returnRate: '1,7% a.m.', icon: Activity },
]
const investmentPaymentMethods = [
  { id: 'PIX', label: 'PIX', description: 'Pagamento instantâneo em reais', icon: QrCode },
  { id: 'BTC', label: 'BTC', description: 'Bitcoin', icon: Bitcoin },
  { id: 'USDT', label: 'USDT', description: 'Tether USD', icon: WalletCards },
  { id: 'USTD', label: 'USTD', description: 'Pagamento em USTD', icon: WalletCards },
] as const
type InvestmentPaymentMethod = typeof investmentPaymentMethods[number]['id']
function UserInvestments({ session }: { session: Session }) {
  const { api, data, error, load } = usePortalState(session)
  const [busy, setBusy] = useState('')
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  const [checkoutPlan, setCheckoutPlan] = useState<typeof plans[number] | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<InvestmentPaymentMethod>('PIX')
  const [checkoutKey, setCheckoutKey] = useState('')
  const openCheckout = (plan: typeof plans[number]) => {
    setCheckoutPlan(plan); setPaymentMethod('PIX'); setCheckoutKey(crypto.randomUUID()); setActionError(''); setNotice('')
  }
  const invest = async (event: FormEvent) => {
    event.preventDefault()
    if (!checkoutPlan) return
    const plan = checkoutPlan
    setBusy(plan.name); setActionError(''); setNotice('')
    try {
      const investment = await api.post<Row>('/investments', { pack: plan.name, amount: plan.amount, paymentMethod, idempotencyKey: checkoutKey })
      await load(); setCheckoutPlan(null)
      setNotice(`Pagamento via ${paymentMethod} iniciado. Referência: ${investment.paymentReference}. O investimento será ativado após a confirmação.`)
    }
    catch (reason: any) { setActionError(reason.message) } finally { setBusy('') }
  }
  return <Page title="Investimentos" subtitle="Escolha um plano e faça o pagamento no ato do investimento."><ErrorBox error={error || actionError} />{notice && <div className="success-box" role="status"><Check aria-hidden="true" />{notice}</div>}<div className="payment-method-strip"><span>Formas de pagamento aceitas</span>{investmentPaymentMethods.map(method => <b key={method.id}>{method.label}</b>)}</div><div className="plan-grid">{plans.map(plan => <article className="plan-card" key={plan.name}><plan.icon aria-hidden="true" /><span>PLANO GOMOVE</span><h2>{plan.name}</h2><strong>{brl(plan.amount)}</strong><p>Retorno projetado: {plan.returnRate}</p><button className="primary-btn" disabled={!!busy} onClick={() => openCheckout(plan)}>Investir e pagar</button></article>)}</div><h2 className="section-title">Meus contratos</h2>{data ? <DataTable rows={data.investments} columns={[["id", "CONTRATO"], ["date", "DATA"], ["pack", "PLANO"], ["amount", "VALOR", row => brl(row.amount)], ["paymentMethod", "PAGAMENTO", row => row.paymentMethod || '—'], ["status", "STATUS", row => status(row.status)]]} /> : <Loader />}{checkoutPlan && <Modal title="Pagamento do investimento" close={() => !busy && setCheckoutPlan(null)}><form className="modal-form investment-checkout" onSubmit={invest}><div className="checkout-summary"><span><small>Plano</small><b>{checkoutPlan.name}</b></span><strong>{brl(checkoutPlan.amount)}</strong></div><fieldset><legend>Como você deseja pagar?</legend><div className="payment-method-grid">{investmentPaymentMethods.map(method => <label className={paymentMethod === method.id ? 'selected' : ''} key={method.id}><input type="radio" name="paymentMethod" value={method.id} checked={paymentMethod === method.id} onChange={() => setPaymentMethod(method.id)} /><method.icon aria-hidden="true" /><span><b>{method.label}</b><small>{method.description}</small></span><Check className="method-check" aria-hidden="true" /></label>)}</div></fieldset><div className="payment-notice"><ShieldCheck aria-hidden="true" /><span><b>Pagamento obrigatório no ato</b><small>Ao continuar, o pagamento será iniciado. A ativação acontece somente após a confirmação da transação.</small></span></div><ErrorBox error={actionError} /><div className="modal-actions"><button type="button" className="outline-btn" disabled={!!busy} onClick={() => setCheckoutPlan(null)}>Cancelar</button><button className="primary-btn" disabled={!!busy} aria-busy={!!busy}>{busy ? 'Iniciando pagamento…' : `Pagar com ${paymentMethod}`}</button></div></form></Modal>}</Page>
}

const products = [
  { id: 'PROD-01', name: 'Capacete Urban Carbon', price: 289, category: 'Segurança' },
  { id: 'PROD-02', name: 'Carregador portátil GoMove', price: 419, category: 'Energia' },
  { id: 'PROD-03', name: 'Kit mobilidade premium', price: 149, category: 'Acessórios' },
]
function Store({ session }: { session: Session }) {
  const { api, data, error, load } = usePortalState(session)
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState('')
  const [actionError, setActionError] = useState('')
  const buy = async (product: typeof products[number]) => {
    setBusy(product.id); setNotice(''); setActionError('')
    try { await api.post('/orders', { description: product.name, quantity: 1, total: product.price, status: 'Processando' }); setNotice(`${product.name} adicionado aos seus pedidos.`); await load() }
    catch (reason: any) { setActionError(reason.message) } finally { setBusy('') }
  }
  return <Page title="Loja e pedidos" subtitle="Produtos selecionados para sua experiência GoMove.">
    <ErrorBox error={error || actionError} />
    {notice && <div className="success-box" role="status"><Check aria-hidden="true" />{notice}</div>}

    <section className="store-catalog" aria-labelledby="store-catalog-title">
      <div className="store-section-heading">
        <h2 id="store-catalog-title">Produtos disponíveis</h2>
        <span>{products.length} opções</span>
      </div>
      <div className="product-grid">
        {products.map(product => <article className="store-product-card" key={product.id}>
          <div className="store-product-art"><ShoppingBag aria-hidden="true" /></div>
          <div className="store-product-content">
            <span className="store-product-category">{product.category}</span>
            <h3>{product.name}</h3>
            <strong>{brl(product.price)}</strong>
          </div>
          <button
            className="primary-btn store-product-cta"
            disabled={!!busy}
            aria-busy={busy === product.id}
            aria-label={`Comprar ${product.name} por ${brl(product.price)}`}
            onClick={() => void buy(product)}
          >
            <ShoppingBag aria-hidden="true" />
            {busy === product.id ? 'Processando…' : 'Comprar agora'}
          </button>
        </article>)}
      </div>
    </section>

    <section className="store-orders" aria-labelledby="store-orders-title">
      <div className="store-section-heading">
        <h2 id="store-orders-title">Meus pedidos</h2>
        {data && <span>{data.orders.length} {data.orders.length === 1 ? 'pedido' : 'pedidos'}</span>}
      </div>
      {data ? <DataTable rows={data.orders} columns={[["id", "PEDIDO"], ["date", "DATA"], ["description", "ITEM"], ["total", "TOTAL", row => brl(row.total)], ["status", "STATUS", row => status(row.status)]]} /> : <Loader />}
    </section>
  </Page>
}

function UserFinance({ session }: { session: Session }) {
  const { api, data, error, load } = usePortalState(session)
  const [amount, setAmount] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const withdraw = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setNotice(''); setActionError('')
    try { await api.post('/withdrawals', { amount: Number(amount), method: 'PIX', account: data?.profile.pixType || 'CPF', status: 'Pendente', paidAt: '—' }); setAmount(''); setNotice('Solicitação de saque enviada para análise.'); await load() }
    catch (reason: any) { setActionError(reason.message) } finally { setBusy(false) }
  }
  if (!data && !error) return <Loader />
  const state = data || emptyState
  return <Page title="Financeiro" subtitle="Faturas, extrato e saques em um só lugar."><ErrorBox error={error || actionError} />{notice && <div className="success-box" role="status"><Check aria-hidden="true" />{notice}</div>}<section className="metric-grid"><Metric label="CRÉDITOS" value={brl(state.transactions.filter(item => item.amount > 0).reduce((sum, item) => sum + item.amount, 0))} icon={CircleDollarSign} /><Metric label="FATURAS PENDENTES" value={String(state.invoices.filter(item => item.status === 'Pendente').length)} icon={FileText} /><Metric label="SAQUES" value={brl(state.withdrawals.reduce((sum, item) => sum + item.amount, 0))} icon={WalletCards} /></section><section className="dashboard-split"><div><h2 className="section-title">Faturas</h2><DataTable rows={state.invoices} columns={[["id", "FATURA"], ["due", "VENCIMENTO"], ["description", "DESCRIÇÃO"], ["remaining", "SALDO", row => brl(row.remaining)], ["status", "STATUS", row => status(row.status)]]} /></div><form className="form-panel withdrawal-form" onSubmit={withdraw} aria-busy={busy}><h2>Solicitar saque</h2><label>Valor disponível para saque<input required min="50" step="0.01" type="number" inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} placeholder="R$ 0,00" /></label><p>O pedido será revisado pelo financeiro MASTER.</p><button className="primary-btn" disabled={busy}>{busy ? 'Enviando…' : 'Enviar solicitação'}</button></form></section><h2 className="section-title">Extrato</h2><DataTable rows={state.transactions} columns={[["date", "DATA"], ["description", "DESCRIÇÃO"], ["status", "TIPO"], ["amount", "VALOR", row => <strong className={row.amount >= 0 ? 'positive-text' : ''}>{brl(row.amount)}</strong>]]} /></Page>
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
  const [priority, setPriority] = useState('Média')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setActionError(''); setNotice('')
    try { await api.post('/tickets', { department: 'Atendimento', category: 'Solicitação', subject, message, priority, status: 'Aberto' }); setSubject(''); setMessage(''); setPriority('Média'); setNotice('Ticket enviado. Nossa equipe já pode acompanhar sua solicitação.'); await load() }
    catch (reason: any) { setActionError(reason.message) } finally { setBusy(false) }
  }
  return <Page title="Atendimento" subtitle="Nossa equipe acompanha cada solicitação."><ErrorBox error={error || actionError} />{notice && <div className="success-box" role="status"><Check aria-hidden="true" />{notice}</div>}<form className="form-panel" onSubmit={submit} aria-busy={busy}><h2>Abrir novo ticket</h2><div className="form-grid"><label>Assunto<input required value={subject} onChange={event => setSubject(event.target.value)} /></label><label>Prioridade<select value={priority} onChange={event => setPriority(event.target.value)}><option>Baixa</option><option>Média</option><option>Alta</option></select></label></div><label>Mensagem<textarea required value={message} onChange={event => setMessage(event.target.value)} /></label><button className="primary-btn" disabled={busy}><Plus aria-hidden="true" />{busy ? 'Enviando…' : 'Enviar ticket'}</button></form><h2 className="section-title">Meus atendimentos</h2>{data ? <DataTable rows={data.tickets} columns={[["id", "TICKET"], ["date", "DATA"], ["subject", "ASSUNTO"], ["priority", "PRIORIDADE"], ["status", "STATUS", row => status(row.status)]]} /> : <Loader />}</Page>
}

function Profile({ session }: { session: Session }) {
  const { api, data, error, load } = usePortalState(session)
  const [form, setForm] = useState<Record<string, any>>()
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  useEffect(() => { if (data && !form) setForm(data.profile) }, [data])
  if (!form && !error) return <Loader />
  const update = (key: string, value: any) => setForm({ ...form, [key]: value })
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setSaved(false); setActionError('')
    try { await api.put('/profile', form); await load(); setSaved(true) } catch (reason: any) { setActionError(reason.message) } finally { setBusy(false) }
  }
  return <Page title="Meu perfil" subtitle="Mantenha seus dados e preferências de segurança atualizados."><ErrorBox error={error || actionError} />{saved && <div className="success-box" role="status"><Check aria-hidden="true" />Perfil salvo com sucesso.</div>}<form className="form-panel profile-form" onSubmit={submit} aria-busy={busy}><div className="profile-identity"><span className="avatar large">{initials(form?.name || session.user.name)}</span><div><h2>{form?.name || session.user.name}</h2><p>@{session.user.username}</p></div></div><div className="form-grid"><label>Nome completo<input autoComplete="name" value={form?.name || ''} onChange={event => update('name', event.target.value)} /></label><label>E-mail<input autoComplete="email" type="email" value={form?.email || ''} onChange={event => update('email', event.target.value)} /></label><label>Telefone<input autoComplete="tel" value={form?.phone || ''} onChange={event => update('phone', event.target.value)} /></label><label>País<input autoComplete="country-name" value={form?.country || ''} onChange={event => update('country', event.target.value)} /></label></div><div className="toggle-row"><span><b>2FA no login</b><small>Proteção adicional para acessar a conta</small></span><input aria-label="Ativar 2FA no login" type="checkbox" checked={!!form?.twoFactorLogin} onChange={event => update('twoFactorLogin', event.target.checked)} /></div><div className="toggle-row"><span><b>2FA nos saques</b><small>Confirmação extra para movimentações</small></span><input aria-label="Ativar 2FA nos saques" type="checkbox" checked={!!form?.twoFactorWithdraw} onChange={event => update('twoFactorWithdraw', event.target.checked)} /></div><button className="primary-btn" disabled={busy}>{busy ? 'Salvando…' : 'Salvar alterações'}</button></form></Page>
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
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<User>()
  const [form, setForm] = useState({ name: '', email: '', username: '', phone: '', password: '', sponsorId: '__MASTER__', status: 'PENDING' })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const load = () => api.get<ApiPage<User>>('/admin/associates?pageSize=100').then(value => setRows(value.items)).catch(reason => setError(reason.message))
  useEffect(() => { void load() }, [])
  const openCreate = () => { setSelected(undefined); setCreating(true); setForm({ name: '', email: '', username: '', phone: '', password: '', sponsorId: '__MASTER__', status: 'PENDING' }); setError('') }
  const openEdit = (account: User) => { setCreating(false); setSelected(account); setForm({ name: account.name, email: account.email || '', username: account.username, phone: (account as Row).phone || '', password: '', sponsorId: rows.some(item => item.id === account.sponsorId) ? account.sponsorId || '__MASTER__' : '__MASTER__', status: account.status }); setError('') }
  const closeEditor = () => { setCreating(false); setSelected(undefined) }
  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    try {
      const payload = { ...form, sponsorId: form.sponsorId === '__MASTER__' ? null : form.sponsorId }
      if (selected) await api.patch(`/admin/associates/${selected.id}`, payload)
      else await api.post('/admin/associates', payload)
      setNotice(selected ? 'Usuário atualizado e sincronizado com a conta.' : 'Usuário criado e disponível para gestão.')
      closeEditor(); await load()
    } catch (reason: any) { setError(reason.message) } finally { setBusy(false) }
  }
  const remove = async () => { if (!deleting) return; setBusy(true); setError(''); try { await api.delete(`/admin/associates/${deleting.id}`); setNotice('Usuário excluído e vínculos operacionais tratados.'); setDeleting(undefined); await load() } catch (reason: any) { setError(reason.message) } finally { setBusy(false) } }
  const filtered = rows.filter(item => `${item.name} ${item.username} ${item.email} ${item.status}`.toLowerCase().includes(query.toLowerCase()))
  const editing = creating || !!selected
  return <Page title="Gestão de usuários" subtitle="Cadastros, acessos, patrocinadores e status da rede." action={<button className="primary-btn" onClick={openCreate}><Plus aria-hidden="true" />Novo usuário</button>}><ErrorBox error={error} />{notice && <div className="success-box" role="status"><Check aria-hidden="true" />{notice}</div>}<div className="table-tools"><div className="search-box"><Search aria-hidden="true" /><input aria-label="Buscar usuários" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar usuário, e-mail ou status" /></div><span>{filtered.length} usuários encontrados</span></div><UserTable users={filtered} onSelect={openEdit} />{editing && <Modal title={selected ? `Editar ${selected.name}` : 'Cadastrar usuário'} close={closeEditor}><form className="modal-form" onSubmit={save} aria-busy={busy}><div className="form-grid"><label>Nome completo<input required autoComplete="name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label><label>E-mail<input required type="email" autoComplete="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></label><label>Usuário<input required minLength={3} autoComplete="username" value={form.username} onChange={event => setForm({ ...form, username: event.target.value })} /></label><label>Telefone<input autoComplete="tel" value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} /></label><label>{selected ? 'Nova senha (opcional)' : 'Senha provisória'}<input required={!selected} minLength={6} type="password" autoComplete="new-password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} /></label><label>Status<select value={form.status} onChange={event => setForm({ ...form, status: event.target.value })}><option value="PENDING">Pendente</option><option value="ACTIVE">Ativo</option><option value="BLOCKED">Bloqueado</option></select></label><label className="wide">Patrocinador<select value={form.sponsorId} onChange={event => setForm({ ...form, sponsorId: event.target.value })}><option value="__MASTER__">Administrador MASTER</option>{rows.filter(item => item.id !== selected?.id).map(item => <option value={item.id} key={item.id}>{item.name} · @{item.username}</option>)}</select></label></div><div className="modal-actions split-actions">{selected && <button type="button" className="outline-btn danger-btn" disabled={busy} onClick={() => { setDeleting(selected); closeEditor() }}><Trash2 aria-hidden="true" />Excluir</button>}<span /><button type="button" className="outline-btn" disabled={busy} onClick={closeEditor}>Cancelar</button><button className="primary-btn" disabled={busy}>{busy ? 'Salvando…' : selected ? 'Salvar alterações' : 'Criar usuário'}</button></div></form></Modal>}{deleting && <Modal title="Excluir usuário?" close={() => setDeleting(undefined)}><div className="modal-form"><p>Esta ação remove a conta de <b>{deleting.name}</b>, os dados vinculados e realoca seus indicados ao patrocinador anterior.</p><div className="modal-actions"><button className="outline-btn" onClick={() => setDeleting(undefined)}>Cancelar</button><button className="primary-btn danger-solid" disabled={busy} onClick={() => void remove()}>{busy ? 'Excluindo…' : 'Confirmar exclusão'}</button></div></div></Modal>}</Page>
}

type CrudField = { key: string; label: string; type?: 'text' | 'number' | 'select' | 'textarea' | 'user'; required?: boolean; options?: string[]; step?: string; placeholder?: string }
type CollectionType = 'vehicles' | 'investments' | 'orders' | 'invoices' | 'withdrawals' | 'tickets'
const collectionConfig: Record<CollectionType, { title: string; singular: string; subtitle: string; columns: TableColumn[]; fields: CrudField[] }> = {
  vehicles: { title: 'Gestão de frota', singular: 'veículo', subtitle: 'Cadastre ativos, vincule usuários e controle a disponibilidade.', columns: [["plate", "PLACA"], ["model", "MODELO"], ["category", "CATEGORIA"], ["ownerName", "USUÁRIO"], ["battery", "BATERIA", row => `${row.battery || 0}%`], ["status", "STATUS", row => status(row.status)]], fields: [{ key: 'userId', label: 'Usuário vinculado', type: 'user' }, { key: 'plate', label: 'Placa / identificação', required: true }, { key: 'model', label: 'Modelo', required: true }, { key: 'category', label: 'Categoria', type: 'select', required: true, options: ['Scooter', 'Automóvel', 'Bicicleta', 'Outro'] }, { key: 'location', label: 'Localização', required: true }, { key: 'battery', label: 'Bateria (%)', type: 'number', required: true }, { key: 'status', label: 'Status', type: 'select', required: true, options: ['Em operação', 'Disponível', 'Manutenção', 'Indisponível'] }] },
  investments: { title: 'Gestão de investimentos', singular: 'investimento', subtitle: 'Cadastre contratos e sincronize aportes com cada investidor.', columns: [["id", "CONTRATO"], ["ownerName", "USUÁRIO"], ["pack", "PLANO"], ["amount", "VALOR", row => brl(row.amount)], ["paymentMethod", "PAGAMENTO", row => row.paymentMethod || '—'], ["paymentStatus", "STATUS PAG.", row => row.paymentStatus ? status(row.paymentStatus) : '—'], ["status", "STATUS", row => status(row.status)]], fields: [{ key: 'userId', label: 'Investidor', type: 'user', required: true }, { key: 'pack', label: 'Plano', required: true }, { key: 'amount', label: 'Valor investido', type: 'number', step: '0.01', required: true }, { key: 'profit', label: 'Rendimento acumulado', type: 'number', step: '0.01' }, { key: 'days', label: 'Dias de contrato', type: 'number' }, { key: 'date', label: 'Data', required: true, placeholder: 'dd/mm/aaaa' }, { key: 'status', label: 'Status', type: 'select', required: true, options: ['Pendente', 'Aguardando pagamento', 'Ativo', 'Encerrado', 'Cancelado'] }] },
  orders: { title: 'Gestão de pedidos', singular: 'pedido', subtitle: 'Inclua vendas, acompanhe entregas e mantenha o histórico do cliente.', columns: [["id", "PEDIDO"], ["ownerName", "USUÁRIO"], ["description", "ITEM"], ["quantity", "QTD."], ["total", "TOTAL", row => brl(row.total)], ["status", "STATUS", row => status(row.status)]], fields: [{ key: 'userId', label: 'Cliente', type: 'user', required: true }, { key: 'description', label: 'Item / descrição', required: true }, { key: 'quantity', label: 'Quantidade', type: 'number', required: true }, { key: 'total', label: 'Valor total', type: 'number', step: '0.01', required: true }, { key: 'date', label: 'Data', required: true, placeholder: 'dd/mm/aaaa' }, { key: 'status', label: 'Status', type: 'select', required: true, options: ['Processando', 'Separação', 'Em trânsito', 'Entregue', 'Cancelado'] }] },
  invoices: { title: 'Gestão de faturas', singular: 'fatura', subtitle: 'Crie cobranças e acompanhe recebimentos por usuário.', columns: [["id", "FATURA"], ["ownerName", "USUÁRIO"], ["description", "DESCRIÇÃO"], ["due", "VENCIMENTO"], ["amount", "VALOR", row => brl(row.amount)], ["status", "STATUS", row => status(row.status)]], fields: [{ key: 'userId', label: 'Cliente', type: 'user', required: true }, { key: 'description', label: 'Descrição', required: true }, { key: 'amount', label: 'Valor', type: 'number', step: '0.01', required: true }, { key: 'remaining', label: 'Saldo pendente', type: 'number', step: '0.01', required: true }, { key: 'due', label: 'Vencimento', required: true, placeholder: 'dd/mm/aaaa' }, { key: 'status', label: 'Status', type: 'select', required: true, options: ['Pendente', 'Pago', 'Vencido', 'Cancelado'] }] },
  withdrawals: { title: 'Gestão de saques', singular: 'saque', subtitle: 'Registre e processe solicitações financeiras dos usuários.', columns: [["id", "SAQUE"], ["ownerName", "USUÁRIO"], ["date", "DATA"], ["method", "MÉTODO"], ["amount", "VALOR", row => brl(row.amount)], ["status", "STATUS", row => status(row.status)]], fields: [{ key: 'userId', label: 'Usuário', type: 'user', required: true }, { key: 'amount', label: 'Valor', type: 'number', step: '0.01', required: true }, { key: 'method', label: 'Método', type: 'select', required: true, options: ['PIX', 'TED', 'Transferência'] }, { key: 'account', label: 'Conta / chave', required: true }, { key: 'date', label: 'Data', required: true, placeholder: 'dd/mm/aaaa' }, { key: 'paidAt', label: 'Data do pagamento', placeholder: 'dd/mm/aaaa ou —' }, { key: 'status', label: 'Status', type: 'select', required: true, options: ['Pendente', 'Em análise', 'Pago', 'Recusado'] }] },
  tickets: { title: 'Central de suporte', singular: 'ticket', subtitle: 'Cadastre, atribua e resolva atendimentos integrados à conta.', columns: [["id", "TICKET"], ["ownerName", "USUÁRIO"], ["subject", "ASSUNTO"], ["department", "ÁREA"], ["priority", "PRIORIDADE"], ["status", "STATUS", row => status(row.status)]], fields: [{ key: 'userId', label: 'Usuário', type: 'user', required: true }, { key: 'subject', label: 'Assunto', required: true }, { key: 'department', label: 'Área', type: 'select', required: true, options: ['Atendimento', 'Financeiro', 'Operações', 'Cadastro'] }, { key: 'category', label: 'Categoria', required: true }, { key: 'priority', label: 'Prioridade', type: 'select', required: true, options: ['Baixa', 'Média', 'Alta'] }, { key: 'message', label: 'Mensagem / observações', type: 'textarea' }, { key: 'status', label: 'Status', type: 'select', required: true, options: ['Aberto', 'Em análise', 'Aguardando usuário', 'Resolvido'] }] },
}
function AdminCollection({ session, type }: { session: Session; type: CollectionType }) {
  const api = useApi(session)
  const config = collectionConfig[type]
  const [rows, setRows] = useState<Row[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<Row>()
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<Row>()
  const [form, setForm] = useState<Row>({ id: '' })
  const load = () => Promise.all([api.get<ApiPage<Row>>(`/admin/${type}?pageSize=100`), api.get<ApiPage<User>>('/admin/associates?pageSize=100')]).then(([records, accounts]) => { setRows(records.items); setUsers(accounts.items) }).catch(reason => setError(reason.message))
  useEffect(() => { void load() }, [type])
  const openCreate = () => { const initial: Row = { id: '' }; for (const field of config.fields) initial[field.key] = field.options?.[0] ?? (field.type === 'number' ? 0 : ''); setForm(initial); setCreating(true); setEditing(undefined); setError('') }
  const openEdit = (row: Row) => { setForm({ ...row }); setEditing(row); setCreating(false); setError('') }
  const closeEditor = () => { setCreating(false); setEditing(undefined) }
  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('')
    const payload = Object.fromEntries(config.fields.map(field => [field.key, form[field.key]]))
    try { if (editing) await api.patch(`/admin/${type}/${editing.id}`, payload); else await api.post(`/admin/${type}`, payload); setNotice(`${config.singular[0].toUpperCase()}${config.singular.slice(1)} ${editing ? 'atualizado' : 'cadastrado'} com sucesso.`); closeEditor(); await load() }
    catch (reason: any) { setError(reason.message) } finally { setBusy(false) }
  }
  const remove = async () => { if (!deleting) return; setBusy(true); setError(''); try { await api.delete(`/admin/${type}/${deleting.id}`); setNotice(`${config.singular[0].toUpperCase()}${config.singular.slice(1)} excluído com sucesso.`); setDeleting(undefined); await load() } catch (reason: any) { setError(reason.message) } finally { setBusy(false) } }
  const enriched = rows.map(row => ({ ...row, ownerName: users.find(account => account.id === row.userId)?.name ?? row.driver ?? 'Não vinculado' }))
  const filtered = enriched.filter(row => JSON.stringify(row).toLowerCase().includes(query.toLowerCase()))
  return <Page title={config.title} subtitle={config.subtitle} action={<button className="primary-btn" onClick={openCreate}><Plus aria-hidden="true" />Cadastrar {config.singular}</button>}><ErrorBox error={error} />{notice && <div className="success-box" role="status"><Check aria-hidden="true" />{notice}</div>}<div className="table-tools"><div className="search-box"><Search aria-hidden="true" /><input aria-label={`Buscar em ${config.title}`} value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar nesta área" /></div><span>{filtered.length} registros</span></div><DataTable rows={filtered} columns={config.columns} action={row => <div className="row-actions"><button className="icon-btn" aria-label={`Editar ${row.id}`} onClick={() => openEdit(row)}><Pencil aria-hidden="true" /></button><button className="icon-btn danger-icon" aria-label={`Excluir ${row.id}`} onClick={() => setDeleting(row)}><Trash2 aria-hidden="true" /></button></div>} />{(creating || editing) && <Modal title={editing ? `Editar ${config.singular}` : `Cadastrar ${config.singular}`} close={closeEditor}><form className="modal-form" onSubmit={save} aria-busy={busy}><div className="form-grid">{config.fields.map(field => <label className={field.type === 'textarea' ? 'wide' : ''} key={field.key}>{field.label}{field.type === 'user' ? <select required={field.required} value={form[field.key] ?? ''} onChange={event => setForm({ ...form, [field.key]: event.target.value })}><option value="">{field.required ? 'Selecione um usuário' : 'Sem vínculo'}</option>{users.map(account => <option value={account.id} key={account.id}>{account.name} · @{account.username}</option>)}</select> : field.type === 'select' ? <select required={field.required} value={form[field.key] ?? ''} onChange={event => setForm({ ...form, [field.key]: event.target.value })}>{field.options?.map(option => <option key={option}>{option}</option>)}</select> : field.type === 'textarea' ? <textarea required={field.required} value={form[field.key] ?? ''} onChange={event => setForm({ ...form, [field.key]: event.target.value })} /> : <input required={field.required} type={field.type || 'text'} min={field.type === 'number' ? 0 : undefined} step={field.step} placeholder={field.placeholder} value={form[field.key] ?? ''} onChange={event => setForm({ ...form, [field.key]: event.target.value })} />}</label>)}</div><div className="modal-actions"><button type="button" className="outline-btn" disabled={busy} onClick={closeEditor}>Cancelar</button><button className="primary-btn" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button></div></form></Modal>}{deleting && <Modal title={`Excluir ${config.singular}?`} close={() => setDeleting(undefined)}><div className="modal-form"><p>O registro <b>{deleting.id}</b> será removido e deixará de aparecer na conta vinculada.</p><div className="modal-actions"><button className="outline-btn" onClick={() => setDeleting(undefined)}>Cancelar</button><button className="primary-btn danger-solid" disabled={busy} onClick={() => void remove()}>{busy ? 'Excluindo…' : 'Confirmar exclusão'}</button></div></div></Modal>}</Page>
}

function AdminFinance({ session }: { session: Session }) {
  const [section, setSection] = useState<'invoices' | 'withdrawals'>('invoices')
  return <><div className="finance-tabs" role="tablist" aria-label="Áreas financeiras"><button role="tab" aria-selected={section === 'invoices'} className={section === 'invoices' ? 'active' : ''} onClick={() => setSection('invoices')}><FileText aria-hidden="true" />Faturas</button><button role="tab" aria-selected={section === 'withdrawals'} className={section === 'withdrawals' ? 'active' : ''} onClick={() => setSection('withdrawals')}><WalletCards aria-hidden="true" />Saques</button></div><AdminCollection session={session} type={section} /></>
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
