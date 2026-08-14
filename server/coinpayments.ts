import { CoinPaymentsClient, CoinPaymentsError, verifyWebhook } from '@coinpayments/sdk'

export type CoinPaymentsInvoice = {
  id: string
  link: string
  checkoutLink: string
}

export class CoinPaymentsConfigurationError extends Error {}

function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new CoinPaymentsConfigurationError(`Configuração ausente: ${name}`)
  return value
}

function validatedPublicUrl() {
  const value = required('APP_PUBLIC_URL').replace(/\/$/, '')
  let parsed: URL
  try { parsed = new URL(value) } catch { throw new CoinPaymentsConfigurationError('APP_PUBLIC_URL inválida') }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new CoinPaymentsConfigurationError('APP_PUBLIC_URL precisa ser uma URL HTTP(S) válida')
  return value
}

export function coinPaymentsConfig(requirePublicUrl = true) {
  return {
    clientId: required('COINPAYMENTS_CLIENT_ID'),
    clientSecret: required('COINPAYMENTS_CLIENT_SECRET'),
    baseUrl: process.env.COINPAYMENTS_BASE_URL?.trim() || 'https://a-api.coinpayments.net',
    webhookUrl: required('COINPAYMENTS_WEBHOOK_URL'),
    invoiceCurrency: process.env.COINPAYMENTS_INVOICE_CURRENCY?.trim() || '5203',
    publicUrl: requirePublicUrl ? validatedPublicUrl() : undefined,
  }
}

function firstAndLastName(name: string) {
  const parts = name.trim().split(/\s+/)
  return { firstName: parts.shift() || 'Cliente', lastName: parts.join(' ') || 'GoMove' }
}

export async function createCoinPaymentsInvoice(input: {
  investmentId: string
  pack: string
  amount: number
  buyerName: string
  buyerEmail: string
  successPath?: string
  cancelPath?: string
}): Promise<CoinPaymentsInvoice> {
  const config = coinPaymentsConfig()
  const amount = input.amount.toFixed(2)
  const client = new CoinPaymentsClient({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    baseUrl: config.baseUrl,
  })
  try {
    const response = await client.invoices.postMerchantInvoicesV2({
      body: {
        currency: config.invoiceCurrency,
        invoiceId: input.investmentId,
        description: `Investimento GoMove - ${input.pack}`,
        items: [{
          customId: input.investmentId,
          sku: input.pack,
          name: input.pack,
          quantity: { value: 1, type: 'quantity' },
          amount,
        }],
        amount: { breakdown: { subtotal: amount }, total: amount },
        buyer: {
          name: firstAndLastName(input.buyerName),
          emailAddress: input.buyerEmail,
        },
        customData: { investmentId: input.investmentId },
        payment: { refundEmail: input.buyerEmail },
        webhooks: [{
          notificationsUrl: config.webhookUrl,
          notifications: ['invoicePending', 'invoicePaid', 'invoiceCompleted', 'invoiceCancelled', 'invoiceTimedOut'],
        }],
        ...(config.publicUrl ? {
          successUrl: `${config.publicUrl}${input.successPath || '/investments?payment=success'}`,
          cancelUrl: `${config.publicUrl}${input.cancelPath || '/investments?payment=cancelled'}`,
        } : {}),
      },
    }) as { invoices?: CoinPaymentsInvoice[] }
    const invoice = response.invoices?.[0]
    if (!invoice?.id || !invoice.checkoutLink) throw new Error('CoinPayments não retornou uma invoice válida')
    return invoice
  } catch (error) {
    if (error instanceof CoinPaymentsError) {
      const message = typeof error.payload === 'object' && error.payload && 'message' in error.payload
        ? String((error.payload as { message: unknown }).message)
        : 'Falha ao criar a cobrança no CoinPayments'
      throw new Error(message)
    }
    throw error
  }
}

export function verifyCoinPaymentsWebhook(rawBody: string, headers: Record<string, string | string[] | undefined>) {
  const config = coinPaymentsConfig(false)
  return verifyWebhook({
    method: 'POST',
    url: config.webhookUrl,
    rawBody,
    headers,
    clientSecret: config.clientSecret,
    expectedClientId: config.clientId,
    maxAgeSeconds: 300,
  })
}
