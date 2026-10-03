/** Reconstitui a URL após o rewrite da Vercel, preservando o convite como um único parâmetro. */
export function restoreApiRequestUrl(requestUrl: string): string {
  const incoming = new URL(requestUrl, 'http://gomove.local')
  const rewrittenPath = incoming.searchParams.get('path')
  let apiPath = incoming.pathname
  if (rewrittenPath !== null) {
    const route = rewrittenPath.replace(/^\/+/, '')
    const invitePrefix = 'public/invites/'
    if (route.startsWith(invitePrefix)) {
      let invite = route.slice(invitePrefix.length)
      try { invite = decodeURIComponent(invite) } catch { /* O validador rejeita códigos malformados. */ }
      apiPath = `/api/${invitePrefix}${encodeURIComponent(invite)}`
    } else apiPath = `/api/${route}`
  }
  incoming.searchParams.delete('path')
  return `${apiPath}${incoming.searchParams.size ? `?${incoming.searchParams}` : ''}`
}
