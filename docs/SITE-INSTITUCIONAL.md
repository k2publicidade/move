# GoMove — site institucional

## Conteúdo e identidade

Fonte fornecida pelo cliente: https://gomove-locacoes-infra.ronieljapan.chatgpt.site/

Conteúdo reutilizado: quatro frentes de atuação (Mobilidade, Turismo, E-mobility e Infraestrutura), apresentação da empresa, Matheus Soares como CEO, modalidades Associado/Cotista/frota de terceiros, indicação direta, Unilevel, carteiras, teto e perguntas frequentes. Informações comerciais dependem da apresentação e das condições contratuais vigentes; não são garantias de retorno.

Logo oficial preservada em `/brand/gomove-logo-oficial.png`. Artes e PDF obtidos do site do cliente em `/assets/hero.png`, `/assets/infra.png`, `/assets/matheus.png` e `/assets/GoMove-Apresentacao.pdf`. Imagens são disponibilizadas localmente em WebP para reduzir transferência. As artes de operação/infraestrutura são conceituais e devem ser identificadas assim, não apresentadas como comprovação de instalações ou frota existente.

Não foram inventados telefone, WhatsApp, endereço, CNPJ, depoimentos, indicadores de frota, rendimentos fixos ou formulário de contato com envio inexistente. Os canais disponíveis na entrega são cadastro, acesso ao portal e apresentação institucional.

## Rotas

- `/`: site público, inclusive para quem já tem sessão.
- `/login` e `/portal`: acesso à plataforma; sessão válida segue ao ambiente autorizado.
- `/cadastro`, `/cadastro?ref=login`, `/convite/codigo`: cadastro existente, preservando indicador.
- `/?ref=login`, `/?inviteCode=codigo`, `/?convite=codigo`: convites antigos continuam no cadastro.
- Referências inválidas ou vazias permanecem na validação do cadastro, não viram acesso direto silenciosamente.
- Demais rotas autenticadas e API não foram redesenhadas.

## Direção visual e interações

Composição institucional editorial, identidade preto/verde-lima e tipografia Manrope/Barlow Condensed. Conteúdo organizado para apresentar soluções, explicar modalidades e conduzir à plataforma. Estilos restritos ao site para não alterar as telas financeiras.

Navegação por seções, menu mobile com teclado, FAQ expansível, links funcionais para o PDF local e animações progressivas de entrada com respeito a `prefers-reduced-motion`. Conteúdo não depende de animação para ficar acessível.

## Desenvolvimento e validação

```bash
npm ci
npm run dev
npm test
npm run build
```

Validação local: 198/198 testes aprovados, build completo de frontend/backend aprovado e `git diff --check` sem erros. Navegador verificado em 320, 390, 768 e 1440 pixels, sem overflow horizontal; logo/imagens e âncoras locais válidas. Menu móvel abre/fecha e Escape devolve o foco; FAQ expansível; PDF local responde HTTP 200 com `application/pdf`. Login e cadastro permanecem separados; referência inválida não perde silenciosamente o indicador. Animações de entrada verificadas com a aba em primeiro plano (IntersectionObserver é suspenso pelo navegador em abas ocultas). Com `prefers-reduced-motion: reduce`, nenhuma seção fica invisível. QA usa ledger isolado e gateway sem credenciais; não houve movimentação em contas reais. Revisão independente e publicação na branch de implementação precedem qualquer merge/deploy em produção.

O PDF institucional original é composto por 15 páginas de imagens; a versão completa é oferecida para consulta. Valores e percentuais exibidos no site devem permanecer alinhados às constantes do plano de negócio do sistema, incluindo o mínimo atual de cota de R$60.
