import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import {
  Activity, AlertCircle, BarChart3, Bitcoin, CalendarDays, Car, Check, CircleDollarSign, Copy, FileText, GitBranch,
  Headphones, LayoutDashboard, LogOut, Menu, Network, Package, Pencil, Plus, QrCode, Search,
  Settings, ShieldCheck, ShoppingBag, TicketCheck, UserRound, UsersRound, Wallet,
  Trash2, WalletCards, Wrench, X,
} from 'lucide-react'
import { ApiClient, clearSession, loadSession, saveSession, type Session } from './api'
import { ASSOCIATE_PLAN_PRICE_CENTS, DIRECT_REFERRAL_BPS, SHAREHOLDER_MIN_QUOTA_CENTS, UNILEVEL_LEVELS, isBonusEligibleParticipant } from './businessPlan'
import type { Bonus, CommissionRule, Page as ApiPage, TreeUser, User } from './types'
import './styles.css'

type Row = Record<string, any> & { id: string }
type PortalState = {
  vehicles: Row[]; investments: Row[]; orders: Row[]; invoices: Row[]; transactions: Row[]
  withdrawals: Row[]; tickets: Row[]; cart: Row[]; profile: Record<string, any>; business: Record<string, any>
}

const emptyState: PortalState = { vehicles: [], investments: [], orders: [], invoices: [], transactions: [], withdrawals: [], tickets: [], cart: [], profile: {}, business: {} }
const vehicleFeatureEnabled = false
const AUTO_REFRESH_INTERVAL_MS = 5_000
const brl = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0)
const cents = (value: number) => brl((value || 0) / 100)
const dateTime = (value?: string) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value)) : '—'
const defaultUnilevelText = UNILEVEL_LEVELS.map(item => `${item.level}:${item.bps / 100}`).join(', ')
const initials = (name: string) => name.split(' ').map(part => part[0]).join('').slice(0, 2).toUpperCase()
const statusLabels: Record<string, string> = {
  ACTIVE: 'Ativo', INACTIVE: 'Inativo', PENDING: 'Pendente', BLOCKED: 'Bloqueado',
  APPROVED: 'Aprovado', CANCELLED: 'Cancelado', REVERSAL: 'Estorno', BLOCKED_UPGRADE: 'Bloqueado até upgrade',
  SCHEDULED: 'Agendado', PROCESSING: 'Processando', PROCESSED: 'Processado', CAPPED_200_PERCENT: 'Teto de 200% atingido',
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

function useAutoRefresh(refresh: () => Promise<unknown> | void) {
  const refreshRef = useRef(refresh)
  const inFlightRef = useRef(false)
  useEffect(() => { refreshRef.current = refresh }, [refresh])
  useEffect(() => {
    let disposed = false
    const run = async () => {
      if (disposed || inFlightRef.current || document.visibilityState === 'hidden') return
      inFlightRef.current = true
      try { await refreshRef.current() } finally { inFlightRef.current = false }
    }
    const refreshWhenVisible = () => { if (document.visibilityState === 'visible') void run() }
    const interval = window.setInterval(() => { void run() }, AUTO_REFRESH_INTERVAL_MS)
    addEventListener('focus', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)
    return () => { disposed = true; clearInterval(interval); removeEventListener('focus', refreshWhenVisible); document.removeEventListener('visibilitychange', refreshWhenVisible) }
  }, [])
}

function usePortalState(session: Session) {
  const api = useApi(session)
  const [data, setData] = useState<PortalState>()
  const [error, setError] = useState('')
  const load = useCallback(() => api.get<PortalState>('/state').then(value => { setData({ ...emptyState, ...value }); setError('') }).catch(reason => setError(reason.message)), [api])
  useEffect(() => { void load() }, [load])
  useAutoRefresh(load)
  return { api, data, error, load }
}

function NavLink({ to, icon: Icon, children, current, onNavigate }: { to: string; icon: any; children: ReactNode; current: string; onNavigate?: () => void }) {
  const active = current === to || (!['/dashboard', '/admin'].includes(to) && current.startsWith(`${to}/`))
  return <a href={to} className={active ? 'active' : ''} aria-current={active ? 'page' : undefined} onClick={event => { event.preventDefault(); go(to); onNavigate?.() }}><Icon aria-hidden="true" /><span>{children}</span></a>
}

function Loader() { return <div className="loading-screen" role="status" aria-live="polite"><div className="loader-mark" aria-hidden="true">G</div><p>Carregando a operação…</p></div> }
function ErrorBox({ error }: { error: string }) { return error ? <div className="form-error" role="alert"><AlertCircle aria-hidden="true" />{error}</div> : null }
function PixPaymentDetails({ payment }: { payment: Row }) {
  const [copied, setCopied] = useState(false)
  const pixCode = String(payment.pixQrCode || '')
  const qrImage = (payment.pixQrCodeBase64 || payment.qrCodeBase64 || payment.pixQrCodeUrl || payment.qrCodeUrl) ? String(payment.pixQrCodeBase64 || payment.qrCodeBase64 || payment.pixQrCodeUrl || payment.qrCodeUrl) : null
  const paymentUrl = payment.paymentUrl ? String(payment.paymentUrl) : null

  const copy = async () => {
    if (!pixCode) return
    await navigator.clipboard.writeText(pixCode)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2500)
  }

  const qrImageUrl = qrImage
    ? (qrImage.startsWith('data:') || qrImage.startsWith('http') ? qrImage : `data:image/png;base64,${qrImage}`)
    : null

  return (
    <div className="pix-payment-details" role="status">
      <div className="pix-qr-container">
        <div className="pix-qr-instructions">
          <QrCode aria-hidden="true" />
          <span>Pague escaneando o QR Code abaixo</span>
        </div>
        <div className="pix-qr-card">
          {qrImageUrl ? (
            <img
              src={qrImageUrl}
              alt="QR Code PIX gerado pela PIXPAY"
              width={300}
              height={300}
              className="pix-qr-image"
            />
          ) : pixCode ? (
            <QRCodeSVG
              value={pixCode}
              size={300}
              level="M"
              includeMargin={true}
              bgColor="#ffffff"
              fgColor="#000000"
              className="pix-qr-image"
            />
          ) : (
            <div className="pix-qr-placeholder">Carregando QR Code…</div>
          )}
        </div>
        <small className="pix-qr-hint">Abra o app do seu banco, escolha <b>Pagar com PIX &gt; Ler QR Code</b> e aponte a câmera para a imagem acima.</small>
        {paymentUrl && (
          <a href={paymentUrl} target="_blank" rel="noreferrer" className="outline-btn" style={{ fontSize: '11px', padding: '6px 12px', marginTop: '6px' }}>
            Abrir página de pagamento da PixPay
          </a>
        )}
      </div>

      <div className="pix-copy-section">
        <div className="pix-copy-header">
          <Copy aria-hidden="true" />
          <span>
            <b>Ou use o PIX Copia e Cola</b>
            <small>Copie o código abaixo e cole no campo PIX Copia e Cola do seu banco:</small>
          </span>
        </div>
        <textarea readOnly aria-label="Código PIX Copia e Cola" value={pixCode} onClick={e => (e.target as HTMLTextAreaElement).select()} />
        <button type="button" className="primary-btn" onClick={() => void copy()}>
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? 'Código PIX copiado!' : 'Copiar código PIX'}
        </button>
      </div>

      <div className="pix-status-badge">
        <span>Referência: <b>{payment.paymentReference || payment.id}</b></span>
        <span className="pix-live-indicator">
          <span className="pix-pulse-dot" aria-hidden="true" />
          Aguardando confirmação automática
        </span>
      </div>
    </div>
  )
}
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
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
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
  return <main className="login-shell"><div className="login-visual"><img src="/brand/gomove-hero.jpeg" alt="Mobilidade inteligente GoMove" /></div><section className="login-panel"><div className="login-form-wrap"><img className="login-logo" src="/brand/gomove-logo-oficial.png" alt="GoMove" /><h1>Bem-vindo <em>de volta.</em></h1><p>Acesse sua conta GoMove com suas credenciais.</p><form onSubmit={submit} aria-busy={loading}><label>Usuário ou e-mail<input required autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} /></label><label>Senha<input required autoComplete="current-password" type="password" value={password} onChange={event => setPassword(event.target.value)} /></label><ErrorBox error={error} /><button className="primary-btn login-btn" disabled={loading}>{loading ? 'Autenticando…' : 'Entrar na plataforma'}</button></form><p className="registration-prompt">Ainda não tem acesso? <a href="/cadastro">Criar conta</a></p></div></section></main>
}
function BonusPeriodSummary({ periods }: { periods: { todayCents: number; weekCents: number; monthCents: number } }) {
  const values = [
    { label: 'Hoje', value: periods.todayCents, note: 'Desde 00h' },
    { label: 'Esta semana', value: periods.weekCents, note: 'De segunda até hoje' },
    { label: 'Este mês', value: periods.monthCents, note: 'Acumulado no mês' },
  ]
  return <section className="bonus-period-summary" aria-labelledby="bonus-period-title"><div className="bonus-period-heading"><span><i><CalendarDays aria-hidden="true" /></i><span><small>SEU RESULTADO</small><h2 id="bonus-period-title">Bonificações recebidas</h2></span></span><p>Valores aprovados e creditados na sua conta.</p></div><div className="bonus-period-grid">{values.map((item, index) => <article className={index === 2 ? 'featured' : ''} key={item.label}><span>{item.label}</span><strong>{cents(item.value)}</strong><small>{item.note}</small></article>)}</div></section>
}

