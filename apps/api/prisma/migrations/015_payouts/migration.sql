-- F5 · levantamentos.
--
-- O ponto em que um erro no razão passa a ter consequência irreversível: o
-- dinheiro sai da plataforma. O valor é reservado no momento do pedido
-- (RN-052), validado contra o razão e nunca contra a projecção (RN-050), e
-- pedidos concorrentes são serializados por bloqueio de linha (RN-053).

CREATE TYPE "PayoutStatus" AS ENUM (
  'REQUESTED', 'APPROVED', 'PROCESSING', 'PAID', 'FAILED', 'CANCELLED'
);
CREATE TYPE "PayoutMethod" AS ENUM ('BANK_TRANSFER', 'MULTICAIXA_EXPRESS');

CREATE TABLE "payouts" (
  "id"                   UUID PRIMARY KEY,
  "profile_id"           UUID NOT NULL REFERENCES "profiles"("id") ON DELETE RESTRICT,
  "requested_by_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "amount_minor"         BIGINT NOT NULL CHECK ("amount_minor" > 0),
  -- Taxa do parceiro. Zero enquanto DP-04 não fechar.
  "fee_minor"            BIGINT NOT NULL DEFAULT 0 CHECK ("fee_minor" >= 0),
  "net_minor"            BIGINT NOT NULL CHECK ("net_minor" > 0),
  "currency"             CHAR(3) NOT NULL,
  "method"               "PayoutMethod" NOT NULL,
  -- Em claro à espera de DP-17. Nunca sai da API nem entra no registo.
  "destination"          TEXT NOT NULL,
  "destination_masked"   TEXT NOT NULL,
  "status"               "PayoutStatus" NOT NULL DEFAULT 'REQUESTED',
  "provider_reference"   TEXT,
  "failure_reason"       TEXT CHECK (char_length("failure_reason") <= 2000),
  "reviewed_by_user_id"  UUID REFERENCES "users"("id") ON DELETE RESTRICT,
  "requested_at"         TIMESTAMPTZ(3) NOT NULL,
  "approved_at"          TIMESTAMPTZ(3),
  "settled_at"           TIMESTAMPTZ(3),
  "created_at"           TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"           TIMESTAMPTZ(3) NOT NULL
);

-- O que sai é o que se pediu menos a taxa. A mesma forma de RN-042, aplicada
-- ao outro sentido do dinheiro.
ALTER TABLE "payouts"
  ADD CONSTRAINT "payouts_amount_is_fee_plus_net"
  CHECK ("amount_minor" = "fee_minor" + "net_minor");

-- A referência do parceiro é única quando existe. Parcial porque só é atribuída
-- na aprovação, e há levantamentos que morrem antes disso.
CREATE UNIQUE INDEX "payouts_provider_reference_idx"
    ON "payouts" ("provider_reference")
 WHERE "provider_reference" IS NOT NULL;

CREATE INDEX "payouts_profile_id_status_idx"
    ON "payouts" ("profile_id", "status", "requested_at" DESC);

-- A fila da administração.
CREATE INDEX "payouts_queue_idx"
    ON "payouts" ("requested_at")
 WHERE "status" IN ('REQUESTED', 'APPROVED', 'PROCESSING');

-- Um levantamento não se apaga: é rasto de dinheiro que saiu.
GRANT SELECT, INSERT, UPDATE ON "payouts" TO nadm_app;
