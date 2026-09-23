-- CreateEnum
CREATE TYPE "LedgerAccount" AS ENUM ('PROVIDER_CLEARING', 'ESCROW', 'CREATOR_AVAILABLE', 'CREATOR_RESERVED', 'PLATFORM_FEE_REVENUE', 'REFUNDS_PAYABLE', 'TAX_PAYABLE');

-- CreateEnum
CREATE TYPE "LedgerDirection" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "LedgerSubjectType" AS ENUM ('DEAL', 'PROFILE', 'PLATFORM');

-- CreateTable
CREATE TABLE "ledger_transactions" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "deal_id" UUID,
    "external_reference" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" UUID NOT NULL,
    "transaction_id" UUID NOT NULL,
    "account" "LedgerAccount" NOT NULL,
    "subject_type" "LedgerSubjectType" NOT NULL,
    "subject_id" UUID NOT NULL,
    "direction" "LedgerDirection" NOT NULL,
    "amount_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wallets" (
    "profile_id" UUID NOT NULL,
    "available_minor" BIGINT NOT NULL DEFAULT 0,
    "reserved_minor" BIGINT NOT NULL DEFAULT 0,
    "pending_minor" BIGINT NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL,
    "recomputed_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "wallets_pkey" PRIMARY KEY ("profile_id")
);

-- CreateIndex
CREATE INDEX "ledger_transactions_deal_id_idx" ON "ledger_transactions"("deal_id");

-- CreateIndex
CREATE UNIQUE INDEX "ledger_transactions_kind_external_reference_key" ON "ledger_transactions"("kind", "external_reference");

-- CreateIndex
CREATE INDEX "ledger_entries_account_subject_id_id_idx" ON "ledger_entries"("account", "subject_id", "id");

-- CreateIndex
CREATE INDEX "ledger_entries_transaction_id_idx" ON "ledger_entries"("transaction_id");

-- AddForeignKey
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "ledger_transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Restrições que o Prisma não exprime ──────────────────────────────────────
-- RN-102: o valor é sempre positivo; o sinal está em `direction`.
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_amount_positive"
  CHECK ("amount_minor" > 0);

ALTER TABLE "wallets" ADD CONSTRAINT "wallets_balances_non_negative"
  CHECK ("available_minor" >= 0 AND "reserved_minor" >= 0 AND "pending_minor" >= 0);

-- ── RN-101: o razão é imutável ───────────────────────────────────────────────
-- Corrigir é lançar estorno, nunca reescrever. A aplicação não tem UPDATE nem
-- DELETE nestas tabelas, e nenhuma quantidade de código descuidado lho devolve.
GRANT SELECT, INSERT ON "ledger_transactions", "ledger_entries" TO nadm_app;

-- A carteira é projecção recalculável (RN-103), por isso aceita escrita.
GRANT SELECT, INSERT, UPDATE, DELETE ON "wallets" TO nadm_app;
