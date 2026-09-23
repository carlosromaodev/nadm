-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('FAN', 'CREATOR', 'BRAND_MEMBER', 'BRAND_OWNER', 'ADMIN', 'SUPPORT');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "VerificationLevel" AS ENUM ('NONE', 'PHONE', 'IDENTITY');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('INDIVIDUAL', 'BRAND');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "display_name" TEXT NOT NULL,
    "roles" "Role"[],
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "verification_level" "VerificationLevel" NOT NULL DEFAULT 'NONE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "type" "AccountType" NOT NULL,
    "legal_name" TEXT,
    "tax_id" TEXT,
    "owner_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "accounts_owner_user_id_idx" ON "accounts"("owner_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_tax_id_key" ON "accounts"("tax_id");

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ── Papel de runtime da aplicação ────────────────────────────────────────────
-- A aplicação NUNCA corre como dono. O que o razão e a auditoria proíbem é
-- imposto por permissão, não por disciplina de quem escreve código. Ver CLAUDE.md.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nadm_app') THEN
    CREATE ROLE nadm_app LOGIN PASSWORD 'nadm_app';
  END IF;
END
$$;

GRANT USAGE ON SCHEMA "public" TO nadm_app;

GRANT SELECT, INSERT, UPDATE, DELETE ON "users", "accounts" TO nadm_app;
