import type { IncomingMessage, ServerResponse } from 'node:http'
import { app } from '../server/index.js'

export default function handler(req:IncomingMessage,res:ServerResponse) {
  const incoming=new URL(req.url||'/', 'http://gomove.local')
  const rewrittenPath=incoming.searchParams.get('path')
  const apiPath=rewrittenPath===null?incoming.pathname:`/api/${rewrittenPath.replace(/^\/+/, '')}`
  incoming.searchParams.delete('path')
  req.url=`${apiPath}${incoming.searchParams.size?`?${incoming.searchParams}`:''}`
  return app(req,res)
}
