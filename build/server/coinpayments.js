import { CoinPaymentsClient, CoinPaymentsError, verifyWebhook } from '@coinpayments/sdk';
export class CoinPaymentsConfigurationError extends Error {
}
function required(name) {
    const value = process.env[name]?.trim();
    if (!value)
        throw new CoinPaymentsConfigurationError(`Configuração ausente: ${name}`);
    return value;
}
export function coinPaymentsConfig() {
    return {
        clientId: required('COINPAYMENTS_CLIENT_ID'),
        clientSecret: required('COINPAYMENTS_CLIENT_SECRET'),
        baseUrl: process.env.COINPAYMENTS_BASE_URL?.trim() || 'https://a-api.coinpayments.net',
        webhookUrl: required('COINPAYMENTS_WEBHOOK_URL'),
        invoiceCurrency: process.env.COINPAYMENTS_INVOICE_CURRENCY?.trim() || '5203',
        publicUrl: process.env.APP_PUBLIC_URL?.trim().replace(/\/$/, ''),
    };
}
function firstAndLastName(name) {
    const parts = name.trim().split(/\s+/);
    return { firstName: parts.shift() || 'Cliente', lastName: parts.join(' ') || 'GoMove' };
}
export async function createCoinPaymentsInvoice(input) {
    const config = coinPaymentsConfig();
    const amount = input.amount.toFixed(2);
    const client = new CoinPaymentsClient({
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        baseUrl: config.baseUrl,
    });
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
                    successUrl: `${config.publicUrl}/investments?payment=success`,
                    cancelUrl: `${config.publicUrl}/investments?payment=cancelled`,
                } : {}),
            },
        });
        const invoice = response.invoices?.[0];
        if (!invoice?.id || !invoice.checkoutLink)
            throw new Error('CoinPayments não retornou uma invoice válida');
        return invoice;
    }
    catch (error) {
        if (error instanceof CoinPaymentsError) {
            const message = typeof error.payload === 'object' && error.payload && 'message' in error.payload
                ? String(error.payload.message)
                : 'Falha ao criar a cobrança no CoinPayments';
            throw new Error(message);
        }
        throw error;
    }
}
export function verifyCoinPaymentsWebhook(rawBody, headers) {
    const config = coinPaymentsConfig();
    return verifyWebhook({
        method: 'POST',
        url: config.webhookUrl,
        rawBody,
        headers,
        clientSecret: config.clientSecret,
        expectedClientId: config.clientId,
        maxAgeSeconds: 300,
    });
}
