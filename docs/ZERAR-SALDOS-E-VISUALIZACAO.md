# Zerar saldos e acessos administrativos de visualização

## 1. Zerar saldos do sistema

Necessário quando os valores em produção são todos de teste e a operação precisa começar zerada.

Como usar: painel MASTER → **Configurações** → painel **Zona de risco · Zerar saldos do sistema** → digitar `ZERAR SALDOS` → botão *Zerar saldos do sistema*.

API equivalente: `POST /api/admin/financial-reset` com `{ "confirmation": "ZERAR SALDOS" }` e o token do MASTER. Sem a frase exata a resposta é `422`; com token de associado ou de administrador de visualização, `403`.

### O que é apagado

`transactions`, `withdrawals`, `investments`, `invoices`, `orders`, `cart`, `bonusEntries`, `dailyProfitabilities`, `dailyProfitabilityRuns`, `commissionEvents`, `twoPpWebhookEvents`.

Cada conta `ASSOCIATE` volta ao estado **sem pacote**: `membershipType = ASSOCIATE`, `associatePlanStatus = PENDING`, `associatePlanAmountCents = 5500`, `bonusCapCents = 50000`, sem `shareholderSince` e sem `associatePlanPaidAt`. O `status` da conta é preservado (`ACTIVE`) para que a pessoa continue entrando, consiga comprar o plano novamente e não fique trancada fora do sistema.

### O que é preservado

`users`, `profiles`, `vehicles`, `tickets`, `commissionRules`, `auditLogs`, `sessions` — ou seja: contas, senhas, rede de patrocínio, operação e configuração. A parametrização do gateway 2PP (`TWOPP_API_KEY`, `TWOPP_API_SECRET`, `TWOPP_WEBHOOK_TOKEN`, `TWOPP_BASE_URL`) vive em variáveis de ambiente e não é tocada por nenhum reset de dados.

Depois do reset o conteúdo de demonstração (usado apenas com `NODE_ENV=test`) não volta, porque a auditoria passa a conter a entrada `FINANCIAL_RESET`.

### Backup e restauração

Antes de apagar, o estado íntegro é gravado:

- **Produção (Neon/Postgres)**: nova linha em `gomove_state` com `id = backup-<data-iso>`. Nada é apagado, então a cópia também sobrevive a uma segunda limpeza.
- **Execução local (arquivo)**: `.data/db.json.backup-<data-iso>.json`.

Restaurar produção (substitui o estado atual pelo backup, mantendo a trava de versão):

```sql
update gomove_state as p
set payload = b.payload, version = p.version + 1, updated_at = now()
from gomove_state as b
where p.id = 'production' and b.id = 'backup-2026-09-19T18-30-00-000Z';
```

Restaurar local: substituir `.data/db.json` pelo arquivo de backup.

A operação inteira fica registrada em `auditLogs` (`FINANCIAL_RESET`), com o caminho/id do backup, a quantidade de contas zeradas, os totais zerados por carteira e a contagem por coleção.

## 2. Administradores de visualização (somente leitura)

Perfil `ADMIN_VIEWER`: entra no painel administrativo, **consulta tudo** e **não altera nada**.

Onde criar:

- Painel MASTER → **Configurações** → painel **Administradores de visualização** (criar, trocar senha e remover). O servidor recusa a senha em texto, guarda o mesmo hash `scrypt` dos demais usuários e encerra as sessões abertas quando a senha muda ou o acesso é removido: `GET|POST /api/admin/viewers`, `PATCH|DELETE /api/admin/viewers/:id` (só MASTER).
- Variável de ambiente `GOMOVE_VIEWER_ADMINS` (JSON com até 20 acessos), criada uma única vez no boot — útil para provisionar os acessos fixos da operação sem depender do painel:

```json
[{"name":"Admin 2","username":"admin2","email":"admin2@gomoveinfra.com.br","password":"senha-forte"}]
```

A criação por ambiente **nunca sobrescreve** uma senha já existente: para trocar a senha de um acesso já criado, use o painel.

Garantias aplicadas no servidor (não só na interface):

- Toda requisição autenticada que não seja `GET`/`HEAD` é recusada com `403` e a mensagem *"Perfil de visualização: esta conta só pode consultar os dados"*. A única exceção é `POST /api/auth/logout`.
- O perfil não patrocina cadastros (`canSponsorRegistrations`), não é elegível a bônus (`isBonusEligibleParticipant`), não é contado como associado/cotista nos painéis e não consegue criar outros administradores nem executar a limpeza de saldos.
- A interface esconde os controles de escrita (novo cadastro, editar, excluir, ajustes de saldo, ativar/desativar regras, zerar saldos) e mostra a faixa *Perfil de visualização*.

Testes: `tests/financialReset.test.ts` e `tests/viewerAdmins.test.ts`.
