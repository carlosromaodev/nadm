-- CreateEnum
CREATE TYPE "DealStatus" AS ENUM ('PROPOSED', 'COUNTER_OFFERED', 'ACCEPTED', 'IN_PROGRESS', 'DELIVERED', 'APPROVED', 'PAID', 'DECLINED', 'REFUNDED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "EscrowStatus" AS ENUM ('PENDING', 'HELD', 'RELEASED', 'REFUNDED', 'FAILED');

-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('TEXT', 'SYSTEM', 'ATTACHMENT', 'STATE_CHANGE');

-- CreateTable
CREATE TABLE "deals" (
    "id" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "buyer_user_id" UUID NOT NULL,
    "buyer_account_id" UUID NOT NULL,
    "creator_profile_id" UUID NOT NULL,
    "offer_id" UUID NOT NULL,
    "offer_snapshot" JSONB NOT NULL,
    "status" "DealStatus" NOT NULL DEFAULT 'PROPOSED',
    "escrow_status" "EscrowStatus" NOT NULL DEFAULT 'PENDING',
    "amount_minor" BIGINT NOT NULL,
    "platform_fee_minor" BIGINT NOT NULL,
    "creator_net_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "brief" TEXT,
    "due_at" TIMESTAMPTZ(3),
    "expires_at" TIMESTAMPTZ(3),
    "accepted_at" TIMESTAMPTZ(3),
    "delivered_at" TIMESTAMPTZ(3),
    "approved_at" TIMESTAMPTZ(3),
    "settled_at" TIMESTAMPTZ(3),
    "last_message_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "sender_user_id" UUID,
    "kind" "MessageKind" NOT NULL,
    "body" TEXT NOT NULL,
    "client_id" TEXT,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deliveries" (
    "id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "note" TEXT NOT NULL,
    "submitted_at" TIMESTAMPTZ(3) NOT NULL,
    "accepted_at" TIMESTAMPTZ(3),
    "rejected_at" TIMESTAMPTZ(3),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "deals_reference_key" ON "deals"("reference");

-- CreateIndex
CREATE INDEX "deals_creator_profile_id_status_created_at_idx" ON "deals"("creator_profile_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "deals_buyer_user_id_status_idx" ON "deals"("buyer_user_id", "status");

-- CreateIndex
CREATE INDEX "deals_status_expires_at_idx" ON "deals"("status", "expires_at");

-- CreateIndex
CREATE INDEX "messages_deal_id_created_at_idx" ON "messages"("deal_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "messages_deal_id_client_id_key" ON "messages"("deal_id", "client_id");

-- CreateIndex
CREATE UNIQUE INDEX "deliveries_deal_id_version_key" ON "deliveries"("deal_id", "version");

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_buyer_user_id_fkey" FOREIGN KEY ("buyer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_buyer_account_id_fkey" FOREIGN KEY ("buyer_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_creator_profile_id_fkey" FOREIGN KEY ("creator_profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_offer_id_fkey" FOREIGN KEY ("offer_id") REFERENCES "offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Restrições que o Prisma não exprime ──────────────────────────────────────
-- RN-042: a repartição fecha sempre, ao cêntimo.
ALTER TABLE "deals" ADD CONSTRAINT "deals_amount_split_balances"
  CHECK ("amount_minor" = "platform_fee_minor" + "creator_net_minor");

-- RN-040: ninguém compra a si próprio. A verificação completa precisa do perfil
-- e vive no domínio; aqui fica a rede de segurança contra dados corrompidos.
ALTER TABLE "deals" ADD CONSTRAINT "deals_amounts_non_negative"
  CHECK ("amount_minor" >= 0 AND "platform_fee_minor" >= 0 AND "creator_net_minor" >= 0);

-- Referência legível exposta ao utilizador, em vez do UUID. Ver SDD §4.3.
CREATE SEQUENCE "deal_reference_seq" START 1;

GRANT SELECT, INSERT, UPDATE, DELETE ON "deals", "messages", "deliveries" TO nadm_app;
GRANT USAGE, SELECT ON SEQUENCE "deal_reference_seq" TO nadm_app;
