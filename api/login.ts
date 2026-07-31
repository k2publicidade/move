const demoUsers = {
  admin: { id: 'usr-admin', name: 'Administrador GoMove', username: 'admin', email: 'admin@gomove.com.br', role: 'ADMIN_MASTER', status: 'ACTIVE', sponsorId: null, inviteCode: 'admin01' },
  matheus: { id: 'usr-matheus', name: 'Matheus Oliveira', username: 'matheus', email: 'matheus@gomove.com.br', role: 'ASSOCIATE', status: 'ACTIVE', sponsorId: 'usr-admin', inviteCode: 'matheus01' },
} as const

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') {
      return Response.json({ error: 'Método não permitido' }, { status: 405, headers: { Allow: 'POST' } })
    }
    const { username, password } = await request.json().catch(() => ({ username: '', password: '' }))
    const normalized = String(username).toLowerCase() === 'master' ? 'admin' : String(username).toLowerCase()
    if ((normalized === 'admin' || normalized === 'matheus') && password === 'gomove2026') {
      return Response.json({ token: `demo:${normalized}`, user: demoUsers[normalized] })
    }
    return Response.json({ error: 'Usuário ou senha inválidos' }, { status: 401 })
  },
}
