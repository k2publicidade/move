# Configuração do gateway 2PP

A GOMOVE lê as credenciais do 2PP no servidor, pelas variáveis de ambiente. A troca de chave e segredo é feita no ambiente de produção da Vercel e precisa de um novo deploy para entrar em vigor.

## Ambiente de produção

- Repositório: `k2publicidade/move`, branch de produção `main`.
- Projeto Vercel: `move`, equipe `k2publicidade2-9832s-projects`.
- Domínio público: `https://www.gomoveinfra.com.br`.
- Integração: `server/twopayments.ts`, utilizada pela API Node em `api/index.ts`.

| Variável | Configuração |
| --- | --- |
| `TWOPP_API_KEY` | API Key do painel 2PP, armazenada como Sensitive em Production. |
| `TWOPP_API_SECRET` | Segredo correspondente à mesma API Key, armazenado como Sensitive em Production. |
| `TWOPP_BASE_URL` | Host HTTPS da API informado no painel 2PP. |
| `TWOPP_WEBHOOK_TOKEN` | Token da aplicação, com pelo menos 32 caracteres, usado na URL de callback para autenticar a notificação recebida. |
| `APP_PUBLIC_URL` | Origem HTTPS pública da aplicação, sem página, parâmetros ou fragmentos. |

O token de callback da aplicação e o segredo opcional de assinatura HMAC oferecido pelo painel 2PP são mecanismos distintos. A integração atual verifica o token de callback da aplicação.

## Troca de credenciais

1. Obtenha a API Key e o segredo correspondentes no painel 2PP.
2. Atualize `TWOPP_API_KEY` e `TWOPP_API_SECRET` em Production nas configurações do projeto Vercel. Mantenha ambos como Sensitive.
3. Publique novamente a versão de produção para que as funções recebam os novos valores.
4. Confirme o deploy como Ready e confira os aliases do domínio público.
5. Valide as credenciais com `GET /api/v1/currencies/crypto`, enviando `X-API-Key` e `X-API-Secret` ao host do gateway. Confira também `GET /api/health` no domínio da GOMOVE.

As credenciais não devem entrar em commits, arquivos do frontend, capturas públicas ou logs. Arquivos locais `.env` e `.vercel` estão ignorados pelo Git. Variáveis Sensitive não permitem recuperar seus valores pelo painel/API após a gravação; a confirmação da atualização usa o registro de alteração e uma consulta autenticada ao gateway.

## Rotação validada em 10/10/2026

A API Key e o segredo fornecidos pelo responsável foram atualizados em Production às 12:59, no horário de São Paulo, e a versão que já estava publicada foi republicada.

- Código de origem: `7b99c50b99535b36b12983770ab1acc29f6c245b`, branch `main`.
- Deploy da rotação: `dpl_5KPmvmEXQPo8ASFqP6A2SrLcWBY4`, confirmado como Ready e associado ao domínio público.
- Consulta autenticada à 2PP: HTTP 200.
- API de saúde da GOMOVE: HTTP 200, com `ok: true`.
- Site público: HTTP 200.

Essa validação confirmou a autenticação de leitura e a disponibilidade do site. Nenhuma cobrança, saque ou transferência foi criada; o fluxo financeiro completo com webhook não foi exercitado nessa rotação.

## Rotação de credenciais em 28/10/2026

- As novas `TWOPP_API_KEY` e `TWOPP_API_SECRET` foram gravadas como Secret em Production, sem incluir seus valores no Git.
- A consulta autenticada `GET /api/v1/currencies/crypto` ao host do 2PP respondeu HTTP 200.
- A versão já publicada foi republicada e promovida ao domínio `www.gomoveinfra.com.br`.
- Deploy: `dpl_9BcWpfofjBVirsmXgxNAwN2ZNjjK`, status Ready.
- Fonte informada pela Vercel: commit `7de6b74defba4f674348b8a3e17f1f30d9a0b583`, branch `codex/migrate-supabase`. Essa fonte difere da `main` clonada; preservar essa diferença antes de qualquer publicação futura de código.
- Validação da cópia local da main: 198 testes passaram e `npm run build` concluiu. Esses testes usam provedor simulado e não validam a versão diferente que está em produção.

A autenticação de leitura foi validada. A liquidação real de um depósito e de um saque, incluindo recebimento dos respectivos webhooks e movimentação única da carteira, ainda precisa de validação operacional. Nenhum pagamento ou saque real foi executado nesta rotação.
