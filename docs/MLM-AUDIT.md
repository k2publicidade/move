# Auditoria funcional do marketing multinível GoMove

Data: 31/07/2026

## Escopo validado

- Cadastro público somente por convite de patrocinador ativo.
- Ativação, bloqueio, edição e exclusão segura pelo MASTER.
- Prevenção de patrocinador próprio, ciclos diretos e ciclos indiretos.
- Visualização de diretos, rede total e rede unilevel por geração.
- Regras de comissão com até 20 níveis, percentuais em basis points e apenas uma regra ativa por evento.
- Confirmação idempotente de investimento e snapshot imutável da regra utilizada.
- Geração de bônus sem compressão de níveis e somente para patrocinadores ativos.
- Aprovação, cancelamento e estorno auditável dos bônus.
- Sincronização de bônus aprovados e estornos com o extrato financeiro do usuário.
- Validação de saldo disponível, reserva de saques pendentes e débito único no pagamento.
- Auditoria das decisões sensíveis do MASTER.

## Falhas críticas corrigidas

1. O backend de demonstração da Vercel não processava a confirmação do investimento.
2. Regras aceitavam níveis repetidos, percentuais inválidos e totais superiores a 100%.
3. Níveis não sequenciais podiam pagar a geração errada.
4. A confirmação repetida podia divergir entre ambientes; agora é idempotente.
5. Aprovar bônus não atualizava o saldo e o extrato do usuário.
6. Estornos não impediam duplicidade no backend de demonstração.
7. Saques não validavam saldo nem reservavam solicitações pendentes.
8. Contas com histórico financeiro podiam ser excluídas destrutivamente.
9. Patrocinadores inativos podiam ser atribuídos pelo MASTER.
10. O usuário não possuía uma visão completa da rede por nível.

## Garantias implementadas

- Valores financeiros são calculados em centavos inteiros.
- Cada evento de investimento possui uma única distribuição de comissão.
- Cada bônus possui chave idempotente por evento, beneficiário e nível.
- Cada bônus aprovado ou saque pago produz no máximo um lançamento no extrato.
- Cada bônus aprovado aceita no máximo um estorno.
- Regras utilizadas por eventos não podem ser excluídas.
- Contas com investimentos, eventos ou bônus devem ser bloqueadas, preservando o histórico.

## Supabase

O arquivo `supabase/schema.sql` inclui relacionamentos, índices, RLS, prevenção recursiva de ciclos, eventos de comissão, snapshots de regras e vínculos idempotentes com o razão financeiro. A execução no Supabase real depende apenas das credenciais e do projeto que serão fornecidos na etapa de integração.

## Verificação automatizada

- 23 testes aprovados.
- Build TypeScript/Vite aprovado.
- Auditoria npm sem vulnerabilidades.
- Detector de qualidade visual sem ocorrências.
- Painéis verificados em desktop e 390 px sem overflow ou erros no console.