function Registration({ setSession }: { setSession: (session: Session) => void }) {
  const invited = location.pathname.startsWith('/convite/')
  const inviteCode = invited ? location.pathname.split('/').pop() || '' : ''
  const api = useApi(null)
  const [invite, setInvite] = useState<any>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', username: '', password: '' })
  useEffect(() => {
    if (!invited) return
    api.get(`/public/invites/${inviteCode}`).then(setInvite).catch(reason => setError(reason.message))
  }, [inviteCode, invited])
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      const session = await api.post<Session>('/public/register', { ...form, inviteCode: inviteCode || undefined })
      saveSession(session)
      setSession(session)
      location.replace('/dashboard')
    } catch (reason: any) { setError(reason.message) } finally { setBusy(false) }
  }
  const description = invited
    ? invite ? `Indicado por ${invite.sponsor.name}. Após o cadastro, escolha como deseja ativar sua participação.` : 'Verificando convite…'
    : 'Crie seu acesso. Dentro da plataforma, você poderá escolher entre o Plano de Associado ou a compra direta de cotas.'
  return <main className="login-shell invite-shell"><section className="login-panel compact-login"><div className="login-form-wrap"><img className="login-logo" src="/brand/gomove-logo-oficial.png" alt="GoMove" /><span className="eyebrow">NOVO ACESSO</span><h1>Crie sua <em>conta.</em></h1><p>{description}</p><form onSubmit={submit} aria-busy={busy}><label>Nome<input required autoComplete="name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label><label>E-mail<input required autoComplete="email" type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></label><label>Usuário<input required minLength={3} pattern="[A-Za-z0-9._-]+" title="Use apenas letras, números, ponto, hífen ou sublinhado" autoComplete="username" value={form.username} onChange={event => setForm({ ...form, username: event.target.value })} /></label><label>Senha<input required autoComplete="new-password" minLength={6} type="password" aria-describedby="password-hint" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} /><small id="password-hint">Use pelo menos 6 caracteres.</small></label><ErrorBox error={error} /><button className="primary-btn login-btn" disabled={busy || (invited && !invite)}>{busy ? 'Criando conta…' : 'Criar conta e continuar'}</button></form><p className="registration-prompt">Já possui uma conta? <a href="/">Entrar</a></p></div></section></main>
}

const userLinks = [
  ['/dashboard', 'Visão geral', LayoutDashboard], ['/investments', 'Cotas GoMove', BarChart3],
  ['/store', 'Loja e pedidos', ShoppingBag], ['/finance', 'Financeiro', Wallet], ['/bonuses', 'Bonificações', CircleDollarSign], ['/network', 'Minha rede', Network],
  ['/support', 'Atendimento', Headphones], ['/profile', 'Meu perfil', UserRound],
] as const
const activationLinks = [
  ['/activation', 'Ativar participação', ShieldCheck], ['/investments', 'Comprar cotas', BarChart3],
  ['/support', 'Atendimento', Headphones], ['/profile', 'Meu perfil', UserRound],
] as const
const adminLinks = ([
  ['/admin', 'Dashboard MASTER', LayoutDashboard], ['/admin/associates', 'Usuários', UsersRound], ['/admin/fleet', 'Frota', Car],
  ['/admin/investments', 'Cotas', BarChart3], ['/admin/orders', 'Pedidos', Package], ['/admin/finance', 'Financeiro', Wallet],
  ['/admin/network', 'Rede completa', GitBranch], ['/admin/commissions', 'Comissões', CircleDollarSign], ['/admin/support', 'Suporte', TicketCheck],
  ['/admin/audit', 'Auditoria', ShieldCheck], ['/admin/settings', 'Configurações', Settings],
] as const).filter(([to]) => vehicleFeatureEnabled || to !== '/admin/fleet')

function Shell({ session, logout }: { session: Session; logout: () => void }) {
  const path = usePath()
  const [mobileOpen, setMobileOpen] = useState(false)
  const isAdmin = session.user.role === 'ADMIN_MASTER'
  const needsActivation = session.user.status === 'ACTIVE' && session.user.membershipType !== 'SHAREHOLDER' && session.user.associatePlanStatus !== 'ACTIVE'
  const links = isAdmin ? adminLinks : needsActivation ? activationLinks : userLinks
  return <div className="app-shell">{mobileOpen && <button type="button" className="mobile-overlay" aria-label="Fechar menu" onClick={() => setMobileOpen(false)} />}<aside className={`sidebar ${mobileOpen ? 'is-mobile-open' : ''}`} aria-label={isAdmin ? 'Navegação MASTER' : 'Navegação do usuário'}><div className="sidebar-top"><img src="/brand/gomove-logo-oficial.png" alt="GoMove" /></div><nav aria-label="Menu principal"><div className="nav-group"><span className="nav-label">{isAdmin ? 'ADMINISTRAÇÃO MASTER' : 'MINHA CONTA'}</span>{links.map(([to, label, Icon]) => <NavLink key={to} to={to} icon={Icon} current={path} onNavigate={() => setMobileOpen(false)}>{label}</NavLink>)}</div></nav><div className="sidebar-profile"><span className="avatar">{initials(session.user.name)}</span><span><b>{session.user.name}</b><small>{isAdmin ? 'Administrador MASTER' : 'Usuário GoMove'}</small></span></div></aside><div className="app-main"><header className="topbar"><button type="button" className="icon-btn mobile-menu" aria-label="Abrir menu" onClick={() => setMobileOpen(true)}><Menu aria-hidden="true" /></button><span className="environment-pill"><span /> Sistema operacional</span><div className="topbar-spacer" /><div className="user-chip"><span className="avatar">{initials(session.user.name)}</span><span><b>{session.user.name}</b><small>{isAdmin ? 'MASTER' : 'USUÁRIO'}</small></span></div><button type="button" className="icon-btn" aria-label="Sair" onClick={logout}><LogOut aria-hidden="true" /></button></header><main className="page-content" id="conteudo-principal"><Router session={session} path={path} /></main></div></div>
}

