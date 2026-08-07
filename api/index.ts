import type { IncomingMessage, ServerResponse } from 'node:http'
import { app } from '../server/index.js'

export default function handler(req:IncomingMessage,res:ServerResponse) {
  const incoming=new URL(req.url||'/', 'http://gomove.local')
  const apiPath=incoming.searchParams.get('path')||''
  incoming.searchParams.delete('path')
  req.url=`/api/${apiPath}${incoming.searchParams.size?`?${incoming.searchParams}`:''}`
  return app(req,res)
}
