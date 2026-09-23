-- F4 · contraproposta, com o acerto de dinheiro que DP-15 obriga.
--
-- O criador responde com outro preço ou outro prazo (T4); o comprador aceita
-- (T5) ou recusa (T6). Com o dinheiro já retido desde a proposta, aceitar um
-- preço diferente obriga a acertar o escrow — reforço se subiu, estorno parcial
-- se desceu.

CREATE TYPE "CounterOfferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED');

CREATE TABLE "deal_counter_offers" (
  "id"                  UUID PRIMARY KEY,
  "deal_id"             UUID NOT NULL REFERENCES "deals"("id") ON DELETE RESTRICT,
  "proposed_by_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  -- O preço anunciado pedido, sem taxa de nenhum dos lados.
  "price_minor"         BIGINT NOT NULL CHECK ("price_minor" >= 0),
  "currency"            CHAR(3) NOT NULL,
  "sla_hours"           INTEGER NOT NULL CHECK ("sla_hours" > 0),
  "message"             TEXT CHECK (char_length("message") <= 2000),
  "status"              "CounterOfferStatus" NOT NULL DEFAULT 'PENDING',
  "expires_at"          TIMESTAMPTZ(3) NOT NULL,
  "resolved_at"         TIMESTAMPTZ(3),
  "created_at"          TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "deal_counter_offers_deal_id_created_at_idx"
    ON "deal_counter_offers" ("deal_id", "created_at" DESC);

-- Uma só contraproposta por `Deal` à espera de resposta. A restrição vive no
-- Postgres porque protege contra concorrência: duas contrapropostas submetidas
-- ao mesmo tempo passariam as duas por uma verificação em aplicação.
CREATE UNIQUE INDEX "deal_counter_offers_one_pending_idx"
    ON "deal_counter_offers" ("deal_id")
 WHERE "status" = 'PENDING';

-- Uma contraproposta resolvida não volta atrás: é histórico da negociação.
-- O papel da aplicação escreve e resolve, mas não apaga.
GRANT SELECT, INSERT, UPDATE ON "deal_counter_offers" TO nadm_app;

-- ─────────────────────────────────────────────── o reforço do pagamento

CREATE TYPE "PaymentPurpose" AS ENUM ('INITIAL', 'TOP_UP');

ALTER TABLE "payment_intents"
  ADD COLUMN "purpose" "PaymentPurpose" NOT NULL DEFAULT 'INITIAL',
  ADD COLUMN "counter_offer_id" UUID REFERENCES "deal_counter_offers"("id") ON DELETE RESTRICT;

-- Um reforço aponta sempre para a contraproposta que paga; um pagamento
-- inicial nunca aponta para nenhuma.
ALTER TABLE "payment_intents"
  ADD CONSTRAINT "payment_intents_top_up_has_counter_offer"
  CHECK (
    ("purpose" = 'TOP_UP' AND "counter_offer_id" IS NOT NULL)
    OR ("purpose" = 'INITIAL' AND "counter_offer_id" IS NULL)
  );
