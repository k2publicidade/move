import { Children, createContext, FormEvent, MouseEvent, ReactElement, ReactNode, useContext, useEffect, useState } from 'react'
import {
  Activity, ArrowDownToLine, ArrowRight, ArrowUpRight, Bell, Boxes, BriefcaseBusiness,
  Building2, CalendarDays, CarFront, Check, ChevronDown, ChevronRight, CircleDollarSign,
  Clock3, CloudDownload, CreditCard, FileText, Gauge, GitBranch, Globe2, Headphones,
  HeartHandshake, LayoutDashboard, LifeBuoy, LockKeyhole, LogOut, Menu, Minus, Moon,
  Network, PackageCheck, PanelLeftClose, PlayCircle, Plus, ReceiptText, Search, Send,
  Settings, ShieldCheck, ShoppingBag, ShoppingCart, Sparkles, Sun, TicketCheck, TrendingUp,
  UserRound, UsersRound, Video, WalletCards, Wrench, X, Zap
} from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from 'recharts'
import { demoState, demoUser } from './demoData'

type Item = Record<string, any> & { id: string }
type AppState = {
  invoices: Item[]; orders: Item[]; investments: Item[]; transactions: Item[]
  withdrawals: Item[]; tickets: Item[]; profile: Record<string, any>; cart: Item[]
}

const emptyState: AppState = { invoices: [], orders: [], investments: [], transactions: [], withdrawals: [], tickets: [], profile: {}, cart: [] }
const money = (value: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)

type RouterValue = { pathname: string; go: (path: string, replace?: boolean) => void }
const RouterContext = createContext<RouterValue>({ pathname: '/dashboard', go: () => undefined })
function SimpleRouter({ children }: { children: ReactNode }) {
  const [pathname, setPathname] = useState(window.location.pathname)
  useEffect(() => { const sync = () => setPathname(window.location.pathname); window.addEventListener('popstate', sync); return () => window.removeEventListener('popstate', sync) }, [])
  const go = (path: string, replace = false) => { window.history[replace ? 'replaceState' : 'pushState']({}, '', path); setPathname(path) }
  return <RouterContext.Provider value={{ pathname, go }}>{children}</RouterContext.Provider>
}
function useLocation() { const { pathname } = useContext(RouterContext); return { pathname } }
function NavLink({ to, children, className = '', onClick, title }: { to: string; children: ReactNode; className?: string; onClick?: () => void; title?: string }) {
  const { pathname, go } = useContext(RouterContext)
  const click = (e: MouseEvent<HTMLAnchorElement>) => { if (!e.ctrlKey && !e.metaKey && !e.shiftKey) { e.preventDefault(); go(to); onClick?.() } }
  return <a href={to} onClick={click} className={`${className} ${pathname === to ? 'active' : ''}`.trim()} title={title}>{children}</a>
}
function Navigate({ to, replace = false }: { to: string; replace?: boolean }) { const { go } = useContext(RouterContext); useEffect(() => go(to, replace), [to, replace]); return null }
function Route(_props: { path: string; element: ReactNode }) { return null }
function Routes({ children }: { children: ReactNode }) {
  const { pathname } = useContext(RouterContext)
  const routes = Children.toArray(children) as ReactElement<{ path: string; element: ReactNode }>[]
  return <>{(routes.find(route => route.props.path === pathname) || routes.find(route => route.props.path === '*'))?.props.element}</>
}

