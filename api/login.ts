const demoUser = { name: 'Matheus Oliveira', role: 'Administrador', initials: 'MO' }

export default {
  async fetch(request: Request) {
    if (request.method !== 'POST') {
      return Response.json({ error: 'Método não permitido' }, { status: 405, headers: { Allow: 'POST' } })
    }

    const { username, password } = await request.json().catch(() => ({ username: '', password: '' }))
    if ((username === 'admin' || username === 'matheus') && password === 'gomove2026') {
      return Response.json({ token: 'gomove-demo-token', user: demoUser })
    }

    return Response.json({ error: 'Usuário ou senha inválidos' }, { status: 401 })
  }
}

