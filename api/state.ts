const state = {
  invoices: [
    { id: 'INV-1084', due: '05/08/2026', description: 'Assinatura GoMove Pro', amount: 349, remaining: 349, status: 'Pendente' },
    { id: 'INV-1031', due: '05/07/2026', description: 'Adesão Scooter Urban', amount: 890, remaining: 0, status: 'Pago' },
    { id: 'INV-0978', due: '05/06/2026', description: 'Mensalidade de plataforma', amount: 129, remaining: 0, status: 'Pago' }
  ],
  orders: [
    { id: 'PED-2048', date: '28/07/2026', description: 'Capacete Urban Carbon', quantity: 1, total: 289, status: 'Em trânsito' },
    { id: 'PED-1984', date: '04/07/2026', description: 'Kit mobilidade GoMove', quantity: 1, total: 149, status: 'Entregue' }
  ],
  investments: [
    { id: 'ATV-441', date: '15/03/2026', pack: 'Scooter Performance', amount: 8500, profit: 1278.34, days: 138, status: 'Ativo' },
    { id: 'ATV-318', date: '08/01/2026', pack: 'Frota Essencial', amount: 5000, profit: 943.12, days: 204, status: 'Ativo' }
  ],
  transactions: [
    { id: 'MOV-9812', date: '30/07/2026', description: 'Rendimento operacional', amount: 184.2, status: 'Crédito' },
    { id: 'MOV-9801', date: '26/07/2026', description: 'Bônus de rede', amount: 92.5, status: 'Crédito' },
    { id: 'MOV-9742', date: '18/07/2026', description: 'Compra PED-2048', amount: -289, status: 'Débito' },
    { id: 'MOV-9680', date: '10/07/2026', description: 'Rendimento operacional', amount: 176.8, status: 'Crédito' }
  ],
  withdrawals: [{ id: 'SAQ-401', date: '12/07/2026', amount: 500, method: 'PIX', account: '***.982.***-**', paidAt: '13/07/2026', status: 'Pago' }],
  tickets: [
    { id: 'TK-184', date: '29/07/2026', department: 'Financeiro', category: 'Fatura', subject: 'Confirmação de pagamento', priority: 'Média', status: 'Em análise' },
    { id: 'TK-163', date: '12/07/2026', department: 'Operações', category: 'Veículo', subject: 'Agendamento preventivo', priority: 'Baixa', status: 'Resolvido' }
  ],
  profile: { name: 'Matheus Oliveira', email: 'matheus@gomove.com.br', phone: '(47) 99988-2040', birthdate: '1992-08-15', language: 'Português', country: 'Brasil', twoFactorLogin: false, twoFactorWithdraw: true, pixType: 'CPF' },
  cart: [{ id: 'PROD-01', name: 'Capacete Urban Carbon', price: 289, quantity: 1 }]
}

export default {
  fetch(request: Request) {
    if (request.method !== 'GET') {
      return Response.json({ error: 'Método não permitido' }, { status: 405, headers: { Allow: 'GET' } })
    }
    return Response.json(state, { headers: { 'Cache-Control': 'public, max-age=0, s-maxage=300' } })
  }
}

