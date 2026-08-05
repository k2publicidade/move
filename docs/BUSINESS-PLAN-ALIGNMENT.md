# Aderência ao Plano de Negócios GoMove

Fonte de verdade: `Plano_de_Negocios_GoMove_Associado_e_Cotista.pdf`, versão anexada em 05/08/2026.

## Matriz de aderência

| Regra do documento | Implementação no sistema |
| --- | --- |
| Ingresso como Associado mediante Plano de R$ 55,00 | Todo novo cadastro nasce como Associado, com plano pendente. A conta não pode ser ativada enquanto o plano de R$ 55,00 não estiver confirmado como ativo. |
| Associado participa da comunidade | A conta ativa mantém acesso ao painel, rede, atendimento, loja e financeiro. |
| Associado pode indicar Associados e Cotistas | O convite continua disponível para todo participante ativo. A modalidade do indicado é exibida na rede e no painel MASTER. |
| Bonificação direta e indireta | O nível 1 é identificado como indicação direta; níveis posteriores são identificados como indiretos. Percentuais continuam configuráveis pelo MASTER. |
| Associado não participa dos resultados das cotas | O painel do Associado não apresenta resultados financeiros como direito disponível. Esse direito aparece somente para Cotistas. |
| Limite acumulado de R$ 500,00 em bonificações | O motor soma bônus aprovados e pendentes do Associado. A parcela que exceder R$ 500,00 recebe o estado `BLOCKED_UPGRADE` e não pode ser aprovada ou sacada. |
| Upgrade com aquisição mínima de R$ 500,00 em cotas | O checkout e a confirmação administrativa rejeitam aquisições inferiores a R$ 500,00. A confirmação promove automaticamente o participante a Cotista. |
| Manutenção do Plano de Associado ativo | Aquisição de cotas, ativação de conta e elegibilidade para novos bônus exigem plano ativo. |
| Liberação do excedente após upgrade | Ao confirmar a primeira aquisição elegível, todos os bônus `BLOCKED_UPGRADE` do participante passam automaticamente para `PENDING`, preservando a etapa de aprovação financeira. |
| Cotista sem o limite anterior | O motor não aplica o teto de R$ 500,00 a participantes da modalidade Cotista. |

## Parâmetros não definidos no anexo

O documento não informa percentuais de bonificação por nível, periodicidade do Plano de Associado, quantidade máxima de níveis, rentabilidade das cotas ou fórmula de distribuição de resultados. O sistema não apresenta rentabilidades projetadas como se fossem regras oficiais. Os percentuais de indicação permanecem configuráveis e auditáveis pelo MASTER.

Qualquer definição futura desses parâmetros deve ser incorporada ao documento oficial antes de ser fixada no código.

## Controles técnicos

- Valores monetários das regras são processados em centavos.
- Confirmações de pagamento são idempotentes.
- Webhooks CoinPayments continuam validados por assinatura.
- Mudanças de modalidade, confirmação de cotas e liberação de bônus são registradas na auditoria.
- O schema PostgreSQL/Supabase contém modalidade, status do plano, valor do plano, teto de bônus e datas de confirmação/upgrade.