function Router({ session, path }: { session: Session; path: string }) {
  const admin = session.user.role === 'ADMIN_MASTER'
  if (admin) {
    if (!path.startsWith('/admin')) { go('/admin'); return <Loader /> }
    if (path === '/admin') return <AdminDashboard session={session} />
    if (path === '/admin/associates') return <Associates session={session} />
    if (path === '/admin/fleet') {
      if (!vehicleFeatureEnabled) { go('/admin'); return <Loader /> }
      return <AdminCollection session={session} type="vehicles" />
    }
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
  const needsActivation = session.user.status === 'ACTIVE' && session.user.membershipType !== 'SHAREHOLDER' && session.user.associatePlanStatus !== 'ACTIVE'
  if (needsActivation && !['/activation', '/investments', '/my-investments', '/profile', '/support'].includes(path)) { go('/activation'); return <Loader /> }
  if (path === '/activation') return needsActivation ? <ActivationOnboarding session={session} /> : <UserDashboard session={session} />
  if (path === '/dashboard' || path === '/') return <UserDashboard session={session} />
  if (path === '/investments' || path === '/my-investments') return <UserInvestments session={session} />
  if (path === '/store' || path === '/orders') return <Store session={session} />
  if (['/finance', '/invoices', '/statement', '/withdraw', '/withdrawals', '/pay'].includes(path)) return <UserFinance session={session} />
  if (path === '/bonuses') return <BonusesPage session={session} />
  if (['/network', '/referrals', '/unilevel', '/genealogy'].includes(path)) return <NetworkPage session={session} />
  if (path === '/support' || path === '/tickets') return <Support session={session} />
  if (path === '/profile') return <Profile session={session} />
  return <UserDashboard session={session} />
}

function ActivationOnboarding({ session }: { session: Session }) {
  const api = useApi(session)
  const [planCheckoutKey] = useState(() => crypto.randomUUID())
  const [planPaymentAsset, setPlanPaymentAsset] = useState<'BTC' | 'USDT' | 'OTHER' | 'PIX'>('BTC')
  const [customerDocument, setCustomerDocument] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [checkout, setCheckout] = useState<Row>()
  const activateAssociate = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true); setError(''); setCheckout(undefined)
    try {
      const result = await api.post<Row>('/associate-plan', { idempotencyKey: planCheckoutKey, preferredPaymentAsset: planPaymentAsset, paymentMethod: planPaymentAsset, ...(planPaymentAsset === 'PIX' ? { customerDocument } : {}) })
      if (result.demo) setCheckout(result)
      else if (/^https?:\/\//i.test(String(result.paymentUrl || ''))) window.location.assign(result.paymentUrl)
      else setCheckout(result)
    } catch (reason: any) { setError(reason.message) } finally { setBusy(false) }
  }
  const confirmDemoAssociate = async () => {
    if (!checkout?.demo) return
    setBusy(true); setError('')
    try {
      const result = await api.post<{ user: User }>(`/associate-plan/${checkout.id}/confirm-demo`, {})
      const nextSession = { ...session, user: result.user }
      saveSession(nextSession)
      location.replace('/dashboard')
    } catch (reason: any) { setError(reason.message) } finally { setBusy(false) }
  }
  return <Page title="Escolha como ativar sua conta" subtitle="Seu acesso foi criado. Agora selecione uma das duas modalidades para iniciar sua participação.">
    <ErrorBox error={error} />
    <div className="activation-intro" role="status"><ShieldCheck aria-hidden="true" /><span><b>Conta criada com segurança</b><small>Você está dentro da plataforma. A modalidade escolhida será ativada após a confirmação do pagamento.</small></span></div>
    <section className="activation-options" aria-label="Modalidades de ativação">
      <form className="activation-card" onSubmit={activateAssociate} aria-busy={busy}>
        <span className="activation-number" aria-hidden="true">01</span><ShieldCheck className="activation-icon" aria-hidden="true" />
        <span className="eyebrow">REDE E BONIFICAÇÕES</span><h2>Plano de Associado</h2><strong>{cents(ASSOCIATE_PLAN_PRICE_CENTS)}</strong>
        <p>Ative o plano para participar como Associado e seguir as regras de indicação e ganhos da modalidade.</p>
        <label>Forma de pagamento<select value={planPaymentAsset} onChange={event => setPlanPaymentAsset(event.target.value as typeof planPaymentAsset)}><option value="PIX">PIX</option><option value="BTC">Bitcoin (BTC)</option><option value="USDT">Tether (USDT)</option><option value="OTHER">Outra criptomoeda</option></select></label>
        {planPaymentAsset === 'PIX' && <label>CPF ou CNPJ do pagador<input required inputMode="numeric" autoComplete="off" value={customerDocument} onChange={event => setCustomerDocument(event.target.value)} placeholder="Somente números" /></label>}
        <button className="primary-btn" disabled={busy}>{busy ? 'Criando cobrança…' : 'Comprar Plano de Associado'}</button>
      </form>
      <article className="activation-card featured">
        <span className="activation-number" aria-hidden="true">02</span><BarChart3 className="activation-icon" aria-hidden="true" />
        <span className="eyebrow">PARTICIPAÇÃO DIRETA</span><h2>Compra direta de cotas</h2><strong>A partir de {cents(SHAREHOLDER_MIN_QUOTA_CENTS)}</strong>
        <p>A compra direta de cotas não exige o Plano de Associado de R$ 55. Após a confirmação, sua modalidade passa a Cotista.</p>
        <ul><li><Check aria-hidden="true" />Sem pagamento adicional do plano</li><li><Check aria-hidden="true" />Rentabilidade e teto de até 200% sobre as cotas</li></ul>
        <button type="button" className="primary-btn" onClick={() => go('/investments')}>Comprar cotas diretamente</button>
      </article>
    </section>
    {checkout && checkout.demo && <div className="payment-notice" role="status"><ShieldCheck aria-hidden="true" /><span><b>Checkout de demonstração criado</b><small>Confirme abaixo para simular o retorno de pagamento e ativar o plano nesta demonstração.</small></span><button type="button" className="primary-btn" disabled={busy} onClick={() => void confirmDemoAssociate()}>{busy ? 'Confirmando…' : 'Confirmar pagamento de demonstração'}</button></div>}
    {checkout && !checkout.demo && (checkout.pixQrCode ? <PixPaymentDetails payment={checkout} /> : <div className="success-box" role="status"><Check aria-hidden="true" />Cobrança criada. Referência: {checkout.paymentReference || checkout.id}</div>)}
  </Page>
}

function UserDashboard({ session }: { session: Session }) {
  const { data, error } = usePortalState(session)
  if (!data && !error) return <Loader />
  const state = data || emptyState
  const invested = state.investments.reduce((sum, item) => sum + Number(item.amount || 0), 0)
  const earnings = state.investments.reduce((sum, item) => sum + Number(item.profit || 0), 0)
  const participant = state.business
  const isShareholder = participant.membershipType === 'SHAREHOLDER'
  return <Page title={`Olá, ${session.user.name.split(' ')[0]}.`} subtitle="Aqui está o resumo da sua participação na GoMove."><ErrorBox error={error} /><BonusPeriodSummary periods={participant.bonusPeriods || { todayCents: 0, weekCents: 0, monthCents: 0 }} />{!isShareholder && <div className="business-plan-alert"><ShieldCheck aria-hidden="true" /><span><b>Você é Associado</b><small>Bonificações são limitadas a R$ 500,00. Adquira ao menos {cents(SHAREHOLDER_MIN_QUOTA_CENTS)} em cotas para evoluir a Cotista e liberar valores bloqueados.</small></span><button className="primary-btn" onClick={() => go('/investments')}>Fazer upgrade</button></div>}{isShareholder && <div className="business-plan-alert"><BarChart3 aria-hidden="true" /><span><b>Teto de ganhos: {cents(participant.earningCapCents)}</b><small>Diário, indicação e Unilevel podem acumular até 200% das suas cotas. Ao atingir o limite, adquira novas cotas para renovar a capacidade.</small></span><button className="primary-btn" onClick={() => go('/investments')}>Renovar cotas</button></div>}<section className="metric-grid"><Metric label="MODALIDADE" value={isShareholder ? 'Cotista' : 'Associado'} icon={UserRound} note={isShareholder ? `${brl(invested)} em cotas confirmadas` : 'Participação na rede'} /><Metric label="PLANO DE ASSOCIADO" value={participant.associatePlanStatus === 'ACTIVE' ? 'Ativo' : 'Pendente'} icon={ShieldCheck} note={cents(ASSOCIATE_PLAN_PRICE_CENTS)} /><Metric label="BÔNUS APROVADOS" value={cents(participant.approvedBonusCents)} icon={WalletCards} note={participant.blockedBonusCents ? `${cents(participant.blockedBonusCents)} bloqueados` : 'Diretos e indiretos'} /><Metric label="LIMITE DISPONÍVEL" value={cents(participant.earningCapRemainingCents ?? participant.bonusCapRemainingCents)} icon={BarChart3} note={isShareholder ? `${cents(participant.earningCapConsumedCents)} de ${cents(participant.earningCapCents)} utilizados` : 'Até o teto de R$ 500,00'} /></section><section className="dashboard-split"><div className="panel"><div className="panel-title"><h2>Movimentações recentes</h2><button className="text-btn" onClick={() => go('/finance')}>Ver financeiro</button></div>{state.transactions.slice(0, 5).map(item => <div className="activity-row" key={item.id}><i className={item.amount >= 0 ? 'positive' : 'negative'}><WalletCards /></i><span><b>{item.description}</b><small>{item.date}</small></span><strong className={item.amount >= 0 ? 'positive-text' : ''}>{brl(item.amount)}</strong></div>)}</div><div className="panel quick-panel"><h2>Acesso rápido</h2><button onClick={() => go('/investments')}><BarChart3 /><span><b>{isShareholder ? 'Adquirir novas cotas' : 'Evoluir para Cotista'}</b><small>Aquisição mínima de {cents(SHAREHOLDER_MIN_QUOTA_CENTS)}</small></span></button><button onClick={() => go('/network')}><Network /><span><b>Minha rede</b><small>Indicações diretas e indiretas</small></span></button><button onClick={() => go('/support')}><Headphones /><span><b>Solicitar suporte</b><small>Atendimento especializado</small></span></button></div></section></Page>
}

const quotaPaymentOptions = [
  { id: 'PIX', label: 'PIX', description: 'Pagamento instantâneo em reais', icon: QrCode },
  { id: 'BTC', label: 'Bitcoin (BTC)', description: 'Pagamento com Bitcoin', icon: Bitcoin },
  { id: 'USDT', label: 'Tether (USDT)', description: 'Stablecoin pareada ao dólar', icon: CircleDollarSign },
  { id: 'OTHER', label: 'Outras criptomoedas', description: 'Escolha no checkout CoinPayments', icon: WalletCards },
] as const
type QuotaPaymentOption = typeof quotaPaymentOptions[number]['id']

