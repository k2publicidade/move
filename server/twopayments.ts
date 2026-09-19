export type TwoPpTransaction = {
  id: string
  status: string
  paymentMethod: 'pix' | 'crypto'
  pixQrCode: string | null
  pixQrCodeBase64: string | null
  pixQrCodeUrl: string | null
  paymentUrl: string | null
  payAddress: string | null
  payAmount: string | null
  payCurrency: string | null
}

export type TwoPpWithdrawal = {
  id: string
  status: string
  amount: string | null
  netAmount: string | null
  pixKey: string
  pixKeyType: 'cpf'
}

export class TwoPpConfigurationError extends Error {}

/** Criptomoedas habilitadas na conta 2PP (GET /api/v1/currencies/crypto). */
export const TWO_PP_CRYPTO_CURRENCIES = ['usdt-trc20', 'usdt-bep20'] as const
export type TwoPpCryptoCurrency = (typeof TWO_PP_CRYPTO_CURRENCIES)[number]

export function isTwoPpCryptoCurrency(value: unknown): value is TwoPpCryptoCurrency {
  return TWO_PP_CRYPTO_CURRENCIES.includes(String(value) as TwoPpCryptoCurrency)
}

function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new TwoPpConfigurationError(`Configuração ausente: ${name}`)
  return value
}

function validatedPublicUrl() {
  const value = required('APP_PUBLIC_URL').replace(/\/$/, '')
  let parsed: URL
  try { parsed = new URL(value) } catch { throw new TwoPpConfigurationError('APP_PUBLIC_URL inválida') }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new TwoPpConfigurationError('APP_PUBLIC_URL precisa ser uma URL HTTPS válida')
  return value
}

export function twoPpConfig(requirePublicUrl = true) {
  const webhookToken = required('TWOPP_WEBHOOK_TOKEN')
  if (webhookToken.length < 32) throw new TwoPpConfigurationError('TWOPP_WEBHOOK_TOKEN precisa ter pelo menos 32 caracteres')
  return {
    apiKey: required('TWOPP_API_KEY'),
    apiSecret: required('TWOPP_API_SECRET'),
    baseUrl: (process.env.TWOPP_BASE_URL?.trim() || 'https://webhookxxx.2pp.online').replace(/\/$/, ''),
    webhookToken,
    publicUrl: requirePublicUrl ? validatedPublicUrl() : undefined,
  }
}

/**
 * Cada cobrança informa ao 2PP a própria URL de notificação. O identificador local vai no
 * caminho para que o webhook ainda encontre a fatura quando a notificação chega antes de a
 * cobrança ser gravada, e o token no query string autentica a entrega.
 */
export function twoPpWebhookUrl(localId: string) {
  const config = twoPpConfig()
  return `${config.publicUrl}/api/webhooks/2pp/${encodeURIComponent(localId)}?token=${encodeURIComponent(config.webhookToken)}`
}

export function normalizeCustomerDocument(value: unknown) {
  const document = String(value ?? '').replace(/\D/g, '')
  if (![11, 14].includes(document.length)) throw new Error('Informe um CPF ou CNPJ válido para o pagamento PIX')
  return document
}

function providerMessage(payload: any, fallback: string) {
  const message = payload?.message ?? payload?.error
  return message ? String(message) : fallback
}

