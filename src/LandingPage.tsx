import React, { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowRight, ArrowUpRight, Menu, X } from 'lucide-react'
import { ASSOCIATE_PLAN_PRICE_CENTS, ASSOCIATE_BONUS_CAP_CENTS, SHAREHOLDER_MIN_QUOTA_CENTS, ASSOCIATE_UPGRADE_MIN_QUOTA_CENTS, SHAREHOLDER_TOTAL_CAP_BPS, DIRECT_REFERRAL_BPS, UNILEVEL_LEVELS } from './businessPlan'
const money = (cents: number) => `R$ ${(cents / 100).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`

const presentation = '/brand/institucional/GoMove-Apresentacao.pdf'
const navigation = [['Operações', '#gm-operacoes'], ['A GoMove', '#gm-empresa'], ['Participação', '#gm-participacao'], ['Dúvidas', '#gm-duvidas']] as const
const operations = [
  ['01', 'Mobilidade', 'O seu próximo caminho.', 'Compra, venda e locação de veículos para motoristas de aplicativo. Soluções de curta e média duração para colocar a rotina em movimento.'],
  ['02', 'Turismo', 'O litoral no seu ritmo.', 'Locação de carros na alta temporada em Balneário Camboriú, Itapema e no litoral de Santa Catarina. Mobilidade para aproveitar a viagem.'],
  ['03', 'E-mobility', 'Outra energia para a cidade.', 'Venda e locação de scooters elétricas. Economia e praticidade para os deslocamentos urbanos.'],
  ['04', 'Infra', 'Espaço para novas possibilidades.', 'Estruturas para eventos, moradia modular e soluções em contêineres. Cada projeto depende de viabilidade técnica e legal.'],
] as const