function UserInvestments({ session }: { session: Session }) {
  const { api, data, error, load } = usePortalState(session)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [amount, setAmount] = useState('500')
  const [checkoutOpen, setCheckoutOpen] = useState(false)
  const [checkoutKey, setCheckoutKey] = useState('')
  const [paymentOption, setPaymentOption] = useState<QuotaPaymentOption>('BTC')
  const [customerDocument, setCustomerDocument] = useState('')
  const [checkoutResult, setCheckoutResult] = useState<Row>()
  const openCheckout = (event: FormEvent) => {
    event.preventDefault(); setActionError(''); setCheckoutResult(undefined); setPaymentOption('PIX'); setCustomerDocument(''); setCheckoutKey(crypto.randomUUID()); setCheckoutOpen(true)
  }
  const invest = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true); setActionError('')
    try {
      const investment = await api.post<Row>('/investments', { pack: 'Cotas GoMove', amount: Number(amount), preferredPaymentAsset: paymentOption, paymentMethod: paymentOption, ...(paymentOption === 'PIX' ? { customerDocument } : {}), idempotencyKey: checkoutKey })
      if (!investment.paymentUrl && !investment.pixQrCode) throw new Error('O gateway não retornou os dados do pagamento')
      await load()
      if (/^https?:\/\//i.test(investment.paymentUrl)) window.location.assign(investment.paymentUrl)
      else setCheckoutResult(investment)
    }
    catch (reason: any) { setActionError(reason.message) } finally { setBusy(false) }
  }
  const participant = data?.business || {}
  const isShareholder = participant.membershipType === 'SHAREHOLDER'
  return <Page title="Cotas GoMove" subtitle={isShareholder ? 'Amplie sua participação como Cotista.' : 'Torne-se Cotista sem precisar adquirir o Plano de Associado.'}><ErrorBox error={error || actionError} /><section className="dashboard-split quota-section"><form className="form-panel" onSubmit={openCheckout}><span className="eyebrow">AQUISIÇÃO DIRETA DE COTAS</span><h2>{isShareholder ? 'Adquirir novas cotas' : 'Ativar como Cotista'}</h2><p>A compra direta de cotas dispensa o Plano de Associado de {cents(ASSOCIATE_PLAN_PRICE_CENTS)}. O valor mínimo é {cents(SHAREHOLDER_MIN_QUOTA_CENTS)}.</p><label>Valor das cotas<input required min={SHAREHOLDER_MIN_QUOTA_CENTS / 100} step="0.01" type="number" inputMode="decimal" value={amount} onChange={event => setAmount(event.target.value)} /></label><div className="payment-notice"><ShieldCheck aria-hidden="true" /><span><b>Sem exigência do plano de R$ 55</b><small>Ao confirmar no mínimo {cents(SHAREHOLDER_MIN_QUOTA_CENTS)}, sua conta será ativada diretamente como Cotista.</small></span></div><button className="primary-btn">Escolher pagamento</button></form><div className="panel business-rights"><h2>Direitos como Cotista</h2><div><Check aria-hidden="true" /><span><b>Participação nos resultados financeiros</b><small>Direito exclusivo da modalidade Cotista.</small></span></div><div><Check aria-hidden="true" /><span><b>Teto de ganhos de até 200%</b><small>Diário e bonificações acumulam dentro do teto das cotas adquiridas.</small></span></div><div><Check aria-hidden="true" /><span><b>Plano de R$ 55 dispensado</b><small>A compra direta de cotas é uma modalidade independente.</small></span></div></div></section><h2 className="section-title">Minhas aquisições</h2>{data ? <DataTable rows={data.investments} columns={[["id", "CONTRATO"], ["date", "DATA"], ["pack", "PRODUTO"], ["amount", "VALOR", row => brl(row.amount)], ["paymentMethod", "PAGAMENTO", row => row.paymentProvider === 'PIXPAY' ? 'PIXPAY · PIX' : row.paymentAsset ? `CoinPayments · ${row.paymentAsset}` : row.paymentMethod || '—'], ["status", "STATUS", row => status(row.status)]]} /> : <Loader />}{checkoutOpen && <Modal title={checkoutResult ? 'Pagamento iniciado' : 'Escolha como pagar'} close={() => !busy && setCheckoutOpen(false)}>{checkoutResult ? <div className="modal-form investment-checkout"><div className="checkout-summary"><span><small>Referência</small><b>{checkoutResult.paymentReference}</b></span><strong>{brl(checkoutResult.amount)}</strong></div>{checkoutResult.pixQrCode ? <PixPaymentDetails payment={checkoutResult} /> : <div className="payment-notice"><Check aria-hidden="true" /><span><b>Pagamento iniciado</b><small>Use o link do CoinPayments para concluir o pagamento.</small></span></div>}<div className="modal-actions"><button className="primary-btn" onClick={() => setCheckoutOpen(false)}>Concluir</button></div></div> : <form className="modal-form investment-checkout" onSubmit={invest} aria-busy={busy}><div className="checkout-summary"><span><small>Aquisição</small><b>Cotas GoMove</b></span><strong>{brl(Number(amount))}</strong></div><fieldset><legend>Como você deseja pagar?</legend><div className="payment-method-grid">{quotaPaymentOptions.map(option => <label className={paymentOption === option.id ? 'selected' : ''} key={option.id}><input type="radio" name="paymentOption" value={option.id} checked={paymentOption === option.id} onChange={() => setPaymentOption(option.id)} /><option.icon aria-hidden="true" /><span><b>{option.label}</b><small>{option.description}</small></span><Check className="method-check" aria-hidden="true" /></label>)}</div></fieldset>{paymentOption === 'PIX' && <label>CPF ou CNPJ do pagador<input required inputMode="numeric" autoComplete="off" value={customerDocument} onChange={event => setCustomerDocument(event.target.value)} placeholder="Somente números" /></label>}<div className="payment-notice"><ShieldCheck aria-hidden="true" /><span><b>Pagamento processado pelo {paymentOption === 'PIX' ? 'PIXPAY' : 'CoinPayments'}</b><small>A aquisição só será confirmada após a notificação do gateway.</small></span></div><ErrorBox error={actionError} /><div className="modal-actions"><button type="button" className="outline-btn" disabled={busy} onClick={() => setCheckoutOpen(false)}>Cancelar</button><button className="primary-btn" disabled={busy}>{busy ? 'Criando cobrança…' : 'Continuar para pagamento'}</button></div></form>}</Modal>}</Page>
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

