CREATE TABLE "direct_conversations" (
    "id" UUID NOT NULL,
    "buyer_user_id" UUID NOT NULL,
    "creator_profile_id" UUID NOT NULL,
    "last_message_at" TIMESTAMPTZ(3) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "direct_conversations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "direct_messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender_user_id" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "client_id" TEXT NOT NULL,
    "read_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "direct_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "direct_conversations_buyer_user_id_creator_profile_id_key"
ON "direct_conversations"("buyer_user_id", "creator_profile_id");
CREATE INDEX "direct_conversations_buyer_user_id_last_message_at_idx"
ON "direct_conversations"("buyer_user_id", "last_message_at" DESC);
CREATE INDEX "direct_conversations_creator_profile_id_last_message_at_idx"
ON "direct_conversations"("creator_profile_id", "last_message_at" DESC);
CREATE UNIQUE INDEX "direct_messages_conversation_id_client_id_key"
ON "direct_messages"("conversation_id", "client_id");
CREATE INDEX "direct_messages_conversation_id_created_at_idx"
ON "direct_messages"("conversation_id", "created_at");

ALTER TABLE "direct_conversations" ADD CONSTRAINT "direct_conversations_buyer_user_id_fkey"
FOREIGN KEY ("buyer_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "direct_conversations" ADD CONSTRAINT "direct_conversations_creator_profile_id_fkey"
FOREIGN KEY ("creator_profile_id") REFERENCES "profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_conversation_id_fkey"
FOREIGN KEY ("conversation_id") REFERENCES "direct_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "direct_messages" ADD CONSTRAINT "direct_messages_sender_user_id_fkey"
FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

GRANT SELECT, INSERT, UPDATE, DELETE ON "direct_conversations", "direct_messages" TO nadm_app;