const pageMeta: Record<string, { eyebrow: string; title: string; description: string }> = {
  '/dashboard': { eyebrow: 'CENTRO DE COMANDO', title: 'Visão geral', description: 'Sua operação GoMove, clara e em movimento.' },
  '/investments': { eyebrow: 'PORTFÓLIO', title: 'Investimentos', description: 'Ativos de mobilidade que trabalham por você.' },
  '/store': { eyebrow: 'GO STORE', title: 'Loja inteligente', description: 'Equipamentos, serviços e mobilidade em um só lugar.' },
  '/invoices': { eyebrow: 'CONTAS', title: 'Faturas', description: 'Acompanhe vencimentos e pagamentos.' },
  '/orders': { eyebrow: 'COMPRAS', title: 'Pedidos', description: 'Do checkout até a entrega.' },
  '/statement': { eyebrow: 'FINANCEIRO', title: 'Extrato', description: 'Movimentações, rendimentos e despesas.' },
  '/my-investments': { eyebrow: 'FINANCEIRO', title: 'Meus investimentos', description: 'Performance detalhada dos seus ativos.' },
  '/withdraw': { eyebrow: 'FINANCEIRO', title: 'Solicitar saque', description: 'Resgate seguro via PIX ou carteira digital.' },
  '/pay': { eyebrow: 'FINANCEIRO', title: 'Pagar com saldo', description: 'Use seu saldo GoMove para quitar faturas.' },
  '/withdrawals': { eyebrow: 'FINANCEIRO', title: 'Saques', description: 'Histórico e andamento das solicitações.' },
  '/network': { eyebrow: 'ECOSSISTEMA', title: 'Visão da rede', description: 'Conexões que ampliam resultados.' },
  '/referrals': { eyebrow: 'ECOSSISTEMA', title: 'Meus diretos', description: 'Pessoas conectadas diretamente a você.' },
  '/unilevel': { eyebrow: 'ECOSSISTEMA', title: 'Unilevel', description: 'Acompanhe o desempenho por nível.' },
  '/genealogy': { eyebrow: 'ECOSSISTEMA', title: 'Genealogia', description: 'Navegue pela estrutura da sua rede.' },
  '/social': { eyebrow: 'IMPACTO', title: 'Projetos sociais', description: 'Mobilidade que transforma comunidades.' },
  '/downloads': { eyebrow: 'CONTEÚDO', title: 'Downloads', description: 'Materiais oficiais sempre atualizados.' },
  '/videos': { eyebrow: 'CONTEÚDO', title: 'Vídeos', description: 'Conteúdo para dominar a plataforma.' },
  '/tickets': { eyebrow: 'SUPORTE', title: 'Tickets', description: 'Atendimento humano, rastreável e rápido.' },
  '/profile': { eyebrow: 'CONTA', title: 'Perfil e segurança', description: 'Seus dados, acessos e preferências.' },
  '/fleet': { eyebrow: 'OPERAÇÃO', title: 'Minha frota', description: 'Disponibilidade e saúde dos veículos.' }
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand ${compact ? 'brand--compact' : ''}`} aria-label="GoMove — Mobilidade Inteligente">
    <span className="brand-logo-wrap">
      <img className="brand-logo" src="/brand/gomove-logo-oficial.png" alt="GoMove — Mobilidade Inteligente" />
    </span>
  </div>
}

function Login({ onLogin }: { onLogin: (user: any) => void }) {
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('gomove2026')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setLoading(true); setError('')
    try {
      const res = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }) })
      if (!res.headers.get('content-type')?.includes('application/json')) throw new Error('API indisponível')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      localStorage.setItem('gomove-session', JSON.stringify(data.user)); onLogin(data.user)
    } catch (err: any) {
      if ((username === 'admin' || username === 'matheus') && password === 'gomove2026') {
        localStorage.setItem('gomove-session', JSON.stringify(demoUser)); onLogin(demoUser)
      } else {
        setError(err.message === 'API indisponível' ? 'Usuário ou senha inválidos' : err.message || 'Não foi possível entrar')
      }
    }
    finally { setLoading(false) }
  }
  return <main className="login-shell">
    <div className="login-visual">
      <div className="login-glow" />
      <div className="login-copy">
        <span className="eyebrow">PLATAFORMA GOMOVE</span>
        <h1>Inteligência que<br/><em>move resultados.</em></h1>
        <p>Gestão, mobilidade e crescimento em uma experiência conectada.</p>
        <div className="login-proof"><span><ShieldCheck/> Ambiente seguro</span><span><Activity/> Operação em tempo real</span></div>
      </div>
      <div className="login-orbit"><CarFront/><span/><span/></div>
    </div>
    <section className="login-panel">
      <div className="login-form-wrap">
        <Brand />
        <div className="login-heading"><span>ACESSO RESTRITO</span><h2>Bem-vindo de volta.</h2><p>Entre para continuar sua jornada GoMove.</p></div>
        <form onSubmit={submit}>
          <label>Usuário<input value={username} onChange={e=>setUsername(e.target.value)} autoComplete="username" /></label>
          <label>Senha<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" /></label>
          <div className="form-row"><label className="check"><input type="checkbox" defaultChecked /> Manter conectado</label><button type="button" className="link-btn">Esqueci minha senha</button></div>
          {error && <p className="form-error">{error}</p>}
          <button className="primary-btn login-btn" disabled={loading}>{loading ? 'Autenticando...' : <>Entrar na plataforma <ArrowRight/></>}</button>
        </form>
        <p className="demo-note"><Sparkles/> Demonstração: admin / gomove2026</p>
      </div>
    </section>
  </main>
}

const navGroups = [
  { title: 'OPERAÇÃO', items: [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }, { to: '/fleet', label: 'Minha frota', icon: CarFront },
    { to: '/investments', label: 'Investimentos', icon: TrendingUp }, { to: '/store', label: 'Loja GoMove', icon: ShoppingBag },
    { to: '/invoices', label: 'Faturas', icon: ReceiptText }, { to: '/orders', label: 'Pedidos', icon: PackageCheck }
  ]},
  { title: 'FINANCEIRO', items: [
    { to: '/statement', label: 'Extrato', icon: Activity }, { to: '/my-investments', label: 'Meus investimentos', icon: BriefcaseBusiness },
    { to: '/withdraw', label: 'Solicitar saque', icon: ArrowDownToLine }, { to: '/pay', label: 'Pagar com saldo', icon: WalletCards },
    { to: '/withdrawals', label: 'Saques', icon: CreditCard }
  ]},
  { title: 'REDE', items: [
    { to: '/network', label: 'Visão geral', icon: Network }, { to: '/referrals', label: 'Meus diretos', icon: UsersRound },
    { to: '/unilevel', label: 'Unilevel', icon: Boxes }, { to: '/genealogy', label: 'Genealogia', icon: GitBranch }
  ]},
  { title: 'RECURSOS', items: [
    { to: '/social', label: 'Projetos sociais', icon: HeartHandshake }, { to: '/downloads', label: 'Downloads', icon: CloudDownload },
    { to: '/videos', label: 'Vídeos', icon: Video }, { to: '/tickets', label: 'Suporte', icon: LifeBuoy }
  ]}
]

function Sidebar({ collapsed, mobileOpen, onClose }: { collapsed: boolean; mobileOpen: boolean; onClose: () => void }) {
  return <aside className={`sidebar ${collapsed ? 'is-collapsed' : ''} ${mobileOpen ? 'is-mobile-open' : ''}`}>
    <div className="sidebar-top"><Brand compact={collapsed}/><button className="mobile-close" onClick={onClose}><X/></button></div>
    <nav>{navGroups.map(group=><div className="nav-group" key={group.title}><span className="nav-label">{group.title}</span>{group.items.map(item=>{const Icon=item.icon;return <NavLink key={item.to} to={item.to} onClick={onClose} title={collapsed?item.label:undefined}><Icon/><span>{item.label}</span><i/></NavLink>})}</div>)}</nav>
    <NavLink className="sidebar-profile" to="/profile" onClick={onClose}><span className="avatar">MO</span><span><b>Matheus Oliveira</b><small>Administrador</small></span><ChevronRight/></NavLink>
  </aside>
}

function Topbar({ collapsed, setCollapsed, setMobileOpen, user, logout }: any) {
  const [dark, setDark] = useState(true)
  return <header className="topbar">
    <button className="icon-btn desktop-toggle" onClick={()=>setCollapsed(!collapsed)} aria-label="Alternar menu"><PanelLeftClose/></button>
    <button className="icon-btn mobile-menu" onClick={()=>setMobileOpen(true)} aria-label="Abrir menu"><Menu/></button>
    <div className="topbar-spacer" />
    <div className="live-pill"><span/> SISTEMA OPERACIONAL</div>
    <button className="icon-btn" onClick={()=>{setDark(!dark);document.documentElement.classList.toggle('light')}} aria-label="Alternar tema">{dark?<Moon/>:<Sun/>}</button>
    <button className="icon-btn notification" aria-label="Notificações"><Bell/><span>3</span></button>
    <div className="user-chip"><span className="avatar">{user.initials}</span><span><b>{user.name}</b><small>{user.role}</small></span><ChevronDown/></div>
    <button className="icon-btn" onClick={logout} aria-label="Sair"><LogOut/></button>
  </header>
}

function Page({ children, action }: { children: ReactNode; action?: ReactNode }) {
  const location = useLocation(); const meta = pageMeta[location.pathname] || pageMeta['/dashboard']
  return <><div className="page-heading"><div><span className="eyebrow">{meta.eyebrow}</span><h1>{meta.title}</h1><p>{meta.description}</p></div>{action}</div>{children}</>
}

function Metric({ label, value, change, icon: Icon, tone='lime' }: any) {
  return <article className={`metric-card tone-${tone}`}><div className="metric-top"><span>{label}</span><i><Icon/></i></div><strong>{value}</strong><small><TrendingUp/> {change}</small><div className="metric-shine"/></article>
}

const chartData = [
  { month:'Fev', value:18 },{ month:'Mar', value:22 },{ month:'Abr', value:21 },{ month:'Mai', value:28 },{ month:'Jun', value:34 },{ month:'Jul', value:42 }
]

function Dashboard({ state }: { state: AppState }) {
  const totalProfit = state.investments.reduce((a,b)=>a+Number(b.profit||0),0)
  return <Page action={<button className="outline-btn"><CalendarDays/> Jul 2026 <ChevronDown/></button>}>
    <section className="metric-grid">
      <Metric label="LUCRO TOTAL" value={money(totalProfit)} change="+18,4% este mês" icon={CircleDollarSign}/>
      <Metric label="ATIVOS EM OPERAÇÃO" value="12" change="98% disponíveis" icon={CarFront} tone="cyan"/>
      <Metric label="SALDO DISPONÍVEL" value={money(4820.36)} change="+R$ 453,50 em julho" icon={WalletCards} tone="blue"/>
      <Metric label="REDE ATIVA" value="128" change="+14 novos parceiros" icon={UsersRound} tone="orange"/>
    </section>
    <section className="dashboard-grid">
      <article className="panel performance-panel">
        <div className="panel-head"><div><span>PERFORMANCE</span><h2>Evolução de resultados</h2></div><button className="ghost-btn">Últimos 6 meses <ChevronDown/></button></div>
        <div className="chart-summary"><strong>R$ 18.750,00</strong><span>+24,8%</span></div>
        <div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chartData}><defs><linearGradient id="limeArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#b8df00" stopOpacity={.5}/><stop offset="100%" stopColor="#b8df00" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="#ffffff0a" vertical={false}/><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{fill:'#78828d',fontSize:12}}/><Tooltip contentStyle={{background:'#0d151c',border:'1px solid #29343c',borderRadius:12}}/><Area type="monotone" dataKey="value" stroke="#b8df00" strokeWidth={3} fill="url(#limeArea)"/></AreaChart></ResponsiveContainer></div>
      </article>
      <article className="panel fleet-mini">
        <div className="panel-head"><div><span>FROTA</span><h2>Status operacional</h2></div><button className="icon-btn"><ArrowUpRight/></button></div>
        <div className="donut"><div><strong>12</strong><small>veículos</small></div></div>
        <div className="legend"><span><i className="dot lime"/>Em operação <b>9</b></span><span><i className="dot teal"/>Disponíveis <b>2</b></span><span><i className="dot orange"/>Manutenção <b>1</b></span></div>
      </article>
      <article className="panel activity-panel">
        <div className="panel-head"><div><span>AGORA</span><h2>Atividade recente</h2></div><button className="ghost-btn">Ver extrato</button></div>
        <div className="activity-list">{state.transactions.slice(0,4).map(t=><div key={t.id}><i className={t.amount>0?'positive':'negative'}>{t.amount>0?<ArrowDownToLine/>:<ArrowUpRight/>}</i><span><b>{t.description}</b><small>{t.date} · {t.id}</small></span><strong className={t.amount>0?'positive-text':''}>{t.amount>0?'+':''}{money(t.amount)}</strong></div>)}</div>
      </article>
      <article className="panel quick-panel"><div className="panel-head"><div><span>ATALHOS</span><h2>Ações rápidas</h2></div></div><div className="quick-grid"><NavLink to="/withdraw"><ArrowDownToLine/><span>Sacar saldo</span></NavLink><NavLink to="/pay"><WalletCards/><span>Pagar fatura</span></NavLink><NavLink to="/store"><ShoppingBag/><span>Ir à loja</span></NavLink><NavLink to="/tickets"><Headphones/><span>Abrir chamado</span></NavLink></div></article>
    </section>
  </Page>
}

function Status({ children }: { children: ReactNode }) { return <span className={`status status-${String(children).toLowerCase().replaceAll(' ','-').replaceAll('é','e')}`}>{children}</span> }

function DataTable({ columns, rows, search=true }: { columns: {key:string;label:string;render?:(row:any)=>ReactNode}[]; rows:any[]; search?:boolean }) {
  const [query,setQuery]=useState(''); const shown=rows.filter(r=>JSON.stringify(r).toLowerCase().includes(query.toLowerCase()))
  return <div className="table-card">{search&&<div className="table-tools"><div className="search-box"><Search/><input placeholder="Buscar registros..." value={query} onChange={e=>setQuery(e.target.value)}/></div><button className="outline-btn"><Settings/> Filtros</button></div>}<div className="table-scroll"><table><thead><tr>{columns.map(c=><th key={c.key}>{c.label}</th>)}</tr></thead><tbody>{shown.map((row,i)=><tr key={row.id||i}>{columns.map(c=><td key={c.key}>{c.render?c.render(row):row[c.key]}</td>)}</tr>)}</tbody></table></div><div className="table-footer"><span>{shown.length} registros</span><div><button disabled>Anterior</button><b>1</b><button disabled>Próxima</button></div></div></div>
}

const invoiceCols = [
  {key:'status',label:'STATUS',render:(r:any)=><Status>{r.status}</Status>},{key:'id',label:'FATURA'},{key:'due',label:'VENCIMENTO'},
  {key:'description',label:'DESCRIÇÃO'},{key:'amount',label:'VALOR',render:(r:any)=><b>{money(r.amount)}</b>},{key:'remaining',label:'RESTANTE',render:(r:any)=>money(r.remaining)}
]

function Invoices({ state }: { state: AppState }) { return <Page action={<NavLink className="primary-btn" to="/pay"><WalletCards/> Pagar com saldo</NavLink>}><DataTable columns={invoiceCols} rows={state.invoices}/></Page> }
function Orders({ state }: { state: AppState }) { return <Page><DataTable rows={state.orders} columns={[{key:'id',label:'PEDIDO'},{key:'date',label:'DATA'},{key:'description',label:'DESCRIÇÃO'},{key:'quantity',label:'QTD.'},{key:'total',label:'TOTAL',render:r=><b>{money(r.total)}</b>},{key:'status',label:'STATUS',render:r=><Status>{r.status}</Status>}]}/></Page> }
function Statement({ state }: { state: AppState }) { return <Page action={<button className="outline-btn"><CloudDownload/> Exportar CSV</button>}><DataTable rows={state.transactions} columns={[{key:'date',label:'DATA'},{key:'id',label:'ID'},{key:'description',label:'DESCRIÇÃO'},{key:'amount',label:'VALOR',render:r=><b className={r.amount>0?'positive-text':''}>{r.amount>0?'+':''}{money(r.amount)}</b>},{key:'status',label:'TIPO',render:r=><Status>{r.status}</Status>}]}/></Page> }
function MyInvestments({ state }: { state: AppState }) { return <Page><DataTable rows={state.investments} columns={[{key:'id',label:'ATIVO'},{key:'date',label:'INÍCIO'},{key:'pack',label:'PLANO'},{key:'amount',label:'APORTE',render:r=>money(r.amount)},{key:'profit',label:'RENDIMENTO',render:r=><b className="positive-text">+{money(r.profit)}</b>},{key:'days',label:'DIAS'},{key:'status',label:'STATUS',render:r=><Status>{r.status}</Status>}]}/></Page> }

const products = [
  {id:'PROD-01',name:'Capacete Urban Carbon',category:'SEGURANÇA',price:289,icon:ShieldCheck,tag:'Mais vendido'},
  {id:'PROD-02',name:'Scooter GoMove Urban 500',category:'MOBILIDADE',price:7490,icon:Zap,tag:'Lançamento'},
  {id:'PROD-03',name:'Kit Conectividade Smart',category:'TECNOLOGIA',price:449,icon:Activity,tag:'Essencial'},
  {id:'PROD-04',name:'Revisão Performance',category:'SERVIÇO',price:349,icon:Wrench,tag:'Oficina GoMove'},
  {id:'PROD-05',name:'Baú Cargo Pro 48L',category:'ACESSÓRIO',price:689,icon:Boxes,tag:'Entrega rápida'},
  {id:'PROD-06',name:'Training: Gestão de Frota',category:'CONHECIMENTO',price:149,icon:PlayCircle,tag:'100% online'}
]

function Store({ state, refresh }: { state: AppState; refresh:()=>void }) {
  const [cartOpen,setCartOpen]=useState(false)
  const add=async(p:any)=>{await fetch('/api/cart',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:`${p.id}-${Date.now()}`,name:p.name,price:p.price,quantity:1})});refresh();setCartOpen(true)}
  const total=state.cart.reduce((a,b)=>a+b.price*b.quantity,0)
  return <Page action={<button className="primary-btn" onClick={()=>setCartOpen(true)}><ShoppingCart/> Carrinho <span className="btn-badge">{state.cart.length}</span></button>}>
    <div className="store-hero"><div><span>GO DAYS · EDIÇÃO URBANA</span><h2>Seu próximo movimento<br/>começa aqui.</h2><p>Equipamentos selecionados para uma operação mais segura, conectada e eficiente.</p><button className="light-btn">Explorar destaques <ArrowRight/></button></div><div className="hero-scooter"><Zap/><span>ELÉTRICA</span></div></div>
    <div className="product-grid">{products.map(p=>{const Icon=p.icon;return <article className="product-card" key={p.id}><div className="product-visual"><span>{p.tag}</span><Icon/></div><small>{p.category}</small><h3>{p.name}</h3><div><strong>{money(p.price)}</strong><button onClick={()=>add(p)} aria-label={`Adicionar ${p.name}`}><Plus/></button></div></article>})}</div>
    {cartOpen&&<div className="drawer-backdrop" onClick={()=>setCartOpen(false)}><aside className="cart-drawer" onClick={e=>e.stopPropagation()}><div className="drawer-head"><div><span>SEU CARRINHO</span><h2>{state.cart.length} itens selecionados</h2></div><button className="icon-btn" onClick={()=>setCartOpen(false)}><X/></button></div><div className="cart-items">{state.cart.map(i=><div key={i.id}><span className="cart-thumb"><ShoppingBag/></span><span><b>{i.name}</b><small>Qtd. {i.quantity}</small></span><strong>{money(i.price*i.quantity)}</strong></div>)}</div><div className="address-mini"><MapPinIcon/><span><b>Entrega para</b><small>Rua 1500, 820 · Balneário Camboriú</small></span><button>Alterar</button></div><div className="cart-total"><span>Subtotal <b>{money(total)}</b></span><span>Entrega <b className="positive-text">Grátis</b></span><strong>Total <b>{money(total)}</b></strong></div><button className="primary-btn checkout-btn" onClick={()=>alert('Checkout criado com sucesso!')}>Ir para checkout <ArrowRight/></button></aside></div>}
  </Page>
}

function MapPinIcon(){return <Globe2/>}

const plans=[
  {name:'URBAN START',value:5000,return:'1,1% a.m.',vehicles:'Cota de scooter',accent:false},
  {name:'PERFORMANCE',value:8500,return:'1,35% a.m.',vehicles:'Scooter conectada',accent:true},
  {name:'FROTA PRIME',value:15000,return:'1,6% a.m.',vehicles:'Cota multiveículo',accent:false}
]
function Investments({ state, refresh }: {state:AppState;refresh:()=>void}){
  const invest=async(p:any)=>{await fetch('/api/investments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date:new Date().toLocaleDateString('pt-BR'),pack:p.name,amount:p.value,profit:0,days:0,status:'Em análise'})});await refresh();alert('Solicitação de investimento criada.')}
  return <Page><div className="investment-summary"><span><small>TOTAL INVESTIDO</small><strong>{money(state.investments.reduce((a,b)=>a+b.amount,0))}</strong></span><span><small>RENDIMENTOS</small><strong className="positive-text">+{money(state.investments.reduce((a,b)=>a+b.profit,0))}</strong></span><span><small>ATIVOS</small><strong>{state.investments.length}</strong></span></div><div className="plan-grid">{plans.map(p=><article className={`plan-card ${p.accent?'featured':''}`} key={p.name}>{p.accent&&<span className="recommended">MAIS ESCOLHIDO</span>}<div className="plan-icon"><CarFront/></div><small>PLANO</small><h2>{p.name}</h2><strong>A partir de {money(p.value)}</strong><ul><li><Check/> {p.vehicles}</li><li><Check/> Retorno estimado de {p.return}</li><li><Check/> Gestão e manutenção inclusas</li><li><Check/> Painel de performance</li></ul><button className={p.accent?'primary-btn':'outline-btn'} onClick={()=>invest(p)}>Quero investir <ArrowRight/></button><small className="risk-note">Rentabilidade estimada. Consulte os termos.</small></article>)}</div></Page>
}

function Fleet(){const vehicles=[{name:'Scooter Urban GM-0421',type:'Elétrica · 500W',battery:86,status:'Em operação',next:'12 dias'},{name:'Scooter Cargo GM-0388',type:'Elétrica · 800W',battery:62,status:'Disponível',next:'4 dias'},{name:'BYD Yuan GM-0104',type:'Elétrico · 204cv',battery:74,status:'Em operação',next:'28 dias'},{name:'Scooter Urban GM-0297',type:'Elétrica · 500W',battery:18,status:'Manutenção',next:'Hoje'}];return <Page action={<button className="primary-btn"><Plus/> Novo veículo</button>}><div className="fleet-toolbar"><div className="search-box"><Search/><input placeholder="Buscar placa, modelo ou ID..."/></div><div className="fleet-filters"><button className="active">Todos <b>12</b></button><button>Operação <b>9</b></button><button>Disponíveis <b>2</b></button><button>Manutenção <b>1</b></button></div></div><div className="vehicle-grid">{vehicles.map((v,i)=><article className="vehicle-card" key={v.name}><div className="vehicle-visual"><span>GM / 0{i+1}</span>{i===2?<CarFront/>:<Zap/>}<Status>{v.status}</Status></div><h3>{v.name}</h3><p>{v.type}</p><div className="battery-row"><span><Zap/> Bateria</span><b>{v.battery}%</b></div><div className="progress"><i style={{width:`${v.battery}%`}}/></div><div className="vehicle-meta"><span><Gauge/> 1.284 km</span><span><Wrench/> {v.next}</span></div><button className="outline-btn">Ver detalhes <ArrowRight/></button></article>)}</div></Page>}

function FinancialForm({type,state,refresh}:{type:'withdraw'|'pay';state:AppState;refresh:()=>void}){
  const [method,setMethod]=useState('PIX');const [amount,setAmount]=useState('500');const [invoice,setInvoice]=useState(state.invoices.find(i=>i.status==='Pendente')?.id||'')
  const submit=async(e:FormEvent)=>{e.preventDefault();if(type==='withdraw'){await fetch('/api/withdrawals',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date:new Date().toLocaleDateString('pt-BR'),amount:Number(amount),method,account:'Conta cadastrada',paidAt:'—',status:'Em análise'})})}else if(invoice){await fetch(`/api/invoices/${invoice}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:'Pago',remaining:0})})}await refresh();alert(type==='withdraw'?'Saque solicitado com segurança.':'Fatura paga com sucesso.')}
  return <Page><form className="form-panel" onSubmit={submit}><div className="form-panel-head"><span className="form-icon">{type==='withdraw'?<ArrowDownToLine/>:<WalletCards/>}</span><div><h2>{type==='withdraw'?'Dados da solicitação':'Pagar fatura com saldo'}</h2><p>{type==='withdraw'?'O processamento ocorre em até 2 dias úteis.':'Saldo disponível: R$ 4.820,36'}</p></div></div>{type==='withdraw'?<><div className="segmented"><button type="button" className={method==='PIX'?'active':''} onClick={()=>setMethod('PIX')}>PIX</button><button type="button" className={method==='USDT'?'active':''} onClick={()=>setMethod('USDT')}>USDT</button><button type="button" className={method==='USDC'?'active':''} onClick={()=>setMethod('USDC')}>USDC</button></div><div className="form-grid"><label>Tipo do saldo<select><option>Saldo de rendimentos</option><option>Saldo de bônus</option></select></label><label>Valor do saque<input type="number" value={amount} onChange={e=>setAmount(e.target.value)}/></label><label>{method==='PIX'?'Chave PIX':'Endereço da carteira'}<input defaultValue={method==='PIX'?'***.982.***-**':'0x8a...c42'} /></label><label>Senha financeira<input type="password" defaultValue="123456" /></label><label className="wide">Código 2FA<input placeholder="000 000" /></label></div></>:<div className="form-grid"><label className="wide">Fatura<select value={invoice} onChange={e=>setInvoice(e.target.value)}>{state.invoices.filter(i=>i.status==='Pendente').map(i=><option value={i.id} key={i.id}>{i.id} — {i.description} — {money(i.remaining)}</option>)}</select></label><label>Saldo a utilizar<select><option>Saldo disponível</option><option>Saldo de bônus</option></select></label><label>Senha financeira<input type="password" defaultValue="123456"/></label></div>}<label className="check consent"><input type="checkbox" required/> Confirmo que os dados estão corretos e autorizo esta operação.</label><button className="primary-btn submit-btn">{type==='withdraw'?'Confirmar solicitação':'Confirmar pagamento'} <ShieldCheck/></button></form></Page>
}