function BonusesPage({ session }: { session: Session }) {
  const api = useApi(session)
  const [summary, setSummary] = useState<any>()
  const [bonuses, setBonuses] = useState<Bonus[]>([])
  const [error, setError] = useState('')
  const load = useCallback(() => Promise.all([api.get<any>('/network/summary'), api.get<ApiPage<Bonus>>('/bonuses/me?pageSize=100')])
      .then(([bonusSummary, bonusEntries]) => { setSummary(bonusSummary); setBonuses([...bonusEntries.items].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')))); setError('') })
      .catch(reason => setError(reason.message))
  , [api])
  useEffect(() => { void load() }, [load])
  useAutoRefresh(load)
  if (!summary && !error) return <Loader />
  return <Page title="Bonificações" subtitle="Acompanhe seus créditos de indicação e Unilevel com transparência."><ErrorBox error={error} /><BonusPeriodSummary periods={summary?.bonusPeriods || { todayCents: 0, weekCents: 0, monthCents: 0 }} /><section className="metric-grid bonus-status-grid"><Metric label="TOTAL APROVADO" value={cents(summary?.approvedBonusCents)} icon={Check} note="Bonificações confirmadas" /><Metric label="AGUARDANDO APROVAÇÃO" value={cents(summary?.pendingBonusCents)} icon={Activity} note="Em análise pelo financeiro" /><Metric label="VALOR BLOQUEADO" value={cents(summary?.blockedBonusCents)} icon={AlertCircle} note={summary?.blockedBonusCents ? 'Aguardando ampliação do limite' : 'Nenhum valor bloqueado'} /><Metric label="LIMITE DISPONÍVEL" value={cents(summary?.earningCapRemainingCents ?? summary?.bonusCapRemainingCents)} icon={ShieldCheck} note={summary?.membershipType === 'SHAREHOLDER' ? 'Dentro do teto de 200% das cotas' : 'Dentro do teto da modalidade'} /></section>{summary?.blockedBonusCents > 0 && <div className="business-plan-alert warning bonus-page-alert"><AlertCircle aria-hidden="true" /><span><b>{cents(summary.blockedBonusCents)} aguardando liberação</b><small>{summary.membershipType === 'SHAREHOLDER' ? 'Renove suas cotas para ampliar o teto de ganhos.' : 'Evolua para Cotista para ampliar sua capacidade de bonificação.'}</small></span><button className="primary-btn" onClick={() => go('/investments')}>{summary.membershipType === 'SHAREHOLDER' ? 'Renovar cotas' : 'Evoluir para Cotista'}</button></div>}<section className="bonus-history" aria-labelledby="bonus-history-title"><div className="store-section-heading"><div><span className="eyebrow">HISTÓRICO COMPLETO</span><h2 id="bonus-history-title">Detalhes das bonificações</h2></div><span>{bonuses.length} {bonuses.length === 1 ? 'lançamento' : 'lançamentos'}</span></div><BonusTable rows={bonuses} detailed /></section></Page>
}

function NetworkPage({ session }: { session: Session }) {
  const api = useApi(session)
  const [summary, setSummary] = useState<any>()
  const [directs, setDirects] = useState<User[]>([])
  const [unilevel, setUnilevel] = useState<Array<User & { level: number }>>([])
  const [bonuses, setBonuses] = useState<Bonus[]>([])
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const load = useCallback(() => Promise.all([api.get<any>('/network/summary'), api.get<ApiPage<User>>('/network/directs?pageSize=100'), api.get<Array<User & { level: number }>>('/network/unilevel?depth=10'), api.get<ApiPage<Bonus>>('/bonuses/me?pageSize=100')]).then(([networkSummary, directUsers, networkUsers, bonusEntries]) => { setSummary(networkSummary); setDirects(directUsers.items); setUnilevel(networkUsers); setBonuses(bonusEntries.items); setError('') }).catch(reason => setError(reason.message)), [api])
  useEffect(() => { void load() }, [load])
  useAutoRefresh(load)
  if (!summary && !error) return <Loader />
  const referral = `${location.origin}/convite/${session.user.inviteCode}`
  const copyReferral = async () => { try { await navigator.clipboard.writeText(referral); setCopied(true); setTimeout(() => setCopied(false), 2500) } catch { setError('Não foi possível copiar o link. Selecione-o e copie manualmente.') } }
  return <Page title="Minha rede" subtitle="Acompanhe indicações diretas, indiretas e bonificações."><ErrorBox error={error} />{copied && <div className="success-box" role="status"><Check aria-hidden="true" />Link de indicação copiado.</div>}{summary?.blockedBonusCents > 0 && <div className="business-plan-alert warning"><AlertCircle aria-hidden="true" /><span><b>{cents(summary.blockedBonusCents)} aguardando upgrade</b><small>Você atingiu o limite de R$ 500,00 da modalidade Associado. O valor será liberado ao se tornar Cotista.</small></span><button className="primary-btn" onClick={() => go('/investments')}>Evoluir para Cotista</button></div>}<div className="business-plan-alert"><Network aria-hidden="true" /><span><b>Dois bônus, duas bases de cálculo</b><small>Indicação direta: {DIRECT_REFERRAL_BPS / 100}% sobre cada nova compra do seu indicado · Unilevel sobre o Diário: {UNILEVEL_LEVELS.map(item => `N${item.level} ${item.bps / 100}%`).join(' · ')}</small></span></div><section className="metric-grid"><Metric label="INDICAÇÕES DIRETAS" value={String(summary?.directs || 0)} icon={UsersRound} /><Metric label="INDICAÇÕES INDIRETAS" value={String(Math.max(0, (summary?.networkSize || 0) - (summary?.directs || 0)))} icon={Network} /><Metric label="BÔNUS APROVADOS" value={cents(summary?.approvedBonusCents)} icon={WalletCards} /><Metric label={summary?.membershipType === 'SHAREHOLDER' ? 'MODALIDADE' : 'LIMITE RESTANTE'} value={summary?.membershipType === 'SHAREHOLDER' ? 'Cotista' : cents(summary?.bonusCapRemainingCents)} icon={ShieldCheck} /></section><div className="referral-banner"><div><span>SEU LINK DE INDICAÇÃO</span><strong>{referral}</strong></div><button className="primary-btn" onClick={() => void copyReferral()}><Copy aria-hidden="true" />{copied ? 'Link copiado' : 'Copiar link'}</button></div><section className="dashboard-split"><div><h2 className="section-title">Meus diretos</h2><UserTable users={directs} /></div><div><h2 className="section-title">Bônus recentes</h2><BonusTable rows={bonuses} /></div></section><section className="unilevel-section"><div className="store-section-heading"><h2>Rede por nível</h2><span>{unilevel.length} participantes</span></div><DataTable rows={unilevel as Row[]} columns={[["level", "NÍVEL", row => `N${row.level}`], ["name", "PARTICIPANTE"], ["membershipType", "MODALIDADE", row => row.membershipType === 'SHAREHOLDER' ? 'Cotista' : 'Associado'], ["username", "USUÁRIO", row => `@${row.username}`], ["status", "STATUS", row => status(row.status)]]} /></section></Page>
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
  return <DataTable rows={users} columns={[["name", "PARTICIPANTE"], ["membershipType", "MODALIDADE", row => row.membershipType === 'SHAREHOLDER' ? 'Cotista' : 'Associado'], ["associatePlanStatus", "PLANO R$ 55", row => status(row.associatePlanStatus || 'PENDING')], ["username", "USUÁRIO", row => `@${row.username}`], ["status", "STATUS", row => status(row.status)]]} action={onSelect ? row => <button className="outline-btn" onClick={() => onSelect(row as User)}>Gerenciar</button> : undefined} />
}
function BonusTable({ rows, detailed = false }: { rows: Bonus[]; detailed?: boolean }) {
  const typeLabel = (type: string) => ({ DIRECT_REFERRAL: 'Indicação direta', UNILEVEL: 'Unilevel', UNILEVEL_PROFITABILITY: 'Unilevel diário', MANUAL: 'Crédito manual', REVERSAL: 'Estorno' }[type] || type)
  const columns: TableColumn[] = [["type", "TIPO", row => typeLabel(row.type)], ["amountCents", "VALOR", row => <strong className={row.amountCents >= 0 ? 'positive-text' : ''}>{cents(row.amountCents)}</strong>], ["level", "NÍVEL", row => row.level ? `N${row.level}` : '—'], ["status", "STATUS", row => status(row.status)]]
  if (detailed) columns.unshift(["createdAt", "DATA", row => dateTime(row.createdAt)])
  if (detailed) columns.push(["reason", "ORIGEM / MOTIVO", row => row.reason || 'Bonificação de rede'])
  const table = <DataTable rows={rows as Row[]} columns={columns} empty="Você ainda não recebeu bonificações." />
  if (!detailed) return table
  return <><div className="bonus-desktop-table">{table}</div><div className="bonus-mobile-list">{rows.length ? rows.map(row => <article className="bonus-mobile-card" key={row.id}><header><div><span>{typeLabel(row.type)}</span><small>{row.level ? `Nível ${row.level}` : 'Crédito de rede'}</small></div>{status(row.status)}</header><strong className={`bonus-mobile-value ${row.amountCents >= 0 ? 'positive-text' : 'negative-text'}`}>{cents(row.amountCents)}</strong><dl><div><dt>Recebido em</dt><dd>{dateTime(row.createdAt)}</dd></div><div><dt>Origem</dt><dd>{row.reason || 'Bonificação de rede'}</dd></div></dl></article>) : <div className="bonus-mobile-empty"><WalletCards aria-hidden="true" /><strong>Nenhuma bonificação ainda</strong><span>Seus próximos lançamentos aparecerão aqui.</span></div>}</div></>
}

function AdminDashboard({ session }: { session: Session }) {
  const api = useApi(session)
  const [data, setData] = useState<any>()
  const [error, setError] = useState('')
  const load = useCallback(() => api.get('/admin/dashboard').then(value => { setData(value); setError('') }).catch(reason => setError(reason.message)), [api])
  useEffect(() => { void load() }, [load])
  useAutoRefresh(load)
  return <Page title="Central MASTER" subtitle="Aderência operacional ao Plano de Negócios GoMove."><ErrorBox error={error} />{data ? <><section className="metric-grid admin-grid"><Metric label="ASSOCIADOS" value={String(data.associates || 0)} icon={UsersRound} note={`${data.active} contas ativas`} /><Metric label="COTISTAS" value={String(data.shareholders || 0)} icon={BarChart3} note="Com direito aos resultados" /><Metric label="PLANOS PENDENTES" value={String(data.pendingPlans || 0)} icon={ShieldCheck} note={`Plano de ${cents(ASSOCIATE_PLAN_PRICE_CENTS)}`} /><Metric label="BÔNUS BLOQUEADOS" value={cents(data.bonusBlockedCents)} icon={AlertCircle} note="Aguardando upgrade" /><Metric label="BÔNUS PENDENTES" value={cents(data.bonusPendingCents)} icon={Activity} note="Aguardando aprovação" /></section><section className="dashboard-split"><div className="panel"><h2>Prioridades do Plano de Negócios</h2><div className="admin-alert"><ShieldCheck /><span><b>{data.pendingPlans || 0} planos aguardando confirmação</b><small>Uma conta só pode ser ativada após o Plano de Associado de {cents(ASSOCIATE_PLAN_PRICE_CENTS)}.</small></span><button onClick={() => go('/admin/associates')}>Abrir</button></div><div className="admin-alert"><AlertCircle /><span><b>{cents(data.bonusBlockedCents)} em bônus bloqueados</b><small>Os valores serão liberados após a aquisição mínima de {cents(SHAREHOLDER_MIN_QUOTA_CENTS)} em cotas.</small></span><button onClick={() => go('/admin/commissions')}>Abrir</button></div><div className="admin-alert"><Wallet /><span><b>{data.pendingWithdrawals || 0} saques aguardando</b><small>Valide e processe as solicitações financeiras.</small></span><button onClick={() => go('/admin/finance')}>Abrir</button></div></div><div className="panel operation-health"><h2>Regras automatizadas</h2><div><span>Plano de Associado obrigatório</span><b>Ativa</b></div><div><span>Indicação direta sobre cotas</span><b>{DIRECT_REFERRAL_BPS / 100}%</b></div><div><span>Unilevel N1 a N6</span><b>6% · 5% · 4% · 3% · 2% · 1%</b></div><div><span>Teto de bônus do Associado</span><b>{cents(50_000)}</b></div><div><span>Upgrade mínimo para Cotista</span><b>{cents(SHAREHOLDER_MIN_QUOTA_CENTS)}</b></div><div><span>Liberação do bônus bloqueado</span><b>Automática</b></div></div></section></> : <Loader />}</Page>
}

function Associates({ session }: { session: Session }) {
  const api = useApi(session)
  const [rows, setRows] = useState<User[]>([])
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<User>()
  const [creating, setCreating] = useState(false)
  const [deleting, setDeleting] = useState<User>()
  const [form, setForm] = useState({ name: '', email: '', username: '', phone: '', password: '', sponsorId: '__MASTER__', status: 'PENDING', associatePlanStatus: 'PENDING' })
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const load = () => api.get<ApiPage<User>>('/admin/associates?pageSize=100').then(value => setRows(value.items)).catch(reason => setError(reason.message))
  useEffect(() => { void load() }, [])
  const openCreate = () => { setSelected(undefined); setCreating(true); setForm({ name: '', email: '', username: '', phone: '', password: '', sponsorId: '__MASTER__', status: 'PENDING', associatePlanStatus: 'PENDING' }); setError('') }
  const openEdit = (account: User) => { setCreating(false); setSelected(account); setForm({ name: account.name, email: account.email || '', username: account.username, phone: (account as Row).phone || '', password: '', sponsorId: rows.some(item => item.id === account.sponsorId) ? account.sponsorId || '__MASTER__' : '__MASTER__', status: account.status, associatePlanStatus: account.associatePlanStatus || 'PENDING' }); setError('') }
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
  const masterSponsorEligible = session.user.role === 'ADMIN_MASTER' && session.user.status === 'ACTIVE'
  const eligibleSponsors = rows.filter(item => item.id !== selected?.id && isBonusEligibleParticipant(item))
  const filtered = rows.filter(item => `${item.name} ${item.username} ${item.email} ${item.status} ${item.membershipType} ${item.associatePlanStatus}`.toLowerCase().includes(query.toLowerCase()))
  const editing = creating || !!selected
  return <Page title="Gestão de participantes" subtitle="Plano de Associado, modalidade, acessos e patrocinadores." action={<button className="primary-btn" onClick={openCreate}><Plus aria-hidden="true" />Novo Associado</button>}><ErrorBox error={error} />{notice && <div className="success-box" role="status"><Check aria-hidden="true" />{notice}</div>}<div className="table-tools"><div className="search-box"><Search aria-hidden="true" /><input aria-label="Buscar participantes" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar participante, modalidade ou status" /></div><span>{filtered.length} participantes encontrados</span></div><UserTable users={filtered} onSelect={openEdit} />{editing && <Modal title={selected ? `Editar ${selected.name}` : 'Cadastrar Associado'} close={closeEditor}><form className="modal-form" onSubmit={save} aria-busy={busy}><div className="form-grid"><label>Nome completo<input required autoComplete="name" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label><label>E-mail<input required type="email" autoComplete="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></label><label>Usuário<input required minLength={3} autoComplete="username" value={form.username} onChange={event => setForm({ ...form, username: event.target.value })} /></label><label>Telefone<input autoComplete="tel" value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} /></label><label>{selected ? 'Nova senha (opcional)' : 'Senha provisória'}<input required={!selected} minLength={6} type="password" autoComplete="new-password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} /></label><label>Plano de Associado · {cents(ASSOCIATE_PLAN_PRICE_CENTS)}<select value={form.associatePlanStatus} onChange={event => setForm({ ...form, associatePlanStatus: event.target.value })}><option value="PENDING">Pendente</option><option value="ACTIVE">Ativo / confirmado</option><option value="INACTIVE">Inativo</option></select></label><label>Status da conta<select value={form.status} onChange={event => setForm({ ...form, status: event.target.value })}><option value="PENDING">Pendente</option><option value="ACTIVE">Ativo</option><option value="BLOCKED">Bloqueado</option></select></label>{selected && <label>Modalidade<input readOnly value={selected.membershipType === 'SHAREHOLDER' ? 'Cotista' : 'Associado'} /></label>}<label className="wide">Patrocinador<select required value={form.sponsorId} onChange={event => setForm({ ...form, sponsorId: event.target.value })}><option value="" disabled>Selecione um patrocinador elegível</option>{masterSponsorEligible && <option value="__MASTER__">Administrador MASTER</option>}{eligibleSponsors.map(item => <option value={item.id} key={item.id}>{item.name} · @{item.username}</option>)}</select></label></div><div className="modal-actions split-actions">{selected && <button type="button" className="outline-btn danger-btn" disabled={busy} onClick={() => { setDeleting(selected); closeEditor() }}><Trash2 aria-hidden="true" />Excluir</button>}<span /><button type="button" className="outline-btn" disabled={busy} onClick={closeEditor}>Cancelar</button><button className="primary-btn" disabled={busy}>{busy ? 'Salvando…' : selected ? 'Salvar alterações' : 'Criar Associado'}</button></div></form></Modal>}{deleting && <Modal title="Excluir participante?" close={() => setDeleting(undefined)}><div className="modal-form"><p>Esta ação remove a conta de <b>{deleting.name}</b>, os dados vinculados e realoca seus indicados ao patrocinador anterior.</p><div className="modal-actions"><button className="outline-btn" onClick={() => setDeleting(undefined)}>Cancelar</button><button className="primary-btn danger-solid" disabled={busy} onClick={() => void remove()}>{busy ? 'Excluindo…' : 'Confirmar exclusão'}</button></div></div></Modal>}</Page>
}

type CrudField = { key: string; label: string; type?: 'text' | 'number' | 'select' | 'textarea' | 'user'; required?: boolean; options?: string[]; step?: string; min?: number; placeholder?: string }
type CollectionType = 'vehicles' | 'investments' | 'orders' | 'invoices' | 'withdrawals' | 'tickets'
const collectionConfig: Record<CollectionType, { title: string; singular: string; subtitle: string; columns: TableColumn[]; fields: CrudField[] }> = {
  vehicles: { title: 'Gestão de frota', singular: 'veículo', subtitle: 'Cadastre ativos, vincule usuários e controle a disponibilidade.', columns: [["plate", "PLACA"], ["model", "MODELO"], ["category", "CATEGORIA"], ["ownerName", "USUÁRIO"], ["battery", "BATERIA", row => `${row.battery || 0}%`], ["status", "STATUS", row => status(row.status)]], fields: [{ key: 'userId', label: 'Usuário vinculado', type: 'user' }, { key: 'plate', label: 'Placa / identificação', required: true }, { key: 'model', label: 'Modelo', required: true }, { key: 'category', label: 'Categoria', type: 'select', required: true, options: ['Scooter', 'Automóvel', 'Bicicleta', 'Outro'] }, { key: 'location', label: 'Localização', required: true }, { key: 'battery', label: 'Bateria (%)', type: 'number', required: true }, { key: 'status', label: 'Status', type: 'select', required: true, options: ['Em operação', 'Disponível', 'Manutenção', 'Indisponível'] }] },
  investments: { title: 'Gestão de cotas', singular: 'aquisição de cotas', subtitle: `Controle aquisições a partir de ${cents(SHAREHOLDER_MIN_QUOTA_CENTS)} e o upgrade automático para Cotista.`, columns: [["id", "CONTRATO"], ["ownerName", "PARTICIPANTE"], ["pack", "PRODUTO"], ["amount", "VALOR", row => brl(row.amount)], ["paymentMethod", "PAGAMENTO", row => row.paymentMethod || '—'], ["paymentStatus", "STATUS PAG.", row => row.paymentStatus ? status(row.paymentStatus) : '—'], ["status", "STATUS", row => status(row.status)]], fields: [{ key: 'userId', label: 'Participante', type: 'user', required: true }, { key: 'pack', label: 'Produto', type: 'select', options: ['Cotas GoMove'], required: true }, { key: 'amount', label: 'Valor das cotas', type: 'number', min: SHAREHOLDER_MIN_QUOTA_CENTS / 100, step: '0.01', required: true }, { key: 'profit', label: 'Resultados financeiros acumulados', type: 'number', step: '0.01' }, { key: 'date', label: 'Data', required: true, placeholder: 'dd/mm/aaaa' }, { key: 'status', label: 'Status', type: 'select', required: true, options: ['Pendente', 'Aguardando pagamento', 'Ativo', 'Encerrado', 'Cancelado'] }] },
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
  const confirmInvestment = async (row: Row) => { setBusy(true); setError(''); setNotice(''); try { const result = await api.post<{ bonuses: Row[]; idempotent: boolean }>(`/admin/investments/${row.id}/confirm`, {}); setNotice(result.idempotent ? 'Esta aquisição já estava confirmada.' : `Cotas confirmadas, modalidade atualizada e ${result.bonuses.length} bonificações geradas.`); await load() } catch (reason: any) { setError(reason.message) } finally { setBusy(false) } }
  const enriched = rows.map(row => ({ ...row, ownerName: users.find(account => account.id === row.userId)?.name ?? row.driver ?? 'Não vinculado' }))
  const filtered = enriched.filter(row => JSON.stringify(row).toLowerCase().includes(query.toLowerCase()))
  return <Page title={config.title} subtitle={config.subtitle} action={<button className="primary-btn" onClick={openCreate}><Plus aria-hidden="true" />Cadastrar {config.singular}</button>}><ErrorBox error={error} />{notice && <div className="success-box" role="status"><Check aria-hidden="true" />{notice}</div>}<div className="table-tools"><div className="search-box"><Search aria-hidden="true" /><input aria-label={`Buscar em ${config.title}`} value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar nesta área" /></div><span>{filtered.length} registros</span></div><DataTable rows={filtered} columns={config.columns} action={row => <div className="row-actions">{type === 'investments' && row.status !== 'Ativo' && row.paymentStatus !== 'CONFIRMED' && <button className="outline-btn confirm-investment-btn" disabled={busy} onClick={() => void confirmInvestment(row)}><Check aria-hidden="true" />Confirmar pagamento</button>}<button className="icon-btn" aria-label={`Editar ${row.id}`} onClick={() => openEdit(row)}><Pencil aria-hidden="true" /></button><button className="icon-btn danger-icon" aria-label={`Excluir ${row.id}`} onClick={() => setDeleting(row)}><Trash2 aria-hidden="true" /></button></div>} />{(creating || editing) && <Modal title={editing ? `Editar ${config.singular}` : `Cadastrar ${config.singular}`} close={closeEditor}><form className="modal-form" onSubmit={save} aria-busy={busy}><div className="form-grid">{config.fields.map(field => <label className={field.type === 'textarea' ? 'wide' : ''} key={field.key}>{field.label}{field.type === 'user' ? <select required={field.required} value={form[field.key] ?? ''} onChange={event => setForm({ ...form, [field.key]: event.target.value })}><option value="">{field.required ? 'Selecione um usuário' : 'Sem vínculo'}</option>{users.map(account => <option value={account.id} key={account.id}>{account.name} · @{account.username}</option>)}</select> : field.type === 'select' ? <select required={field.required} value={form[field.key] ?? ''} onChange={event => setForm({ ...form, [field.key]: event.target.value })}>{field.options?.map(option => <option key={option}>{option}</option>)}</select> : field.type === 'textarea' ? <textarea required={field.required} value={form[field.key] ?? ''} onChange={event => setForm({ ...form, [field.key]: event.target.value })} /> : <input required={field.required} type={field.type || 'text'} min={field.type === 'number' ? 0 : undefined} step={field.step} placeholder={field.placeholder} value={form[field.key] ?? ''} onChange={event => setForm({ ...form, [field.key]: event.target.value })} />}</label>)}</div><div className="modal-actions"><button type="button" className="outline-btn" disabled={busy} onClick={closeEditor}>Cancelar</button><button className="primary-btn" disabled={busy}>{busy ? 'Salvando…' : 'Salvar'}</button></div></form></Modal>}{deleting && <Modal title={`Excluir ${config.singular}?`} close={() => setDeleting(undefined)}><div className="modal-form"><p>O registro <b>{deleting.id}</b> será removido e deixará de aparecer na conta vinculada.</p><div className="modal-actions"><button className="outline-btn" onClick={() => setDeleting(undefined)}>Cancelar</button><button className="primary-btn danger-solid" disabled={busy} onClick={() => void remove()}>{busy ? 'Excluindo…' : 'Confirmar exclusão'}</button></div></div></Modal>}</Page>
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
  const [dailyRuns, setDailyRuns] = useState<Row[]>([])
  const [dailyForm, setDailyForm] = useState({ date: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()), percent: '' })
  const [form, setForm] = useState({ userId: '', amount: '', reason: '' })
  const [ruleForm, setRuleForm] = useState({ name: '', directReferralPercent: String(DIRECT_REFERRAL_BPS / 100), levels: defaultUnilevelText, active: false })
  const [editingRule, setEditingRule] = useState<CommissionRule>()
  const [ruleEditor, setRuleEditor] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => Promise.all([api.get<ApiPage<CommissionRule>>('/admin/commission-rules?pageSize=100'), api.get<ApiPage<Bonus>>('/admin/bonus-entries?pageSize=100'), api.get<ApiPage<User>>('/admin/associates?pageSize=100'), api.get<ApiPage<Row>>('/admin/daily-profitabilities?pageSize=100')]).then(([a, b, c, d]) => { setRules(a.items); setBonuses(b.items); setUsers(c.items); setDailyRuns(d.items); setError('') }).catch(reason => setError(reason.message)), [api])
  useEffect(() => { void load() }, [load])
  useAutoRefresh(load)
  const manual = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(''); setNotice(''); try { await api.post('/admin/bonus-entries/manual-credit', { userId: form.userId, amountCents: Math.round(Number(form.amount) * 100), reason: form.reason }); setForm({ userId: '', amount: '', reason: '' }); setNotice('Crédito criado e enviado para aprovação.'); await load() } catch (reason: any) { setError(reason.message) } finally { setBusy(false) } }
  const scheduleDaily = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(''); setNotice(''); try { await api.post('/admin/daily-profitabilities', { date: dailyForm.date, rateBps: Math.round(Number(dailyForm.percent) * 100) }); setDailyForm({ ...dailyForm, percent: '' }); setNotice('Diário cadastrado. O processamento automático ocorrerá às 09:00, horário de São Paulo.'); await load() } catch (reason: any) { setError(reason.message) } finally { setBusy(false) } }
  const processDaily = async (run: Row) => { setBusy(true); setError(''); setNotice(''); try { const result = await api.post<{ run: Row; earnings: Row[]; bonuses: Row[]; idempotent: boolean }>(`/admin/daily-profitabilities/${run.id}/process`, {}); setNotice(result.idempotent ? 'Este Diário já havia sido processado.' : `Diário processado para ${result.earnings.length} cotistas e ${result.bonuses.filter(item => item.status === 'APPROVED').length} comissões Unilevel.`); await load() } catch (reason: any) { setError(reason.message) } finally { setBusy(false) } }
  const transition = async (entry: Bonus, action: string) => { setBusy(true); setError(''); setNotice(''); try { await api.post(`/admin/bonus-entries/${entry.id}/${action}`, action === 'reverse' ? { reason: 'Estorno administrativo solicitado pelo MASTER' } : {}); setNotice(action === 'approve' ? 'Bônus aprovado e creditado no extrato do usuário.' : action === 'reverse' ? 'Bônus estornado e débito refletido no extrato.' : 'Bônus cancelado.'); await load() } catch (reason: any) { setError(reason.message) } finally { setBusy(false) } }
  const openRule = (rule?: CommissionRule) => { setEditingRule(rule); setRuleForm(rule ? { name: rule.name, directReferralPercent: String((rule.directReferralBps ?? DIRECT_REFERRAL_BPS) / 100), levels: rule.levels.map(item => `${item.level}:${item.bps / 100}`).join(', '), active: rule.active } : { name: 'Indicação direta + Unilevel do Diário', directReferralPercent: String(DIRECT_REFERRAL_BPS / 100), levels: defaultUnilevelText, active: false }); setRuleEditor(true); setError('') }
  const saveRule = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(''); setNotice(''); try { const levels = ruleForm.levels.split(',').map(part => part.trim()).filter(Boolean).map((part, index) => { const [levelText, percentText] = part.includes(':') ? part.split(':') : [String(index + 1), part]; return { level: Number(levelText), bps: Math.round(Number(percentText) * 100) } }); const payload = { name: ruleForm.name, directReferralBps: Math.round(Number(ruleForm.directReferralPercent) * 100), levels, active: ruleForm.active }; if (editingRule) await api.patch(`/admin/commission-rules/${editingRule.id}`, payload); else await api.post('/admin/commission-rules', payload); setRuleEditor(false); setNotice(`Regra ${editingRule ? 'atualizada' : 'criada'} com sucesso.`); await load() } catch (reason: any) { setError(reason.message) } finally { setBusy(false) } }
  const activateRule = async (rule: CommissionRule) => { setBusy(true); setError(''); try { await api.patch(`/admin/commission-rules/${rule.id}`, { active: !rule.active }); setNotice(rule.active ? 'Regra desativada.' : 'Regra ativada como padrão do comissionamento.'); await load() } catch (reason: any) { setError(reason.message) } finally { setBusy(false) } }
  const removeRule = async (rule: CommissionRule) => { setBusy(true); setError(''); try { await api.delete(`/admin/commission-rules/${rule.id}`); setNotice('Regra excluída.'); await load() } catch (reason: any) { setError(reason.message) } finally { setBusy(false) } }
  const eligibleUsers = users.filter(isBonusEligibleParticipant)
  const bonusRows = bonuses.map(entry => ({ ...entry, ownerName: users.find(user => user.id === entry.userId)?.name ?? 'Conta não encontrada' }))
  return <Page title="Comissões e bônus" subtitle="Configure níveis unilevel, confirme lançamentos e acompanhe o crédito de cada usuário." action={<button className="primary-btn" onClick={() => openRule()}><Plus aria-hidden="true" />Nova regra</button>}>
    <ErrorBox error={error} />{notice && <div className="success-box" role="status"><Check aria-hidden="true" />{notice}</div>}
    <form className="form-panel commission-credit-form" onSubmit={scheduleDaily} aria-busy={busy}><h2>Cadastrar Diário</h2><p>Informe o percentual que será aplicado às 09:00 somente sobre cotas financeiras confirmadas. O Plano de Associado de R$ 55,00 não participa do cálculo.</p><div className="form-grid"><label>Data do Diário<input required type="date" value={dailyForm.date} onChange={event => setDailyForm({ ...dailyForm, date: event.target.value })} /></label><label>Percentual sobre as cotas<input required min="0.01" max="100" step="0.01" type="number" inputMode="decimal" value={dailyForm.percent} onChange={event => setDailyForm({ ...dailyForm, percent: event.target.value })} placeholder="Ex.: 1,00" /></label></div><button className="primary-btn" disabled={busy}>Cadastrar Diário</button></form>
    <h2 className="section-title">Histórico do Diário</h2><DataTable rows={dailyRuns} columns={[["date", "DATA", row => new Date(`${row.date}T12:00:00`).toLocaleDateString('pt-BR')], ["rateBps", "PERCENTUAL", row => `${row.rateBps / 100}%`], ["participantCount", "COTISTAS", row => row.participantCount ?? '—'], ["creditedAmountCents", "DIÁRIO CREDITADO", row => row.creditedAmountCents === undefined ? '—' : cents(row.creditedAmountCents)], ["unilevelAmountCents", "UNILEVEL", row => row.unilevelAmountCents === undefined ? '—' : cents(row.unilevelAmountCents)], ["cappedAmountCents", "CORTADO PELO TETO", row => row.cappedAmountCents === undefined ? '—' : cents(row.cappedAmountCents)], ["status", "STATUS", row => status(row.status)]]} action={row => row.status === 'SCHEDULED' ? <button className="outline-btn" disabled={busy} onClick={() => void processDaily(row)}>Processar agora</button> : <span>—</span>} />
    <div className="panel rules-panel"><div className="panel-title"><h2>Regras de comissionamento</h2><span>{rules.length} cadastradas</span></div>{rules.length ? rules.map(rule => <div className="rule-row commission-rule-row" key={rule.id}><span><b>{rule.name}</b><small>Direta: {(rule.directReferralBps ?? DIRECT_REFERRAL_BPS) / 100}% · {rule.levels.map(level => `N${level.level}: ${level.bps / 100}%`).join(' · ')}</small></span>{status(rule.active ? 'ACTIVE' : 'INACTIVE')}<div className="row-actions"><button className="outline-btn" disabled={busy} onClick={() => void activateRule(rule)}>{rule.active ? 'Desativar' : 'Ativar'}</button><button className="icon-btn" aria-label={`Editar regra ${rule.name}`} onClick={() => openRule(rule)}><Pencil aria-hidden="true" /></button><button className="icon-btn danger-icon" aria-label={`Excluir regra ${rule.name}`} disabled={rule.active || busy} onClick={() => void removeRule(rule)}><Trash2 aria-hidden="true" /></button></div></div>) : <div className="empty-panel"><Activity aria-hidden="true" /><h2>Nenhuma regra cadastrada</h2><p>Crie e ative uma regra antes de confirmar investimentos.</p></div>}</div>
    <form className="form-panel commission-credit-form" onSubmit={manual} aria-busy={busy}><h2>Novo crédito manual</h2><p>O valor será lançado como pendente e só entrará no saldo depois da aprovação.</p><div className="form-grid"><label>Participante elegível<select required value={form.userId} onChange={event => setForm({ ...form, userId: event.target.value })}><option value="">Selecione o participante</option>{eligibleUsers.map(user => <option value={user.id} key={user.id}>{user.name}</option>)}</select></label><label>Valor em reais<input required min="0.01" step="0.01" type="number" value={form.amount} onChange={event => setForm({ ...form, amount: event.target.value })} /></label><label className="wide">Justificativa<input required value={form.reason} onChange={event => setForm({ ...form, reason: event.target.value })} /></label></div><button className="primary-btn" disabled={busy}>Criar crédito pendente</button></form>
    <h2 className="section-title">Lançamentos</h2><DataTable rows={bonusRows as Row[]} columns={[["ownerName", "USUÁRIO"], ["type", "TIPO", row => row.type === 'DIRECT_REFERRAL' ? 'Indicação direta sobre compra' : row.type === 'UNILEVEL' ? 'Unilevel legado sobre cotas' : row.type === 'UNILEVEL_PROFITABILITY' ? 'Unilevel sobre o Diário' : row.type], ["level", "NÍVEL", row => row.level ? `N${row.level}` : '—'], ["amountCents", "VALOR", row => cents(row.amountCents)], ["reason", "MOTIVO"], ["status", "STATUS", row => status(row.status)]]} action={row => row.status === 'PENDING' ? <div className="inline-actions"><button disabled={busy} onClick={() => void transition(row as Bonus, 'approve')}>Aprovar</button><button disabled={busy} onClick={() => void transition(row as Bonus, 'cancel')}>Cancelar</button></div> : row.status === 'APPROVED' && row.type !== 'REVERSAL' && row.type !== 'UNILEVEL_PROFITABILITY' ? <button className="outline-btn" disabled={busy} onClick={() => void transition(row as Bonus, 'reverse')}>Estornar</button> : <span>—</span>} />
    {ruleEditor && <Modal title={editingRule ? 'Editar regra de comissão' : 'Nova regra de comissão'} close={() => !busy && setRuleEditor(false)}><form className="modal-form" onSubmit={saveRule} aria-busy={busy}><label>Nome da regra<input required value={ruleForm.name} onChange={event => setRuleForm({ ...ruleForm, name: event.target.value })} /></label><label>Indicação direta sobre as cotas (%)<input required min="0.01" max="100" step="0.01" type="number" value={ruleForm.directReferralPercent} onChange={event => setRuleForm({ ...ruleForm, directReferralPercent: event.target.value })} /></label><label>Níveis e percentuais Unilevel<input required value={ruleForm.levels} onChange={event => setRuleForm({ ...ruleForm, levels: event.target.value })} placeholder={defaultUnilevelText} /><small>Plano atual: {defaultUnilevelText}.</small></label><label className="check"><input type="checkbox" checked={ruleForm.active} onChange={event => setRuleForm({ ...ruleForm, active: event.target.checked })} />Ativar esta regra após salvar</label><div className="modal-actions"><button type="button" className="outline-btn" disabled={busy} onClick={() => setRuleEditor(false)}>Cancelar</button><button className="primary-btn" disabled={busy}>{busy ? 'Salvando…' : 'Salvar regra'}</button></div></form></Modal>}
  </Page>
}

