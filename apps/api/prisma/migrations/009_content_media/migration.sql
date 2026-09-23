CREATE TABLE "media" (
  "id" UUID PRIMARY KEY, "owner_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "storage_key" TEXT NOT NULL UNIQUE, "mime_type" TEXT NOT NULL,
  "byte_size" INTEGER NOT NULL CHECK ("byte_size" > 0 AND "byte_size" <= 10485760),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "media_mime_type" CHECK ("mime_type" IN ('image/jpeg','image/png','image/webp','video/mp4','video/webm'))
);
CREATE INDEX "media_owner_user_id_created_at_idx" ON "media"("owner_user_id", "created_at");

CREATE TABLE "content_items" (
  "id" UUID PRIMARY KEY, "profile_id" UUID NOT NULL REFERENCES "profiles"("id") ON DELETE RESTRICT,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('PHOTO','VIDEO','ALBUM','PLAYLIST')),
  "caption" TEXT NOT NULL CHECK (char_length("caption") <= 300),
  "visibility" TEXT NOT NULL CHECK ("visibility" IN ('PUBLIC','PAID','MEMBERS')),
  "price_minor" BIGINT NOT NULL DEFAULT 0 CHECK ("price_minor" >= 0), "currency" CHAR(3) NOT NULL DEFAULT 'AOA' CHECK ("currency" = 'AOA'),
  "media_ids" UUID[] NOT NULL, "preview_media_ids" UUID[] NOT NULL,
  "folder" TEXT, "status" TEXT NOT NULL CHECK ("status" IN ('DRAFT','PUBLISHED','SCHEDULED')),
  "scheduled_at" TIMESTAMPTZ(3), "published_at" TIMESTAMPTZ(3), "deleted_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "content_paid_price" CHECK ("visibility" <> 'PAID' OR "price_minor" > 0),
  CONSTRAINT "content_schedule_required" CHECK ("status" <> 'SCHEDULED' OR "scheduled_at" IS NOT NULL),
  CONSTRAINT "content_publish_required" CHECK ("status" <> 'PUBLISHED' OR "published_at" IS NOT NULL),
  CONSTRAINT "content_media_limit" CHECK (cardinality("media_ids") <= 20 AND cardinality("preview_media_ids") <= 20),
  CONSTRAINT "content_preview_subset" CHECK ("preview_media_ids" <@ "media_ids")
);
CREATE INDEX "content_items_profile_id_status_scheduled_at_idx" ON "content_items"("profile_id", "status", "scheduled_at");

CREATE TABLE "content_grants" (
  "id" UUID PRIMARY KEY, "content_id" UUID NOT NULL REFERENCES "content_items"("id") ON DELETE RESTRICT,
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "source" TEXT NOT NULL CHECK ("source" IN ('OWNER','PURCHASE','MEMBERSHIP')),
  "granted_at" TIMESTAMPTZ(3) NOT NULL, "expires_at" TIMESTAMPTZ(3), "revoked_at" TIMESTAMPTZ(3),
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "content_grant_expiry" CHECK ("expires_at" IS NULL OR "expires_at" > "granted_at")
);
CREATE UNIQUE INDEX "content_grants_content_id_user_id_key" ON "content_grants"("content_id", "user_id");
GRANT SELECT, INSERT, UPDATE ON "media", "content_items", "content_grants" TO nadm_app;
