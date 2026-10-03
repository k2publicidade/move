import type { IncomingMessage, ServerResponse } from 'node:http'
import { app } from '../server/index.js'
import { restoreApiRequestUrl } from '../server/requestRouting.js'

export default function handler(req:IncomingMessage,res:ServerResponse) {
  req.url=restoreApiRequestUrl(req.url||'/')
  return app(req,res)
}