function NetworkPages({type}:{type:'overview'|'referrals'|'unilevel'|'genealogy'}){
 const people=[{name:'Camila Martins',user:'camilam',level:'Nível 1',volume:12840,status:'Ativo'},{name:'Rafael Costa',user:'rafaelc',level:'Nível 1',volume:9200,status:'Ativo'},{name:'Bruno Azevedo',user:'brunoa',level:'Nível 2',volume:7150,status:'Ativo'},{name:'Lívia Santos',user:'livias',level:'Nível 2',volume:4780,status:'Pendente'}]
 if(type==='overview')return <Page><section className="metric-grid network-metrics"><Metric label="PARCEIROS DIRETOS" value="14" change="+3 este mês" icon={UsersRound}/><Metric label="TOTAL NA REDE" value="128" change="4 níveis ativos" icon={Network} tone="cyan"/><Metric label="VOLUME DA REDE" value="R$ 84,2 mil" change="+12,8%" icon={TrendingUp} tone="blue"/><Metric label="BÔNUS ACUMULADO" value="R$ 3.420" change="+R$ 284 em julho" icon={CircleDollarSign} tone="orange"/></section><div className="referral-banner"><div><span>SEU LINK DE INDICAÇÃO</span><strong>gomove.com.br/convite/matheus01</strong></div><button className="primary-btn" onClick={()=>navigator.clipboard.writeText('gomove.com.br/convite/matheus01')}>Copiar link <Send/></button></div><DataTable rows={people} columns={[{key:'name',label:'PARCEIRO'},{key:'user',label:'USUÁRIO'},{key:'level',label:'NÍVEL'},{key:'volume',label:'VOLUME',render:r=>money(r.volume)},{key:'status',label:'STATUS',render:r=><Status>{r.status}</Status>}]}/></Page>
 if(type==='genealogy')return <Page action={<div className="tree-tools"><button>−</button><button>100%</button><button>+</button></div>}><div className="tree-panel"><div className="tree-search"><Search/><input placeholder="Buscar por usuário..."/><button className="primary-btn">Pesquisar</button></div><div className="tree"><div className="tree-root person-node"><span>MO</span><b>Matheus</b><small>Você · Prime</small></div><div className="tree-line vertical"/><div className="tree-level">{people.slice(0,3).map((p,i)=><div className="person-branch" key={p.user}><div className="tree-line branch"/><div className="person-node"><span>{p.name.split(' ').map((n:string)=>n[0]).join('').slice(0,2)}</span><b>{p.name}</b><small>{i+3} parceiros</small></div></div>)}</div></div><div className="tree-legend"><span><i className="dot lime"/>Ativo</span><span><i className="dot orange"/>Pendente</span><span><i className="dot teal"/>Você</span></div></div></Page>
 return <Page><DataTable rows={type==='referrals'?people.slice(0,2):people} columns={[{key:'level',label:'NÍVEL'},{key:'name',label:'NOME'},{key:'user',label:'USUÁRIO'},{key:'volume',label:'INVESTIMENTO TOTAL',render:r=>money(r.volume)},{key:'status',label:'STATUS',render:r=><Status>{r.status}</Status>}]}/></Page>
}

