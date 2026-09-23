-- CreateEnum
CREATE TYPE "PaymentIntentStatus" AS ENUM ('CREATED', 'PENDING', 'CAPTURED', 'FAILED', 'EXPIRED', 'REVERSED');

-- CreateTable
CREATE TABLE "payment_intents" (
    "id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_reference" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "status" "PaymentIntentStatus" NOT NULL DEFAULT 'CREATED',
    "payer_phone" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "captured_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payment_intents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_events" (
    "id" UUID NOT NULL,
    "payment_intent_id" UUID NOT NULL,
    "provider_event_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL,
    "processed_at" TIMESTAMPTZ(3),

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_keys" (
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_body" JSONB,
    "status" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY ("scope","key")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_intents_provider_reference_key" ON "payment_intents"("provider_reference");

-- CreateIndex
CREATE UNIQUE INDEX "payment_intents_idempotency_key_key" ON "payment_intents"("idempotency_key");

-- CreateIndex
CREATE INDEX "payment_intents_deal_id_status_idx" ON "payment_intents"("deal_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_events_provider_event_id_key" ON "payment_events"("provider_event_id");

-- CreateIndex
CREATE INDEX "payment_events_payment_intent_id_received_at_idx" ON "payment_events"("payment_intent_id", "received_at");

-- CreateIndex
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys"("expires_at");

-- AddForeignKey
ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_payment_intent_id_fkey" FOREIGN KEY ("payment_intent_id") REFERENCES "payment_intents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Restrições que o Prisma não exprime ──────────────────────────────────────
-- RN-092: no máximo uma intenção de pagamento activa por Deal. É este índice
-- que torna a regra verdadeira sob concorrência — duas tentativas simultâneas
-- de pagar o mesmo Deal: uma passa, a outra viola a unicidade.
CREATE UNIQUE INDEX "payment_intents_one_active_per_deal"
  ON "payment_intents"("deal_id")
  WHERE "status" IN ('CREATED', 'PENDING');

ALTER TABLE "payment_intents" ADD CONSTRAINT "payment_intents_amount_positive"
  CHECK ("amount_minor" > 0);

GRANT SELECT, INSERT, UPDATE, DELETE ON "payment_intents", "idempotency_keys" TO nadm_app;
-- RN-091: um evento do parceiro é registo bruto e imutável. Escreve-se uma vez;
-- só `processed_at` muda, e por isso o UPDATE é concedido mas o DELETE não.
GRANT SELECT, INSERT, UPDATE ON "payment_events" TO nadm_app;
