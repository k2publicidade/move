import { hasInviteReference } from './invites'

/** Keep the public website separate from authenticated routes and affiliate onboarding. */
export function publicSurface(location: Pick<Location, 'pathname' | 'search'>): 'website' | 'registration' | 'portal' {
  const { pathname } = location
  if (pathname === '/cadastro' || pathname === '/cadastro/' || pathname.startsWith('/convite/') || (pathname === '/' && hasInviteReference(location))) return 'registration'
  return pathname === '/' ? 'website' : 'portal'
}
