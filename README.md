# GoMove — Mobilidade Inteligente

Plataforma fullstack para a operação GoMove, com dois ambientes independentes e controle de acesso por função:

- Portal do usuário para mobilidade, investimentos, compras, financeiro, rede, suporte e perfil.
- Central MASTER para administrar usuários, frota, investimentos, pedidos, financeiro, rede multinível, comissões, tickets, auditoria e configurações.

## Acessos de demonstração

| Perfil | Usuário | Senha | Entrada |
| --- | --- | --- | --- |
| Administrador MASTER | `admin` | `gomove2026` | `/admin` |
| Usuário | `matheus` | `gomove2026` | `/dashboard` |

O login `master` também é aceito como alias do administrador no modo de demonstração.

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
- Configurações e restauração segura do ambiente demo

## Arquitetura

- `src/App.tsx` — portais responsivos e roteamento com proteção por função
- `src/api.ts` — cliente único da API com tratamento de sessão
- `src/demoBackend.ts` — backend local persistente no navegador para o preview da Vercel
- `server/index.ts` — API Express, autenticação, persistência JSON e operações administrativas
- `server/mlm.ts` — regras puras de rede, ciclos, comissões e estornos
- `tests/` — testes automatizados da API cliente e do motor multinível
- `public/brand/` — identidade visual e logo oficial GoMove

## Persistência e produção

No desenvolvimento local, a API persiste dados em `.data/db.json`. No preview estático da Vercel, a aplicação usa uma base de demonstração isolada no `localStorage` do navegador; assim, todos os fluxos podem ser apresentados sem depender de um banco externo.

Antes de uso comercial com dados reais, configure um banco gerenciado, segredo de sessão, gateway de pagamento/PIX, e-mail/SMS, telemetria veicular e provedor de 2FA. As credenciais do sistema de referência não estão armazenadas neste projeto.
