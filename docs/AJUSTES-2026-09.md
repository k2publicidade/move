# Ajustes de regras — lista de 9 itens (Set/2026)

Documento de conferência para o TI. Cada item traz a regra aplicada, onde ela vive no
código e a evidência de teste. Fonte única das regras do plano: `src/businessPlan.ts`
(valores) e `src/wallets.ts` (carteiras, saques e taxas). Os dois backends
(`server/index.ts` e `src/demoBackend.ts`) importam esses módulos, então a mesma regra
vale para produção e para a demonstração.

| # | Item | Regra aplicada | Onde | Evidência |
| --- | --- | --- | --- | --- |
| 1 | Upgrade obrigatório do Associado | Adesão de R$ 55,00 sem rendimento diário; teto de R$ 500,00 em bonificações acumuladas. Ao atingir o teto, o Associado só evolui a Cotista com cota mínima de **R$ 300,00** (`ASSOCIATE_UPGRADE_MIN_QUOTA_CENTS`). Antes eram R$ 500,00. | `src/businessPlan.ts` (`associateBonusCapReached`, `requiredUpgradeQuotaCents`, `canUpgradeToShareholder`), `confirmInvestmentInDb` nos dois backends | `tests/businessPlan.test.ts` › "direct entry as Cotista starts at R$ 60 and the mandatory upgrade at the cap requires R$ 300"; `tests/businessRules2026.test.ts` › "ingresso direto como Cotista a partir de R$ 60 e upgrade obrigatório com cota mínima de R$ 300" |
| 2 | Pacote mínimo do Cotista | Ingresso direto como Cotista a partir de **R$ 60,00** (`SHAREHOLDER_MIN_QUOTA_CENTS`). Antes R$ 500,00. | `src/businessPlan.ts`, `parseQuotaAmount` (server) e `parseDemoQuotaAmount` (demo), formulários do painel | Idem item 1 |
| 3 | Bonificação somente na aquisição de cota | A ativação do Plano de R$ 55,00 não abre evento de comissão e não gera bonificação para ninguém da rede. A Indicação Direta (10%) nasce na confirmação/ativação da cota; o Unilevel incide sobre o rendimento elegível (Diário) do Cotista da rede. | `confirmInvestmentInDb`/`confirmDemoInvestment` (só cotas geram `commissionEvents`), `src/mlm.ts` (`calculateDirectReferralBonus`, `calculateProfitabilityBonuses`) | `tests/businessRules2026.test.ts` › "a adesão de R$ 55 não gera bonificação; a cota ativada gera a indicação direta de 10%" |
| 4 | Uma conta por CPF | CPF obrigatório e único no cadastro público, no cadastro administrativo e na edição de perfil; a checagem usa os dígitos normalizados e ignora a própria conta na edição. | `cpfOwnerId` (`src/wallets.ts`) + rotas `POST /api/public/register`, `POST /api/admin/associates`, `PATCH /api/admin/associates/:id`, `PUT /api/profile` | `tests/businessRules2026.test.ts` › "o cadastro rejeita um segundo CPF igual no site, no admin e no perfil"; `tests/pixWithdrawals.test.ts` (CPF inválido) |
| 5 | Processamento diário | O Diário é apurado **todas as noites, sem horário exato fixado**: o cron dispara às 19h, 20h, 21h e 22h (horário de São Paulo) e o endpoint é idempotente. Se o MASTER não cadastrar o percentual do dia, o processamento repete o último percentual cadastrado. Fora da janela noturna (18h–05h) o endpoint não cria Diário automático, mas continua processando um Diário cadastrado manualmente, a qualquer hora. | `vercel.json` (crons), `GET /api/cron/daily-profitability` em `server/index.ts`, tela "Cadastrar Diário" no painel MASTER | `tests/businessRules2026.test.ts` › "o processamento diário é noturno, idempotente e repete o último percentual do Diário"; "um Diário cadastrado pelo MASTER é processado a qualquer hora, uma única vez" |
| 6 | Saques da Carteira de Rede | Saques **todos os dias, sem limite de quantidade**; cada solicitação exige saldo disponível na própria carteira e valor mínimo de R$ 55,00. A trava "1 saque por dia" foi removida. Vale para Associados e Cotistas com pacote ativo. | `validateWithdrawal` (`src/wallets.ts`) | `tests/withdrawalPolicy.test.ts` › "Carteira Rede aceita quantos saques quiser no mesmo dia, sem somar as carteiras" |
| 7 | Saques da Carteira de Rendimento (Cota) | **1 saque por semana**, com liberação do botão todo **domingo, às 18h** (America/Sao_Paulo). A semana vai de domingo 18h a domingo 18h; um saque já feito consome a semana. Valor mínimo R$ 55,00 e carência de 30 dias de cota ativa mantidas. As janelas dos dias 15 e 30 foram removidas. | `cotaWithdrawalWeekKey`, `hasCotaWithdrawalThisWeek`, `nextCotaWithdrawalRelease` (`src/wallets.ts`), aviso na tela Financeiro | `tests/withdrawalPolicy.test.ts` › "Carteira Cota libera 1 saque por semana a partir do domingo 18h" |
| 8 | Taxa de saque | **6% sobre o valor solicitado, descontados do próprio saque**, nas duas carteiras (`WITHDRAWAL_FEE_BPS = 600`). Ex.: R$ 55,00 → taxa R$ 3,30 → líquido R$ 51,70. Saques já registrados preservam as condições com que foram criados. | `withdrawalAmounts` / `updateWithdrawal` (`src/wallets.ts`) | `tests/withdrawalPolicy.test.ts` › "six percent is rounded in cents and applies to both wallets..."; `tests/pixWithdrawals.test.ts` |
| 9 | Carteiras e teto | Cota e Rede seguem separadas: nenhuma validação soma saldos para atingir o mínimo ou o disponível. Os créditos de ganho das duas carteiras (Diário na Cota e bonificações/unilevel na Rede) contam para o **único teto de 250% do pacote** (`SHAREHOLDER_EARNING_CAP_BPS = 15_000` = 150% além dos 100% investidos). Saques não reiniciam o limite de ganhos, porque o teto é medido pelos créditos de ganho, não pelo saldo. | `walletSummary`, `allocateEarningByBusinessPlan` (`src/wallets.ts`, `src/businessPlan.ts`) | `tests/withdrawalPolicy.test.ts` (saldos não se somam), `tests/businessPlan.test.ts` (teto 250% total) |

## Parâmetros que não mudaram

Percentual de 250% do pacote, Indicação Direta de 10%, percentuais do Unilevel
(10/9/8/7/6/5% sobre o rendimento elegível), teto de R$ 500,00 em bonificações do
Associado, mínimo de saque de R$ 55,00 e prazo de pagamento de até 48 horas (fluxo
manual do MASTER).

## Operação

- Os 4 agendamentos do Vercel apontam para o mesmo endpoint; cada um roda uma vez por dia,
  o que mantém a configuração compatível com o plano Hobby do Vercel. Se a conta for Pro,
  o mesmo endpoint pode ser chamado de hora em hora sem alteração de código.
- O endpoint exige `CRON_SECRET` (mínimo 16 caracteres) no header
  `Authorization: Bearer <CRON_SECRET>`. Sem a variável configurada a rota responde 503.
- O processamento é idempotente por data: repetir a chamada no mesmo dia não duplica
  rendimentos nem bonificações.
- `GOMOVE_MAX_QUOTA_CENTS` continua limitando o teto da aquisição de cotas.
