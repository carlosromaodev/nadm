-- CreateEnum
CREATE TYPE "AvailabilityStatus" AS ENUM ('AVAILABLE', 'NO_SLOTS', 'PAUSED');

-- CreateEnum
CREATE TYPE "OfferKind" AS ENUM ('DIRECT_MESSAGE', 'CONTENT_UNLOCK', 'MEMBERSHIP', 'CUSTOM_SERVICE', 'BOOKING');

-- CreateEnum
CREATE TYPE "OfferStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "handle" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "bio" TEXT,
    "availability_status" "AvailabilityStatus" NOT NULL DEFAULT 'AVAILABLE',
    "published_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offers" (
    "id" UUID NOT NULL,
    "profile_id" UUID NOT NULL,
    "kind" "OfferKind" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "price_minor" BIGINT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "sla_hours" INTEGER NOT NULL,
    "revisions_included" INTEGER NOT NULL DEFAULT 1,
    "requires_brief" BOOLEAN NOT NULL DEFAULT true,
    "status" "OfferStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profiles_user_id_key" ON "profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "profiles_handle_key" ON "profiles"("handle");

-- CreateIndex
CREATE INDEX "profiles_availability_status_published_at_idx" ON "profiles"("availability_status", "published_at");

-- CreateIndex
CREATE INDEX "offers_profile_id_status_idx" ON "offers"("profile_id", "status");

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Restrições que o Prisma não exprime ──────────────────────────────────────
-- RN-012: o handle é único sem depender da caixa com que foi escrito.
CREATE UNIQUE INDEX "profiles_handle_lower_key" ON "profiles"(lower("handle"));

-- RN-030: nenhuma oferta tem preço negativo.
ALTER TABLE "offers" ADD CONSTRAINT "offers_price_minor_non_negative"
  CHECK ("price_minor" >= 0);

GRANT SELECT, INSERT, UPDATE, DELETE ON "profiles", "offers" TO nadm_app;