function Audit({ session }: { session: Session }) {
  const api = useApi(session)
  const [rows, setRows] = useState<Row[]>([])
  useEffect(() => { api.get<ApiPage<Row>>('/admin/audit-logs?pageSize=100').then(value => setRows(value.items)) }, [])
  return <Page title="Auditoria administrativa" subtitle="Trilha imutável das decisões sensíveis do MASTER."><DataTable rows={rows} columns={[["createdAt", "DATA", row => new Date(row.createdAt).toLocaleString('pt-BR')], ["action", "AÇÃO"], ["targetType", "TIPO"], ["targetId", "ALVO"], ["details", "DETALHES", row => JSON.stringify(row.details)]]} /></Page>
}

function AdminSettings() {
  return <Page title="Configurações MASTER" subtitle="Parâmetros globais, segurança e manutenção do ambiente."><section className="settings-grid"><div className="panel"><h2>Segurança</h2><div className="toggle-row"><span><b>Autenticação protegida</b><small>Senhas armazenadas com hash criptográfico e sessões privadas</small></span><input type="checkbox" checked readOnly /></div><div className="toggle-row"><span><b>Auditar mudanças financeiras</b><small>Registra autor, data e justificativa</small></span><input type="checkbox" checked readOnly /></div></div><div className="panel"><h2>Ambiente online</h2><p>Cadastros, convites, operações e dados administrativos são armazenados no servidor e compartilhados entre dispositivos autorizados.</p></div></section></Page>
}

function Root() {
  const [session, setSession] = useState<Session | null>(loadSession())
  const [validating, setValidating] = useState(!!loadSession())
  useEffect(() => {
    if (!session) { setValidating(false); return }
    new ApiClient(session.token, () => setSession(null)).get<{ user: User }>('/auth/me').then(({ user }) => { const next = { ...session, user }; saveSession(next); setSession(next) }).catch(() => { clearSession(); setSession(null) }).finally(() => setValidating(false))
  }, [])
  const logout = () => { clearSession(); setSession(null); go('/') }
  const registrationPath = location.pathname === '/cadastro' || location.pathname.startsWith('/convite/')
  if (registrationPath && !session) return <Registration setSession={setSession} />
  if (validating) return <Loader />
  return session ? <Shell session={session} logout={logout} /> : <Login setSession={setSession} />
}

export default function App() { return <Root /> }