function Action({ href, children, secondary = false }: { href: string; children: React.ReactNode; secondary?: boolean }) {
  return <a className={`gm-button${secondary ? ' gm-button--outline' : ''}`} href={href}>{children}<ArrowUpRight aria-hidden="true" /></a>
}

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButton = useRef<HTMLButtonElement>(null)
  const site = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setMenuOpen(false); menuButton.current?.focus() }
    }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [menuOpen])

  useEffect(() => {
    const root = site.current
    if (!root || !('IntersectionObserver' in window)) return
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    if (reduced.matches) return
    let observer: IntersectionObserver | undefined
    const revealAll = () => { root.classList.remove('gm-observer-ready'); observer?.disconnect() }
    try {
      observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) { entry.target.classList.add('gm-visible'); observer?.unobserve(entry.target) }
        })
      }, { threshold: 0.08 })
      root.querySelectorAll('[data-gm-reveal]').forEach(element => observer?.observe(element))
      root.classList.add('gm-observer-ready')
      reduced.addEventListener('change', revealAll)
    } catch { revealAll() }
    return () => { revealAll(); reduced.removeEventListener('change', revealAll) }
  }, [])

  return <div className="gm-site" ref={site}>
    <a className="gm-skip" href="#gm-conteudo">Pular para o conteúdo</a>
    <header className="gm-header">
      <div className="gm-container gm-header-inner">
        <a className="gm-logo" href="#gm-inicio" aria-label="GoMove — início"><img src="/brand/gomove-logo-oficial.png" width="802" height="259" alt="GoMove" /></a>
        <nav className="gm-desktop-nav" aria-label="Navegação principal">{navigation.map(([label, href]) => <a key={href} href={href}>{label}</a>)}</nav>
        <a className="gm-portal-link" href="/login">Acessar portal <ArrowUpRight aria-hidden="true" /></a>
        <button className="gm-menu-button" ref={menuButton} type="button" aria-expanded={menuOpen} aria-controls="gm-mobile-nav" aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}</button>
      </div>
      <nav id="gm-mobile-nav" className="gm-mobile-nav" aria-label="Navegação móvel" hidden={!menuOpen}>{navigation.map(([label, href]) => <a key={href} href={href} onClick={() => { setMenuOpen(false); menuButton.current?.focus() }}>{label}<ArrowRight aria-hidden="true" /></a>)}<a href="/login">Acessar portal<ArrowUpRight aria-hidden="true" /></a><a href="/cadastro">Fazer cadastro<ArrowUpRight aria-hidden="true" /></a></nav>
    </header>
    <main id="gm-conteudo" tabIndex={-1}>
      <section className="gm-hero gm-container" id="gm-inicio" aria-labelledby="gm-hero-title">
        <div className="gm-hero-copy"><p className="gm-kicker">GoMove / Locações e infraestruturas</p><h1 id="gm-hero-title">Movendo pessoas.<br /><span>Estruturando<br className="gm-desktop-break" /> oportunidades.</span></h1><p className="gm-hero-description">Da mobilidade aos novos espaços. Conectamos veículos, estruturas e pessoas a possibilidades reais de operação.</p><div className="gm-actions"><Action href="/cadastro">Faça parte desse movimento</Action><a className="gm-text-link" href="#gm-operacoes">Conheça a GoMove <ArrowDown aria-hidden="true" /></a></div></div>
        <figure className="gm-hero-figure"><img src="/brand/institucional/hero.webp" width="1050" height="636" fetchPriority="high" alt="Representação conceitual da GoMove com prédio, carros e scooter elétrica" /><figcaption>Imagem conceitual • visão de mobilidade e infraestrutura</figcaption></figure>
        <div className="gm-hero-bottom"><span>Mobilidade. Turismo. E-mobility. Infra.</span><span>Uma operação. Diferentes caminhos.</span></div>
      </section>
      <section className="gm-section gm-cream" id="gm-operacoes" aria-labelledby="gm-operations-title"><div className="gm-container">
        <div className="gm-section-heading" data-gm-reveal><p className="gm-kicker">01 / O que nos move</p><h2 id="gm-operations-title">Quatro frentes.<br />Um olhar conectado.</h2><p>Locações e infraestruturas que respondem a diferentes necessidades, da rotina urbana a novos espaços de uso.</p></div>
        <div className="gm-operation-list">{operations.map(([number, title, headline, description]) => <article className="gm-operation" key={title} data-gm-reveal><span className="gm-index">{number}</span><h3>{title}</h3><div><h4>{headline}</h4><p>{description}</p></div><ArrowUpRight aria-hidden="true" /></article>)}</div>
      </div></section>
      <section className="gm-section gm-infra" id="gm-infra" aria-labelledby="gm-infra-title"><div className="gm-container gm-split">
        <div data-gm-reveal><p className="gm-kicker">02 / Infraestrutura</p><h2 id="gm-infra-title">A próxima estrutura<br />começa com uma ideia.</h2><p>Um lugar para morar, receber ou empreender. Exploramos estruturas modulares e contêineres para transformar necessidades em espaços.</p><div className="gm-tags"><span>Moradia</span><span>Eventos</span><span>Comercial</span></div><p className="gm-small">Implantação sujeita à viabilidade técnica, às condições do local e às exigências legais de cada projeto.</p><a className="gm-text-link" href="/cadastro">Converse sobre sua ideia <ArrowUpRight aria-hidden="true" /></a></div>
        <figure data-gm-reveal><img src="/brand/institucional/infra.webp" width="554" height="238" loading="lazy" alt="Estudo conceitual de estrutura modular em contêineres" /><figcaption>Imagem conceitual • não representa empreendimento entregue</figcaption></figure>
      </div></section>
      <section className="gm-section gm-lime" id="gm-empresa" aria-labelledby="gm-company-title"><div className="gm-container gm-company" data-gm-reveal><p className="gm-kicker">03 / A GoMove</p><h2 id="gm-company-title">Atuação local.<br />Visão de expansão.</h2><div><p className="gm-lead">Conectar mobilidade, turismo, eventos e habitação em uma operação que cria continuidade.</p><p>A GoMove trabalha com gestão de ativos, parcerias e visão de expansão. Os serviços recorrentes aproximam diferentes frentes de negócio, com foco nas necessidades de cada operação.</p><a className="gm-text-link" href={presentation} target="_blank" rel="noopener noreferrer">Conheça a apresentação institucional (PDF) <ArrowUpRight aria-hidden="true" /></a></div></div></section>
      <section className="gm-section gm-leadership" aria-labelledby="gm-leadership-title"><div className="gm-container gm-leadership-layout"><figure data-gm-reveal><img src="/brand/institucional/matheus.webp" width="580" height="584" loading="lazy" alt="Matheus Soares, CEO da GoMove" /></figure><div data-gm-reveal><p className="gm-kicker">04 / Liderança</p><h2 id="gm-leadership-title">Uma visão de negócio.<br />Uma gestão presente.</h2><h3>Matheus Soares</h3><span className="gm-role">CEO / GoMove</span><p>Mais de três anos de experiência em locações e infraestrutura. Especialista em locação de veículos, Matheus conduz a visão de conectar ativos, serviços e novas possibilidades de operação.</p></div></div></section>
      <Participation />
      <section className="gm-section gm-cream" id="gm-duvidas" aria-labelledby="gm-faq-title"><div className="gm-container gm-faq-layout"><div><p className="gm-kicker">07 / Perguntas frequentes</p><h2 id="gm-faq-title">Clareza antes<br />do próximo passo.</h2><p>Consulte a apresentação e as condições contratuais antes de decidir.</p></div><div className="gm-faq">
        <details><summary>Em quais áreas a GoMove atua?</summary><p>Mobilidade, turismo, e-mobility e infraestrutura. A operação conecta locação de veículos, scooters elétricas, estruturas para eventos e soluções modulares, conforme a disponibilidade e a viabilidade de cada projeto.</p></details>
        <details><summary>O Associado recebe resultado diário?</summary><p>Não. O Associado participa comercialmente por indicações; não recebe resultado diário de cota. A adesão ao plano não gera bônus de rede.</p></details>
        <details><summary>Os resultados do Cotista são garantidos?</summary><p>Não. Os resultados são variáveis e dependem da operação e da apuração. Não há garantia de retorno fixo nem prazo garantido. O teto contratual é um limite, não uma promessa de ganho.</p></details>
        <details><summary>Onde consultar todas as condições?</summary><p>Leia a <a href={presentation} target="_blank" rel="noopener noreferrer">apresentação institucional (PDF)</a> e o contrato aplicável. O cadastro é o caminho para iniciar a conversa; quem já participa pode acessar o portal.</p></details>
      </div></div></section>
      <section className="gm-section gm-conversion" aria-labelledby="gm-conversion-title"><div className="gm-container" data-gm-reveal><p className="gm-kicker">O próximo movimento é seu</p><h2 id="gm-conversion-title">Vamos conectar<br />novas possibilidades?</h2><p>Conheça as modalidades e encontre o caminho que faz sentido para você.</p><div className="gm-actions"><Action href="/cadastro">Iniciar meu cadastro</Action><Action href="/login" secondary>Já participo · acessar portal</Action></div></div></section>
    </main>
    <footer className="gm-footer"><div className="gm-container"><div className="gm-footer-top"><a className="gm-logo" href="#gm-inicio" aria-label="GoMove — voltar ao início"><img src="/brand/gomove-logo-oficial.png" width="802" height="259" alt="GoMove" /></a><p>Movendo pessoas.<br />Estruturando oportunidades.</p><nav aria-label="Links do rodapé">{navigation.map(([label, href]) => <a key={href} href={href}>{label}</a>)}<a href={presentation} target="_blank" rel="noopener noreferrer">Apresentação (PDF)</a><a href="/login">Portal GoMove</a></nav></div><p className="gm-disclaimer">Informações institucionais e comerciais. Participação sujeita à análise e ao contrato aplicável. Resultados variáveis, sem garantia de retorno fixo ou prazo de retorno. Limites e exemplos não constituem promessa de rentabilidade. Imagens de estruturas e da operação são conceituais.</p><div className="gm-footer-bottom"><span>GoMove / Locações e infraestruturas</span><a href="https://www.gomoveinfra.com.br" target="_blank" rel="noopener noreferrer">Site de referência <ArrowUpRight aria-hidden="true" /></a></div></div></footer>
  </div>
}