function Social(){return <Page><div className="impact-hero"><div><span>MOVIMENTO QUE TRANSFORMA</span><h2>Cada quilômetro pode<br/>mudar um destino.</h2><p>Parte do ecossistema GoMove financia acesso à mobilidade, capacitação e oportunidades.</p><button className="light-btn">Conhecer o impacto <ArrowRight/></button></div><HeartHandshake/></div><div className="project-grid">{[{t:'Rodas do Futuro',p:'Capacitação de jovens para manutenção de veículos elétricos.',n:'284 jovens'},{t:'Move Verde',p:'Compensação e reflorestamento ligados à frota GoMove.',n:'12,8 ton CO₂'},{t:'Elas em Movimento',p:'Formação e mobilidade para mulheres empreendedoras.',n:'146 mulheres'}].map(x=><article key={x.t}><span><HeartHandshake/></span><h3>{x.t}</h3><p>{x.p}</p><strong>{x.n}</strong><small>IMPACTO ATÉ AGORA</small></article>)}</div></Page>}

function Resources({type}:{type:'downloads'|'videos'}){const items=type==='downloads'?[{t:'Apresentação GoMove',s:'PDF · Português',i:FileText},{t:'Manual da plataforma',s:'PDF · 4,8 MB',i:FileText},{t:'Guia de identidade',s:'ZIP · 18 MB',i:CloudDownload},{t:'Perguntas frequentes',s:'PDF · Atualizado',i:FileText}]:[{t:'Conheça a GoMove',s:'Institucional · 03:42',i:PlayCircle},{t:'Primeiros passos',s:'Tutorial · 08:15',i:PlayCircle},{t:'Como acompanhar sua frota',s:'Academy · 12:40',i:PlayCircle}];return <Page><div className="resource-grid">{items.map(({t,s,i:Icon})=><article key={t}><div className="resource-icon"><Icon/></div><div><h3>{t}</h3><p>{s}</p></div><button className="icon-btn">{type==='downloads'?<ArrowDownToLine/>:<PlayCircle/>}</button></article>)}</div></Page>}

