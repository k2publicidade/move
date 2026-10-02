/** Resolve códigos e links compartilhados sem perder o indicador por uma barra final. */
export function normalizeInviteCode(value: string): string {
  let code = value.trim()
  if (/^https?:\/\//i.test(code)) {
    try { code = new URL(code).pathname.replace(/\/+$/, '').split('/convite/')[1] ?? '' }
    catch { return '' }
  }
  try { code = decodeURIComponent(code) } catch { return '' }
  return code.trim().toLowerCase()
}

export function inviteCodeFromLocation(location: Pick<Location, 'pathname' | 'search'>): string {
  if (location.pathname.startsWith('/convite/')) {
    return normalizeInviteCode(location.pathname.replace(/\/+$/, '').slice('/convite/'.length))
  }
  const query = new URLSearchParams(location.search)
  return normalizeInviteCode(query.get('inviteCode') ?? query.get('convite') ?? '')
}
