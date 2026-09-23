-- F6 · disputas, e a resposta do criador à avaliação.
--
-- A disputa é a saída quando as partes discordam. Enquanto está aberta, a
-- libertação do escrow fica travada (RN-048): o dinheiro não segue para o
-- criador com a questão por resolver.

CREATE TYPE "DisputeStatus" AS ENUM ('OPEN', 'RESOLVED', 'WITHDRAWN');
CREATE TYPE "DisputeResolution" AS ENUM ('BUYER', 'CREATOR');

CREATE TABLE "disputes" (
  "id"                 UUID PRIMARY KEY,
  "deal_id"            UUID NOT NULL REFERENCES "deals"("id") ON DELETE RESTRICT,
  "opened_by_user_id"  UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "reason"             TEXT NOT NULL CHECK (char_length("reason") BETWEEN 1 AND 2000),
  "status"             "DisputeStatus" NOT NULL DEFAULT 'OPEN',
  "resolution"         "DisputeResolution",
  "decided_by_user_id" UUID REFERENCES "users"("id") ON DELETE RESTRICT,
  "decision_note"      TEXT CHECK (char_length("decision_note") <= 2000),
  "opened_at"          TIMESTAMPTZ(3) NOT NULL,
  "decided_at"         TIMESTAMPTZ(3),
  "created_at"         TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"         TIMESTAMPTZ(3) NOT NULL
);

-- Uma disputa resolvida tem sempre quem decidiu e a favor de quem; uma aberta
-- não tem nem uma coisa nem outra. Sem isto, uma decisão podia ficar a meio.
ALTER TABLE "disputes"
  ADD CONSTRAINT "disputes_resolution_is_complete"
  CHECK (
    ("status" = 'RESOLVED' AND "resolution" IS NOT NULL AND "decided_by_user_id" IS NOT NULL AND "decided_at" IS NOT NULL)
    OR ("status" = 'WITHDRAWN' AND "resolution" IS NULL AND "decided_at" IS NOT NULL)
    OR ("status" = 'OPEN' AND "resolution" IS NULL AND "decided_by_user_id" IS NULL AND "decided_at" IS NULL)
  );

-- Uma só disputa aberta por `Deal`. A restrição vive no Postgres porque protege
-- contra concorrência: as duas partes a abrir disputa ao mesmo tempo passariam
-- as duas por uma verificação em aplicação.
CREATE UNIQUE INDEX "disputes_one_open_idx"
    ON "disputes" ("deal_id")
 WHERE "status" = 'OPEN';

-- A fila da administração, por ordem de chegada.
CREATE INDEX "disputes_queue_idx"
    ON "disputes" ("opened_at")
 WHERE "status" = 'OPEN';

CREATE INDEX "disputes_deal_id_opened_at_idx"
    ON "disputes" ("deal_id", "opened_at" DESC);

-- Uma disputa não se apaga: é a prova de que houve desacordo e de como acabou.
GRANT SELECT, INSERT, UPDATE ON "disputes" TO nadm_app;

-- ───────────────────────────────────────── a resposta do criador à avaliação

ALTER TABLE "reviews"
  ADD COLUMN "reply" TEXT CHECK (char_length("reply") <= 2000),
  ADD COLUMN "replied_at" TIMESTAMPTZ(3);

-- A resposta é uma só e não se apaga: ou está lá, ou nunca esteve.
ALTER TABLE "reviews"
  ADD CONSTRAINT "reviews_reply_is_complete"
  CHECK (("reply" IS NULL AND "replied_at" IS NULL) OR ("reply" IS NOT NULL AND "replied_at" IS NOT NULL));

-- A migração 011 deu SELECT e INSERT; responder precisa de UPDATE, e só disso.
GRANT UPDATE ("reply", "replied_at") ON "reviews" TO nadm_app;
