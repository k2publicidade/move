type Row = Record<string, any>

// Perfil administrativo que consulta todo o sistema e não altera nada.
export const VIEWER_ADMIN_ROLE = 'ADMIN_VIEWER'
export const VIEWER_ADMIN_ENV = 'GOMOVE_VIEWER_ADMINS'

export type ViewerAdminConfig = { name: string; username: string; email: string; password: string }

const usernamePattern = /^[a-z0-9._-]{3,32}$/

function text(value: unknown) {
  return String(value ?? '').trim()
}

// Lista de acessos de visualização configurados por ambiente, no formato JSON:
// [{"name":"...","username":"...","email":"...","password":"..."}]
export function parseViewerAdminConfig(raw: unknown): ViewerAdminConfig[] {
  const value = text(raw)
  if (!value) return []
  let entries: unknown
  try { entries = JSON.parse(value) } catch { throw new Error(`${VIEWER_ADMIN_ENV} precisa ser um JSON com a lista de acessos`) }
  if (!Array.isArray(entries) || entries.length > 20) throw new Error(`${VIEWER_ADMIN_ENV} precisa ser uma lista com até 20 acessos`)
  const parsed: ViewerAdminConfig[] = []
  for (const entry of entries) {
    const name = text((entry as Row)?.name), username = text((entry as Row)?.username).toLowerCase(), email = text((entry as Row)?.email).toLowerCase(), password = String((entry as Row)?.password ?? '')
    if (!name || !email || !usernamePattern.test(username) || password.length < 6 || password.length > 128) {
      throw new Error(`${VIEWER_ADMIN_ENV}: cada acesso precisa de nome, e-mail, usuário válido (3 a 32 caracteres) e senha de 6 a 128 caracteres`)
    }
    if (parsed.some(item => item.username === username || item.email === email)) throw new Error(`${VIEWER_ADMIN_ENV}: usuário ou e-mail repetido na configuração`)
    parsed.push({ name, username, email, password })
  }
  return parsed
}

// Cria somente os acessos que ainda não existem: usuário/e-mail já cadastrados são preservados
// (inclusive a senha atual, que só o MASTER troca no painel).
export function ensureConfiguredViewerAdmins(
  db: Row,
  config: ViewerAdminConfig[],
  options: { createId: () => string; hashPassword: (password: string) => string; timestamp?: () => string },
): Array<{ id: string; username: string }> {
  const created: Array<{ id: string; username: string }> = []
  for (const account of config) {
    const users = (db.users ?? []) as Row[]
    if (users.some(user => String(user.username ?? '').toLowerCase() === account.username || String(user.email ?? '').toLowerCase() === account.email)) continue
    const id = options.createId()
    users.push({
      id,
      username: account.username,
      email: account.email,
      name: account.name,
      passwordHash: options.hashPassword(account.password),
      role: VIEWER_ADMIN_ROLE,
      status: 'ACTIVE',
      sponsorId: null,
      inviteCode: `vis-${options.createId().replace(/-/g, '').slice(0, 8)}`,
    })
    db.profiles = db.profiles ?? {}
    db.profiles[id] = { name: account.name, email: account.email, country: 'Brasil' }
    db.auditLogs = db.auditLogs ?? []
    db.auditLogs.unshift({
      id: options.createId(),
      actorId: 'system',
      action: 'VIEWER_ADMIN_CREATE',
      targetType: 'USER',
      targetId: id,
      details: { username: account.username, source: 'CONFIG' },
      createdAt: (options.timestamp ?? (() => new Date().toISOString()))(),
    })
    created.push({ id, username: account.username })
  }
  return created
}
