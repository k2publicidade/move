# GoMove — Mobilidade Inteligente

Plataforma fullstack para a operação GoMove, com dois ambientes independentes e controle de acesso por função:

- Portal do usuário para mobilidade, investimentos, compras, financeiro, rede, suporte e perfil.
- Central MASTER para administrar usuários, frota, investimentos, pedidos, financeiro, rede multinível, comissões, tickets, auditoria e configurações.

## Executar localmente

```bash
npm install
npm run dev
```

- Aplicação: `http://localhost:5173`
- API: `http://localhost:4010`

Para validar a entrega:

```bash
npm test
npm run build
```

Para servir a versão compilada pela API Express:

```bash
npm run build
npm start
```

## Pagamentos com CoinPayments

O fluxo de investimentos cria uma invoice em BRL no checkout hospedado do CoinPayments. O contrato permanece aguardando pagamento e só é ativado após o webhook assinado `InvoiceCompleted`. Assinaturas inválidas, timestamps antigos e entregas duplicadas são rejeitados ou deduplicados.

1. Conclua a conta comercial e o KYC no CoinPayments.
2. No painel, crie uma API Integration com permissão para invoices.
3. Copie `.env.example` para `.env` e preencha `COINPAYMENTS_CLIENT_ID` e `COINPAYMENTS_CLIENT_SECRET`.
4. Cadastre a URL HTTPS exata de `COINPAYMENTS_WEBHOOK_URL`, assinando os eventos `invoicePending`, `invoicePaid`, `invoiceCompleted`, `invoiceCancelled` e `invoiceTimedOut`.
5. Confirme no painel quais criptomoedas estão habilitadas para recebimento e execute um pagamento de teste antes de produção.

A senha de login da conta CoinPayments não é uma credencial de API e nunca deve ser adicionada ao projeto.

## Pagamentos via PIXPAY

O checkout também aceita PIX e cria uma cobrança com QR Code copia e cola no PIXPAY. Configure `PIXPAY_API_KEY`, `PIXPAY_API_SECRET`, `PIXPAY_WEBHOOK_TOKEN` (segredo aleatório com pelo menos 32 caracteres) e `APP_PUBLIC_URL`. Cada cobrança informa ao gateway o webhook HTTPS `/api/webhooks/pixpay`; o pagamento só é confirmado quando o PIXPAY notifica o mesmo identificador e valor da transação.

## Funcionalidades

### Portal do usuário

- Dashboard financeiro e operacional
- Veículos vinculados, bateria, localização e disponibilidade
- Planos, solicitação e carteira de investimentos
- Loja, compras e acompanhamento de pedidos
- Faturas, extrato e solicitação de saques via PIX
- Rede de indicações, link de convite e bônus
- Abertura e acompanhamento de tickets
- Perfil e preferências de autenticação em dois fatores

### Central MASTER

- Dashboard executivo com prioridades da operação
- Ativação, bloqueio e acompanhamento de usuários
- Gestão de frota, investimentos e pedidos
- Aprovação de faturas e solicitações de saque
- Genealogia completa da rede por profundidade
- Regras unilevel, créditos, aprovações e estornos de bônus
- Fila administrativa de suporte
- Trilha de auditoria de operações sensíveis
- Configurações operacionais e trilha de auditoria

### Diário e teto de ganhos

- O MASTER cadastra uma data e um percentual do Diário em **Comissões**.
- Às 09:00 no horário de São Paulo, o cron aplica o percentual somente às cotas financeiras confirmadas; o Plano de Associado de R$ 55,00 não recebe Diário nem gera Unilevel.
- O Unilevel incide sobre o Diário efetivamente creditado ao cotista, usando os níveis configurados no sistema.
- Diário, indicação direta, Unilevel e créditos financeiros compartilham um teto de 200% do total de cotas confirmadas. Novas cotas ampliam essa capacidade; valores acima do teto não são creditados retroativamente.
- Na Vercel, configure `CRON_SECRET` com pelo menos 16 caracteres. O agendamento `0 12 * * *` usa UTC e corresponde a 09:00 em `America/Sao_Paulo`.

## Arquitetura

- `src/App.tsx` — portais responsivos e roteamento com proteção por função
- `src/api.ts` — cliente único da API com tratamento de sessão
- `server/index.ts` — API Express, autenticação, persistência JSON e operações administrativas
- `api/index.ts` — entrada serverless da API na Vercel
- `server/mlm.ts` — regras puras de rede, ciclos, comissões e estornos
- `tests/` — testes automatizados da API cliente e do motor multinível
- `public/brand/` — identidade visual e logo oficial GoMove

