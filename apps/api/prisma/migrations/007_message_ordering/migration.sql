-- Ordem determinística da conversa.
--
-- Várias mensagens escritas na mesma transacção partilham o `created_at` ao
-- milissegundo — a aprovação e a libertação do escrow, por exemplo. Desempatar
-- por `id` dava ordem aleatória, porque o id é um UUID v4. `seq` é a ordem de
-- inserção e resolve o desempate.
ALTER TABLE "messages" ADD COLUMN "seq" BIGSERIAL NOT NULL;

CREATE INDEX "messages_deal_id_seq_idx" ON "messages"("deal_id", "seq");

-- Sem USAGE na sequência do BIGSERIAL, o papel da aplicação não consegue inserir.
GRANT USAGE, SELECT ON SEQUENCE "messages_seq_seq" TO nadm_app;
