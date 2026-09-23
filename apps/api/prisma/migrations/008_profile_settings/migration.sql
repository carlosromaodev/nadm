ALTER TABLE "profiles" ADD COLUMN "settings" JSONB NOT NULL DEFAULT '{}';
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_settings_object" CHECK (jsonb_typeof("settings") = 'object');
