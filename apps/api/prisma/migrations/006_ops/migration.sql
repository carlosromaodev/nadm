-- CreateTable
CREATE TABLE "outbox_events" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "available_at" TIMESTAMPTZ(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "processed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_user_id" UUID,
    "actor_kind" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "subject_type" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "metadata" JSONB,
    "ip" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "outbox_events_processed_at_available_at_idx" ON "outbox_events"("processed_at", "available_at");

-- CreateIndex
CREATE INDEX "audit_logs_subject_type_subject_id_created_at_idx" ON "audit_logs"("subject_type", "subject_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_logs_actor_user_id_created_at_idx" ON "audit_logs"("actor_user_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Permissões ───────────────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE ON "outbox_events" TO nadm_app;

-- A auditoria tem a mesma imutabilidade do razão. Ver SDD §15.3.
GRANT SELECT, INSERT ON "audit_logs" TO nadm_app;
