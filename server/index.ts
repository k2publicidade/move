import 'dotenv/config'
import express, { type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { buildNetworkTree, calculateBonuses, createBonusReversal, createRegistration, transitionBonus, validateCommissionLevels, wouldCreateSponsorCycle, type MlmUser } from './mlm.js'
import { CoinPaymentsConfigurationError, createCoinPaymentsInvoice, verifyCoinPaymentsWebhook } from './coinpayments.js'
import { ASSOCIATE_BONUS_CAP_CENTS, ASSOCIATE_PLAN_PRICE_CENTS, SHAREHOLDER_MIN_QUOTA_CENTS, allocateBonusByBusinessPlan, canUpgradeToShareholder, releaseBlockedBonuses, withBusinessPlanDefaults } from '../src/businessPlan.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dataFile = process.env.GOMOVE_DATA_FILE ? path.resolve(process.env.GOMOVE_DATA_FILE) : path.join(root, '.data', 'db.json')
type Item = Record<string, any> & { id: string }
type Db = Record<string, any> & { users: MlmUser[]; commissionRules: Item[]; commissionEvents: Item[]; bonusEntries: any[]; auditLogs: Item[]; investments: Item[]; coinPaymentsWebhookEvents: Item[] }
const now = () => new Date().toISOString()
const hash = (password: string) => { const salt = crypto.randomBytes(16).toString('hex'); return `scrypt$${salt}$${crypto.scryptSync(password, salt, 64).toString('hex')}` }
const verify = (password: string, encoded: string) => { const [, salt, expected] = encoded.split('$'); if (!salt || !expected) return false; const actual = crypto.scryptSync(password, salt, 64).toString('hex'); return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex')) }
const publicUser = (u: MlmUser) => { const { passwordHash, ...safe } = u; return safe }
function seeded(): Db {
 const admin = { id: crypto.randomUUID(), username: 'admin', email: 'admin@gomove.local', name: 'Administrador GoMove', passwordHash: hash('gomove2026'), role: 'ADMIN_MASTER' as const, status: 'ACTIVE' as const, sponsorId: null, inviteCode: 'admin01' }
 const matheus = { id: crypto.randomUUID(), username: 'matheus', email: 'matheus@gomove.com.br', name: 'Matheus Oliveira', passwordHash: hash('gomove2026'), role: 'ASSOCIATE' as const, status: 'ACTIVE' as const, sponsorId: admin.id, inviteCode: 'matheus01', membershipType: 'SHAREHOLDER' as const, associatePlanStatus: 'ACTIVE' as const, associatePlanAmountCents: ASSOCIATE_PLAN_PRICE_CENTS, bonusCapCents: ASSOCIATE_BONUS_CAP_CENTS, associatePlanPaidAt: now(), shareholderSince: now() }
 const ana = { id: crypto.randomUUID(), username: 'ana', email: 'ana@gomove.local', name: 'Ana Silva', passwordHash: hash('gomove2026'), role: 'ASSOCIATE' as const, status: 'ACTIVE' as const, sponsorId: matheus.id, inviteCode: 'ana01', membershipType: 'ASSOCIATE' as const, associatePlanStatus: 'ACTIVE' as const, associatePlanAmountCents: ASSOCIATE_PLAN_PRICE_CENTS, bonusCapCents: ASSOCIATE_BONUS_CAP_CENTS, associatePlanPaidAt: now() }
 const bruno = { id: crypto.randomUUID(), username: 'bruno', email: 'bruno@gomove.local', name: 'Bruno Costa', passwordHash: hash('gomove2026'), role: 'ASSOCIATE' as const, status: 'ACTIVE' as const, sponsorId: ana.id, inviteCode: 'bruno01', membershipType: 'ASSOCIATE' as const, associatePlanStatus: 'ACTIVE' as const, associatePlanAmountCents: ASSOCIATE_PLAN_PRICE_CENTS, bonusCapCents: ASSOCIATE_BONUS_CAP_CENTS, associatePlanPaidAt: now() }
 return { users:[admin,matheus,ana,bruno], commissionRules:[{ id:crypto.randomUUID(), name:'Unilevel padrão', eventType:'INVESTMENT_CONFIRMED', active:true, levels:[{level:1,bps:1000},{level:2,bps:500},{level:3,bps:300}], createdAt:now() }], commissionEvents:[], bonusEntries:[], auditLogs:[], coinPaymentsWebhookEvents:[], invoices:[], orders:[], investments:[], transactions:[], withdrawals:[], tickets:[], cart:[], profiles:{} }
}
function ensureDemoContent(db: Db) {
 const matheus=db.users.find(user=>user.username==='matheus'), ana=db.users.find(user=>user.username==='ana')
 if(!Array.isArray(db.vehicles)||!db.vehicles.length) db.vehicles=[
  {id:'VEI-1248',userId:matheus?.id,plate:'GOM-1248',model:'Scooter Urban E2',category:'Scooter',status:'Em operação',battery:78,driver:'Matheus Oliveira',location:'São Paulo - SP'},
  {id:'VEI-0931',plate:'GOM-0931',model:'GoMove SUV E',category:'Automóvel',status:'Disponível',battery:96,driver:'—',location:'Barueri - SP'},
  {id:'VEI-0712',userId:ana?.id,plate:'GOM-0712',model:'Scooter Cargo',category:'Scooter',status:'Manutenção',battery:31,driver:'Ana Silva',location:'Osasco - SP'}]
 if(!db.investments.length&&matheus) db.investments=[{id:'ATV-441',userId:matheus.id,date:'15/03/2026',pack:'Cotas GoMove',amount:8500,amountCents:850000,profit:1278.34,status:'Ativo',paymentStatus:'CONFIRMED'},{id:'ATV-318',userId:matheus.id,date:'08/01/2026',pack:'Cotas GoMove',amount:5000,amountCents:500000,profit:943.12,status:'Ativo',paymentStatus:'CONFIRMED'}]
 if(!db.orders.length&&matheus) db.orders=[{id:'PED-2048',userId:matheus.id,date:'28/07/2026',description:'Capacete Urban Carbon',quantity:1,total:289,status:'Em trânsito'},{id:'PED-1984',userId:matheus.id,date:'04/07/2026',description:'Kit mobilidade GoMove',quantity:1,total:149,status:'Entregue'}]
 if(!db.invoices.length&&matheus) db.invoices=[{id:'INV-ASSOC-01',userId:matheus.id,due:'15/03/2026',description:'Plano de Associado GoMove',amount:55,remaining:0,status:'Pago'}]
 if(!db.transactions.length&&matheus) db.transactions=[{id:'MOV-9812',userId:matheus.id,date:'30/07/2026',description:'Rendimento operacional',amount:184.2,status:'Crédito'},{id:'MOV-9801',userId:matheus.id,date:'26/07/2026',description:'Bônus de rede',amount:92.5,status:'Crédito'},{id:'MOV-9742',userId:matheus.id,date:'18/07/2026',description:'Compra PED-2048',amount:-289,status:'Débito'}]
 if(!db.withdrawals.length&&matheus) db.withdrawals=[{id:'SAQ-401',userId:matheus.id,date:'12/07/2026',amount:500,method:'PIX',account:'***.982.***-**',paidAt:'13/07/2026',status:'Pago'},...(ana?[{id:'SAQ-419',userId:ana.id,date:'30/07/2026',amount:240,method:'PIX',account:'***.441.***-**',paidAt:'—',status:'Pendente'}]:[])]
 if(!db.tickets.length&&matheus) db.tickets=[{id:'TK-184',userId:matheus.id,date:'29/07/2026',department:'Financeiro',category:'Fatura',subject:'Confirmação de pagamento',priority:'Média',status:'Em análise'},{id:'TK-163',userId:matheus.id,date:'12/07/2026',department:'Operações',category:'Veículo',subject:'Agendamento preventivo',priority:'Baixa',status:'Resolvido'}]
 if(!db.profiles)db.profiles={};if(matheus&&!db.profiles[matheus.id])db.profiles[matheus.id]={name:'Matheus Oliveira',email:'matheus@gomove.com.br',phone:'(47) 99988-2040',birthdate:'1992-08-15',language:'Português',country:'Brasil',twoFactorLogin:false,twoFactorWithdraw:true,pixType:'CPF'}
}
function readDb(): Db {
 let db: any
 const persisted = fs.existsSync(dataFile) ? fs.readFileSync(dataFile,'utf8') : ''
 if (!persisted) db=seeded(); else db=JSON.parse(persisted)
 for (const k of ['users','vehicles','commissionRules','commissionEvents','bonusEntries','auditLogs','coinPaymentsWebhookEvents','invoices','orders','investments','transactions','withdrawals','tickets','cart']) if (!Array.isArray(db[k])) db[k]=[]
 if (!db.profiles) db.profiles={}
 if (!db.users.length) Object.assign(db, seeded(), db)
 ensureDemoContent(db)
 for (const user of db.users) {
  if (user.role !== 'ASSOCIATE') continue
  const inferredShareholder=!user.membershipType&&db.investments.some((investment:any)=>investment.userId===user.id&&(investment.status==='Ativo'||investment.paymentStatus==='CONFIRMED')&&Number(investment.amountCents)>=SHAREHOLDER_MIN_QUOTA_CENTS)
  Object.assign(user,withBusinessPlanDefaults(user as any))
  if(inferredShareholder)user.membershipType='SHAREHOLDER'
 }
 const normalized=JSON.stringify(db,null,2)
 if(normalized!==persisted) writeDb(db,normalized)
 return db
}
function writeDb(db: Db, serialized=JSON.stringify(db,null,2)) {
 fs.mkdirSync(path.dirname(dataFile),{recursive:true})
 const tmp=`${dataFile}.${process.pid}.${crypto.randomUUID()}.tmp`
 fs.writeFileSync(tmp,serialized,'utf8')
 try {
  for(let attempt=0;;attempt++) {
   try { fs.renameSync(tmp,dataFile); break }
   catch(error:any) {
    if(attempt>=4||!['EPERM','EBUSY','EACCES'].includes(error?.code)) throw error
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,20*(attempt+1))
   }
  }
 } catch(error) {
  fs.rmSync(tmp,{force:true})
  throw error
 }
}
const audit=(db:Db, actorId:string, action:string, targetType:string, targetId:string, details:any={}) => db.auditLogs.unshift({id:crypto.randomUUID(),actorId,action,targetType,targetId,details,createdAt:now()})
function confirmInvestmentInDb(db:Db, inv:any, actorId:string) {
 const existing=db.commissionEvents.find(e=>e.investmentId===inv.id)
 if(existing)return {event:existing,bonuses:db.bonusEntries.filter(b=>b.eventId===existing.id),idempotent:true}
 const investor=db.users.find(u=>u.id===inv.userId&&u.status==='ACTIVE')
 if(!investor||!Number.isInteger(inv.amountCents)||inv.amountCents<=0)throw new Error('Investimento precisa estar vinculado a uma conta ativa e possuir valor válido')
 if(investor.associatePlanStatus!=='ACTIVE')throw new Error('O Plano de Associado de R$ 55,00 precisa estar ativo antes da aquisição de cotas')
 if(inv.amountCents<SHAREHOLDER_MIN_QUOTA_CENTS)throw new Error('A aquisição mínima para o upgrade de Cotista é de R$ 500,00 em cotas')
 const rule=db.commissionRules.find(r=>r.active&&r.eventType==='INVESTMENT_CONFIRMED')
 if(!rule)throw new Error('Ative uma regra de comissão antes da confirmação')
 const levels=validateCommissionLevels(rule.levels),event={id:crypto.randomUUID(),investmentId:inv.id,investorId:investor.id,amountCents:inv.amountCents,ruleSnapshot:{id:rule.id,name:rule.name,levels},createdAt:now()}
 db.commissionEvents.push(event)
 for(const x of calculateBonuses(db.users,investor.id,event.id,inv.amountCents,levels)) {
  if(db.bonusEntries.some(b=>b.idempotencyKey===x.idempotencyKey||b.idempotencyKey===`${x.idempotencyKey}:available`||b.idempotencyKey===`${x.idempotencyKey}:blocked`))continue
  const recipient=db.users.find(user=>user.id===x.userId)!
  const allocation=allocateBonusByBusinessPlan(recipient,db.bonusEntries as any,x.amountCents)
  const base={userId:x.userId,level:x.level,eventId:event.id,investmentId:inv.id,type:'UNILEVEL',reason:x.level===1?`Indicação direta do investimento ${inv.id}`:`Indicação indireta N${x.level} do investimento ${inv.id}`,ruleSnapshot:event.ruleSnapshot,createdAt:now()}
  if(allocation.availableCents>0)db.bonusEntries.push({id:crypto.randomUUID(),...base,amountCents:allocation.availableCents,status:'PENDING',idempotencyKey:allocation.blockedCents?`${x.idempotencyKey}:available`:x.idempotencyKey})
  if(allocation.blockedCents>0)db.bonusEntries.push({id:crypto.randomUUID(),...base,amountCents:allocation.blockedCents,status:'BLOCKED_UPGRADE',idempotencyKey:`${x.idempotencyKey}:blocked`,reason:'Limite de R$ 500,00 atingido; valor aguardando upgrade para Cotista'})
 }
 inv.paymentStatus='CONFIRMED';inv.status='Ativo';inv.confirmedAt=now()
 let releasedBonusCents=0
 if(canUpgradeToShareholder(investor,inv.amountCents)) {
  if(investor.membershipType!=='SHAREHOLDER'){investor.membershipType='SHAREHOLDER';investor.shareholderSince=now()}
  releasedBonusCents=releaseBlockedBonuses(db.bonusEntries as any,investor.id)
 }
 audit(db,actorId,'INVESTMENT_CONFIRM','INVESTMENT',inv.id,{eventId:event.id,ruleId:rule.id,paymentProvider:inv.paymentProvider,membershipType:investor.membershipType,releasedBonusCents})
 return {event,bonuses:db.bonusEntries.filter(b=>b.eventId===event.id),idempotent:false}
}
const tokens=new Map<string,string>()
const app=express(); app.use(cors())
app.post('/api/webhooks/coinpayments',express.raw({type:'application/json',limit:'256kb'}),(req,res)=>{
 const rawBody=Buffer.isBuffer(req.body)?req.body.toString('utf8'):''
 try {
  const verification=verifyCoinPaymentsWebhook(rawBody,req.headers)
  if(!verification.ok)return res.status(401).json({error:'Assinatura de webhook inválida'})
 } catch(error) {
  if(error instanceof CoinPaymentsConfigurationError)return res.status(503).json({error:'CoinPayments não configurado'})
  return res.status(401).json({error:'Webhook inválido'})
 }
 let payload:any
 try { payload=JSON.parse(rawBody) } catch { return res.status(400).json({error:'JSON inválido'}) }
 const eventKey=crypto.createHash('sha256').update(rawBody).digest('hex'),db=readDb()
 if(db.coinPaymentsWebhookEvents.some(event=>event.id===eventKey))return res.json({received:true,idempotent:true})
 const invoiceId=String(payload?.invoice?.id??payload?.id??''),type=String(payload?.type??'').toLowerCase(),inv=db.investments.find(item=>item.coinPaymentsInvoiceId===invoiceId)
 if(inv) {
  inv.paymentProviderStatus=String(payload?.invoice?.state??payload?.type??'')
  inv.paymentConfirmations=Math.max(0,...(Array.isArray(payload?.invoice?.payments)?payload.invoice.payments.map((payment:any)=>Number(payment.confirmations)||0):[0]))
  if(type==='invoicepending')inv.paymentStatus='PENDING'
  else if(type==='invoicepaid')inv.paymentStatus='PAID'
  else if(type==='invoicecompleted'){inv.paymentStatus='COMPLETED';confirmInvestmentInDb(db,inv,'coinpayments-webhook')}
  else if(type==='invoicecancelled'||type==='invoicetimedout'){inv.paymentStatus=type==='invoicecancelled'?'CANCELLED':'TIMED_OUT';inv.status='Cancelado'}
 }
 db.coinPaymentsWebhookEvents.unshift({id:eventKey,type:String(payload?.type??''),invoiceId,investmentId:inv?.id??null,createdAt:now()})
 if(db.coinPaymentsWebhookEvents.length>10000)db.coinPaymentsWebhookEvents.length=10000
 writeDb(db)
 return res.json({received:true,idempotent:false})
})
app.use(express.json())
function auth(req:Request,res:Response,next:NextFunction) { const token=req.header('authorization')?.replace(/^Bearer\s+/i,''); const id=token&&tokens.get(token); const user=id&&readDb().users.find(u=>u.id===id); if(!user||user.status!=='ACTIVE') { if(token)tokens.delete(token); return res.status(401).json({error:'Sessão inválida ou conta inativa'}); } (req as any).user=user; next() }
function admin(req:Request,res:Response,next:NextFunction) { if((req as any).user.role!=='ADMIN_MASTER') return res.status(403).json({error:'Acesso administrativo obrigatório'}); next() }
function page<T>(items:T[], req:Request) { const p=Math.max(1,Number(req.query.page)||1), size=Math.min(100,Math.max(1,Number(req.query.pageSize)||20)); return {items:items.slice((p-1)*size,p*size),page:p,pageSize:size,total:items.length} }
app.post(['/api/auth/login','/api/login'],(req,res)=>{ const {username,password}=req.body??{}, login=String(username).toLowerCase()==='master'?'admin':String(username).toLowerCase(); const u=readDb().users.find(x=>x.username.toLowerCase()===login||x.email.toLowerCase()===login); if(!u||!verify(String(password??''),String(u.passwordHash))||u.status!=='ACTIVE') return res.status(401).json({error:'Usuário ou senha inválidos'}); const token=crypto.randomBytes(32).toString('base64url'); tokens.set(token,u.id); res.json({token,user:publicUser(u)}) })
app.get('/api/auth/me',auth,(req,res)=>res.json({user:publicUser((req as any).user)}))
app.get('/api/public/invites/:inviteCode',(req,res)=>{const u=readDb().users.find(x=>x.inviteCode.toLowerCase()===req.params.inviteCode.toLowerCase()); if(!u||u.status!=='ACTIVE') return res.status(404).json({error:'Convite indisponível'}); res.json({sponsor:{name:(u as any).name,inviteCode:u.inviteCode}})})
app.post('/api/public/register',(req,res)=>{ const b=req.body??{}; if(!b.username||!b.email||!b.password||!b.inviteCode||!b.name) return res.status(422).json({error:'Campos obrigatórios ausentes'}); const db=readDb(); try { const u=createRegistration(db.users,{username:b.username,email:b.email,passwordHash:hash(b.password),inviteCode:b.inviteCode,name:b.name}); db.users.push(u); audit(db,u.id,'REGISTER','USER',u.id,{sponsorId:u.sponsorId});writeDb(db);res.status(201).json({user:publicUser(u)}) } catch(e:any) { res.status(/already exists/.test(e.message)?409:422).json({error:e.message}) } })
function descendants(db:Db,id:string) { const out=new Set<string>([id]); let changed=true; while(changed){changed=false; for(const u of db.users) if(u.sponsorId&&out.has(u.sponsorId)&&!out.has(u.id)){out.add(u.id);changed=true}} return out }
function businessSummary(db:Db,user:MlmUser) { const bonuses=db.bonusEntries.filter(entry=>entry.userId===user.id&&entry.amountCents>0),approvedBonusCents=bonuses.filter(entry=>entry.status==='APPROVED').reduce((sum,entry)=>sum+entry.amountCents,0),pendingBonusCents=bonuses.filter(entry=>entry.status==='PENDING').reduce((sum,entry)=>sum+entry.amountCents,0),blockedBonusCents=bonuses.filter(entry=>entry.status==='BLOCKED_UPGRADE').reduce((sum,entry)=>sum+entry.amountCents,0),quotaAmountCents=db.investments.filter(investment=>investment.userId===user.id&&(investment.status==='Ativo'||investment.paymentStatus==='CONFIRMED')).reduce((sum,investment)=>sum+Number(investment.amountCents||0),0);return {...publicUser(user),approvedBonusCents,pendingBonusCents,blockedBonusCents,bonusCapRemainingCents:user.membershipType==='SHAREHOLDER'?null:Math.max(0,Number(user.bonusCapCents||ASSOCIATE_BONUS_CAP_CENTS)-approvedBonusCents-pendingBonusCents),quotaAmountCents,canReceiveFinancialResults:user.membershipType==='SHAREHOLDER'}}
app.get('/api/network/summary',auth,(req,res)=>{const db=readDb(),u=(req as any).user, ids=descendants(db,u.id);res.json({directs:db.users.filter(x=>x.sponsorId===u.id).length,networkSize:ids.size-1,activeNetwork:db.users.filter(x=>ids.has(x.id)&&x.status==='ACTIVE').length-1,pendingDirects:db.users.filter(x=>x.sponsorId===u.id&&x.status==='PENDING').length,...businessSummary(db,u)})})
app.get('/api/network/directs',auth,(req,res)=>res.json(page(readDb().users.filter(x=>x.sponsorId===(req as any).user.id).map(publicUser),req)))
app.get('/api/network/unilevel',auth,(req,res)=>{const db=readDb(), root=(req as any).user.id; let frontier=[root], out:any[]=[]; for(let l=1;l<=Math.min(20,Number(req.query.depth)||3);l++){frontier=db.users.filter(u=>frontier.includes(u.sponsorId||''));out.push(...frontier.map(u=>({...publicUser(u),level:l})));}res.json(out)})
app.get('/api/network/tree',auth,(req,res)=>{const db=readDb(), max=Math.min(10,Math.max(0,Number(req.query.depth)||3)); const build=(id:string,d:number):any=>{const u=db.users.find(x=>x.id===id)!;return {...publicUser(u),children:d<max?db.users.filter(x=>x.sponsorId===id).map(x=>build(x.id,d+1)):[]}};res.json(build((req as any).user.id,0))})
app.get('/api/network/search',auth,(req,res)=>{const db=readDb(), q=String(req.query.q||'').toLowerCase(),ids=descendants(db,(req as any).user.id);res.json(page(db.users.filter(u=>ids.has(u.id)&&((u as any).name?.toLowerCase().includes(q)||u.username.toLowerCase().includes(q))).map(publicUser),req))})
app.get('/api/bonuses/me',auth,(req,res)=>res.json(page(readDb().bonusEntries.filter(x=>x.userId===(req as any).user.id),req)))
app.get('/api/admin/dashboard',auth,admin,(_req,res)=>{const d=readDb();res.json({users:d.users.length,active:d.users.filter(u=>u.status==='ACTIVE').length,pending:d.users.filter(u=>u.status==='PENDING').length,associates:d.users.filter(u=>u.role==='ASSOCIATE'&&u.membershipType!=='SHAREHOLDER').length,shareholders:d.users.filter(u=>u.role==='ASSOCIATE'&&u.membershipType==='SHAREHOLDER').length,pendingPlans:d.users.filter(u=>u.role==='ASSOCIATE'&&u.associatePlanStatus!=='ACTIVE').length,vehicles:d.vehicles.length,activeVehicles:d.vehicles.filter((v:any)=>v.status==='Em operação').length,revenue:d.invoices.filter((x:any)=>x.status==='Pago').reduce((s:number,x:any)=>s+Number(x.amount||0),0),pendingWithdrawals:d.withdrawals.filter((x:any)=>x.status==='Pendente').length,openTickets:d.tickets.filter((x:any)=>x.status!=='Resolvido').length,bonusPendingCents:d.bonusEntries.filter(b=>b.status==='PENDING').reduce((s,b)=>s+b.amountCents,0),bonusBlockedCents:d.bonusEntries.filter(b=>b.status==='BLOCKED_UPGRADE').reduce((s,b)=>s+b.amountCents,0)})})
app.get('/api/admin/associates',auth,admin,(req,res)=>{const d=readDb();res.json(page(d.users.filter(u=>u.role==='ASSOCIATE').map(u=>({...publicUser(u),phone:d.profiles[u.id]?.phone??''})),req))})
app.post('/api/admin/associates',auth,admin,(req,res)=>{
 const b=req.body??{},d=readDb(),username=String(b.username??'').trim().toLowerCase(),email=String(b.email??'').trim().toLowerCase(),sponsor=b.sponsorId?d.users.find(u=>u.id===b.sponsorId&&u.status==='ACTIVE'):d.users.find(u=>u.role==='ADMIN_MASTER'&&u.status==='ACTIVE')
 if(!String(b.name??'').trim()||username.length<3||!email.includes('@')||String(b.password??'').length<6||!sponsor)return res.status(422).json({error:'Preencha nome, usuário, e-mail, senha e patrocinador válidos'})
 if(d.users.some(u=>u.username.toLowerCase()===username||u.email.toLowerCase()===email))return res.status(409).json({error:'Usuário ou e-mail já cadastrado'})
 const associatePlanStatus=['ACTIVE','PENDING','INACTIVE'].includes(b.associatePlanStatus)?b.associatePlanStatus:'PENDING',requestedStatus=['ACTIVE','PENDING','BLOCKED'].includes(b.status)?b.status:'PENDING'
 if(requestedStatus==='ACTIVE'&&associatePlanStatus!=='ACTIVE')return res.status(422).json({error:'O Plano de Associado de R$ 55,00 deve estar ativo antes da ativação da conta'})
 const account:MlmUser={id:crypto.randomUUID(),name:String(b.name).trim(),username,email,passwordHash:hash(String(b.password)),role:'ASSOCIATE',status:requestedStatus,sponsorId:sponsor.id,inviteCode:`${username.replace(/[^a-z0-9]/g,'').slice(0,14)}${Math.random().toString(36).slice(2,6)}`,membershipType:'ASSOCIATE',associatePlanStatus,associatePlanAmountCents:ASSOCIATE_PLAN_PRICE_CENTS,bonusCapCents:ASSOCIATE_BONUS_CAP_CENTS,...(associatePlanStatus==='ACTIVE'?{associatePlanPaidAt:now()}:{})}
 d.users.push(account);d.profiles[account.id]={name:account.name,email:account.email,phone:String(b.phone??''),country:'Brasil'};audit(d,(req as any).user.id,'RECORD_CREATE','USER',account.id,{sponsorId:account.sponsorId,status:account.status});writeDb(d);res.status(201).json(publicUser(account))
})
app.patch('/api/admin/associates/:id',auth,admin,(req,res)=>{
 const b=req.body??{},d=readDb(),account=d.users.find(u=>u.id===req.params.id&&u.role==='ASSOCIATE');if(!account)return res.status(404).json({error:'Usuário não encontrado'})
 const username=String(b.username??account.username).trim().toLowerCase(),email=String(b.email??account.email).trim().toLowerCase(),name=String(b.name??account.name??'').trim(),requestedSponsorId=b.sponsorId===null?d.users.find(u=>u.role==='ADMIN_MASTER')?.id:b.sponsorId
 if(!name||username.length<3||!email.includes('@'))return res.status(422).json({error:'Nome, usuário e e-mail são obrigatórios'})
 if(d.users.some(u=>u.id!==account.id&&(u.username.toLowerCase()===username||u.email.toLowerCase()===email)))return res.status(409).json({error:'Usuário ou e-mail já cadastrado'})
 if(requestedSponsorId&&(!d.users.some(u=>u.id===requestedSponsorId&&u.status==='ACTIVE')||wouldCreateSponsorCycle(d.users,account.id,requestedSponsorId)))return res.status(422).json({error:'Patrocinador precisa estar ativo e não pode criar um ciclo'})
 const nextPlanStatus=['ACTIVE','PENDING','INACTIVE'].includes(b.associatePlanStatus)?b.associatePlanStatus:account.associatePlanStatus,nextStatus=['ACTIVE','PENDING','BLOCKED'].includes(b.status)?b.status:account.status
 if(nextStatus==='ACTIVE'&&nextPlanStatus!=='ACTIVE')return res.status(422).json({error:'O Plano de Associado de R$ 55,00 deve estar ativo antes da ativação da conta'})
 const oldName=String(account.name??'');Object.assign(account,{name,username,email,status:nextStatus,associatePlanStatus:nextPlanStatus,sponsorId:requestedSponsorId??account.sponsorId});if(nextPlanStatus==='ACTIVE'&&!account.associatePlanPaidAt)account.associatePlanPaidAt=now();if(b.password){if(String(b.password).length<6)return res.status(422).json({error:'A senha deve ter ao menos 6 caracteres'});account.passwordHash=hash(String(b.password))}d.profiles[account.id]={...(d.profiles[account.id]??{}),name,email,phone:b.phone??d.profiles[account.id]?.phone??''}
 d.vehicles.filter((v:any)=>v.userId===account.id||v.driver===oldName).forEach((v:any)=>{v.userId=account.id;v.driver=name});audit(d,(req as any).user.id,'RECORD_UPDATE','USER',account.id,{name,username,email,status:account.status,sponsorId:account.sponsorId});writeDb(d);res.json(publicUser(account))
})
app.delete('/api/admin/associates/:id',auth,admin,(req,res)=>{
 const d=readDb(),account=d.users.find(u=>u.id===req.params.id&&u.role==='ASSOCIATE');if(!account)return res.status(404).json({error:'Usuário não encontrado'})
 if(d.commissionEvents.some(event=>event.investorId===account.id)||d.bonusEntries.some(entry=>entry.userId===account.id)||d.investments.some(investment=>investment.userId===account.id))return res.status(422).json({error:'Conta com histórico financeiro não pode ser excluída; altere o status para Bloqueado'})
 d.users.filter(u=>u.sponsorId===account.id).forEach(u=>u.sponsorId=account.sponsorId);for(const key of ['investments','orders','invoices','transactions','withdrawals','tickets','cart'])d[key]=d[key].filter((item:any)=>item.userId!==account.id);d.vehicles.filter((v:any)=>v.userId===account.id).forEach((v:any)=>{delete v.userId;v.driver='—'});d.bonusEntries=d.bonusEntries.filter((item:any)=>item.userId!==account.id);delete d.profiles[account.id];audit(d,(req as any).user.id,'RECORD_DELETE','USER',account.id,{username:account.username});d.users=d.users.filter(u=>u.id!==account.id);writeDb(d);res.json({id:account.id})
})
app.get('/api/admin/network/tree',auth,admin,(req,res)=>{const d=readDb(), requestedRoot=typeof req.query.rootUserId==='string'?req.query.rootUserId.trim():'', rootId=requestedRoot||(d.users.find(user=>user.role==='ADMIN_MASTER')?.id||''); const requestedDepth=Number(req.query.depth);const depth=Math.min(10,Math.max(0,Number.isFinite(requestedDepth)?Math.floor(requestedDepth):3));try{const redact=(node:any):any=>{const {passwordHash,...user}=node;return {...user,children:node.children.map(redact)}};res.json(redact(buildNetworkTree(d.users,rootId,depth)))}catch(error:any){res.status(422).json({error:error.message})}})
app.get('/api/admin/associates/:id',auth,admin,(req,res)=>{const u=readDb().users.find(x=>x.id===req.params.id);if(!u)return res.status(404).json({error:'Associado não encontrado'});res.json(publicUser(u))})
app.patch('/api/admin/associates/:id/status',auth,admin,(req,res)=>{const d=readDb(),u=d.users.find(x=>x.id===req.params.id),status=req.body?.status;if(!u)return res.status(404).json({error:'Associado não encontrado'});if(!['ACTIVE','BLOCKED','PENDING'].includes(status)||(status==='BLOCKED'&&!req.body.reason))return res.status(422).json({error:'Status/reason inválido'});if(status==='ACTIVE'&&u.associatePlanStatus!=='ACTIVE')return res.status(422).json({error:'Ative primeiro o Plano de Associado de R$ 55,00'});u.status=status;audit(d,(req as any).user.id,'STATUS_CHANGE','USER',u.id,{status,reason:req.body.reason});writeDb(d);res.json(publicUser(u))})
app.patch('/api/admin/associates/:id/sponsor',auth,admin,(req,res)=>{const d=readDb(),u=d.users.find(x=>x.id===req.params.id),s=d.users.find(x=>x.id===req.body?.sponsorId&&x.status==='ACTIVE');if(!u||!s)return res.status(404).json({error:'Associado ou patrocinador ativo não encontrado'});if(!String(req.body?.reason??'').trim()||wouldCreateSponsorCycle(d.users,u.id,s.id))return res.status(422).json({error:'Patrocinador inválido, ciclo ou justificativa ausente'});u.sponsorId=s.id;audit(d,(req as any).user.id,'SPONSOR_CHANGE','USER',u.id,{sponsorId:s.id,reason:String(req.body.reason).trim()});writeDb(d);res.json(publicUser(u))})
app.get('/api/admin/commission-rules',auth,admin,(req,res)=>res.json(page(readDb().commissionRules,req)))
app.post('/api/admin/commission-rules',auth,admin,(req,res)=>{const b=req.body??{},name=String(b.name??'').trim();if(!name)return res.status(422).json({error:'Informe o nome da regra'});try{const d=readDb(),levels=validateCommissionLevels(b.levels),r={id:crypto.randomUUID(),name,eventType:'INVESTMENT_CONFIRMED',active:Boolean(b.active),levels,createdAt:now(),updatedAt:now()};if(r.active)d.commissionRules.forEach(x=>x.active=false);d.commissionRules.push(r);audit(d,(req as any).user.id,'RULE_CREATE','RULE',r.id,{levels:r.levels,active:r.active});writeDb(d);res.status(201).json(r)}catch(error:any){res.status(422).json({error:error.message})}})
app.patch('/api/admin/commission-rules/:id',auth,admin,(req,res)=>{const d=readDb(),r=d.commissionRules.find(x=>x.id===req.params.id);if(!r)return res.status(404).json({error:'Regra não encontrada'});try{if(req.body?.name!==undefined){const name=String(req.body.name).trim();if(!name)throw new Error('Informe o nome da regra');r.name=name}if(req.body?.levels!==undefined)r.levels=validateCommissionLevels(req.body.levels);if(req.body?.active!==undefined)r.active=Boolean(req.body.active);r.updatedAt=now();if(r.active)d.commissionRules.filter(x=>x.id!==r.id&&x.eventType===r.eventType).forEach(x=>{x.active=false;x.updatedAt=now()});audit(d,(req as any).user.id,'RULE_UPDATE','RULE',r.id,{levels:r.levels,active:r.active});writeDb(d);res.json(r)}catch(error:any){res.status(422).json({error:error.message})}})
app.delete('/api/admin/commission-rules/:id',auth,admin,(req,res)=>{const d=readDb(),index=d.commissionRules.findIndex(x=>x.id===req.params.id);if(index<0)return res.status(404).json({error:'Regra não encontrada'});const rule=d.commissionRules[index];if(rule.active)return res.status(422).json({error:'Desative a regra antes de excluí-la'});if(d.commissionEvents.some(event=>event.ruleSnapshot?.id===rule.id))return res.status(422).json({error:'Regra utilizada em comissões não pode ser excluída'});d.commissionRules.splice(index,1);audit(d,(req as any).user.id,'RULE_DELETE','RULE',rule.id);writeDb(d);res.json({id:rule.id})})
app.get('/api/admin/bonus-entries',auth,admin,(req,res)=>res.json(page(readDb().bonusEntries,req)))
for (const [action,status] of [['approve','APPROVED'],['cancel','CANCELLED']] as const) app.post(`/api/admin/bonus-entries/:id/${action}`,auth,admin,(req,res)=>{const d=readDb(),id=String(req.params.id),index=d.bonusEntries.findIndex(x=>x.id===id);if(index<0)return res.status(404).json({error:'Bônus não encontrado'});try{const entry=transitionBonus(d.bonusEntries[index] as any,status);d.bonusEntries[index]=entry;if(status==='APPROVED'&&!d.transactions.some((item:any)=>item.bonusEntryId===entry.id))d.transactions.unshift({id:crypto.randomUUID(),userId:entry.userId,bonusEntryId:entry.id,date:new Date().toLocaleDateString('pt-BR'),description:entry.type==='MANUAL'?'Crédito manual aprovado':`Bônus ${entry.level?`nível ${entry.level}`:'de rede'} aprovado`,amount:entry.amountCents/100,status:'Crédito',createdAt:now()});audit(d,(req as any).user.id,`BONUS_${action.toUpperCase()}`,'BONUS',entry.id,{amountCents:entry.amountCents,userId:entry.userId});writeDb(d);res.json(entry)}catch(error:any){res.status(422).json({error:error.message})}})
app.post('/api/admin/bonus-entries/:id/reverse',auth,admin,(req,res)=>{const d=readDb(),id=String(req.params.id),reason=typeof req.body?.reason==='string'?req.body.reason:'';try{const reversal=createBonusReversal(d.bonusEntries as any,id,reason);d.bonusEntries.push(reversal);if(!d.transactions.some((item:any)=>item.bonusEntryId===reversal.id))d.transactions.unshift({id:crypto.randomUUID(),userId:reversal.userId,bonusEntryId:reversal.id,date:new Date().toLocaleDateString('pt-BR'),description:'Estorno de bônus aprovado',amount:reversal.amountCents/100,status:'Débito',createdAt:now()});audit(d,(req as any).user.id,'BONUS_REVERSE','BONUS',id,{reversalId:reversal.id,reason:reversal.reason});writeDb(d);res.status(201).json(reversal)}catch(error:any){const status=/not found/.test(error.message)?404:422;res.status(status).json({error:error.message})}})
app.post('/api/admin/bonus-entries/manual-credit',auth,admin,(req,res)=>{const b=req.body??{},d=readDb(),recipient=d.users.find(u=>u.id===b.userId&&u.status==='ACTIVE');if(!recipient||!Number.isInteger(b.amountCents)||b.amountCents<=0||!String(b.reason??'').trim())return res.status(422).json({error:'Selecione uma conta ativa, valor e justificativa válidos'});const allocation=allocateBonusByBusinessPlan(recipient,d.bonusEntries,b.amountCents),created:any[]=[];if(allocation.availableCents)created.push({id:crypto.randomUUID(),userId:recipient.id,amountCents:allocation.availableCents,status:'PENDING',type:'MANUAL',reason:String(b.reason).trim(),createdAt:now()});if(allocation.blockedCents)created.push({id:crypto.randomUUID(),userId:recipient.id,amountCents:allocation.blockedCents,status:'BLOCKED_UPGRADE',type:'MANUAL',reason:'Limite de R$ 500,00 atingido; valor aguardando upgrade para Cotista',createdAt:now()});d.bonusEntries.push(...created);audit(d,(req as any).user.id,'BONUS_MANUAL','BONUS',created[0].id,{userId:recipient.id,amountCents:b.amountCents,blockedCents:allocation.blockedCents});writeDb(d);res.status(201).json(created[0])})
app.post('/api/admin/investments/:id/confirm',auth,admin,(req,res)=>{const d=readDb(),inv=d.investments.find(x=>x.id===req.params.id);if(!inv)return res.status(404).json({error:'Investimento não encontrado'});if(inv.paymentProvider==='COINPAYMENTS'&&!['COMPLETED','CONFIRMED'].includes(inv.paymentStatus))return res.status(422).json({error:'A confirmação deve chegar pelo webhook assinado do CoinPayments'});try{const result=confirmInvestmentInDb(d,inv,(req as any).user.id);if(!result.idempotent)writeDb(d);res.json(result)}catch(error:any){res.status(422).json({error:error.message})}})
app.get('/api/admin/audit-logs',auth,admin,(req,res)=>res.json(page(readDb().auditLogs,req)))
for(const key of ['vehicles','investments','orders','invoices','withdrawals','tickets'] as const) {
 app.get(`/api/admin/${key}`,auth,admin,(req,res)=>res.json(page(readDb()[key],req)))
 app.post(`/api/admin/${key}`,auth,admin,(req,res)=>{const b=req.body??{},d=readDb(),owner=b.userId?d.users.find((u:any)=>u.id===b.userId&&u.role==='ASSOCIATE'):undefined;if(key!=='vehicles'&&!owner)return res.status(422).json({error:'Selecione uma conta de usuário válida'});if(b.userId&&!owner)return res.status(422).json({error:'Usuário inválido'});const prefixes:any={vehicles:'VEI',investments:'ATV',orders:'PED',invoices:'INV',withdrawals:'SAQ',tickets:'TK'},item:any={...b,id:`${prefixes[key]}-${Date.now().toString(36)}`,createdAt:now()};if(!item.date&&key!=='vehicles'&&key!=='invoices')item.date=new Date().toLocaleDateString('pt-BR');if(key==='vehicles')item.driver=owner?.name??'—';if(key==='investments'){item.pack='Cotas GoMove';item.amountCents=Math.round(Number(item.amount||0)*100);if(item.amountCents<SHAREHOLDER_MIN_QUOTA_CENTS)return res.status(422).json({error:'A aquisição mínima é de R$ 500,00 em cotas'});if(owner?.associatePlanStatus!=='ACTIVE')return res.status(422).json({error:'O Plano de Associado de R$ 55,00 precisa estar ativo'})}d[key].unshift(item);audit(d,(req as any).user.id,'RECORD_CREATE',key.toUpperCase(),item.id,item);writeDb(d);res.status(201).json(item)})
 app.patch(`/api/admin/${key}/:id`,auth,admin,(req,res)=>{const d=readDb(),item=d[key].find((x:any)=>x.id===req.params.id),b=req.body??{};if(!item)return res.status(404).json({error:'Registro não encontrado'});if(b.userId&&!d.users.some((u:any)=>u.id===b.userId&&u.role==='ASSOCIATE'))return res.status(422).json({error:'Usuário inválido'});const previousStatus=item.status;Object.assign(item,b,{id:item.id});if(key==='vehicles')item.driver=d.users.find((u:any)=>u.id===item.userId)?.name??'—';if(key==='investments')item.amountCents=Math.round(Number(item.amount||0)*100);if(key==='withdrawals'&&item.status==='Pago'&&previousStatus!=='Pago'&&!d.transactions.some((transaction:any)=>transaction.withdrawalId===item.id)){item.paidAt=new Date().toLocaleDateString('pt-BR');d.transactions.unshift({id:crypto.randomUUID(),userId:item.userId,withdrawalId:item.id,date:item.paidAt,description:`Saque ${item.id}`,amount:-Math.abs(Number(item.amount)),status:'Débito',createdAt:now()})}audit(d,(req as any).user.id,'RECORD_UPDATE',key.toUpperCase(),item.id,b);writeDb(d);res.json(item)})
 app.delete(`/api/admin/${key}/:id`,auth,admin,(req,res)=>{const d=readDb(),index=d[key].findIndex((x:any)=>x.id===req.params.id);if(index<0)return res.status(404).json({error:'Registro não encontrado'});const [item]=d[key].splice(index,1);audit(d,(req as any).user.id,'RECORD_DELETE',key.toUpperCase(),item.id);writeDb(d);res.json({id:item.id})})
}
// Legacy UI resources are authenticated and scoped to the caller where owner/user ownership exists.
for(const key of ['cart','investments','orders','tickets','invoices','withdrawals'] as const) app.get(`/api/${key}`,auth,(req,res)=>{const d=readDb(),u=(req as any).user;res.json(d[key].filter((x:any)=>!x.userId||x.userId===u.id))})
app.put('/api/profile',auth,(req,res)=>{const d=readDb(),u=(req as any).user,allowed=['name','email','phone','birthdate','language','country','twoFactorLogin','twoFactorWithdraw','pixType'];d.profiles[u.id]={...(d.profiles[u.id]??{}),...Object.fromEntries(Object.entries(req.body??{}).filter(([k])=>allowed.includes(k)))};const account=d.users.find(x=>x.id===u.id) as any;if(account&&req.body?.name)account.name=req.body.name;if(account&&req.body?.email)account.email=req.body.email;writeDb(d);res.json(d.profiles[u.id])})
app.post('/api/investments',auth,async(req,res)=>{
 const b=req.body??{},user=(req as any).user as MlmUser,amount=Number(b.amount),amountCents=Math.round(amount*100),pack='Cotas GoMove'
 if(!Number.isFinite(amount)||amountCents<SHAREHOLDER_MIN_QUOTA_CENTS)return res.status(422).json({error:'A aquisição mínima para o upgrade de Cotista é de R$ 500,00 em cotas'})
 if(user.associatePlanStatus!=='ACTIVE')return res.status(422).json({error:'O Plano de Associado de R$ 55,00 precisa estar ativo para adquirir cotas'})
 const idempotencyKey=String(b.idempotencyKey??'').trim()
 if(!idempotencyKey)return res.status(422).json({error:'Identificador idempotente ausente'})
 let d=readDb(),investment=d.investments.find((item:any)=>item.userId===user.id&&item.idempotencyKey===idempotencyKey)
 if(investment?.paymentUrl)return res.json(investment)
 if(investment?.paymentStatus==='INVOICE_CREATING')return res.status(409).json({error:'A cobrança já está sendo criada; tente novamente em instantes'})
 if(!investment){investment={id:crypto.randomUUID(),userId:user.id,date:new Date().toLocaleDateString('pt-BR'),createdAt:now(),pack,amount,amountCents,profit:0,status:'Aguardando pagamento',paymentStatus:'INVOICE_CREATING',paymentProvider:'COINPAYMENTS',paymentMethod:'CoinPayments',idempotencyKey};d.investments.unshift(investment)}
 else {investment.paymentStatus='INVOICE_CREATING';delete investment.paymentError}
 const targetInvestmentId=investment.id
 writeDb(d)
 try {
  const invoice=await createCoinPaymentsInvoice({investmentId:targetInvestmentId,pack:investment.pack,amount:investment.amount,buyerName:String(user.name??user.username),buyerEmail:String(user.email)})
  d=readDb();investment=d.investments.find((item:any)=>item.id===targetInvestmentId)
  if(!investment)return res.status(409).json({error:'O investimento foi removido durante a criação da cobrança'})
  Object.assign(investment,{coinPaymentsInvoiceId:invoice.id,paymentReference:invoice.id,paymentUrl:invoice.checkoutLink,invoiceUrl:invoice.link,paymentStatus:'PENDING',paymentProviderStatus:'Unpaid'})
  audit(d,user.id,'COINPAYMENTS_INVOICE_CREATE','INVESTMENT',investment.id,{coinPaymentsInvoiceId:invoice.id})
  writeDb(d);return res.status(201).json(investment)
 } catch(error:any) {
  d=readDb();investment=d.investments.find((item:any)=>item.id===targetInvestmentId)
  if(investment){investment.paymentStatus='ERROR';investment.paymentError=String(error?.message??'Falha ao criar cobrança');writeDb(d)}
  const status=error instanceof CoinPaymentsConfigurationError?503:502
  return res.status(status).json({error:status===503?'CoinPayments ainda não foi configurado pelo administrador':'Não foi possível iniciar o pagamento no CoinPayments'})
 }
})
for(const key of ['cart','orders','tickets','invoices','withdrawals'] as const) {
 app.post(`/api/${key}`,auth,(req,res)=>{const d=readDb(),b={...(req.body??{})} as any,userId=(req as any).user.id;if(key==='withdrawals'){const amount=Number(b.amount),ledger=d.transactions.filter((item:any)=>item.userId===userId).reduce((sum:number,item:any)=>sum+Number(item.amount||0),0),reserved=d.withdrawals.filter((item:any)=>item.userId===userId&&['Pendente','Em análise'].includes(item.status)).reduce((sum:number,item:any)=>sum+Number(item.amount||0),0);if(!Number.isFinite(amount)||amount<50||amount>ledger-reserved)return res.status(422).json({error:'Valor indisponível para saque'});Object.assign(b,{amount,method:'PIX',status:'Pendente',paidAt:'—'})}const item={...b,id:crypto.randomUUID(),userId,date:new Date().toLocaleDateString('pt-BR'),createdAt:now()};d[key].unshift(item);writeDb(d);res.status(201).json(item)})
 app.patch(`/api/${key}/:id`,auth,(req,res)=>{const d=readDb(),item=d[key].find((x:any)=>x.id===req.params.id&&x.userId===(req as any).user.id);if(!item)return res.status(404).json({error:'Registro não encontrado'});Object.assign(item,req.body??{}, {id:item.id,userId:item.userId});writeDb(d);res.json(item)})
}
app.get('/api/state',auth,(req,res)=>{const d=readDb(),u=(req as any).user,owned=(rows:any[])=>rows.filter(item=>!item.userId||item.userId===u.id);res.json({vehicles:owned(d.vehicles),investments:owned(d.investments),orders:owned(d.orders),invoices:owned(d.invoices),transactions:owned(d.transactions),withdrawals:owned(d.withdrawals),tickets:owned(d.tickets),cart:owned(d.cart),profile:d.profiles[u.id]??{name:u.name,email:u.email},business:businessSummary(d,u)})})
app.get('/api/health',(_req,res)=>res.json({ok:true,service:'GoMove API'}))
const dist=path.join(root,'dist');if(fs.existsSync(dist)){app.use(express.static(dist));app.get(/.*/,(_req,res)=>res.sendFile(path.join(dist,'index.html')))}
if (process.env.NODE_ENV!=='test') app.listen(Number(process.env.PORT||4010),()=>console.log(`GoMove API disponível em http://localhost:${process.env.PORT||4010}`))
export { app, readDb, writeDb }
