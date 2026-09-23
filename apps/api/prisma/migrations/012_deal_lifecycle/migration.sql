-- F4 · caminhos de falha e prazos.
--
-- Acrescenta o que as transições de saída precisam de guardar: quando o negócio
-- fechou, e quantas revisões o comprador já gastou.

ALTER TABLE "deals"
  ADD COLUMN "closed_at" TIMESTAMPTZ(3),
  ADD COLUMN "revision_count" INTEGER NOT NULL DEFAULT 0;

-- O contador só sobe, e só até onde a oferta permitiu. O tecto por oferta vive
-- no `offer_snapshot` e não é comparável em SQL; o que o Postgres garante aqui é
-- que ninguém escreve um número impossível.
ALTER TABLE "deals"
  ADD CONSTRAINT "deals_revision_count_non_negative" CHECK ("revision_count" >= 0);

-- Os negócios já fechados antes desta migração: `closed_at` reconstrói-se do
-- momento em que cada um terminou, para o período de graça da conversa continuar
-- a contar do sítio certo.
UPDATE "deals"
   SET "closed_at" = COALESCE("settled_at", "approved_at", "updated_at")
 WHERE "status" IN ('PAID', 'DECLINED', 'REFUNDED', 'EXPIRED');

-- Índices parciais para os dois varrimentos do agendador. São parciais porque a
-- esmagadora maioria das linhas nunca é candidata: varrer a tabela inteira para
-- encontrar meia dúzia de prazos vencidos é trabalho que cresce com o sucesso.
CREATE INDEX "deals_expiry_sweep_idx"
    ON "deals" ("expires_at")
 WHERE "status" IN ('PROPOSED', 'COUNTER_OFFERED');

CREATE INDEX "deals_auto_approval_idx"
    ON "deals" ("delivered_at")
 WHERE "status" = 'DELIVERED';

CREATE INDEX "deals_late_delivery_idx"
    ON "deals" ("due_at")
 WHERE "status" IN ('ACCEPTED', 'IN_PROGRESS');