function Participation() {
  return <>
    <section className="gm-section gm-participation gm-cream" id="gm-participacao" aria-labelledby="gm-participation-title"><div className="gm-container">
      <div className="gm-section-heading" data-gm-reveal><p className="gm-kicker">05 / Participação</p><h2 id="gm-participation-title">Diferentes formas<br />de fazer parte.</h2><p>Atuação comercial, participação na operação ou gestão de veículos. Conheça o que distingue cada caminho.</p></div>
      <div className="gm-modalities">
        <article data-gm-reveal><p className="gm-kicker">Indicação e participação comercial</p><h3>Associado</h3><p className="gm-price">{money(ASSOCIATE_PLAN_PRICE_CENTS)} <span>/ adesão</span></p><p>Participação comercial por indicação. O Associado não recebe resultado diário de cota.</p><ul><li>Teto acumulado de bonificações: {money(ASSOCIATE_BONUS_CAP_CENTS)}.</li><li>Ao atingir o teto, upgrade com cota mínima de {money(ASSOCIATE_UPGRADE_MIN_QUOTA_CENTS)} para continuar conforme as regras.</li><li>A adesão ao plano não gera bônus de rede.</li></ul><Action href="/cadastro" secondary>Conhecer o plano</Action></article>
        <article className="gm-quota" data-gm-reveal><p className="gm-kicker">Participação na operação</p><h3>Cotista / SCP</h3><p className="gm-price"><span>A partir de </span>{money(SHAREHOLDER_MIN_QUOTA_CENTS)}</p><p>Resultados variáveis, com apuração diária conforme a operação e as condições contratuais.</p><ul><li>Direto de {DIRECT_REFERRAL_BPS / 100}% somente sobre cota elegível ativada.</li><li>Unilevel de seis níveis sobre o rendimento, não sobre a compra da cota.</li><li>Teto total de {SHAREHOLDER_TOTAL_CAP_BPS / 100}%, incluindo principal e ganhos de rede.</li></ul><p className="gm-small">Sem garantia de retorno fixo ou prazo de retorno. O teto não é uma promessa de resultado.</p><Action href="/cadastro">Entender a participação</Action></article>
        <article className="gm-third-party" data-gm-reveal><p className="gm-kicker">Ativos em movimento</p><h3>Frota de terceiros</h3><p>Disponibilize veículos para a operação de locação, com gestão, manutenção e acompanhamento conforme contrato.</p><p>As condições de entrada e a remuneração são contratuais, de acordo com o veículo e a operação.</p><a className="gm-text-link" href="/cadastro">Apresentar meu veículo <ArrowUpRight aria-hidden="true" /></a></article>
      </div>
    </div></section>
    <section className="gm-section gm-rules" id="gm-regras" aria-labelledby="gm-rules-title"><div className="gm-container">
      <div className="gm-section-heading" data-gm-reveal><p className="gm-kicker">06 / Como funciona</p><h2 id="gm-rules-title">Regras claras.<br />Carteiras separadas.</h2><p>Entenda a origem de cada crédito e o limite da participação. Os exemplos são explicativos, não uma previsão de ganhos.</p></div>
      <div className="gm-rules-layout">
        <div data-gm-reveal><h3>Indicação direta</h3><p>Uma cota elegível ativada de {money(ASSOCIATE_UPGRADE_MIN_QUOTA_CENTS)} pode gerar {money(ASSOCIATE_UPGRADE_MIN_QUOTA_CENTS * DIRECT_REFERRAL_BPS / 10000)} de bônus direto ({DIRECT_REFERRAL_BPS / 100}%), conforme a elegibilidade e o contrato.</p><div className="gm-direct-example"><span>{money(ASSOCIATE_UPGRADE_MIN_QUOTA_CENTS)}<small>Cota elegível ativada</small></span><ArrowRight aria-hidden="true" /><span>{money(ASSOCIATE_UPGRADE_MIN_QUOTA_CENTS * DIRECT_REFERRAL_BPS / 10000)}<small>Bônus direto</small></span></div><h3>Um limite único para o Cotista</h3><p>O teto total de {SHAREHOLDER_TOTAL_CAP_BPS / 100}% inclui o principal mais os resultados e os ganhos de rede. As carteiras são separadas para acompanhamento, mas não criam limites independentes.</p><div className="gm-wallets"><div><h4>Carteira Cota</h4><p>Resultados da participação na operação.</p></div><div><h4>Carteira Rede</h4><p>Bônus direto e Unilevel.</p></div></div><p className="gm-small">Resultados variáveis. Apuração diária não significa rendimento fixo ou garantido.</p></div>
        <div className="gm-unilevel" data-gm-reveal><h3>Unilevel · seis níveis</h3><p>Percentuais sobre o rendimento apurado da rede, não sobre a compra de cotas, conforme regras de elegibilidade.</p><table><caption>Distribuição por nível sobre o rendimento</caption><thead><tr><th scope="col">Nível</th><th scope="col">Percentual</th></tr></thead><tbody>{UNILEVEL_LEVELS.map(({ level, bps }) => <tr key={level}><th scope="row">{level}º nível</th><td>{bps / 100}%</td></tr>)}</tbody></table></div>
      </div>
      <div className="gm-presentation" data-gm-reveal><div><h3>O panorama completo, em um só lugar.</h3><p>Consulte a apresentação institucional e confirme as condições no contrato aplicável.</p></div><Action href={presentation} secondary>Ver apresentação (PDF)</Action></div>
    </div></section>
  </>
}