function Tickets({state,refresh}:{state:AppState;refresh:()=>void}){const [open,setOpen]=useState(false);const [subject,setSubject]=useState('');const submit=async(e:FormEvent)=>{e.preventDefault();await fetch('/api/tickets',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date:new Date().toLocaleDateString('pt-BR'),department:'Atendimento',category:'Dúvida',subject,priority:'Média',status:'Aberto'})});setOpen(false);setSubject('');refresh()};return <Page action={<button className="primary-btn" onClick={()=>setOpen(true)}><Plus/> Novo ticket</button>}><div className="support-banner"><span><Headphones/></span><div><h2>Como podemos ajudar?</h2><p>Tempo médio de primeira resposta: <b>18 minutos</b></p></div><span className="online-badge"><i/> EQUIPE ONLINE</span></div><DataTable rows={state.tickets} columns={[{key:'date',label:'DATA'},{key:'id',label:'TICKET'},{key:'department',label:'DEPARTAMENTO'},{key:'subject',label:'ASSUNTO'},{key:'priority',label:'PRIORIDADE'},{key:'status',label:'STATUS',render:r=><Status>{r.status}</Status>}]}/>{open&&<Modal title="Novo ticket" close={()=>setOpen(false)}><form onSubmit={submit} className="modal-form"><label>Assunto<input value={subject} onChange={e=>setSubject(e.target.value)} required placeholder="Como podemos ajudar?"/></label><label>Departamento<select><option>Atendimento</option><option>Financeiro</option><option>Operações</option></select></label><label>Mensagem<textarea rows={5} placeholder="Descreva sua solicitação com detalhes..."/></label><button className="primary-btn">Enviar ticket <Send/></button></form></Modal>}</Page>}

