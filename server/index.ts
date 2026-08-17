import 'dotenv/config'
import express, { type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { AsyncLocalStorage } from 'node:async_hooks'
import { neon } from '@neondatabase/serverless'
import { buildNetworkTree, calculateDirectReferralBonus, calculateProfitabilityBonuses, canSponsorRegistrations, createBonusReversal, createRegistration, transitionBonus, validateCommissionPlan, wouldCreateSponsorCycle, type MlmUser } from './mlm.js'
import { CoinPaymentsConfigurationError, createCoinPaymentsInvoice, verifyCoinPaymentsWebhook } from './coinpayments.js'
import { PixPayConfigurationError, createPixPayTransaction, normalizeCustomerDocument, verifyPixPayWebhookToken } from './pixpay.js'
import { ASSOCIATE_BONUS_CAP_CENTS, ASSOCIATE_PLAN_PRICE_CENTS, COMMISSION_PLAN_VERSION, DIRECT_REFERRAL_BPS, SHAREHOLDER_MIN_QUOTA_CENTS, UNILEVEL_LEVELS, allocateEarningByBusinessPlan, canUpgradeToShareholder, isBonusEligibleParticipant, releaseBlockedBonuses, withBusinessPlanDefaults } from '../src/businessPlan.js'
import { summarizeBonusPeriods } from '../src/bonusPeriods.js'

const root = path.resolve(process.env.GOMOVE_ROOT || process.cwd())
const dataFile = process.env.GOMOVE_DATA_FILE ? path.resolve(process.env.GOMOVE_DATA_FILE) : path.join(root, '.data', 'db.json')
type Item = Record<string, any> & { id: string }
type Db = Record<string, any> & { users: MlmUser[]; commissionRules: Item[]; commissionEvents: Item[]; dailyProfitabilityRuns: Item[]; dailyProfitabilities: Item[]; bonusEntries: any[]; auditLogs: Item[]; investments: Item[]; coinPaymentsWebhookEvents: Item[]; pixPayWebhookEvents: Item[]; sessions: Record<string,{userId:string;expiresAt:string}> }
type DbRequestContext = { db: Db; dirty: boolean; version: number }
const ACCOUNT_ONBOARDING_VERSION=1
const databaseUrl=String(process.env.DATABASE_URL??'').trim()
const dbRequestContext=new AsyncLocalStorage<DbRequestContext>()
const now = () => new Date().toISOString()
const hash = (password: string) => { const salt = crypto.randomBytes(16).toString('hex'); return `scrypt$${salt}$${crypto.scryptSync(password, salt, 64).toString('hex')}` }
const verify = (password: string, encoded: string) => { const [, salt, expected] = encoded.split('$'); if (!salt || !expected) return false; const actual = crypto.scryptSync(password, salt, 64).toString('hex'); return crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex')) }
const publicUser = (u: MlmUser) => { const { passwordHash, ...safe } = u; return safe }
function demoSeeded(): Db {
 const admin = { id: crypto.randomUUID(), username: 'admin', email: 'admin@gomove.local', name: 'Administrador GoMove', passwordHash: hash('gomove2026'), role: 'ADMIN_MASTER' as const, status: 'ACTIVE' as const, sponsorId: null, inviteCode: 'admin01' }
 const matheus = { id: crypto.randomUUID(), username: 'matheus', email: 'matheus@gomove.com.br', name: 'Matheus Oliveira', passwordHash: hash('gomove2026'), role: 'ASSOCIATE' as const, status: 'ACTIVE' as const, sponsorId: admin.id, inviteCode: 'matheus01', membershipType: 'SHAREHOLDER' as const, associatePlanStatus: 'ACTIVE' as const, associatePlanAmountCents: ASSOCIATE_PLAN_PRICE_CENTS, bonusCapCents: ASSOCIATE_BONUS_CAP_CENTS, associatePlanPaidAt: now(), shareholderSince: now() }
 const ana = { id: crypto.randomUUID(), username: 'ana', email: 'ana@gomove.local', name: 'Ana Silva', passwordHash: hash('gomove2026'), role: 'ASSOCIATE' as const, status: 'ACTIVE' as const, sponsorId: matheus.id, inviteCode: 'ana01', membershipType: 'ASSOCIATE' as const, associatePlanStatus: 'ACTIVE' as const, associatePlanAmountCents: ASSOCIATE_PLAN_PRICE_CENTS, bonusCapCents: ASSOCIATE_BONUS_CAP_CENTS, associatePlanPaidAt: now() }
 const bruno = { id: crypto.randomUUID(), username: 'bruno', email: 'bruno@gomove.local', name: 'Bruno Costa', passwordHash: hash('gomove2026'), role: 'ASSOCIATE' as const, status: 'ACTIVE' as const, sponsorId: ana.id, inviteCode: 'bruno01', membershipType: 'ASSOCIATE' as const, associatePlanStatus: 'ACTIVE' as const, associatePlanAmountCents: ASSOCIATE_PLAN_PRICE_CENTS, bonusCapCents: ASSOCIATE_BONUS_CAP_CENTS, associatePlanPaidAt: now() }
 return { accountOnboardingVersion:ACCOUNT_ONBOARDING_VERSION, commissionPlanVersion:COMMISSION_PLAN_VERSION, users:[admin,matheus,ana,bruno], commissionRules:[{ id:crypto.randomUUID(), name:'Indicação direta + Unilevel GoMove', eventType:'INVESTMENT_CONFIRMED', active:true, directReferralBps:DIRECT_REFERRAL_BPS, levels:UNILEVEL_LEVELS.map(level=>({...level})), createdAt:now() }], commissionEvents:[], dailyProfitabilityRuns:[], dailyProfitabilities:[], bonusEntries:[], auditLogs:[], coinPaymentsWebhookEvents:[], pixPayWebhookEvents:[], sessions:{}, invoices:[], orders:[], investments:[], transactions:[], withdrawals:[], tickets:[], cart:[], profiles:{} }
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
function productionSeeded(): Db {
 const password=String(process.env.GOMOVE_ADMIN_PASSWORD??'')
 if(password.length<12)throw new Error('GOMOVE_ADMIN_PASSWORD precisa ter pelo menos 12 caracteres no primeiro início')
 const username=String(process.env.GOMOVE_ADMIN_USERNAME??'admin').trim().toLowerCase()
 const email=String(process.env.GOMOVE_ADMIN_EMAIL??'admin@gomoveinfra.com.br').trim().toLowerCase()
 const name=String(process.env.GOMOVE_ADMIN_NAME??'Administrador GoMove').trim()
 const admin={id:crypto.randomUUID(),username,email,name,passwordHash:hash(password),role:'ADMIN_MASTER' as const,status:'ACTIVE' as const,sponsorId:null,inviteCode:String(process.env.GOMOVE_ADMIN_INVITE_CODE??'gomove').trim().toLowerCase()}
 return {accountOnboardingVersion:ACCOUNT_ONBOARDING_VERSION,commissionPlanVersion:COMMISSION_PLAN_VERSION,users:[admin],commissionRules:[{id:crypto.randomUUID(),name:'Indicação direta + Unilevel GoMove',eventType:'INVESTMENT_CONFIRMED',active:true,directReferralBps:DIRECT_REFERRAL_BPS,levels:UNILEVEL_LEVELS.map(level=>({...level})),createdAt:now()}],commissionEvents:[],dailyProfitabilityRuns:[],dailyProfitabilities:[],bonusEntries:[],auditLogs:[{id:crypto.randomUUID(),actorId:admin.id,action:'PRODUCTION_INITIALIZED',targetType:'SYSTEM',targetId:'gomove',details:{mode:'production'},createdAt:now()}],coinPaymentsWebhookEvents:[],pixPayWebhookEvents:[],sessions:{},vehicles:[],invoices:[],orders:[],investments:[],transactions:[],withdrawals:[],tickets:[],cart:[],profiles:{[admin.id]:{name,email,country:'Brasil'}}}
}
const initialDatabase=()=>process.env.NODE_ENV==='test'?demoSeeded():productionSeeded()
function readDb(): Db {
 const requestStore=dbRequestContext.getStore()
 if(databaseUrl) {
  if(!requestStore)throw new Error('Contexto do banco indisponível')
  return normalizeDb(requestStore.db)
 }
 let db: any
 const persisted = fs.existsSync(dataFile) ? fs.readFileSync(dataFile,'utf8') : ''
 if (!persisted) db=initialDatabase(); else db=JSON.parse(persisted)
 return normalizeDb(db,persisted)
}
function normalizeDb(db:any,persisted?:string): Db {
 for (const k of ['users','vehicles','commissionRules','commissionEvents','dailyProfitabilityRuns','dailyProfitabilities','bonusEntries','auditLogs','coinPaymentsWebhookEvents','pixPayWebhookEvents','invoices','orders','investments','transactions','withdrawals','tickets','cart']) if (!Array.isArray(db[k])) db[k]=[]
 if (!db.profiles) db.profiles={}
 if (!db.sessions) db.sessions={}
 if (!db.users.length) Object.assign(db, initialDatabase(), db)
 if(db.accountOnboardingVersion!==ACCOUNT_ONBOARDING_VERSION){const legacyRegistrationIds=new Set(db.auditLogs.filter((entry:any)=>entry.action==='REGISTER'&&entry.targetType==='USER').map((entry:any)=>entry.targetId));db.users.filter((user:any)=>user.role==='ASSOCIATE'&&user.status==='PENDING'&&user.membershipType==='ASSOCIATE'&&user.associatePlanStatus==='PENDING'&&legacyRegistrationIds.has(user.id)).forEach((user:any)=>{user.status='ACTIVE'});db.accountOnboardingVersion=ACCOUNT_ONBOARDING_VERSION}
 if(db.commissionPlanVersion!==COMMISSION_PLAN_VERSION){db.commissionRules.forEach((rule:any)=>rule.active=false);db.commissionRules.push({id:crypto.randomUUID(),name:'Indicação direta + Unilevel GoMove',eventType:'INVESTMENT_CONFIRMED',active:true,directReferralBps:DIRECT_REFERRAL_BPS,levels:UNILEVEL_LEVELS.map(level=>({...level})),createdAt:now()});db.commissionPlanVersion=COMMISSION_PLAN_VERSION}
 if(process.env.NODE_ENV==='test')ensureDemoContent(db)
 for (const user of db.users) {
  if (user.role !== 'ASSOCIATE') continue
  const inferredShareholder=!user.membershipType&&db.investments.some((investment:any)=>investment.userId===user.id&&(investment.status==='Ativo'||investment.paymentStatus==='CONFIRMED')&&Number(investment.amountCents)>=SHAREHOLDER_MIN_QUOTA_CENTS)
  Object.assign(user,withBusinessPlanDefaults(user as any))
  if(inferredShareholder)user.membershipType='SHAREHOLDER'
 }
 const normalized=JSON.stringify(db,null,2)
 if(persisted!==undefined&&normalized!==persisted) writeDb(db,normalized)
 return db
}
function writeDb(db: Db, serialized=JSON.stringify(db,null,2)) {
 const requestStore=dbRequestContext.getStore()
 if(databaseUrl) {
  if(!requestStore)throw new Error('Contexto do banco indisponível')
  requestStore.db=db;requestStore.dirty=true;return
 }
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
async function loadPostgresDb():Promise<{db:Db;version:number}> {
 const sql=neon(databaseUrl)
 await sql`create table if not exists gomove_state (id text primary key, payload jsonb not null, version bigint not null default 1, updated_at timestamptz not null default now())`
 let rows=await sql`select payload,version from gomove_state where id='production'`
 if(!rows.length){const seeded=initialDatabase();await sql`insert into gomove_state(id,payload) values ('production',${JSON.stringify(seeded)}::jsonb) on conflict (id) do nothing`;rows=await sql`select payload,version from gomove_state where id='production'`}
 return {db:normalizeDb(rows[0].payload),version:Number(rows[0].version)}
}
async function savePostgresDb(context:DbRequestContext) {
 const sql=neon(databaseUrl),rows=await sql`update gomove_state set payload=${JSON.stringify(context.db)}::jsonb,version=version+1,updated_at=now() where id='production' and version=${context.version} returning version`
 if(!rows.length)throw new Error('Os dados foram alterados por outra operação; tente novamente')
 context.version=Number(rows[0].version);context.dirty=false
}
async function flushDb() {
 const context=dbRequestContext.getStore()
 if(databaseUrl&&context?.dirty)await savePostgresDb(context)
}
async function refreshDb():Promise<Db> {
 if(!databaseUrl)return readDb()
 const context=dbRequestContext.getStore()
 if(!context)throw new Error('Contexto do banco indisponível')
 const loaded=await loadPostgresDb();context.db=loaded.db;context.version=loaded.version;context.dirty=false
 return context.db
}
const audit=(db:Db, actorId:string, action:string, targetType:string, targetId:string, details:any={}) => db.auditLogs.unshift({id:crypto.randomUUID(),actorId,action,targetType,targetId,details,createdAt:now()})
async function mergeProviderInvoice(collection:'invoices'|'investments',localId:string,providerInvoice:{id:string;checkoutLink:string;link:string},onMerge:(db:Db,item:any)=>void) {
 for(let attempt=0;attempt<3;attempt++) {
  const db=await refreshDb(),item=db[collection].find((candidate:any)=>candidate.id===localId)
  if(!item)return null
  Object.assign(item,{coinPaymentsInvoiceId:providerInvoice.id,paymentReference:providerInvoice.id,paymentUrl:providerInvoice.checkoutLink,invoiceUrl:providerInvoice.link})
  if(item.paymentStatus==='INVOICE_CREATING')Object.assign(item,{paymentStatus:'PENDING',paymentProviderStatus:'Unpaid'})
  onMerge(db,item);writeDb(db)
  try{await flushDb();return item}catch(error:any){if(!/alterados por outra operação/.test(String(error?.message))||attempt===2)throw error}
 }
 return null
}
async function mergePixPayTransaction(collection:'invoices'|'investments',localId:string,transaction:{id:string;qrCode:string;qrCodeBase64?:string|null;qrCodeUrl?:string|null;status:string;paymentUrl:string|null},onMerge:(db:Db,item:any)=>void) {
 for(let attempt=0;attempt<3;attempt++) {
  const db=await refreshDb(),item=db[collection].find((candidate:any)=>candidate.id===localId)
  if(!item)return null
  Object.assign(item,{pixPayTransactionId:transaction.id,paymentReference:transaction.id,paymentUrl:transaction.paymentUrl,pixQrCode:transaction.qrCode,pixQrCodeBase64:transaction.qrCodeBase64||null,pixQrCodeUrl:transaction.qrCodeUrl||null,paymentProviderStatus:transaction.status})
  if(item.paymentStatus==='INVOICE_CREATING')item.paymentStatus='PENDING'
  onMerge(db,item);writeDb(db)
  try{await flushDb();return item}catch(error:any){if(!/alterados por outra operação/.test(String(error?.message))||attempt===2)throw error}
 }
 return null
}
function parseQuotaAmount(input:unknown) { const amount=Number(input),rawCents=amount*100,amountCents=Math.round(rawCents),configuredMax=Number(process.env.GOMOVE_MAX_QUOTA_CENTS),maxCents=Number.isSafeInteger(configuredMax)&&configuredMax>=SHAREHOLDER_MIN_QUOTA_CENTS?configuredMax:100_000_000;if(!Number.isFinite(amount)||!Number.isSafeInteger(amountCents)||Math.abs(rawCents-amountCents)>0.000001||amountCents<SHAREHOLDER_MIN_QUOTA_CENTS||amountCents>maxCents)throw new Error(`A aquisição deve ficar entre R$ 500,00 e R$ ${(maxCents/100).toLocaleString('pt-BR',{minimumFractionDigits:2})}, com no máximo duas casas decimais`);return {amount,amountCents} }
function parseWebhookAmountCents(value:unknown) { const raw=String(value??'').trim();if(!/^\d+(?:\.\d{1,2})?$/.test(raw))return null;const [units,decimals='']=raw.split('.'),cents=Number(units)*100+Number(decimals.padEnd(2,'0'));return Number.isSafeInteger(cents)?cents:null }
function validateWebhookInvoice(invoicePayload:any,target:any) { if(invoicePayload&&Object.prototype.hasOwnProperty.call(invoicePayload,'amount')){const amountValue=typeof invoicePayload.amount==='object'&&invoicePayload.amount!==null?(invoicePayload.amount.total??invoicePayload.amount.value):invoicePayload.amount,amountCents=parseWebhookAmountCents(amountValue);if(amountCents===null||amountCents!==Number(target.amountCents))throw new Error('Valor da fatura no webhook não confere')}if(invoicePayload&&Object.prototype.hasOwnProperty.call(invoicePayload,'currency')){const received=String(typeof invoicePayload.currency==='object'&&invoicePayload.currency!==null?(invoicePayload.currency.id??invoicePayload.currency.code??''):invoicePayload.currency),expected=String(process.env.COINPAYMENTS_INVOICE_CURRENCY??'5203');if(!received||received!==expected)throw new Error('Moeda da fatura no webhook não confere')} }
const NON_RETRYABLE_CHECKOUT_STATUSES=new Set(['CANCELLED','TIMED_OUT','ERROR','SUPERSEDED'])
function confirmedQuotaCents(db:Db,userId:string) { return db.investments.filter((investment:any)=>investment.userId===userId&&(investment.status==='Ativo'||investment.paymentStatus==='CONFIRMED')).reduce((sum:number,investment:any)=>sum+Number(investment.amountCents||0),0) }
function allocateEarning(db:Db,participant:MlmUser,amountCents:number) { return allocateEarningByBusinessPlan(participant,db.bonusEntries,db.dailyProfitabilities as any,confirmedQuotaCents(db,participant.id),amountCents) }
function saoPauloDate(date=new Date()) { const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date),value=(type:string)=>parts.find(part=>part.type===type)?.value;return `${value('year')}-${value('month')}-${value('day')}` }
function processDailyProfitabilityRun(db:Db,run:any,actorId:string) {
 if(run.status==='PROCESSED')return {run,earnings:db.dailyProfitabilities.filter(item=>item.runId===run.id),bonuses:db.bonusEntries.filter(item=>item.dailyProfitabilityRunId===run.id),idempotent:true}
 if(run.status!=='SCHEDULED')throw new Error('O Diário não está disponível para processamento')
 const rule=db.commissionRules.find(item=>item.active);if(!rule)throw new Error('Ative uma regra de Unilevel antes de processar o Diário')
 const plan=validateCommissionPlan(rule.levels,rule.directReferralBps),earnings:any[]=[],bonuses:any[]=[]
 Object.assign(run,{status:'PROCESSING',participantCount:0,grossAmountCents:0,creditedAmountCents:0,cappedAmountCents:0,unilevelAmountCents:0})
 for(const participant of db.users.filter(item=>item.role==='ASSOCIATE'&&item.status==='ACTIVE'&&item.membershipType==='SHAREHOLDER')) {
  const quotaAmountCents=confirmedQuotaCents(db,participant.id);if(quotaAmountCents<=0)continue
  const grossAmountCents=Math.floor(quotaAmountCents*run.rateBps/10_000);if(grossAmountCents<=0)continue
  const allocation=allocateEarning(db,participant,grossAmountCents),earning={id:crypto.randomUUID(),runId:run.id,userId:participant.id,date:run.date,rateBps:run.rateBps,quotaAmountCents,grossAmountCents,creditedAmountCents:allocation.availableCents,cappedAmountCents:allocation.cappedCents,capCents:allocation.capCents,createdAt:now()}
  db.dailyProfitabilities.unshift(earning);earnings.push(earning);run.participantCount+=1;run.grossAmountCents+=grossAmountCents;run.creditedAmountCents+=allocation.availableCents;run.cappedAmountCents+=allocation.cappedCents
  if(allocation.availableCents>0)db.transactions.unshift({id:crypto.randomUUID(),userId:participant.id,dailyProfitabilityId:earning.id,dailyProfitabilityRunId:run.id,date:run.date,description:`Diário de ${run.rateBps/100}% sobre as cotas`,amount:allocation.availableCents/100,status:'Crédito',createdAt:now()})
  if(allocation.availableCents<=0)continue
  for(const calculated of calculateProfitabilityBonuses(db.users,participant.id,earning.id,allocation.availableCents,plan.levels)) {
   const recipient=db.users.find(item=>item.id===calculated.userId)!;const bonusAllocation=allocateEarning(db,recipient,calculated.amountCents);const base={userId:recipient.id,sourceUserId:participant.id,level:calculated.level,eventId:earning.id,dailyProfitabilityId:earning.id,dailyProfitabilityRunId:run.id,type:calculated.type,reason:`Unilevel N${calculated.level} sobre o Diário de ${participant.name}`,createdAt:now()}
   if(bonusAllocation.availableCents>0){const bonus={id:crypto.randomUUID(),...base,amountCents:bonusAllocation.availableCents,status:'APPROVED',idempotencyKey:bonusAllocation.cappedCents?`${calculated.idempotencyKey}:available`:calculated.idempotencyKey};db.bonusEntries.unshift(bonus);bonuses.push(bonus);run.unilevelAmountCents+=bonus.amountCents;db.transactions.unshift({id:crypto.randomUUID(),userId:recipient.id,bonusEntryId:bonus.id,dailyProfitabilityId:earning.id,dailyProfitabilityRunId:run.id,date:run.date,description:`Unilevel N${calculated.level} sobre o Diário de ${participant.name}`,amount:bonus.amountCents/100,status:'Crédito',createdAt:now()})}
   if(bonusAllocation.cappedCents>0){const capped={id:crypto.randomUUID(),...base,amountCents:bonusAllocation.cappedCents,status:'CAPPED_200_PERCENT',idempotencyKey:`${calculated.idempotencyKey}:capped`,reason:'Teto de ganhos atingido; renove suas cotas para ampliar o limite'};db.bonusEntries.unshift(capped);bonuses.push(capped)}
  }
 }
 Object.assign(run,{status:'PROCESSED',processedAt:now()});audit(db,actorId,'DAILY_PROFITABILITY_PROCESS','DAILY_PROFITABILITY',run.id,{date:run.date,rateBps:run.rateBps,participantCount:run.participantCount,creditedAmountCents:run.creditedAmountCents,cappedAmountCents:run.cappedAmountCents,unilevelAmountCents:run.unilevelAmountCents});return {run,earnings,bonuses,idempotent:false}
}
function confirmInvestmentInDb(db:Db, inv:any, actorId:string) {
 const existing=db.commissionEvents.find(e=>e.investmentId===inv.id)
 if(existing)return {event:existing,bonuses:db.bonusEntries.filter(b=>b.eventId===existing.id),idempotent:true}
 const investor=db.users.find(u=>u.id===inv.userId&&u.status==='ACTIVE')
 if(!investor||!Number.isInteger(inv.amountCents)||inv.amountCents<=0)throw new Error('Investimento precisa estar vinculado a uma conta ativa e possuir valor válido')
 if(inv.amountCents<SHAREHOLDER_MIN_QUOTA_CENTS)throw new Error('A aquisição mínima para o upgrade de Cotista é de R$ 500,00 em cotas')
 const rule=db.commissionRules.find(r=>r.active&&r.eventType==='INVESTMENT_CONFIRMED')
 if(!rule)throw new Error('Ative uma regra de comissão antes da confirmação')
 const plan=validateCommissionPlan(rule.levels,rule.directReferralBps),event={id:crypto.randomUUID(),investmentId:inv.id,investorId:investor.id,amountCents:inv.amountCents,ruleSnapshot:{id:rule.id,name:rule.name,...plan},createdAt:now()}
 db.commissionEvents.push(event)
 for(const x of calculateDirectReferralBonus(db.users,investor.id,event.id,inv.amountCents,plan.directReferralBps)) {
  if(db.bonusEntries.some(b=>b.idempotencyKey===x.idempotencyKey||b.idempotencyKey===`${x.idempotencyKey}:available`||b.idempotencyKey===`${x.idempotencyKey}:blocked`))continue
  const recipient=db.users.find(user=>user.id===x.userId)!
  const allocation=allocateEarning(db,recipient,x.amountCents)
  const base={userId:x.userId,level:x.level,eventId:event.id,investmentId:inv.id,type:x.type,reason:`Indicação direta de ${plan.directReferralBps/100}% sobre as cotas ${inv.id}`,ruleSnapshot:event.ruleSnapshot,createdAt:now()}
  if(allocation.availableCents>0)db.bonusEntries.push({id:crypto.randomUUID(),...base,amountCents:allocation.availableCents,status:'PENDING',idempotencyKey:allocation.cappedCents?`${x.idempotencyKey}:available`:x.idempotencyKey})
  if(allocation.cappedCents>0)db.bonusEntries.push({id:crypto.randomUUID(),...base,amountCents:allocation.cappedCents,status:recipient.membershipType==='SHAREHOLDER'?'CAPPED_200_PERCENT':'BLOCKED_UPGRADE',idempotencyKey:`${x.idempotencyKey}:capped`,reason:recipient.membershipType==='SHAREHOLDER'?'Teto de 200% das cotas atingido; renove suas cotas para ampliar o limite':'Limite de R$ 500,00 atingido; valor aguardando upgrade para Cotista'})
 }
 inv.paymentStatus='CONFIRMED';inv.status='Ativo';inv.confirmedAt=now()
 let releasedBonusCents=0
 if(canUpgradeToShareholder(investor,inv.amountCents)) {
  if(investor.membershipType!=='SHAREHOLDER'){investor.membershipType='SHAREHOLDER';investor.shareholderSince=now()}
  const capacity=allocateEarning(db,investor,1)
  releasedBonusCents=releaseBlockedBonuses(db.bonusEntries as any,investor.id,Math.max(0,capacity.capCents-capacity.consumedCents),()=>crypto.randomUUID())
 }
 audit(db,actorId,'INVESTMENT_CONFIRM','INVESTMENT',inv.id,{eventId:event.id,ruleId:rule.id,paymentProvider:inv.paymentProvider,membershipType:investor.membershipType,releasedBonusCents})
 return {event,bonuses:db.bonusEntries.filter(b=>b.eventId===event.id),idempotent:false}
}
const app=express();app.set('trust proxy',1);app.use(cors())
const publicRateBuckets=new Map<string,{count:number;resetAt:number}>()
let rateLimitSchemaReady:Promise<unknown>|undefined
function canonicalRateLimitPath(requestPath:string) { return requestPath==='/api/login'?'/api/auth/login':requestPath }
async function incrementDistributedRateLimit(bucketKey:string,windowStart:number,expiresAt:number,current:number) { const sql=neon(databaseUrl);rateLimitSchemaReady??=(async()=>{await sql`create table if not exists gomove_rate_limits (bucket_key text not null, window_start bigint not null, request_count integer not null default 0, expires_at bigint not null, primary key(bucket_key,window_start))`;await sql`create index if not exists gomove_rate_limits_expires_at_idx on gomove_rate_limits(expires_at)`})();try{await rateLimitSchemaReady}catch(error){rateLimitSchemaReady=undefined;throw error}const rows=await sql`with expired as (delete from gomove_rate_limits where expires_at < ${current}) insert into gomove_rate_limits(bucket_key,window_start,request_count,expires_at) values (${bucketKey},${windowStart},1,${expiresAt}) on conflict (bucket_key,window_start) do update set request_count=gomove_rate_limits.request_count+1,expires_at=excluded.expires_at returning request_count`;return Number(rows[0]?.request_count??0) }
async function publicRateLimit(req:Request,res:Response,next:NextFunction) {
 const configuredLimit=Number(process.env.GOMOVE_PUBLIC_RATE_LIMIT),configuredWindow=Number(process.env.GOMOVE_PUBLIC_RATE_WINDOW_MS),limit=Number.isInteger(configuredLimit)&&configuredLimit>0?configuredLimit:100,windowMs=Number.isInteger(configuredWindow)&&configuredWindow>=1000?configuredWindow:15*60*1000,current=Date.now(),resetAt=Math.floor(current/windowMs)*windowMs+windowMs,canonicalPath=canonicalRateLimitPath(req.path),clientHash=crypto.createHash('sha256').update(String(req.ip||req.socket.remoteAddress||'unknown')).digest('hex'),bucketKey=crypto.createHash('sha256').update(`${canonicalPath}:${clientHash}`).digest('hex')
 let count:number
 try{if(databaseUrl)count=await incrementDistributedRateLimit(bucketKey,resetAt-windowMs,resetAt,current);else{const key=`${limit}:${windowMs}:${bucketKey}`;let bucket=publicRateBuckets.get(key);if(!bucket||bucket.resetAt<=current){bucket={count:0,resetAt};publicRateBuckets.set(key,bucket)}bucket.count+=1;count=bucket.count;if(publicRateBuckets.size>10_000)publicRateBuckets.forEach((value,storedKey)=>{if(value.resetAt<=current)publicRateBuckets.delete(storedKey)})}}catch{return res.status(503).json({error:'Proteção de acesso temporariamente indisponível'})}
 if(count>limit){res.setHeader('retry-after',String(Math.max(1,Math.ceil((resetAt-current)/1000))));return res.status(429).json({error:'Muitas tentativas; aguarde antes de tentar novamente'})}
 next()
}
if(databaseUrl)app.use(async(_req,res,next)=>{
 try {
  const loaded=await loadPostgresDb()
  dbRequestContext.run({...loaded,dirty:false},()=>{
   const originalEnd=res.end.bind(res);let ending=false
   res.end=((...args:any[])=>{
    if(ending)return res
    ending=true
    const context=dbRequestContext.getStore()
    if(!context?.dirty)return originalEnd(...args)
    void savePostgresDb(context).then(()=>originalEnd(...args)).catch((error:any)=>{res.statusCode=/outra operação/.test(String(error?.message))?409:503;res.setHeader('content-type','application/json; charset=utf-8');originalEnd(JSON.stringify({error:String(error?.message??'Falha ao persistir dados')}))})
    return res
   }) as typeof res.end
   next()
  })
 } catch(error){next(error)}
})
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
 const invoicePayload=payload?.invoice??payload,invoiceId=String(invoicePayload?.id??payload?.id??''),localReference=String(invoicePayload?.customData?.investmentId??invoicePayload?.items?.find((item:any)=>item?.customId)?.customId??payload?.customData?.investmentId??''),type=String(payload?.type??'').toLowerCase(),matches=(item:any)=>item.coinPaymentsInvoiceId?item.coinPaymentsInvoiceId===invoiceId:Boolean(localReference&&item.id===localReference),inv=db.investments.find(matches),planInvoice=db.invoices.find((item:any)=>item.productType==='ASSOCIATE_PLAN'&&matches(item))
 if(!inv&&!planInvoice)return res.status(404).json({error:'Fatura do webhook não encontrada'})
 try{validateWebhookInvoice(invoicePayload,inv??planInvoice)}catch(error:any){return res.status(422).json({error:error.message})}
 if(inv) {
  if(invoiceId&&!inv.coinPaymentsInvoiceId)inv.coinPaymentsInvoiceId=invoiceId
  if(inv.paymentStatus!=='CONFIRMED')inv.paymentProviderStatus=String(payload?.invoice?.state??payload?.type??'')
  inv.paymentConfirmations=Math.max(Number(inv.paymentConfirmations)||0,0,...(Array.isArray(payload?.invoice?.payments)?payload.invoice.payments.map((payment:any)=>Number(payment.confirmations)||0):[0]))
  if(type==='invoicepending'&&!['PAID','COMPLETED','CONFIRMED'].includes(inv.paymentStatus))inv.paymentStatus='PENDING'
  else if(type==='invoicepaid'&&!['COMPLETED','CONFIRMED'].includes(inv.paymentStatus))inv.paymentStatus='PAID'
  else if(type==='invoicecompleted'){if(inv.paymentStatus!=='CONFIRMED')inv.paymentStatus='COMPLETED';confirmInvestmentInDb(db,inv,'coinpayments-webhook');inv.paymentStatus='CONFIRMED';inv.status='Ativo';inv.reconciliationRequired=false;delete inv.paymentError}
   else if((type==='invoicecancelled'||type==='invoicetimedout')&&!['PAID','COMPLETED','CONFIRMED'].includes(inv.paymentStatus)){inv.paymentStatus=type==='invoicecancelled'?'CANCELLED':'TIMED_OUT';inv.status='Cancelado'}
  }
 if(planInvoice) {
  if(invoiceId&&!planInvoice.coinPaymentsInvoiceId)planInvoice.coinPaymentsInvoiceId=invoiceId
  if(planInvoice.paymentStatus!=='CONFIRMED')planInvoice.paymentProviderStatus=String(payload?.invoice?.state??payload?.type??'')
  planInvoice.paymentConfirmations=Math.max(Number(planInvoice.paymentConfirmations)||0,0,...(Array.isArray(payload?.invoice?.payments)?payload.invoice.payments.map((payment:any)=>Number(payment.confirmations)||0):[0]))
  if(type==='invoicepending'&&!['PAID','CONFIRMED'].includes(planInvoice.paymentStatus))planInvoice.paymentStatus='PENDING'
  else if(type==='invoicepaid'&&planInvoice.paymentStatus!=='CONFIRMED')planInvoice.paymentStatus='PAID'
  else if(type==='invoicecompleted'){
   planInvoice.paymentStatus='CONFIRMED';planInvoice.status='Pago';planInvoice.remaining=0;planInvoice.paidAt=now();planInvoice.reconciliationRequired=false;delete planInvoice.paymentError
   const participant=db.users.find(user=>user.id===planInvoice.userId&&user.role==='ASSOCIATE')
   if(participant&&participant.associatePlanStatus!=='ACTIVE'){participant.associatePlanStatus='ACTIVE';participant.associatePlanAmountCents=ASSOCIATE_PLAN_PRICE_CENTS;participant.associatePlanPaidAt=now();audit(db,'coinpayments-webhook','ASSOCIATE_PLAN_ACTIVATE','INVOICE',planInvoice.id,{userId:participant.id,coinPaymentsInvoiceId:invoiceId})}
  }
  else if((type==='invoicecancelled'||type==='invoicetimedout')&&!['PAID','CONFIRMED'].includes(planInvoice.paymentStatus)){planInvoice.paymentStatus=type==='invoicecancelled'?'CANCELLED':'TIMED_OUT';planInvoice.status='Cancelado'}
 }
 db.coinPaymentsWebhookEvents.unshift({id:eventKey,type:String(payload?.type??''),invoiceId,investmentId:inv?.id??null,associatePlanInvoiceId:planInvoice?.id??null,createdAt:now()})
 if(db.coinPaymentsWebhookEvents.length>10000)db.coinPaymentsWebhookEvents.length=10000
 writeDb(db)
 return res.json({received:true,idempotent:false})
})
app.post('/api/webhooks/pixpay',express.raw({type:'application/json',limit:'256kb'}),(req,res)=>{
 try { if(!verifyPixPayWebhookToken(req.query.token))return res.status(401).json({error:'Webhook PIXPAY não autorizado'}) }
 catch(error) { return res.status(error instanceof PixPayConfigurationError?503:401).json({error:'Webhook PIXPAY indisponível'}) }
 const rawBody=Buffer.isBuffer(req.body)?req.body.toString('utf8'):''
 let payload:any
 try { payload=JSON.parse(rawBody) } catch { return res.status(400).json({error:'JSON inválido'}) }
 const data=payload?.data??payload,transactionId=String(data?.transactionId??'').trim(),providerStatus=String(data?.status??'').trim().toUpperCase(),paymentMethod=String(data?.paymentMethod??'pix').trim().toLowerCase()
 if(!transactionId||!providerStatus||paymentMethod!=='pix')return res.status(422).json({error:'Notificação PIXPAY inválida'})
 const db=readDb(),matches=(item:any)=>item.paymentProvider==='PIXPAY'&&item.pixPayTransactionId===transactionId,inv=db.investments.find(matches),planInvoice=db.invoices.find((item:any)=>item.productType==='ASSOCIATE_PLAN'&&matches(item))
 if(!inv&&!planInvoice)return res.status(404).json({error:'Cobrança PIX não encontrada'})
 const target=inv??planInvoice,amountCents=parseWebhookAmountCents(data?.amount)
 if(amountCents===null||amountCents!==Number(target.amountCents))return res.status(422).json({error:'Valor da cobrança PIX não confere'})
 const eventKey=crypto.createHash('sha256').update(`${transactionId}:${providerStatus}:${rawBody}`).digest('hex')
 if(db.pixPayWebhookEvents.some(event=>event.id===eventKey))return res.json({received:true,idempotent:true})
 target.paymentProviderStatus=providerStatus
 if(providerStatus==='COMPLETED') {
  if(inv&&inv.paymentStatus!=='CONFIRMED')confirmInvestmentInDb(db,inv,'pixpay-webhook')
  if(planInvoice&&planInvoice.paymentStatus!=='CONFIRMED') {
   Object.assign(planInvoice,{paymentStatus:'CONFIRMED',status:'Pago',remaining:0,paidAt:now(),reconciliationRequired:false});delete planInvoice.paymentError
   const participant=db.users.find(user=>user.id===planInvoice.userId&&user.role==='ASSOCIATE')
   if(participant){participant.associatePlanStatus='ACTIVE';participant.associatePlanAmountCents=ASSOCIATE_PLAN_PRICE_CENTS;participant.associatePlanPaidAt=now();audit(db,'pixpay-webhook','ASSOCIATE_PLAN_ACTIVATE','INVOICE',planInvoice.id,{userId:participant.id,pixPayTransactionId:transactionId})}
  }
 } else if(providerStatus==='FAILED') {
  if(target.paymentStatus!=='CONFIRMED')Object.assign(target,{paymentStatus:'FAILED',status:'Cancelado',reconciliationRequired:false})
 } else if(target.paymentStatus!=='CONFIRMED') target.paymentStatus='PENDING'
 db.pixPayWebhookEvents.unshift({id:eventKey,transactionId,status:providerStatus,investmentId:inv?.id??null,associatePlanInvoiceId:planInvoice?.id??null,createdAt:now()})
 if(db.pixPayWebhookEvents.length>10000)db.pixPayWebhookEvents.length=10000
 writeDb(db)
 return res.json({received:true,idempotent:false})
})
app.use(express.json())
app.get('/api/cron/daily-profitability',(req,res)=>{const secret=String(process.env.CRON_SECRET??'');if(secret.length<16)return res.status(503).json({error:'CRON_SECRET não configurado'});if(req.header('authorization')!==`Bearer ${secret}`)return res.status(401).json({error:'Cron não autorizado'});const d=readDb(),date=saoPauloDate(),run=d.dailyProfitabilityRuns.find(item=>item.date===date);if(!run)return res.json({processed:false,date,reason:'Nenhum Diário cadastrado para hoje'});try{const result=processDailyProfitabilityRun(d,run,'SYSTEM_CRON');if(!result.idempotent)writeDb(d);res.json({processed:true,...result})}catch(error:any){res.status(422).json({error:error.message})}})
function auth(req:Request,res:Response,next:NextFunction) { const token=req.header('authorization')?.replace(/^Bearer\s+/i,''),db=readDb(),session=token?db.sessions[token]:undefined,id=session&&Date.parse(session.expiresAt)>Date.now()?session.userId:undefined,user=id&&db.users.find(u=>u.id===id); if(!user||user.status!=='ACTIVE') { if(token&&db.sessions[token]){delete db.sessions[token];writeDb(db)} return res.status(401).json({error:'Sessão inválida ou conta inativa'}); } (req as any).user=user; next() }
function admin(req:Request,res:Response,next:NextFunction) { if((req as any).user.role!=='ADMIN_MASTER') return res.status(403).json({error:'Acesso administrativo obrigatório'}); next() }
function page<T>(items:T[], req:Request) { const p=Math.max(1,Number(req.query.page)||1), size=Math.min(100,Math.max(1,Number(req.query.pageSize)||20)); return {items:items.slice((p-1)*size,p*size),page:p,pageSize:size,total:items.length} }
function createSession(db:Db,user:MlmUser) { const token=crypto.randomBytes(32).toString('base64url');db.sessions[token]={userId:user.id,expiresAt:new Date(Date.now()+12*60*60*1000).toISOString()};for(const [key,session] of Object.entries(db.sessions))if(Date.parse(session.expiresAt)<=Date.now())delete db.sessions[key];return {token,user:publicUser(user)} }
app.post(['/api/auth/login','/api/login'],publicRateLimit,(req,res)=>{ const {username,password}=req.body??{},plainPassword=String(password??''),login=String(username).trim().toLowerCase(),db=readDb();let u=db.users.find(x=>x.username.toLowerCase()===login||x.email.toLowerCase()===login);if(!u&&login==='master')u=db.users.find(x=>x.username.toLowerCase()==='admin'); if(plainPassword.length>128||!u||!verify(plainPassword,String(u.passwordHash))||u.status!=='ACTIVE') return res.status(401).json({error:'Usuário ou senha inválidos'}); const session=createSession(db,u);writeDb(db);res.json(session) })
app.get('/api/auth/me',auth,(req,res)=>res.json({user:publicUser((req as any).user)}))
app.get('/api/public/invites/:inviteCode',publicRateLimit,(req,res)=>{const inviteCode=String(req.params.inviteCode).toLowerCase(),u=readDb().users.find(x=>x.inviteCode.toLowerCase()===inviteCode); if(!u||!canSponsorRegistrations(u)) return res.status(404).json({error:'Convite indisponível'}); res.json({sponsor:{name:(u as any).name,inviteCode:u.inviteCode}})})
app.post('/api/public/register',publicRateLimit,(req,res)=>{ const b=req.body??{},password=String(b.password??''); if(!b.username||!b.email||password.length<6||password.length>128||!b.name) return res.status(422).json({error:'Informe nome, usuário, e-mail e uma senha entre 6 e 128 caracteres'}); const db=readDb(); try { const u=createRegistration(db.users,{username:b.username,email:b.email,passwordHash:hash(password),inviteCode:b.inviteCode,name:b.name}); db.users.push(u); const session=createSession(db,u);audit(db,u.id,'REGISTER','USER',u.id,{sponsorId:u.sponsorId,source:b.inviteCode?'INVITE':'DIRECT'});writeDb(db);res.status(201).json(session) } catch(e:any) { res.status(/already exists/.test(e.message)?409:422).json({error:e.message}) } })
function descendants(db:Db,id:string) { const out=new Set<string>([id]); let changed=true; while(changed){changed=false; for(const u of db.users) if(u.sponsorId&&out.has(u.sponsorId)&&!out.has(u.id)){out.add(u.id);changed=true}} return out }
function businessSummary(db:Db,user:MlmUser) { const bonuses=db.bonusEntries.filter(entry=>entry.userId===user.id&&entry.amountCents>0),approvedBonusCents=bonuses.filter(entry=>entry.status==='APPROVED').reduce((sum,entry)=>sum+entry.amountCents,0),pendingBonusCents=bonuses.filter(entry=>entry.status==='PENDING').reduce((sum,entry)=>sum+entry.amountCents,0),blockedBonusCents=bonuses.filter(entry=>entry.status==='BLOCKED_UPGRADE').reduce((sum,entry)=>sum+entry.amountCents,0),quotaAmountCents=confirmedQuotaCents(db,user.id),dailyEarningCents=db.dailyProfitabilities.filter(entry=>entry.userId===user.id).reduce((sum,entry)=>sum+Number(entry.creditedAmountCents||0),0),cappedEarningCents=db.dailyProfitabilities.filter(entry=>entry.userId===user.id).reduce((sum,entry)=>sum+Number(entry.cappedAmountCents||0),0)+bonuses.filter(entry=>entry.status==='CAPPED_200_PERCENT').reduce((sum,entry)=>sum+entry.amountCents,0),earningCapCents=user.membershipType==='SHAREHOLDER'?quotaAmountCents*2:Number(user.bonusCapCents||ASSOCIATE_BONUS_CAP_CENTS),earningCapConsumedCents=approvedBonusCents+pendingBonusCents+dailyEarningCents,earningCapRemainingCents=Math.max(0,earningCapCents-earningCapConsumedCents),registrationAudit=db.auditLogs.find(entry=>entry.action==='REGISTER'&&entry.targetId===user.id),createdViaInvite=Boolean(user.registrationSource==='INVITE'||registrationAudit?.details?.source==='INVITE'),bonusPeriods=summarizeBonusPeriods(user.id,db.bonusEntries as any,db.transactions as any);return {...publicUser(user),createdViaInvite,bonusPeriods,approvedBonusCents,pendingBonusCents,blockedBonusCents,dailyEarningCents,cappedEarningCents,earningCapCents,earningCapConsumedCents,earningCapRemainingCents,bonusCapRemainingCents:earningCapRemainingCents,quotaAmountCents,canReceiveFinancialResults:user.membershipType==='SHAREHOLDER'}}
app.get('/api/network/summary',auth,(req,res)=>{const db=readDb(),u=(req as any).user, ids=descendants(db,u.id);res.json({directs:db.users.filter(x=>x.sponsorId===u.id).length,networkSize:ids.size-1,activeNetwork:db.users.filter(x=>ids.has(x.id)&&x.status==='ACTIVE').length-1,pendingDirects:db.users.filter(x=>x.sponsorId===u.id&&x.status==='PENDING').length,...businessSummary(db,u)})})
app.get('/api/network/directs',auth,(req,res)=>res.json(page(readDb().users.filter(x=>x.sponsorId===(req as any).user.id).map(publicUser),req)))
app.get('/api/network/unilevel',auth,(req,res)=>{const db=readDb(), root=(req as any).user.id; let frontier=[root], out:any[]=[]; for(let l=1;l<=Math.min(20,Number(req.query.depth)||3);l++){frontier=db.users.filter(u=>frontier.includes(u.sponsorId||''));out.push(...frontier.map(u=>({...publicUser(u),level:l})));}res.json(out)})
app.get('/api/network/tree',auth,(req,res)=>{const db=readDb(), max=Math.min(10,Math.max(0,Number(req.query.depth)||3)); const build=(id:string,d:number):any=>{const u=db.users.find(x=>x.id===id)!;return {...publicUser(u),children:d<max?db.users.filter(x=>x.sponsorId===id).map(x=>build(x.id,d+1)):[]}};res.json(build((req as any).user.id,0))})
app.get('/api/network/search',auth,(req,res)=>{const db=readDb(), q=String(req.query.q||'').toLowerCase(),ids=descendants(db,(req as any).user.id);res.json(page(db.users.filter(u=>ids.has(u.id)&&((u as any).name?.toLowerCase().includes(q)||u.username.toLowerCase().includes(q))).map(publicUser),req))})
app.get('/api/bonuses/me',auth,(req,res)=>res.json(page(readDb().bonusEntries.filter(x=>x.userId===(req as any).user.id),req)))
app.get('/api/admin/dashboard',auth,admin,(_req,res)=>{const d=readDb();res.json({users:d.users.length,active:d.users.filter(u=>u.status==='ACTIVE').length,pending:d.users.filter(u=>u.status==='PENDING').length,associates:d.users.filter(u=>u.role==='ASSOCIATE'&&u.membershipType!=='SHAREHOLDER').length,shareholders:d.users.filter(u=>u.role==='ASSOCIATE'&&u.membershipType==='SHAREHOLDER').length,pendingPlans:d.users.filter(u=>u.role==='ASSOCIATE'&&u.associatePlanStatus!=='ACTIVE').length,vehicles:d.vehicles.length,activeVehicles:d.vehicles.filter((v:any)=>v.status==='Em operação').length,revenue:d.invoices.filter((x:any)=>x.status==='Pago').reduce((s:number,x:any)=>s+Number(x.amount||0),0),pendingWithdrawals:d.withdrawals.filter((x:any)=>x.status==='Pendente').length,openTickets:d.tickets.filter((x:any)=>x.status!=='Resolvido').length,bonusPendingCents:d.bonusEntries.filter(b=>b.status==='PENDING').reduce((s,b)=>s+b.amountCents,0),bonusBlockedCents:d.bonusEntries.filter(b=>b.status==='BLOCKED_UPGRADE').reduce((s,b)=>s+b.amountCents,0)})})
app.get('/api/admin/associates',auth,admin,(req,res)=>{const d=readDb();res.json(page(d.users.filter(u=>u.role==='ASSOCIATE').map(u=>({...publicUser(u),phone:d.profiles[u.id]?.phone??''})),req))})
app.post('/api/admin/associates',auth,admin,(req,res)=>{
 const b=req.body??{},d=readDb(),username=String(b.username??'').trim().toLowerCase(),email=String(b.email??'').trim().toLowerCase(),password=String(b.password??''),sponsor=b.sponsorId?d.users.find(u=>u.id===b.sponsorId&&canSponsorRegistrations(u)):d.users.find(u=>u.role==='ADMIN_MASTER'&&canSponsorRegistrations(u))
 if(!String(b.name??'').trim()||username.length<3||username==='master'||!email.includes('@')||password.length<6||password.length>128||!sponsor)return res.status(422).json({error:'Preencha nome, usuário, e-mail, senha e patrocinador válidos'})
 if(d.users.some(u=>u.username.toLowerCase()===username||u.email.toLowerCase()===email))return res.status(409).json({error:'Usuário ou e-mail já cadastrado'})
 const associatePlanStatus=['ACTIVE','PENDING','INACTIVE'].includes(b.associatePlanStatus)?b.associatePlanStatus:'PENDING',requestedStatus=['ACTIVE','PENDING','BLOCKED'].includes(b.status)?b.status:'PENDING'
 const account:MlmUser={id:crypto.randomUUID(),name:String(b.name).trim(),username,email,passwordHash:hash(password),role:'ASSOCIATE',status:requestedStatus,sponsorId:sponsor.id,inviteCode:`${username.replace(/[^a-z0-9]/g,'').slice(0,14)}${Math.random().toString(36).slice(2,6)}`,membershipType:'ASSOCIATE',associatePlanStatus,associatePlanAmountCents:ASSOCIATE_PLAN_PRICE_CENTS,bonusCapCents:ASSOCIATE_BONUS_CAP_CENTS,...(associatePlanStatus==='ACTIVE'?{associatePlanPaidAt:now()}:{})}
 d.users.push(account);d.profiles[account.id]={name:account.name,email:account.email,phone:String(b.phone??''),country:'Brasil'};audit(d,(req as any).user.id,'RECORD_CREATE','USER',account.id,{sponsorId:account.sponsorId,status:account.status});writeDb(d);res.status(201).json(publicUser(account))
})
app.patch('/api/admin/associates/:id',auth,admin,(req,res)=>{
 const b=req.body??{},d=readDb(),account=d.users.find(u=>u.id===req.params.id&&u.role==='ASSOCIATE');if(!account)return res.status(404).json({error:'Usuário não encontrado'})
 const username=String(b.username??account.username).trim().toLowerCase(),email=String(b.email??account.email).trim().toLowerCase(),name=String(b.name??account.name??'').trim(),requestedSponsorId=b.sponsorId===null?d.users.find(u=>u.role==='ADMIN_MASTER')?.id:b.sponsorId
 if(!name||username.length<3||(username==='master'&&account.username!=='master')||!email.includes('@'))return res.status(422).json({error:'Nome, usuário e e-mail são obrigatórios'})
 if(d.users.some(u=>u.id!==account.id&&(u.username.toLowerCase()===username||u.email.toLowerCase()===email)))return res.status(409).json({error:'Usuário ou e-mail já cadastrado'})
 if(requestedSponsorId&&(!d.users.some(u=>u.id===requestedSponsorId&&canSponsorRegistrations(u))||wouldCreateSponsorCycle(d.users,account.id,requestedSponsorId)))return res.status(422).json({error:'Patrocinador precisa estar financeiramente elegível e não pode criar um ciclo'})
 const nextPlanStatus=['ACTIVE','PENDING','INACTIVE'].includes(b.associatePlanStatus)?b.associatePlanStatus:account.associatePlanStatus,nextStatus=['ACTIVE','PENDING','BLOCKED'].includes(b.status)?b.status:account.status
 const oldName=String(account.name??'');Object.assign(account,{name,username,email,status:nextStatus,associatePlanStatus:nextPlanStatus,sponsorId:requestedSponsorId??account.sponsorId});if(nextPlanStatus==='ACTIVE'&&!account.associatePlanPaidAt)account.associatePlanPaidAt=now();if(b.password){if(String(b.password).length<6||String(b.password).length>128)return res.status(422).json({error:'A senha deve ter entre 6 e 128 caracteres'});account.passwordHash=hash(String(b.password))}d.profiles[account.id]={...(d.profiles[account.id]??{}),name,email,phone:b.phone??d.profiles[account.id]?.phone??''}
 d.vehicles.filter((v:any)=>v.userId===account.id||v.driver===oldName).forEach((v:any)=>{v.userId=account.id;v.driver=name});audit(d,(req as any).user.id,'RECORD_UPDATE','USER',account.id,{name,username,email,status:account.status,sponsorId:account.sponsorId});writeDb(d);res.json(publicUser(account))
})
app.delete('/api/admin/associates/:id',auth,admin,(req,res)=>{
 const d=readDb(),account=d.users.find(u=>u.id===req.params.id&&u.role==='ASSOCIATE');if(!account)return res.status(404).json({error:'Usuário não encontrado'})
 if(d.commissionEvents.some(event=>event.investorId===account.id)||d.bonusEntries.some(entry=>entry.userId===account.id)||d.investments.some(investment=>investment.userId===account.id))return res.status(422).json({error:'Conta com histórico financeiro não pode ser excluída; altere o status para Bloqueado'})
 d.users.filter(u=>u.sponsorId===account.id).forEach(u=>u.sponsorId=account.sponsorId);for(const key of ['investments','orders','invoices','transactions','withdrawals','tickets','cart'])d[key]=d[key].filter((item:any)=>item.userId!==account.id);d.vehicles.filter((v:any)=>v.userId===account.id).forEach((v:any)=>{delete v.userId;v.driver='—'});d.bonusEntries=d.bonusEntries.filter((item:any)=>item.userId!==account.id);delete d.profiles[account.id];audit(d,(req as any).user.id,'RECORD_DELETE','USER',account.id,{username:account.username});d.users=d.users.filter(u=>u.id!==account.id);writeDb(d);res.json({id:account.id})
})
app.get('/api/admin/network/tree',auth,admin,(req,res)=>{const d=readDb(), requestedRoot=typeof req.query.rootUserId==='string'?req.query.rootUserId.trim():'', rootId=requestedRoot||(d.users.find(user=>user.role==='ADMIN_MASTER')?.id||''); const requestedDepth=Number(req.query.depth);const depth=Math.min(10,Math.max(0,Number.isFinite(requestedDepth)?Math.floor(requestedDepth):3));try{const redact=(node:any):any=>{const {passwordHash,...user}=node;return {...user,children:node.children.map(redact)}};res.json(redact(buildNetworkTree(d.users,rootId,depth)))}catch(error:any){res.status(422).json({error:error.message})}})
app.get('/api/admin/associates/:id',auth,admin,(req,res)=>{const u=readDb().users.find(x=>x.id===req.params.id);if(!u)return res.status(404).json({error:'Associado não encontrado'});res.json(publicUser(u))})
app.patch('/api/admin/associates/:id/status',auth,admin,(req,res)=>{const d=readDb(),u=d.users.find(x=>x.id===req.params.id&&x.role==='ASSOCIATE'),status=req.body?.status;if(!u)return res.status(404).json({error:'Associado não encontrado'});if(!['ACTIVE','BLOCKED','PENDING'].includes(status)||(status==='BLOCKED'&&!req.body.reason))return res.status(422).json({error:'Status/reason inválido'});u.status=status;audit(d,(req as any).user.id,'STATUS_CHANGE','USER',u.id,{status,reason:req.body.reason});writeDb(d);res.json(publicUser(u))})
app.patch('/api/admin/associates/:id/sponsor',auth,admin,(req,res)=>{const d=readDb(),u=d.users.find(x=>x.id===req.params.id&&x.role==='ASSOCIATE'),s=d.users.find(x=>x.id===req.body?.sponsorId);if(!u)return res.status(404).json({error:'Associado não encontrado'});if(!s||!canSponsorRegistrations(s)||!String(req.body?.reason??'').trim()||wouldCreateSponsorCycle(d.users,u.id,s.id))return res.status(422).json({error:'Patrocinador inelegível, ciclo ou justificativa ausente'});u.sponsorId=s.id;audit(d,(req as any).user.id,'SPONSOR_CHANGE','USER',u.id,{sponsorId:s.id,reason:String(req.body.reason).trim()});writeDb(d);res.json(publicUser(u))})
app.get('/api/admin/commission-rules',auth,admin,(req,res)=>res.json(page(readDb().commissionRules,req)))
app.post('/api/admin/commission-rules',auth,admin,(req,res)=>{const b=req.body??{},name=String(b.name??'').trim();if(!name)return res.status(422).json({error:'Informe o nome da regra'});try{const d=readDb(),plan=validateCommissionPlan(b.levels,b.directReferralBps),r={id:crypto.randomUUID(),name,eventType:'INVESTMENT_CONFIRMED',active:Boolean(b.active),...plan,createdAt:now(),updatedAt:now()};if(r.active)d.commissionRules.forEach(x=>x.active=false);d.commissionRules.push(r);audit(d,(req as any).user.id,'RULE_CREATE','RULE',r.id,{...plan,active:r.active});writeDb(d);res.status(201).json(r)}catch(error:any){res.status(422).json({error:error.message})}})
app.patch('/api/admin/commission-rules/:id',auth,admin,(req,res)=>{const d=readDb(),r=d.commissionRules.find(x=>x.id===req.params.id);if(!r)return res.status(404).json({error:'Regra não encontrada'});try{if(req.body?.name!==undefined){const name=String(req.body.name).trim();if(!name)throw new Error('Informe o nome da regra');r.name=name}if(req.body?.levels!==undefined||req.body?.directReferralBps!==undefined)Object.assign(r,validateCommissionPlan(req.body?.levels??r.levels,req.body?.directReferralBps??r.directReferralBps));if(req.body?.active!==undefined)r.active=Boolean(req.body.active);r.updatedAt=now();if(r.active)d.commissionRules.filter(x=>x.id!==r.id&&x.eventType===r.eventType).forEach(x=>{x.active=false;x.updatedAt=now()});audit(d,(req as any).user.id,'RULE_UPDATE','RULE',r.id,{directReferralBps:r.directReferralBps,levels:r.levels,active:r.active});writeDb(d);res.json(r)}catch(error:any){res.status(422).json({error:error.message})}})
app.delete('/api/admin/commission-rules/:id',auth,admin,(req,res)=>{const d=readDb(),index=d.commissionRules.findIndex(x=>x.id===req.params.id);if(index<0)return res.status(404).json({error:'Regra não encontrada'});const rule=d.commissionRules[index];if(rule.active)return res.status(422).json({error:'Desative a regra antes de excluí-la'});if(d.commissionEvents.some(event=>event.ruleSnapshot?.id===rule.id))return res.status(422).json({error:'Regra utilizada em comissões não pode ser excluída'});d.commissionRules.splice(index,1);audit(d,(req as any).user.id,'RULE_DELETE','RULE',rule.id);writeDb(d);res.json({id:rule.id})})
app.get('/api/admin/bonus-entries',auth,admin,(req,res)=>res.json(page(readDb().bonusEntries,req)))
app.get('/api/admin/daily-profitabilities',auth,admin,(req,res)=>res.json(page(readDb().dailyProfitabilityRuns,req)))
app.post('/api/admin/daily-profitabilities',auth,admin,(req,res)=>{const d=readDb(),date=String(req.body?.date??'').trim(),rateBps=Number(req.body?.rateBps);if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isInteger(rateBps)||rateBps<1||rateBps>10_000)return res.status(422).json({error:'Informe uma data e um percentual diário válido'});if(d.dailyProfitabilityRuns.some(run=>run.date===date))return res.status(409).json({error:'O Diário desta data já foi cadastrado'});const run={id:crypto.randomUUID(),date,rateBps,description:String(req.body?.description??'').trim(),status:'SCHEDULED',createdBy:(req as any).user.id,createdAt:now()};d.dailyProfitabilityRuns.unshift(run);audit(d,(req as any).user.id,'DAILY_PROFITABILITY_SCHEDULE','DAILY_PROFITABILITY',run.id,{date,rateBps});writeDb(d);res.status(201).json({run})})
app.post('/api/admin/daily-profitabilities/:id/process',auth,admin,(req,res)=>{const d=readDb(),run=d.dailyProfitabilityRuns.find(item=>item.id===req.params.id);if(!run)return res.status(404).json({error:'Diário não encontrado'});try{const result=processDailyProfitabilityRun(d,run,(req as any).user.id);if(!result.idempotent)writeDb(d);res.json(result)}catch(error:any){res.status(422).json({error:error.message})}})
for (const [action,status] of [['approve','APPROVED'],['cancel','CANCELLED']] as const) app.post(`/api/admin/bonus-entries/:id/${action}`,auth,admin,(req,res)=>{const d=readDb(),id=String(req.params.id),index=d.bonusEntries.findIndex(x=>x.id===id);if(index<0)return res.status(404).json({error:'Bônus não encontrado'});try{const entry=transitionBonus(d.bonusEntries[index] as any,status);d.bonusEntries[index]=entry;if(status==='APPROVED'&&!d.transactions.some((item:any)=>item.bonusEntryId===entry.id))d.transactions.unshift({id:crypto.randomUUID(),userId:entry.userId,bonusEntryId:entry.id,date:new Date().toLocaleDateString('pt-BR'),description:entry.type==='MANUAL'?'Crédito manual aprovado':`Bônus ${entry.level?`nível ${entry.level}`:'de rede'} aprovado`,amount:entry.amountCents/100,status:'Crédito',createdAt:now()});audit(d,(req as any).user.id,`BONUS_${action.toUpperCase()}`,'BONUS',entry.id,{amountCents:entry.amountCents,userId:entry.userId});writeDb(d);res.json(entry)}catch(error:any){res.status(422).json({error:error.message})}})
app.post('/api/admin/bonus-entries/:id/reverse',auth,admin,(req,res)=>{const d=readDb(),id=String(req.params.id),reason=typeof req.body?.reason==='string'?req.body.reason:'';try{const reversal=createBonusReversal(d.bonusEntries as any,id,reason);d.bonusEntries.push(reversal);if(!d.transactions.some((item:any)=>item.bonusEntryId===reversal.id))d.transactions.unshift({id:crypto.randomUUID(),userId:reversal.userId,bonusEntryId:reversal.id,date:new Date().toLocaleDateString('pt-BR'),description:'Estorno de bônus aprovado',amount:reversal.amountCents/100,status:'Débito',createdAt:now()});audit(d,(req as any).user.id,'BONUS_REVERSE','BONUS',id,{reversalId:reversal.id,reason:reversal.reason});writeDb(d);res.status(201).json(reversal)}catch(error:any){const status=/not found/.test(error.message)?404:422;res.status(status).json({error:error.message})}})
app.post('/api/admin/bonus-entries/manual-credit',auth,admin,(req,res)=>{const b=req.body??{},d=readDb(),recipient=d.users.find(u=>u.id===b.userId&&isBonusEligibleParticipant(u));if(!recipient||!Number.isInteger(b.amountCents)||b.amountCents<=0||!String(b.reason??'').trim())return res.status(422).json({error:'Selecione uma conta financeiramente elegível, valor e justificativa válidos'});const allocation=allocateEarning(d,recipient,b.amountCents),created:any[]=[];if(allocation.availableCents)created.push({id:crypto.randomUUID(),userId:recipient.id,amountCents:allocation.availableCents,status:'PENDING',type:'MANUAL',reason:String(b.reason).trim(),createdAt:now()});if(allocation.cappedCents)created.push({id:crypto.randomUUID(),userId:recipient.id,amountCents:allocation.cappedCents,status:recipient.membershipType==='SHAREHOLDER'?'CAPPED_200_PERCENT':'BLOCKED_UPGRADE',type:'MANUAL',reason:recipient.membershipType==='SHAREHOLDER'?'Teto de 200% das cotas atingido; renove suas cotas para ampliar o limite':'Limite de R$ 500,00 atingido; valor aguardando upgrade para Cotista',createdAt:now()});d.bonusEntries.push(...created);audit(d,(req as any).user.id,'BONUS_MANUAL','BONUS',created[0].id,{userId:recipient.id,amountCents:b.amountCents,cappedCents:allocation.cappedCents,capCents:allocation.capCents});writeDb(d);res.status(201).json(created[0])})
app.post('/api/admin/investments/:id/confirm',auth,admin,(req,res)=>{const d=readDb(),inv=d.investments.find(x=>x.id===req.params.id);if(!inv)return res.status(404).json({error:'Investimento não encontrado'});try{const result=confirmInvestmentInDb(d,inv,(req as any).user.id);if(!result.idempotent)writeDb(d);res.json(result)}catch(error:any){res.status(422).json({error:error.message})}})
app.get('/api/admin/audit-logs',auth,admin,(req,res)=>res.json(page(readDb().auditLogs,req)))
for(const key of ['vehicles','investments','orders','invoices','withdrawals','tickets'] as const) {
 app.get(`/api/admin/${key}`,auth,admin,(req,res)=>res.json(page(readDb()[key],req)))
 app.post(`/api/admin/${key}`,auth,admin,(req,res)=>{const b=req.body??{},d=readDb(),owner=b.userId?d.users.find((u:any)=>u.id===b.userId&&u.role==='ASSOCIATE'):undefined;if(key!=='vehicles'&&!owner)return res.status(422).json({error:'Selecione uma conta de usuário válida'});if(b.userId&&!owner)return res.status(422).json({error:'Usuário inválido'});const prefixes:any={vehicles:'VEI',investments:'ATV',orders:'PED',invoices:'INV',withdrawals:'SAQ',tickets:'TK'},item:any={...b,id:`${prefixes[key]}-${Date.now().toString(36)}`,createdAt:now()};if(!item.date&&key!=='vehicles'&&key!=='invoices')item.date=new Date().toLocaleDateString('pt-BR');if(key==='vehicles')item.driver=owner?.name??'—';if(key==='investments'){try{Object.assign(item,parseQuotaAmount(b.amount),{pack:'Cotas GoMove'})}catch(error:any){return res.status(422).json({error:error.message})}}d[key].unshift(item);audit(d,(req as any).user.id,'RECORD_CREATE',key.toUpperCase(),item.id,item);writeDb(d);res.status(201).json(item)})
 app.patch(`/api/admin/${key}/:id`,auth,admin,(req,res)=>{const d=readDb(),item=d[key].find((x:any)=>x.id===req.params.id),b={...(req.body??{})} as any;if(!item)return res.status(404).json({error:'Registro não encontrado'});if(b.userId&&!d.users.some((u:any)=>u.id===b.userId&&u.role==='ASSOCIATE'))return res.status(422).json({error:'Usuário inválido'});let parsedInvestment:any;if(key==='investments'&&b.amount!==undefined){try{parsedInvestment=parseQuotaAmount(b.amount)}catch(error:any){return res.status(422).json({error:error.message})}}if(key==='investments')delete b.amountCents;const previousStatus=item.status;Object.assign(item,b,{id:item.id},parsedInvestment??{});if(key==='vehicles')item.driver=d.users.find((u:any)=>u.id===item.userId)?.name??'—';if(key==='withdrawals'&&item.status==='Pago'&&previousStatus!=='Pago'&&!d.transactions.some((transaction:any)=>transaction.withdrawalId===item.id)){item.paidAt=new Date().toLocaleDateString('pt-BR');d.transactions.unshift({id:crypto.randomUUID(),userId:item.userId,withdrawalId:item.id,date:item.paidAt,description:`Saque ${item.id}`,amount:-Math.abs(Number(item.amount)),status:'Débito',createdAt:now()})}audit(d,(req as any).user.id,'RECORD_UPDATE',key.toUpperCase(),item.id,b);writeDb(d);res.json(item)})
 app.delete(`/api/admin/${key}/:id`,auth,admin,(req,res)=>{const d=readDb(),index=d[key].findIndex((x:any)=>x.id===req.params.id);if(index<0)return res.status(404).json({error:'Registro não encontrado'});const [item]=d[key].splice(index,1);audit(d,(req as any).user.id,'RECORD_DELETE',key.toUpperCase(),item.id);writeDb(d);res.json({id:item.id})})
}
// Legacy UI resources are authenticated and scoped to the caller where owner/user ownership exists.
for(const key of ['cart','investments','orders','tickets','invoices','withdrawals'] as const) app.get(`/api/${key}`,auth,(req,res)=>{const d=readDb(),u=(req as any).user;res.json(d[key].filter((x:any)=>!x.userId||x.userId===u.id))})
app.put('/api/profile',auth,(req,res)=>{const d=readDb(),u=(req as any).user,allowed=['name','email','phone','birthdate','language','country','twoFactorLogin','twoFactorWithdraw','pixType'];d.profiles[u.id]={...(d.profiles[u.id]??{}),...Object.fromEntries(Object.entries(req.body??{}).filter(([k])=>allowed.includes(k)))};const account=d.users.find(x=>x.id===u.id) as any;if(account&&req.body?.name)account.name=req.body.name;if(account&&req.body?.email)account.email=req.body.email;writeDb(d);res.json(d.profiles[u.id])})
app.post('/api/associate-plan',auth,async(req,res)=>{
 const b=req.body??{},user=(req as any).user as MlmUser,idempotencyKey=String(b.idempotencyKey??'').trim()
 if(!idempotencyKey)return res.status(422).json({error:'Identificador idempotente ausente'})
 const openStatuses=new Set(['INVOICE_CREATING','PENDING','PAID','PROVIDER_UNKNOWN'])
 let d=readDb(),invoice=d.invoices.find((item:any)=>item.userId===user.id&&item.productType==='ASSOCIATE_PLAN'&&item.idempotencyKey===idempotencyKey)
 if(invoice&&NON_RETRYABLE_CHECKOUT_STATUSES.has(invoice.paymentStatus))return res.status(409).json({error:'Esta tentativa de pagamento foi encerrada; inicie outra com uma nova chave'})
 if(invoice?.paymentUrl||invoice?.paymentStatus==='CONFIRMED')return res.json(invoice)
 if(invoice)return res.status(409).json({error:'A cobrança está em processamento ou conciliação; tente novamente em instantes'})
 invoice=d.invoices.find((item:any)=>item.userId===user.id&&item.productType==='ASSOCIATE_PLAN'&&openStatuses.has(item.paymentStatus))
 if(invoice?.paymentUrl)return res.json(invoice)
 if(invoice)return res.status(409).json({error:'A cobrança está em processamento ou conciliação; tente novamente em instantes'})
 if(user.associatePlanStatus==='ACTIVE')return res.status(409).json({error:'O Plano de Associado já está ativo'})
 const isPix=String(b.paymentMethod??b.preferredPaymentAsset??'').toUpperCase()==='PIX';let customerDocument:string|undefined
 if(isPix){try{customerDocument=normalizeCustomerDocument(b.customerDocument)}catch(error:any){return res.status(422).json({error:error.message})}}
 const paymentAsset=isPix?'PIX':(['BTC','USDT','OTHER'].includes(String(b.preferredPaymentAsset))?String(b.preferredPaymentAsset):'OTHER');invoice={id:crypto.randomUUID(),userId:user.id,createdAt:now(),due:new Date().toLocaleDateString('pt-BR'),description:'Plano de Associado GoMove',productType:'ASSOCIATE_PLAN',amount:ASSOCIATE_PLAN_PRICE_CENTS/100,amountCents:ASSOCIATE_PLAN_PRICE_CENTS,remaining:ASSOCIATE_PLAN_PRICE_CENTS/100,status:'Aguardando pagamento',paymentStatus:'INVOICE_CREATING',paymentProvider:isPix?'PIXPAY':'COINPAYMENTS',paymentMethod:isPix?'PIX':'CoinPayments',paymentAsset,idempotencyKey};d.invoices.unshift(invoice)
 const targetInvoiceId=invoice.id
 writeDb(d)
 try{await flushDb()}catch(error:any){if(!/alterados por outra operação/.test(String(error?.message)))throw error;d=await refreshDb();invoice=d.invoices.find((item:any)=>item.userId===user.id&&item.productType==='ASSOCIATE_PLAN'&&openStatuses.has(item.paymentStatus));if(invoice?.paymentUrl)return res.json(invoice);return res.status(409).json({error:'A cobrança já está sendo criada; tente novamente em instantes'})}
 try {
  if(isPix){const transaction=await createPixPayTransaction({amount:invoice.amount,customerName:String(user.name??user.username),customerEmail:String(user.email),customerDocument:customerDocument!});invoice=await mergePixPayTransaction('invoices',targetInvoiceId,transaction,(currentDb,currentInvoice)=>audit(currentDb,user.id,'PIXPAY_TRANSACTION_CREATE','ASSOCIATE_PLAN',currentInvoice.id,{pixPayTransactionId:transaction.id}))}
  else {const providerInvoice=await createCoinPaymentsInvoice({investmentId:targetInvoiceId,pack:invoice.description,amount:invoice.amount,buyerName:String(user.name??user.username),buyerEmail:String(user.email),successPath:'/activation?payment=success',cancelPath:'/activation?payment=cancelled'});invoice=await mergeProviderInvoice('invoices',targetInvoiceId,providerInvoice,(currentDb,currentInvoice)=>audit(currentDb,user.id,'COINPAYMENTS_INVOICE_CREATE','ASSOCIATE_PLAN',currentInvoice.id,{coinPaymentsInvoiceId:providerInvoice.id}))}
  if(!invoice)return res.status(409).json({error:'A fatura foi removida durante a criação da cobrança'})
  return res.status(201).json(invoice)
 } catch(error:any) {
  d=await refreshDb();invoice=d.invoices.find((item:any)=>item.id===targetInvoiceId)
  const configurationError=isPix?error instanceof PixPayConfigurationError:error instanceof CoinPaymentsConfigurationError
  if(invoice&&['INVOICE_CREATING','PENDING','PAID'].includes(invoice.paymentStatus)){if(invoice.paymentStatus!=='PAID')invoice.paymentStatus=configurationError?'ERROR':'PROVIDER_UNKNOWN';invoice.reconciliationRequired=!configurationError;invoice.paymentError=configurationError?String(error?.message??'Configuração inválida'):'Resposta do provedor não confirmada; conciliação necessária';writeDb(d);await flushDb()}
  const status=configurationError?503:502,provider=isPix?'PIXPAY':'CoinPayments'
  return res.status(status).json({error:status===503?`${provider} ainda não foi configurado pelo administrador`:`Não foi possível iniciar o pagamento no ${provider}`})
 }
})
app.post('/api/investments',auth,async(req,res)=>{
 const b=req.body??{},user=(req as any).user as MlmUser,pack='Cotas GoMove'
 let amount:number,amountCents:number;try{({amount,amountCents}=parseQuotaAmount(b.amount))}catch(error:any){return res.status(422).json({error:error.message})}
 const idempotencyKey=String(b.idempotencyKey??'').trim()
 if(!idempotencyKey)return res.status(422).json({error:'Identificador idempotente ausente'})
 let d=readDb(),investment=d.investments.find((item:any)=>item.userId===user.id&&item.idempotencyKey===idempotencyKey)
 if(investment&&NON_RETRYABLE_CHECKOUT_STATUSES.has(investment.paymentStatus))return res.status(409).json({error:'Esta tentativa de pagamento foi encerrada; inicie outra com uma nova chave'})
 if(investment?.paymentUrl||investment?.paymentStatus==='CONFIRMED')return res.json(investment)
 if(investment)return res.status(409).json({error:'A cobrança está em processamento ou conciliação; tente novamente em instantes'})
 investment=d.investments.find((item:any)=>item.userId===user.id&&(item.paymentStatus==='PROVIDER_UNKNOWN'||(item.paymentStatus==='PAID'&&item.reconciliationRequired)))
 if(investment)return res.status(409).json({error:'Existe um pagamento aguardando conciliação com o provedor'})
 const isPix=String(b.paymentMethod??b.preferredPaymentAsset??'').toUpperCase()==='PIX';let customerDocument:string|undefined
 if(isPix){try{customerDocument=normalizeCustomerDocument(b.customerDocument)}catch(error:any){return res.status(422).json({error:error.message})}}
 const paymentAsset=isPix?'PIX':(['BTC','USDT','OTHER'].includes(String(b.preferredPaymentAsset))?String(b.preferredPaymentAsset):'OTHER');investment={id:crypto.randomUUID(),userId:user.id,date:new Date().toLocaleDateString('pt-BR'),createdAt:now(),pack,amount,amountCents,profit:0,status:'Aguardando pagamento',paymentStatus:'INVOICE_CREATING',paymentProvider:isPix?'PIXPAY':'COINPAYMENTS',paymentMethod:isPix?'PIX':'CoinPayments',paymentAsset,idempotencyKey};d.investments.unshift(investment)
 const targetInvestmentId=investment.id
 writeDb(d)
 try{await flushDb()}catch(error:any){if(!/alterados por outra operação/.test(String(error?.message)))throw error;d=await refreshDb();investment=d.investments.find((item:any)=>item.userId===user.id&&item.idempotencyKey===idempotencyKey);if(investment?.paymentUrl)return res.json(investment);return res.status(409).json({error:'A cobrança já está sendo criada; tente novamente em instantes'})}
 try {
  if(isPix){const transaction=await createPixPayTransaction({amount:investment.amount,customerName:String(user.name??user.username),customerEmail:String(user.email),customerDocument:customerDocument!});investment=await mergePixPayTransaction('investments',targetInvestmentId,transaction,(currentDb,currentInvestment)=>audit(currentDb,user.id,'PIXPAY_TRANSACTION_CREATE','INVESTMENT',currentInvestment.id,{pixPayTransactionId:transaction.id}))}
  else {const invoice=await createCoinPaymentsInvoice({investmentId:targetInvestmentId,pack:investment.pack,amount:investment.amount,buyerName:String(user.name??user.username),buyerEmail:String(user.email)});investment=await mergeProviderInvoice('investments',targetInvestmentId,invoice,(currentDb,currentInvestment)=>audit(currentDb,user.id,'COINPAYMENTS_INVOICE_CREATE','INVESTMENT',currentInvestment.id,{coinPaymentsInvoiceId:invoice.id}))}
  if(!investment)return res.status(409).json({error:'O investimento foi removido durante a criação da cobrança'})
  return res.status(201).json(investment)
 } catch(error:any) {
  d=await refreshDb();investment=d.investments.find((item:any)=>item.id===targetInvestmentId)
  const configurationError=isPix?error instanceof PixPayConfigurationError:error instanceof CoinPaymentsConfigurationError
  if(investment&&['INVOICE_CREATING','PENDING','PAID'].includes(investment.paymentStatus)){if(investment.paymentStatus!=='PAID')investment.paymentStatus=configurationError?'ERROR':'PROVIDER_UNKNOWN';investment.reconciliationRequired=!configurationError;investment.paymentError=configurationError?String(error?.message??'Configuração inválida'):'Resposta do provedor não confirmada; conciliação necessária';writeDb(d);await flushDb()}
  const status=configurationError?503:502,provider=isPix?'PIXPAY':'CoinPayments'
  return res.status(status).json({error:status===503?`${provider} ainda não foi configurado pelo administrador`:`Não foi possível iniciar o pagamento no ${provider}`})
 }
})
for(const key of ['cart','orders','tickets','invoices','withdrawals'] as const) {
 app.post(`/api/${key}`,auth,(req,res)=>{const d=readDb(),b={...(req.body??{})} as any,userId=(req as any).user.id;if(key==='withdrawals'){const amount=Number(b.amount),ledger=d.transactions.filter((item:any)=>item.userId===userId).reduce((sum:number,item:any)=>sum+Number(item.amount||0),0),reserved=d.withdrawals.filter((item:any)=>item.userId===userId&&['Pendente','Em análise'].includes(item.status)).reduce((sum:number,item:any)=>sum+Number(item.amount||0),0);if(!Number.isFinite(amount)||amount<50||amount>ledger-reserved)return res.status(422).json({error:'Valor indisponível para saque'});Object.assign(b,{amount,method:'PIX',status:'Pendente',paidAt:'—'})}const item={...b,id:crypto.randomUUID(),userId,date:new Date().toLocaleDateString('pt-BR'),createdAt:now()};d[key].unshift(item);writeDb(d);res.status(201).json(item)})
 app.patch(`/api/${key}/:id`,auth,(req,res)=>{const d=readDb(),item=d[key].find((x:any)=>x.id===req.params.id&&x.userId===(req as any).user.id);if(!item)return res.status(404).json({error:'Registro não encontrado'});Object.assign(item,req.body??{}, {id:item.id,userId:item.userId});writeDb(d);res.json(item)})
}
app.get('/api/state',auth,(req,res)=>{const d=readDb(),u=(req as any).user,owned=(rows:any[])=>rows.filter(item=>!item.userId||item.userId===u.id);res.json({vehicles:owned(d.vehicles),investments:owned(d.investments),orders:owned(d.orders),invoices:owned(d.invoices),transactions:owned(d.transactions),withdrawals:owned(d.withdrawals),tickets:owned(d.tickets),cart:owned(d.cart),profile:d.profiles[u.id]??{name:u.name,email:u.email},business:businessSummary(d,u)})})
app.get('/api/health',(_req,res)=>res.json({ok:true,service:'GoMove API'}))
const dist=path.join(root,'dist');if(fs.existsSync(dist)){app.use(express.static(dist));app.get(/.*/,(_req,res)=>res.sendFile(path.join(dist,'index.html')))}
if (process.env.NODE_ENV!=='test'&&!process.env.VERCEL) {
 const target=process.env.PASSENGER_APP_ENV?'passenger':Number(process.env.PORT||4010)
 app.listen(target,()=>console.log('GoMove API disponível'))
}
export { app, readDb, writeDb }
