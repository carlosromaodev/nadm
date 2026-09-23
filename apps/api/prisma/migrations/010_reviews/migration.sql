CREATE TABLE "reviews" (
  "id" UUID PRIMARY KEY,
  "deal_id" UUID NOT NULL UNIQUE REFERENCES "deals"("id") ON DELETE RESTRICT,
  "author_user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "profile_id" UUID NOT NULL REFERENCES "profiles"("id") ON DELETE RESTRICT,
  "rating" INTEGER NOT NULL CHECK ("rating" BETWEEN 1 AND 5),
  "body" TEXT NOT NULL CHECK (char_length("body") <= 2000),
  "published_at" TIMESTAMPTZ(3) NOT NULL,
  "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(3) NOT NULL
);
CREATE INDEX "reviews_profile_id_published_at_idx" ON "reviews"("profile_id", "published_at" DESC);