function Modal({title,close,children}:{title:string;close:()=>void;children:ReactNode}){return <div className="modal-backdrop" onClick={close}><div className="modal" onClick={e=>e.stopPropagation()}><div className="modal-head"><h2>{title}</h2><button className="icon-btn" onClick={close}><X/></button></div>{children}</div></div>}

function Profile({state,refresh}:{state:AppState;refresh:()=>void}){const [form,setForm]=useState(state.profile);useEffect(()=>setForm(state.profile),[state.profile]);const save=async(e:FormEvent)=>{e.preventDefault();await fetch('/api/profile',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)});refresh();alert('Perfil atualizado.')};return <Page><div className="profile-layout"><aside className="profile-card"><div className="profile-avatar">MO<span><Check/></span></div><h2>{form.name}</h2><p>{form.email}</p><Status>Ativo</Status><div><span><small>MEMBRO DESDE</small><b>Janeiro de 2026</b></span><span><small>NÍVEL</small><b>GoMove Prime</b></span></div></aside><form className="profile-form" onSubmit={save}><section><div className="section-title"><UserRound/><span><h2>Dados pessoais</h2><p>Informações usadas na sua conta.</p></span></div><div className="form-grid"><label>Nome completo<input value={form.name||''} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>E-mail<input value={form.email||''} onChange={e=>setForm({...form,email:e.target.value})}/></label><label>Celular<input value={form.phone||''} onChange={e=>setForm({...form,phone:e.target.value})}/></label><label>Idioma<select value={form.language||'Português'} onChange={e=>setForm({...form,language:e.target.value})}><option>Português</option><option>English</option><option>Español</option></select></label></div></section><section><div className="section-title"><LockKeyhole/><span><h2>Segurança em duas etapas</h2><p>Proteção extra para ações sensíveis.</p></span></div><div className="security-options"><label><span><b>Exigir 2FA no login</b><small>Validação sempre que entrar.</small></span><input type="checkbox" checked={!!form.twoFactorLogin} onChange={e=>setForm({...form,twoFactorLogin:e.target.checked})}/></label><label><span><b>Exigir 2FA em saques</b><small>Protege suas retiradas.</small></span><input type="checkbox" checked={!!form.twoFactorWithdraw} onChange={e=>setForm({...form,twoFactorWithdraw:e.target.checked})}/></label></div></section><button className="primary-btn submit-btn">Salvar alterações <Check/></button></form></div></Page>}

