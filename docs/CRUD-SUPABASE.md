# Arquitetura CRUD GoMove

## Fonte de verdade

Todas as entidades operacionais usam `userId` como vínculo com a conta. Nomes como `driver` são apenas dados de apresentação e nunca devem ser usados como chave. A camada atual persiste o demo no navegador/Vercel e em JSON no servidor local; os contratos HTTP foram mantidos para permitir a troca posterior pelo Supabase.

## Contratos administrativos

| Entidade | Listar | Criar | Editar | Excluir |
|---|---|---|---|---|
| Usuários | `GET /api/admin/associates` | `POST /api/admin/associates` | `PATCH /api/admin/associates/:id` | `DELETE /api/admin/associates/:id` |
| Frota | `GET /api/admin/vehicles` | `POST /api/admin/vehicles` | `PATCH /api/admin/vehicles/:id` | `DELETE /api/admin/vehicles/:id` |
| Investimentos | `GET /api/admin/investments` | `POST /api/admin/investments` | `PATCH /api/admin/investments/:id` | `DELETE /api/admin/investments/:id` |
| Pedidos | `GET /api/admin/orders` | `POST /api/admin/orders` | `PATCH /api/admin/orders/:id` | `DELETE /api/admin/orders/:id` |
| Faturas | `GET /api/admin/invoices` | `POST /api/admin/invoices` | `PATCH /api/admin/invoices/:id` | `DELETE /api/admin/invoices/:id` |
| Saques | `GET /api/admin/withdrawals` | `POST /api/admin/withdrawals` | `PATCH /api/admin/withdrawals/:id` | `DELETE /api/admin/withdrawals/:id` |
| Tickets | `GET /api/admin/tickets` | `POST /api/admin/tickets` | `PATCH /api/admin/tickets/:id` | `DELETE /api/admin/tickets/:id` |

Toda mutação administrativa gera uma entrada em `audit_logs`. As respostas de usuário nunca expõem senha ou hash.

## Integridade

- Registros financeiros, pedidos, investimentos e tickets exigem um usuário associado.
- Veículos podem permanecer sem vínculo e passam a exibir “Não vinculado”.
- Ao renomear um usuário, os vínculos continuam válidos porque utilizam o UUID/ID.
- Ao excluir uma conta no demo, os registros de propriedade são removidos, veículos ficam disponíveis e indicados diretos são realocados ao patrocinador anterior.
- No Supabase, FKs financeiras usam `ON DELETE RESTRICT`; a exclusão operacional deve ser feita por `deleted_at` para preservar histórico fiscal e de auditoria.

## Migração para Supabase

1. Executar [`supabase/schema.sql`](../supabase/schema.sql) em um projeto novo.
2. Criar o primeiro usuário no Supabase Auth e atualizar seu perfil para `ADMIN_MASTER`.
3. Substituir a implementação do `ApiClient` por um adapter Supabase mantendo os mesmos DTOs.
4. Migrar os IDs para UUID e importar dados na ordem: perfis, frota, investimentos, pedidos, faturas, transações, saques, tickets e bônus.
5. Validar as políticas RLS com uma sessão MASTER e uma sessão ASSOCIATE antes de produção.

