# Correções de convite, status, bonificação e mobile

Validação local em 03/10/2026.

## Convite e status

- Código, URL `/convite/codigo`, barra final e URL de cadastro com `inviteCode` ou `convite` usam a mesma normalização no frontend, na API e na demonstração. Caminhos adicionais e códigos malformados são rejeitados.
- Abrir um convite já conectado apresenta a conta atual e permite sair mantendo o convite. A indicação permanece vinculada ao cadastro.
- Uma conta ativa pode acessar Minha rede e compartilhar o convite mesmo antes de pagar um produto. Receber bônus continua sujeito à elegibilidade financeira existente.
- O dashboard mostra o status da conta. Para Cotistas, o plano de R$ 55 pendente aparece como dispensado, sem sugerir que a conta esteja pendente.
- A sessão consulta o status atual periodicamente e ao recuperar foco. Pagamentos confirmados atualizam a modalidade e o plano sem novo login. Falhas temporárias de conexão preservam a sessão; requisições antigas não apagam uma sessão mais recente.

## Valores financeiros

- API e demonstração compartilham os totais de bônus e cotas e o mesmo motor de limite de ganhos.
- O total aprovado considera estornos. O saldo da Carteira Rede também considera saques e ajustes; por isso pode diferir do acumulado aprovado. Os textos deixam essa distinção explícita.
- Cotas com pagamento explicitamente pendente não aumentam o limite. Registros antigos de cotas pagas usam o valor em reais quando `amountCents` está ausente.
- As bonificações por período usam a data do crédito, inclusive datas legadas, e ignoram repetições do mesmo identificador de transação.
- Saques e estornos não renovam o limite acumulado de ganhos. Os percentuais e regras comerciais existentes foram preservados.
- A liberação semanal da Cota é exibida às 18h de domingo em São Paulo. A interface respeita a carência e a janela semanal ao apresentar o valor disponível e habilitar o saque.
- Históricos de bônus e listas administrativas carregam todas as páginas da API.

## Mobile

- QR Code dimensionado pela largura disponível, sem ultrapassar a área do pagamento.
- Campos com tamanho de fonte adequado ao celular, valores e referências longas com quebra de linha e cartões ajustados para 320 pixels.
- Menu com botão de fechar, Escape, controle de foco, bloqueio da rolagem ao fundo e navegação oculta fora da área interativa quando fechado.
- Modais contidos na altura disponível, cabeçalho acessível durante a rolagem, foco restaurado ao fechar e ações adaptadas à largura.
- Cópia de convite, PIX e endereço cripto com alternativa por seleção e mensagem em caso de falha.
- Rede MASTER e auditoria apresentam falhas de conexão e permitem tentar novamente, sem exceções não tratadas ou carregamento infinito.
- Redirecionamentos sincronizam a rota inicial. O campo de usuário usa um padrão compatível com a validação atual do navegador.

## Evidências

- `npm test`: 141 testes, incluindo regressões de convite, reescrita de rotas na Vercel, estorno, cotas legadas, paginação, sessão e calendário de saque.
- `npm run build`: frontend, verificação TypeScript e servidor compilados.
- Servidor compilado: rota SPA de convite e API pública de validação por URL de cadastro retornaram o indicador correto.
- Playwright com Edge: 78 verificações de layout e interação em 320, 390 e 768 pixels, com verificações adicionais de desktop em 1440 pixels.
- Fluxo no navegador: convite → cadastro ativo → acesso à rede sem plano → compra de R$ 60 em cotas pela Carteira de Saldo → aprovação do bônus de R$ 6 → mesmos incrementos no dashboard, no período e na Carteira Rede.
- Atualização de plano sem novo login e saída de sessão preservando o convite verificadas no navegador.
- Respostas 503 simuladas na rede MASTER e auditoria produzem mensagem e opção de recuperação, sem exceções não tratadas.
- A verificação pública identificou a decodificação de barras nos parâmetros de convite pela Vercel. O adaptador mantém URLs completas como um único parâmetro, com regressão verificada em uma rota Express real.

Os dados e créditos usados na validação anterior à publicação são locais e isolados. Os resultados e capturas estão em `output/bug-audit/`. A revisão emula telas de celular; não substitui a execução em aparelhos físicos. Não houve pagamento real no gateway durante esses testes.