function Withdrawals({state}:{state:AppState}){return <Page><DataTable rows={state.withdrawals} columns={[{key:'date',label:'SOLICITAÇÃO'},{key:'id',label:'ID'},{key:'amount',label:'VALOR',render:r=>money(r.amount)},{key:'method',label:'MÉTODO'},{key:'account',label:'CONTA'},{key:'paidAt',label:'PAGAMENTO'},{key:'status',label:'STATUS',render:r=><Status>{r.status}</Status>}]}/></Page>}

function AppShell({user,onLogout}:{user:any;onLogout:()=>void}){
 const [collapsed,setCollapsed]=useState(false),[mobileOpen,setMobileOpen]=useState(false),[state,setState]=useState<AppState>(emptyState),[loading,setLoading]=useState(true)
 const refresh=async()=>{try{const res=await fetch('/api/state');if(!res.ok||!res.headers.get('content-type')?.includes('application/json'))throw new Error('API indisponível');setState(await res.json())}catch{setState(demoState as AppState)}finally{setLoading(false)}}
 useEffect(()=>{refresh()},[])
 if(loading)return <div className="loading-screen"><Brand/><div className="loader"><span/></div><p>Preparando sua experiência...</p></div>
 return <div className={`app-shell ${collapsed?'sidebar-collapsed':''}`}><Sidebar collapsed={collapsed} mobileOpen={mobileOpen} onClose={()=>setMobileOpen(false)}/><div className="app-main"><Topbar collapsed={collapsed} setCollapsed={setCollapsed} setMobileOpen={setMobileOpen} user={user} logout={onLogout}/><main className="page-content"><Routes><Route path="/dashboard" element={<Dashboard state={state}/>}/><Route path="/fleet" element={<Fleet/>}/><Route path="/investments" element={<Investments state={state} refresh={refresh}/>}/><Route path="/store" element={<Store state={state} refresh={refresh}/>}/><Route path="/invoices" element={<Invoices state={state}/>}/><Route path="/orders" element={<Orders state={state}/>}/><Route path="/statement" element={<Statement state={state}/>}/><Route path="/my-investments" element={<MyInvestments state={state}/>}/><Route path="/withdraw" element={<FinancialForm type="withdraw" state={state} refresh={refresh}/>}/><Route path="/pay" element={<FinancialForm type="pay" state={state} refresh={refresh}/>}/><Route path="/withdrawals" element={<Withdrawals state={state}/>}/><Route path="/network" element={<NetworkPages type="overview"/>}/><Route path="/referrals" element={<NetworkPages type="referrals"/>}/><Route path="/unilevel" element={<NetworkPages type="unilevel"/>}/><Route path="/genealogy" element={<NetworkPages type="genealogy"/>}/><Route path="/social" element={<Social/>}/><Route path="/downloads" element={<Resources type="downloads"/>}/><Route path="/videos" element={<Resources type="videos"/>}/><Route path="/tickets" element={<Tickets state={state} refresh={refresh}/>}/><Route path="/profile" element={<Profile state={state} refresh={refresh}/>}/><Route path="*" element={<Navigate to="/dashboard" replace/>}/></Routes></main></div>{mobileOpen&&<div className="mobile-overlay" onClick={()=>setMobileOpen(false)}/>}</div>
}

function Root(){const [user,setUser]=useState<any>(()=>{try{return JSON.parse(localStorage.getItem('gomove-session')||'null')}catch{return null}});const logout=()=>{localStorage.removeItem('gomove-session');setUser(null)};return user?<AppShell user={user} onLogout={logout}/>:<Login onLogin={setUser}/>}
export default function App(){return <SimpleRouter><Root/></SimpleRouter>}
