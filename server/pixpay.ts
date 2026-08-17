export type PixPayTransaction = {
  id: string
  qrCode: string
  status: string
  paymentUrl: string | null
}

export class PixPayConfigurationError extends Error {}

function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new PixPayConfigurationError(`Configuração ausente: ${name}`)
  return value
}

function publicUrl() {
  const value = required('APP_PUBLIC_URL').replace(/\/$/, '')
  let parsed: URL
  try { parsed = new URL(value) } catch { throw new PixPayConfigurationError('APP_PUBLIC_URL inválida') }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new PixPayConfigurationError('APP_PUBLIC_URL precisa ser uma URL HTTPS válida')
  return value
}

export function pixPayConfig() {
  const webhookToken = required('PIXPAY_WEBHOOK_TOKEN')
  if (webhookToken.length < 32) throw new PixPayConfigurationError('PIXPAY_WEBHOOK_TOKEN precisa ter pelo menos 32 caracteres')
  return {
    apiKey: required('PIXPAY_API_KEY'),
    apiSecret: required('PIXPAY_API_SECRET'),
    baseUrl: (process.env.PIXPAY_BASE_URL?.trim() || 'https://apixxxtentacion.pixpay.cloud').replace(/\/$/, ''),
    webhookToken,
    webhookUrl: `${publicUrl()}/api/webhooks/pixpay?token=${encodeURIComponent(webhookToken)}`,
  }
}

export function normalizeCustomerDocument(value: unknown) {
  const document = String(value ?? '').replace(/\D/g, '')
  if (![11, 14].includes(document.length)) throw new Error('Informe um CPF ou CNPJ válido para o pagamento PIX')
  return document
}

export async function createPixPayTransaction(input: {
  amount: number
  customerName: string
  customerEmail: string
  customerDocument: string
}): Promise<PixPayTransaction> {
  const config = pixPayConfig()
  const response = await fetch(`${config.baseUrl}/api/v1/transactions/pix`, {
    method: 'POST',
    headers: {
      'X-API-Key': config.apiKey,
      'X-API-Secret': config.apiSecret,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: Number(input.amount.toFixed(2)),
      customerName: input.customerName.trim(),
      customerEmail: input.customerEmail.trim(),
      customerDocument: normalizeCustomerDocument(input.customerDocument),
      webhookUrl: config.webhookUrl,
    }),
    signal: AbortSignal.timeout(15_000),
  })
  let payload: any
  try { payload = await response.json() } catch { throw new Error('PIXPAY retornou uma resposta inválida') }
  if (!response.ok) throw new Error(String(payload?.message ?? payload?.error ?? 'Falha ao criar a cobrança PIX'))
  const data = payload?.data ?? payload
  const id = String(data?.transactionId ?? '').trim()
  const qrCode = String(data?.qrCode ?? '').trim()
  if (!id || !qrCode) throw new Error('PIXPAY não retornou uma cobrança PIX válida')
  return { id, qrCode, status: String(data?.status ?? 'PENDING'), paymentUrl: data?.paymentUrl ? String(data.paymentUrl) : null }
}

export function verifyPixPayWebhookToken(received: unknown) {
  const expected = pixPayConfig().webhookToken
  const actual = String(received ?? '')
  if (actual.length !== expected.length) return false
  let difference = 0
  for (let index = 0; index < expected.length; index++) difference |= expected.charCodeAt(index) ^ actual.charCodeAt(index)
  return difference === 0
}
