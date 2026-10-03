/** Resolve códigos e links compartilhados sem perder o indicador por uma barra final. */
export function normalizeInviteCode(value: string): string {
  let code = value.trim()
  if (/^https?:\/\//i.test(code) || code.startsWith('/')) {
    try {
      const url = new URL(code, 'https://gomove.invalid')
      code = url.pathname.startsWith('/convite/')
        ? url.pathname.replace(/\/+$/, '').slice('/convite/'.length)
        : url.searchParams.get('inviteCode') ?? url.searchParams.get('convite') ?? ''
    }
    catch { return '' }
  }
  try { code = decodeURIComponent(code) } catch { return '' }
  code = code.trim().toLowerCase()
  return /^[a-z0-9._-]+$/.test(code) ? code : ''
}

export function inviteCodeFromLocation(location: Pick<Location, 'pathname' | 'search'>): string {
  if (location.pathname.startsWith('/convite/')) {
    return normalizeInviteCode(location.pathname.replace(/\/+$/, '').slice('/convite/'.length))
  }
  const query = new URLSearchParams(location.search)
  return normalizeInviteCode(query.get('inviteCode') ?? query.get('convite') ?? '')
}
