import { after, test } from 'node:test'
import { strict as assert } from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gomove-master-'))
process.env.NODE_ENV='test'
process.env.GOMOVE_DATA_FILE=path.join(dir,'db.json')
const {app,readDb,writeDb}=await import('../server/index.js')
const server=app.listen(0)
await new Promise<void>(resolve=>server.listening?resolve():server.once('listening',resolve))
const address=server.address() as {port:number}
const request=async(route:string,token?:string,body?:unknown,method=body===undefined?'GET':'POST')=>{
 const response=await fetch(`http://127.0.0.1:${address.port}/api${route}`,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})})
 return {status:response.status,body:await response.json() as any}
}
after(async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));fs.rmSync(dir,{recursive:true,force:true})})
test('MASTER controls: authorization, ledger idempotency, support lifecycle, password revocation and reconciliation',async()=>{
 const master=(await request('/auth/login',undefined,{username:'admin',password:'gomove2026'})).body
 const normal=(await request('/auth/login',undefined,{username:'ana',password:'gomove2026'})).body
 const clean=readDb();clean.transactions=clean.transactions.filter((t:any)=>t.userId!==normal.user.id);clean.withdrawals.forEach((w:any)=>{if(w.userId===normal.user.id)w.status="Cancelado"});writeDb(clean)
 const id=normal.user.id,base=`/admin/associates/${id}`
 assert.equal((await request(`${base}/access`,normal.token,{})).status,403)
 assert.equal((await request(`${base}/balance-adjustments`,normal.token,{amountCents:10000,reason:'Correção',reference:'gate-1'})).status,403)
 const payload={amountCents:10000,reason:'Comprovante conferido',reference:'gate-1'}
 const credit=await request(`${base}/balance-adjustments`,master.token,payload);assert.equal(credit.status,201,JSON.stringify(credit.body))
 assert.equal((await request(`${base}/balance-adjustments`,master.token,payload)).body.idempotent,true)
 assert.equal((await request(`${base}/balance-adjustments`,master.token,{...payload,amountCents:5000})).status,409)
 assert.equal((await request(`${base}/balance-adjustments`,master.token,{...payload,reference:'bad',amountCents:-20000})).status,422)
 assert.equal((await request(`${base}/balance-adjustments`,master.token,{...payload,reference:'bad',amountCents:1.5})).status,422)
 assert.equal((await request(`${base}/account`,master.token)).body.balanceCents,10000)
 assert.equal((await request('/state',normal.token)).body.transactions.filter((t:any)=>t.adjustmentReference==='gate-1').length,1)
 const support=(await request(`${base}/access`,master.token,{})).body
 assert.equal(support.supportActor.id,master.user.id)
 assert.equal((await request('/admin/dashboard',support.token)).status,403)
 assert.equal((await request('/profile',support.token,{name:'Ana suporte'},'PUT')).status,200)
 assert.ok(readDb().auditLogs.some(log=>log.action==='SUPPORT_ACTION_ATTEMPT'&&log.actorId===master.user.id&&log.targetId===id))
 assert.equal((await request('/auth/logout',support.token,{})).status,200)
 assert.equal((await request('/state',support.token)).status,401)
 assert.equal((await request('/auth/me',master.token)).status,200)
 assert.equal((await request(base,master.token,{password:'changed-password'},'PATCH')).status,200)
 assert.equal((await request('/state',normal.token)).status,401)
 assert.equal((await request('/auth/login',undefined,{username:'ana',password:'changed-password'})).status,200)
 assert.ok(readDb().auditLogs.some(log=>log.action==='PASSWORD_RESET'&&!JSON.stringify(log).includes('changed-password')))
 const d=readDb();d.invoices.push({id:'plan-support',userId:id,productType:'ASSOCIATE_PLAN',amountCents:5500,amount:55,paymentStatus:'PENDING'});writeDb(d)
 const recon={recordId:'plan-support',kind:'invoices',reason:'Conferido no gateway',reference:'gateway-plan'}
 assert.equal((await request(`${base}/reconcile`,master.token,recon)).status,200)
 assert.equal((await request(`${base}/reconcile`,master.token,recon)).body.idempotent,true)
 assert.equal((await request(`${base}/account`,master.token)).body.balanceCents,10000)
 const blocked=readDb();blocked.users.find(u=>u.id===id)!.status='BLOCKED';writeDb(blocked)
 const blockedSupport=(await request(`${base}/access`,master.token,{})).body
 assert.equal((await request('/state',blockedSupport.token)).status,200)
 assert.equal(readDb().users.find(u=>u.id===id)!.status,'BLOCKED')
 await request('/auth/logout',master.token,{})
 assert.equal((await request('/state',blockedSupport.token)).status,401)
})
