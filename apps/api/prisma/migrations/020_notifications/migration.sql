-- F9 (parcial) · o despacho do outbox e as notificações enviadas.
--
-- Desde F1 que cada transição escreve em `outbox_events` na mesma transacção
-- que muda o estado — e nada lia a tabela. Esta migração traz o que falta para
-- um trabalhador a poder consumir com segurança.
--
-- **Os fornecedores continuam por decidir (DP-03)**, e por isso só existe o
-- canal falso. O que fica provado é que a notificação certa é planeada e
-- enviada uma só vez; por onde sai é decisão para depois.

ALTER TABLE "outbox_events"
  ADD COLUMN "last_error" TEXT CHECK (char_length("last_error") <= 2000);

CREATE TYPE "ChannelKind" AS ENUM ('PUSH', 'SMS', 'EMAIL');

CREATE TABLE "notification_deliveries" (
  "id"                  UUID PRIMARY KEY,
  "outbox_event_id"     UUID NOT NULL REFERENCES "outbox_events"("id") ON DELETE RESTRICT,
  "recipient_user_id"   UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "channel"             "ChannelKind" NOT NULL,
  "template"            TEXT NOT NULL,
  -- `eventId:recipientUserId:channel`. Derivada de `(evento, destinatário)`
  -- como manda o SDD §14.3, e é ela que trava o duplo envio.
  "idempotency_key"     TEXT NOT NULL UNIQUE,
  "provider"            TEXT NOT NULL,
  "provider_reference"  TEXT,
  "sent_at"             TIMESTAMPTZ(3) NOT NULL,
  "created_at"          TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "notification_deliveries_recipient_idx"
    ON "notification_deliveries" ("recipient_user_id", "sent_at" DESC);

-- O trabalhador vai buscar lotes por aqui: eventos por processar cuja hora já
-- chegou. Parcial porque os processados são a esmagadora maioria das linhas.
CREATE INDEX "outbox_events_pending_idx"
    ON "outbox_events" ("available_at")
 WHERE "processed_at" IS NULL;

-- Uma notificação enviada não se apaga nem se reescreve: é a prova de que a
-- pessoa foi avisada, e a razão por que não é avisada outra vez.
GRANT SELECT, INSERT ON "notification_deliveries" TO nadm_app;
GRANT UPDATE ("attempts", "last_error", "processed_at") ON "outbox_events" TO nadm_app;
