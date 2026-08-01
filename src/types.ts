export type Role = 'ADMIN_MASTER' | 'ASSOCIATE'
export type UserStatus = 'ACTIVE' | 'PENDING' | 'BLOCKED'
export interface User { id:string; name:string; username:string; role:Role; status:UserStatus; sponsorId:string|null; inviteCode:string; email?:string }
export interface Page<T> { items:T[]; page:number; pageSize:number; total:number }
export interface Bonus { id:string; userId:string; amountCents:number; status:string; type:string; reason?:string; reversalOfId?:string; level?:number; eventId?:string; investmentId?:string; idempotencyKey?:string; createdAt?:string }
export interface CommissionRule { id:string; name:string; eventType:string; active:boolean; levels:{level:number;bps:number}[]; createdAt?:string }
export interface TreeUser extends User { children:TreeUser[] }
