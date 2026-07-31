import type { User } from './types'
import { demoRequest } from './demoBackend'
export type Session = { token:string; user:User }
const key='gomove-session'
export const authHeaders=(token:string|null):Record<string,string>=>token?{Authorization:`Bearer ${token}`}:{ }
export const apiErrorMessage=(body:unknown,fallback:string)=>typeof body==='object'&&body&&'error' in body&&typeof (body as {error:unknown}).error==='string'?(body as {error:string}).error:fallback
export function loadSession():Session|null { try { const value=localStorage.getItem(key); return value?JSON.parse(value):null } catch { return null } }
export function saveSession(session:Session) { localStorage.setItem(key,JSON.stringify(session)) }
export function clearSession() { localStorage.removeItem(key) }
export class ApiClient {
  constructor(private token:string|null, private onUnauthorized?:()=>void) {}
  async request<T>(path:string, options:RequestInit={}) : Promise<T> {
    const headers: Record<string,string>={...authHeaders(this.token), ...(options.body?{'Content-Type':'application/json'}:{}), ...(options.headers as Record<string,string>||{})}
    const method=options.method||'GET'
    const requestBody=typeof options.body==='string'?JSON.parse(options.body):options.body
    if(this.token?.startsWith('demo:')) return demoRequest<T>(path,method,requestBody,this.token)
    try {
      const response=await fetch(`/api${path}`, {...options,headers})
      const contentType=response.headers.get('content-type')||''
      const body=contentType.includes('application/json')?await response.json().catch(()=>null):null
      if(response.status===401){ clearSession(); this.onUnauthorized?.() }
      if(response.ok&&body!==null) return body as T
      if(response.status!==404&&body!==null) throw new Error(apiErrorMessage(body,`Erro ${response.status}`))
    } catch(error) {
      if(error instanceof Error&&!/fetch|network|failed/i.test(error.message)) throw error
    }
    return demoRequest<T>(path,method,requestBody,this.token)
  }
  get<T>(path:string){ return this.request<T>(path) }
  post<T>(path:string, body:unknown){ return this.request<T>(path,{method:'POST',body:JSON.stringify(body)}) }
  patch<T>(path:string, body:unknown){ return this.request<T>(path,{method:'PATCH',body:JSON.stringify(body)}) }
  put<T>(path:string, body:unknown){ return this.request<T>(path,{method:'PUT',body:JSON.stringify(body)}) }
}
