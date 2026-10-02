# Correções de pagamentos e convites — 02/10/2026

## Falhas reproduzidas e corrigidas

- A consulta pública de convite rejeitava espaços que o cadastro aceitava. Consulta e cadastro agora normalizam espaços e maiúsculas da mesma forma.
- O cadastro aceita um código ou link colado, além de `/convite/<codigo>/` e `/cadastro?inviteCode=<codigo>`. Mostra o indicador confirmado e bloqueia convites inválidos; respostas de consultas anteriores não substituem a validação atual. Após confirmação do responsável em 02/10/2026, contas ACTIVE podem convidar mesmo com plano pendente. Contas BLOCKED/PENDING e administradores de visualização não patrocinam cadastros. As regras financeiras de bônus e saque continuam independentes.
- Uma nova chave de depósito podia retornar silenciosamente uma cobrança aberta com outro valor. Agora retorna conflito com a referência da cobrança pendente; o portal recupera essa cobrança.
- Repetir a chave de um saque recusado retornava sucesso. Agora retorna conflito e permite uma nova tentativa com nova chave, sem reenviar a operação anterior.
- Uma resposta incerta do provedor preserva a reserva e impede outro saque com nova chave até a conciliação. Recusas definitivas permitem tentar novamente; nenhuma chamada POST ao gateway é repetida automaticamente.
- Notificações atrasadas de pendência não reabrem operações encerradas. A resposta de criação não sobrescreve o status de uma confirmação recebida antecipadamente.
- O portal atualiza os dados da cobrança, inclusive QR Code recebido posteriormente, e distingue depósitos confirmados, recusados, expirados e em conciliação. Cobranças encerradas não exibem QR Code para pagamento.
- A entrada serverless preserva a rota original quando não recebe o parâmetro interno `path`; anteriormente devolvia o HTML do site para uma chamada direta da API. Há testes de convite e webhook pela entrada serverless, com e sem redirecionamento.
- O domínio de webhook rejeita páginas, parâmetros e fragmentos que produziriam uma URL de callback incorreta. Respostas incompletas de saque e cripto geram erros estruturados, preservando a incerteza e, quando disponível, a referência do provedor para conciliação.

## Validação realizada

`npm test`: 131 testes passaram. `npm run build`: compilação TypeScript e build completos passaram.

Testes de integração exercitam criação de cobranças, saques, autenticação de webhooks, confirmação, deduplicação, reservas, taxa de 6%, liberação após recusa e novas tentativas. O provedor HTTP usado nos testes é local e simulado, sem pagamentos reais.

No navegador, foram verificados cadastro por código com espaços, link de convite com barra final, rejeição de convite inválido, geração de PIX com QR Code e copia e cola e bloqueio de depósito com valor divergente. O banco desse teste foi isolado em diretório temporário.

## Validação que depende do ambiente publicado

Não foram realizadas transferências reais. Não há credenciais 2PP preenchidas no ambiente local disponível. Isso não comprova a configuração atual da produção.

Após autorização do usuário, o commit `e88140b` foi publicado na branch `main`. A Vercel confirmou o deploy `AjKcfqX6864hJrzrYyZNraz8BYfQ` como Ready em Production no domínio público. A API `/api/health` respondeu JSON com `ok:true`, e `/api/public/invites/%20GOMOVE%20` confirmou o indicador. O navegador validou o convite com barra final e código com espaços/maiúsculas.

O cadastro administrativo de `jlider01` está ACTIVE, com modalidade Associado e plano PENDING. A regra anterior recusava seu convite; após confirmação do responsável, essa combinação permite convidar, sem ativar o plano ou liberar direitos financeiros. Sua fatura de plano está PROVIDER_UNKNOWN. O painel de saldo e pagamentos foi atualizado para mostrar a referência 2PP, o status do provedor e o erro armazenado (incluindo código e status HTTP), também nos saques, para permitir conciliação baseada em evidências.

O painel autenticado da Vercel confirmou o projeto `move`, o domínio `www.gomoveinfra.com.br` e a versão de produção `b007f90`, ainda sem estas correções. As variáveis `TWOPP_API_KEY`, `TWOPP_API_SECRET`, `TWOPP_BASE_URL`, `TWOPP_WEBHOOK_TOKEN` e `APP_PUBLIC_URL` existem em Production, mas são segredos sem leitura pelo painel; seus valores e validade não foram verificados. O convite público `/convite/gomove` identificou Administrador GoMove. Os logs acessíveis da última hora, consultados em 02/10/2026 às 19:40 de São Paulo, não apresentaram tentativas de depósito ou saque; isso não exclui falhas anteriores.

O servidor publicado precisa receber `TWOPP_API_KEY`, `TWOPP_API_SECRET`, `TWOPP_BASE_URL` com o host real informado no painel, `TWOPP_WEBHOOK_TOKEN` com pelo menos 32 caracteres e `APP_PUBLIC_URL` com o domínio HTTPS correto. Credenciais devem ser configuradas no ambiente do servidor, nunca no frontend ou em arquivos versionados.

Após publicar, validar uma cobrança real e o recebimento do webhook autenticado; conferir valor, identificador e crédito único na Carteira de Saldo. Para saque, conferir reserva do bruto, envio do líquido, confirmação pelo gateway e débito único. O calendário e os requisitos de elegibilidade das carteiras continuam valendo.

As correções são da API Node/Express (`server/index.ts`), também usada na Vercel. O backend PHP legado em `public/api/index.php` não implementa essa integração e precisa ser substituído pela API Node em instalações que ainda o utilizem.
