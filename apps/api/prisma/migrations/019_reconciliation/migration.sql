-- F10 · reconciliação e suspensão de conta.
--
-- A tarefa diária cruza o que o sistema diz com o que o sistema fez, e regista
-- as divergências. **Nenhuma correcção é automática** (SDD §11.5): dinheiro que
-- não bate certo decide-se por uma pessoa, com registo de auditoria.

CREATE TYPE "FindingKind" AS ENUM (
  'STUCK_PAYMENT_INTENT',
  'CAPTURE_WITHOUT_LEDGER',
  'WALLET_DIVERGENCE',
  'STUCK_PAYOUT',
  'UNBALANCED_LEDGER',
  'ESCROW_ON_CLOSED_DEAL'
);
CREATE TYPE "FindingStatus" AS ENUM ('OPEN', 'RESOLVED', 'ACCEPTED');
CREATE TYPE "FindingSeverity" AS ENUM ('WARNING', 'CRITICAL');

CREATE TABLE "reconciliation_findings" (
  "id"                  UUID PRIMARY KEY,
  "kind"                "FindingKind" NOT NULL,
  "severity"            "FindingSeverity" NOT NULL,
  "status"              "FindingStatus" NOT NULL DEFAULT 'OPEN',
  "subject_type"        TEXT NOT NULL,
  "subject_id"          TEXT NOT NULL,
  "fingerprint"         TEXT NOT NULL,
  "detail"              TEXT NOT NULL CHECK (char_length("detail") <= 2000),
  "metadata"            JSONB NOT NULL DEFAULT '{}',
  "detected_at"         TIMESTAMPTZ(3) NOT NULL,
  "resolved_at"         TIMESTAMPTZ(3),
  "resolved_by_user_id" UUID REFERENCES "users"("id") ON DELETE RESTRICT,
  "resolution_note"     TEXT CHECK (char_length("resolution_note") <= 2000),
  "created_at"          TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMPTZ(3) NOT NULL
);

-- Fechar uma divergência obriga a dizer o que se fez, e a ficar quem o disse.
ALTER TABLE "reconciliation_findings"
  ADD CONSTRAINT "reconciliation_findings_closure_is_complete"
  CHECK (
    ("status" = 'OPEN' AND "resolved_at" IS NULL AND "resolved_by_user_id" IS NULL AND "resolution_note" IS NULL)
    OR ("status" <> 'OPEN' AND "resolved_at" IS NOT NULL AND "resolved_by_user_id" IS NOT NULL AND "resolution_note" IS NOT NULL)
  );

-- A mesma divergência não se regista duas vezes enquanto estiver aberta. Sem
-- isto, uma intenção presa há uma semana produzia sete linhas iguais e a lista
-- deixava de se poder ler.
CREATE UNIQUE INDEX "reconciliation_findings_one_open_idx"
    ON "reconciliation_findings" ("fingerprint")
 WHERE "status" = 'OPEN';

CREATE INDEX "reconciliation_findings_queue_idx"
    ON "reconciliation_findings" ("severity", "detected_at" DESC)
 WHERE "status" = 'OPEN';

CREATE INDEX "reconciliation_findings_subject_idx"
    ON "reconciliation_findings" ("subject_type", "subject_id");

-- Uma divergência não se apaga: é o registo de que o sistema já discordou de
-- si próprio, e de como isso acabou.
GRANT SELECT, INSERT, UPDATE ON "reconciliation_findings" TO nadm_app;

-- ───────────────────────────────────────────────── suspensão de conta

ALTER TABLE "users"
  ADD COLUMN "suspended_at" TIMESTAMPTZ(3),
  ADD COLUMN "suspension_reason" TEXT CHECK (char_length("suspension_reason") <= 2000);

-- Suspender é dizer porquê. Uma conta suspensa sem motivo não se percebe daqui
-- a seis meses, nem se defende se alguém reclamar.
ALTER TABLE "users"
  ADD CONSTRAINT "users_suspension_is_complete"
  CHECK (
    ("status" <> 'SUSPENDED' AND "suspended_at" IS NULL AND "suspension_reason" IS NULL)
    OR ("status" = 'SUSPENDED' AND "suspended_at" IS NOT NULL AND "suspension_reason" IS NOT NULL)
  );
