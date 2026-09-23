-- F5 · verificação de identidade.
--
-- Levantar dinheiro exige identidade verificada (RN-051). A submissão é do
-- próprio, a decisão é da administração, e o registo só é legível por esses
-- dois (RN-062).

CREATE TYPE "IdentityDocumentType" AS ENUM ('BI', 'PASSPORT', 'NIF');
CREATE TYPE "IdentityVerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'EXPIRED');

CREATE TABLE "identity_verifications" (
  "id"               UUID PRIMARY KEY,
  "user_id"          UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "document_type"    "IdentityDocumentType" NOT NULL,
  -- Em claro à espera de DP-17 (cifra em repouso). Nunca sai da API: as
  -- leituras devolvem só os últimos dígitos, e o registo estruturado não o toca.
  "document_number"  TEXT NOT NULL CHECK (char_length("document_number") BETWEEN 4 AND 40),
  "full_name"        TEXT NOT NULL CHECK (char_length("full_name") BETWEEN 2 AND 160),
  "status"           "IdentityVerificationStatus" NOT NULL DEFAULT 'PENDING',
  "reviewer_user_id" UUID REFERENCES "users"("id") ON DELETE RESTRICT,
  "reviewed_at"      TIMESTAMPTZ(3),
  "rejection_reason" TEXT CHECK (char_length("rejection_reason") <= 2000),
  "submitted_at"     TIMESTAMPTZ(3) NOT NULL,
  "created_at"       TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"       TIMESTAMPTZ(3) NOT NULL
);

-- Uma submissão por utilizador à espera de decisão. Sem isto, reenviar o
-- formulário deixaria a fila da administração cheia do mesmo pedido.
CREATE UNIQUE INDEX "identity_verifications_one_pending_idx"
    ON "identity_verifications" ("user_id")
 WHERE "status" = 'PENDING';

CREATE INDEX "identity_verifications_user_id_status_idx"
    ON "identity_verifications" ("user_id", "status");

-- A fila da administração, por ordem de chegada.
CREATE INDEX "identity_verifications_queue_idx"
    ON "identity_verifications" ("submitted_at")
 WHERE "status" = 'PENDING';

-- Uma decisão de identidade não se apaga: é prova de quem decidiu e quando.
GRANT SELECT, INSERT, UPDATE ON "identity_verifications" TO nadm_app;