async function createTransaction(path: string, body: Record<string, unknown>, fallbackMessage: string) {
  const config = twoPpConfig()
  const response = await fetch(`${config.baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'X-API-Key': config.apiKey,
      'X-API-Secret': config.apiSecret,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  })
  let payload: any
  try { payload = await response.json() } catch { throw new Error('2PP retornou uma resposta inválida') }
  if (!response.ok) throw new Error(providerMessage(payload, fallbackMessage))
  return (payload?.data ?? payload) as Record<string, any>
}

/** O 2PP devolve o próprio PIX Copia e Cola em `paymentUrl`; só aceitamos URLs reais. */
function httpUrl(value: unknown) {
  const candidate = String(value ?? '').trim()
  return /^https?:\/\//i.test(candidate) ? candidate : null
}

export async function createTwoPpPixTransaction(input: {
  localId: string
  amount: number
  customerName: string
  customerEmail: string
  customerDocument: string
  customerIp?: string
}): Promise<TwoPpTransaction> {
  const data = await createTransaction('/api/v1/transactions/pix', {
    amount: Number(input.amount.toFixed(2)),
    customerName: input.customerName.trim(),
    customerEmail: input.customerEmail.trim(),
    customerDocument: normalizeCustomerDocument(input.customerDocument),
    ...(input.customerIp?.trim() ? { customerIp: input.customerIp.trim() } : {}),
    webhookUrl: twoPpWebhookUrl(input.localId),
  }, 'Falha ao criar a cobrança PIX no 2PP')
  const id = String(data?.transactionId ?? data?.id ?? '').trim()
  const qrCode = String(data?.qrCode ?? data?.qr_code ?? data?.pixQrCode ?? '').trim()
  if (!id || !qrCode) throw new Error('2PP não retornou uma cobrança PIX válida')
  return {
    id,
    status: String(data?.status ?? 'PENDING'),
    paymentMethod: 'pix',
    pixQrCode: qrCode,
    pixQrCodeBase64: null,
    pixQrCodeUrl: null,
    paymentUrl: httpUrl(data?.paymentUrl),
    payAddress: null,
    payAmount: null,
    payCurrency: null,
  }
}

export async function createTwoPpPixWithdrawal(input: {
  localId: string
  amount: number
  pixKey: string
  customerDocument: string
  customerName: string
  customerEmail: string
  customerIp?: string
}): Promise<TwoPpWithdrawal> {
  const data = await createTransaction('/api/v1/withdrawals/pix', {
    amount: Number(input.amount.toFixed(2)),
    pixKey: input.pixKey,
    pixKeyType: 'cpf',
    customerDocument: normalizeCustomerDocument(input.customerDocument),
    ...(input.customerIp?.trim() ? { customerIp: input.customerIp.trim() } : {}),
    webhookUrl: twoPpWebhookUrl(input.localId),
  }, 'Falha ao solicitar o saque PIX no 2PP')
  const id = String(data?.transactionId ?? data?.id ?? '').trim()
  if (!id) throw new Error('2PP não retornou um saque PIX válido')
  return {
    id,
    status: String(data?.status ?? 'PENDING'),
    amount: data?.amount == null ? null : String(data.amount),
    netAmount: data?.netAmount == null ? null : String(data.netAmount),
    pixKey: String(data?.pixKey ?? input.pixKey),
    pixKeyType: 'cpf',
  }
}

export async function createTwoPpCryptoTransaction(input: {
  localId: string
  amount: number
  payCurrency: TwoPpCryptoCurrency
  customerName: string
  customerEmail: string
  customerIp?: string
}): Promise<TwoPpTransaction> {
  const data = await createTransaction('/api/v1/transactions/crypto', {
    amount: Number(input.amount.toFixed(2)),
    priceCurrency: 'BRL',
    payCurrency: input.payCurrency,
    customerName: input.customerName.trim(),
    customerEmail: input.customerEmail.trim(),
    ...(input.customerIp?.trim() ? { customerIp: input.customerIp.trim() } : {}),
    webhookUrl: twoPpWebhookUrl(input.localId),
  }, 'Falha ao criar a cobrança cripto no 2PP')
  const id = String(data?.transactionId ?? data?.id ?? '').trim()
  const payAddress = String(data?.payAddress ?? data?.address ?? '').trim()
  const payAmount = String(data?.payAmount ?? data?.amount ?? '').trim()
  if (!id || !payAddress || !payAmount) throw new Error('2PP não retornou uma cobrança cripto válida')
  return {
    id,
    status: String(data?.status ?? 'PENDING'),
    paymentMethod: 'crypto',
    pixQrCode: null,
    pixQrCodeBase64: null,
    pixQrCodeUrl: null,
    paymentUrl: httpUrl(data?.paymentUrl),
    payAddress,
    payAmount,
    payCurrency: String(data?.payCurrency ?? input.payCurrency),
  }
}

export function verifyTwoPpWebhookToken(received: unknown) {
  const expected = twoPpConfig(false).webhookToken
  const actual = String(received ?? '')
  if (actual.length !== expected.length) return false
  let difference = 0
  for (let index = 0; index < expected.length; index++) difference |= expected.charCodeAt(index) ^ actual.charCodeAt(index)
  return difference === 0
}
