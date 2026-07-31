import express from 'express'
import cors from 'cors'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const dataDir = path.join(root, '.data')
const dataFile = path.join(dataDir, 'db.json')

type RecordItem = Record<string, unknown> & { id: string }
type Database = {
  invoices: RecordItem[]
  orders: RecordItem[]
  investments: RecordItem[]
  transactions: RecordItem[]
  withdrawals: RecordItem[]
  tickets: RecordItem[]
  profile: Record<string, unknown>
  cart: RecordItem[]
}

const seed: Database = {
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
  withdrawals: [
    { id: 'SAQ-401', date: '12/07/2026', amount: 500, method: 'PIX', account: '***.982.***-**', paidAt: '13/07/2026', status: 'Pago' }
  ],
  tickets: [
    { id: 'TK-184', date: '29/07/2026', department: 'Financeiro', category: 'Fatura', subject: 'Confirmação de pagamento', priority: 'Média', status: 'Em análise' },
    { id: 'TK-163', date: '12/07/2026', department: 'Operações', category: 'Veículo', subject: 'Agendamento preventivo', priority: 'Baixa', status: 'Resolvido' }
  ],
  profile: { name: 'Matheus Oliveira', email: 'matheus@gomove.com.br', phone: '(47) 99988-2040', birthdate: '1992-08-15', language: 'Português', country: 'Brasil', twoFactorLogin: false, twoFactorWithdraw: true, pixType: 'CPF' },
  cart: [{ id: 'PROD-01', name: 'Capacete Urban Carbon', price: 289, quantity: 1 }]
}

function readDb(): Database {
  if (!fs.existsSync(dataFile)) {
    fs.mkdirSync(dataDir, { recursive: true })
    fs.writeFileSync(dataFile, JSON.stringify(seed, null, 2))
  }
  return JSON.parse(fs.readFileSync(dataFile, 'utf8')) as Database
}

function writeDb(db: Database) {
  fs.mkdirSync(dataDir, { recursive: true })
  fs.writeFileSync(dataFile, JSON.stringify(db, null, 2))
}

const app = express()
app.use(cors())
app.use(express.json())

app.post('/api/login', (req, res) => {
  const { username, password } = req.body ?? {}
  if ((username === 'admin' || username === 'matheus') && password === 'gomove2026') {
    return res.json({ token: 'gomove-demo-token', user: { name: 'Matheus Oliveira', role: 'Administrador', initials: 'MO' } })
  }
  return res.status(401).json({ error: 'Usuário ou senha inválidos' })
})

app.get('/api/state', (_req, res) => res.json(readDb()))

app.post('/api/:collection', (req, res) => {
  const db = readDb()
  const key = req.params.collection as keyof Database
  const collection = db[key]
  if (!Array.isArray(collection)) return res.status(400).json({ error: 'Coleção inválida' })
  const item = { ...req.body, id: req.body.id || `${key.slice(0, 3).toUpperCase()}-${Date.now().toString().slice(-6)}` }
  collection.unshift(item)
  writeDb(db)
  res.status(201).json(item)
})

app.patch('/api/:collection/:id', (req, res) => {
  const db = readDb()
  const key = req.params.collection as keyof Database
  const collection = db[key]
  if (!Array.isArray(collection)) return res.status(400).json({ error: 'Coleção inválida' })
  const index = collection.findIndex(item => item.id === req.params.id)
  if (index < 0) return res.status(404).json({ error: 'Registro não encontrado' })
  collection[index] = { ...collection[index], ...req.body }
  writeDb(db)
  res.json(collection[index])
})

app.put('/api/profile', (req, res) => {
  const db = readDb()
  db.profile = { ...db.profile, ...req.body }
  writeDb(db)
  res.json(db.profile)
})

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'GoMove API' }))

const dist = path.join(root, 'dist')
if (fs.existsSync(dist)) {
  app.use(express.static(dist))
  app.get(/.*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')))
}

const port = Number(process.env.PORT || 4010)
app.listen(port, () => console.log(`GoMove API disponível em http://localhost:${port}`))