## Persistência e produção

No desenvolvimento local, a API persiste dados em `.data/db.json`. Na Vercel, a aplicação exige `DATABASE_URL` e persiste o estado real em PostgreSQL/Neon. O primeiro acesso cria somente a conta MASTER definida pelas variáveis `GOMOVE_ADMIN_*`; nenhuma conta de demonstração é publicada.

Antes de uso comercial com dados reais, configure um banco gerenciado, segredo de sessão, gateway de pagamento/PIX, e-mail/SMS, telemetria veicular e provedor de 2FA. As credenciais do sistema de referência não estão armazenadas neste projeto.


### Atendimento MASTER por conta (API Node/Express)

Em **Central MASTER → Usuários**, cada conta oferece:

- **Editar cadastro / senha**: atualiza o cadastro e permite definir nova senha; a troca revoga as sessões da conta e gera auditoria sem gravar a senha no histórico.
- **Entrar na conta**: abre o portal sem pedir a senha do participante, inclusive para atendimento de contas bloqueadas ou pendentes. A faixa de suporte identifica o administrador e permite voltar ao MASTER. A sessão dura até uma hora e depende da sessão original do administrador.
- **Saldo e pagamentos**: reúne extrato, faturas, cotas, saques e histórico administrativo. Ajustes positivos ou negativos alteram diretamente a carteira, sem passar pelas regras de bônus. Informe motivo e referência única do atendimento; repetir a mesma operação não credita duas vezes. Débitos respeitam valores reservados para saque.
- **Conciliar pagamento**: após conferir manualmente o identificador e valor no gateway, informe a evidência e referência e confirme a fatura de plano ou aquisição de cotas. A operação ativa o produto e reutiliza as regras de confirmação existentes, sem creditar o principal na carteira. Confirmações repetidas não geram nova ativação ou comissão.

As novas rotas são implementadas em `server/index.ts`, usado pelo servidor Node e por `api/index.ts` na Vercel. O arquivo PHP legado em `public/api/index.php` não oferece estes novos controles; instalações que utilizam somente PHP precisam migrar para a API Node para usar esta interface.

## Carteira de Saldo e Carteira de Rendimentos

- Depósitos confirmados entram na **Carteira de Saldo** e servem exclusivamente para comprar produtos, Plano de Associado e cotas. Não podem ser sacados.
- Bônus aprovados, indicações e rendimentos creditados entram na **Carteira de Rendimentos**. Estornos de ganhos e saques pagos são debitados dessa mesma carteira.
- Saques exigem conta ativa e Plano de Associado ativo ou cotas com pagamento confirmado e status Ativo (sem expiração vencida, quando informada). Apenas a classificação Cotista não basta.
- O mínimo de saque continua em R$ 50. Solicitações Pendente/Em análise reservam rendimentos; Recusado libera a reserva; Pago debita uma única vez. A elegibilidade é revalidada ao solicitar, editar e pagar, inclusive pelo MASTER.
- O financeiro oferece depósito PIX. A API `/api/deposits` também suporta CoinPayments. Apenas confirmação autenticada do gateway ou conciliação MASTER credita o depósito, com deduplicação por fatura.
- Compras pela carteira usam `/api/wallet/purchases`, chave idempotente e preços conferidos no servidor. Não usam rendimentos nem valores reservados para saques.
- Ajustes MASTER exigem carteira explícita na interface; integrações antigas que omitem `wallet` usam `BALANCE`. Nunca registrar um depósito como `EARNINGS`.

### Compatibilidade com o histórico

As movimentações recebem `wallet: BALANCE | EARNINGS` na normalização do banco atual (JSON local ou payload PostgreSQL). Bônus, diários e saques são identificados por seus vínculos; as descrições antigas conhecidas “Rendimento operacional”, “Bônus de rede” e “Saque” também são reconhecidas. Créditos sem origem identificável ficam na Carteira de Saldo, sem liberação automática para saque. Caso um ganho antigo não possua vínculo ou descrição reconhecida, o MASTER deve conferir sua origem e registrar os ajustes auditados nas duas carteiras. Os valores e registros originais são preservados.

Validação: `npm test` inclui depósito PIX com provedor simulado, webhook duplicado, compras, reservas, pagamento de saque e bloqueio por pacote inativo. Os testes não realizam pagamentos reais.
