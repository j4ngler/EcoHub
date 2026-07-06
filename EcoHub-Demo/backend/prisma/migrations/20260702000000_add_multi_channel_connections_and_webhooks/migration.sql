ALTER TABLE "shop_channel_connections"
  ADD COLUMN "main_account_id" TEXT;

DROP INDEX IF EXISTS "shop_channel_connections_shop_id_channel_id_key";

CREATE INDEX "shop_channel_connections_shop_id_channel_id_idx"
  ON "shop_channel_connections"("shop_id", "channel_id");

CREATE INDEX "shop_channel_connections_channel_id_shop_id_remote_idx"
  ON "shop_channel_connections"("channel_id", "shop_id_remote");

CREATE TABLE "channel_webhook_events" (
  "id" TEXT NOT NULL,
  "channel_code" TEXT NOT NULL,
  "event_code" INTEGER NOT NULL,
  "remote_shop_id" TEXT,
  "event_key" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'received',
  "error" TEXT,
  "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processed_at" TIMESTAMP(3),
  CONSTRAINT "channel_webhook_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "channel_webhook_events_event_key_key"
  ON "channel_webhook_events"("event_key");

CREATE INDEX "channel_webhook_events_channel_code_event_code_received_at_idx"
  ON "channel_webhook_events"("channel_code", "event_code", "received_at");

CREATE INDEX "channel_webhook_events_remote_shop_id_idx"
  ON "channel_webhook_events"("remote_shop_id");

INSERT INTO "sales_channels" ("id", "name", "code", "status", "created_at")
SELECT gen_random_uuid()::text, 'Shopee', 'shopee', 'active', CURRENT_TIMESTAMP
WHERE NOT EXISTS (
  SELECT 1 FROM "sales_channels" WHERE "code" = 'shopee'
);
