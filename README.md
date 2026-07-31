# GoMove — Mobilidade Inteligente

Plataforma fullstack independente para operação, investimentos, comércio, financeiro, rede de parceiros e suporte da GoMove.

## Executar

```bash
npm install
npm run dev
```

- Aplicação: `http://localhost:5173`
- API: `http://localhost:4010`

Para servir a versão de produção:

```bash
npm run build
npm start
```

Acesse `http://localhost:4010`.

## Acesso de demonstração

- Usuário: `admin`
- Senha: `gomove2026`

As credenciais fornecidas para consulta do sistema de referência não estão armazenadas neste projeto.

## Módulos

- Dashboard executivo e indicadores operacionais
- Gestão de frota e status de veículos
- Planos e carteira de investimentos
- Loja, carrinho, endereço e checkout
- Faturas, pedidos, extrato, pagamentos e saques
- Rede de parceiros, diretos, unilevel e genealogia
- Projetos sociais, downloads e vídeos
- Tickets de suporte
- Perfil, preferências e controles de 2FA

## Estrutura

- `src/` — aplicação React/TypeScript responsiva
- `server/` — API Express e persistência local
- `.data/db.json` — criada automaticamente na primeira execução
- `public/brand/` — materiais visuais GoMove

Esta entrega é uma implementação original baseada no mapeamento funcional e na identidade visual fornecida. Integrações de produção (gateway de pagamento, PIX, cripto, e-mail/SMS, telemetria veicular e Google Authenticator) devem receber credenciais próprias antes da publicação.
