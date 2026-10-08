/** Resolve códigos e links compartilhados sem perder o indicador por uma barra final. */
export function normalizeInviteCode(value: string): string {
  let code = value.trim()
  if (/^https?:\/\//i.test(code) || code.startsWith('/')) {
    try {
      const url = new URL(code, 'https://gomove.invalid')
      code = url.pathname.startsWith('/convite/')
        ? url.pathname.replace(/\/+$/, '').slice('/convite/'.length)
        : url.searchParams.get('ref') ?? url.searchParams.get('inviteCode') ?? url.searchParams.get('convite') ?? ''
    }
    catch { return '' }
  }
  try { code = decodeURIComponent(code) } catch { return '' }
  code = code.trim().toLowerCase()
  return /^[a-z0-9._-]+$/.test(code) ? code : ''
}

export function referralLink(username: string, inviteCode = ''): string {
  const login = normalizeInviteCode(username)
  if (login) return `https://gomoveinfra.com.br/cadastro?ref=${encodeURIComponent(login)}`
  const legacyCode = normalizeInviteCode(inviteCode)
  return legacyCode ? `https://gomoveinfra.com.br/convite/${encodeURIComponent(legacyCode)}` : ''
}

export function matchesInviteSponsor(identifier: string, sponsor?: { username?: string; inviteCode?: string }): boolean {
  const code = normalizeInviteCode(identifier)
  return Boolean(code && sponsor && [sponsor.username, sponsor.inviteCode].some(value => value && normalizeInviteCode(value) === code))
}

export function hasInviteReference(location: Pick<Location, 'pathname' | 'search'>): boolean {
  const query = new URLSearchParams(location.search)
  return location.pathname.startsWith('/convite/') || ['ref', 'inviteCode', 'convite'].some(key => query.has(key))
}

export function inviteCodeFromLocation(location: Pick<Location, 'pathname' | 'search'>): string {
  if (location.pathname.startsWith('/convite/')) {
    return normalizeInviteCode(location.pathname.replace(/\/+$/, '').slice('/convite/'.length))
  }
  const query = new URLSearchParams(location.search)
  return normalizeInviteCode(query.get('ref') ?? query.get('inviteCode') ?? query.get('convite') ?? '')
}
