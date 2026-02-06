-- CreateEnum
CREATE TYPE "VideoModule" AS ENUM ('packaging', 'receiving', 'other');

-- CreateEnum
CREATE TYPE "VideoUploadStatus" AS ENUM ('UPLOADING', 'READY', 'FAILED', 'DELETED');

-- CreateTable
CREATE TABLE "videos" (
    "id" TEXT NOT NULL,
    "shop_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "uploader_user_id" TEXT NOT NULL,
    "module" "VideoModule" NOT NULL,
    "s3_bucket" TEXT NOT NULL,
    "s3_key" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "size_bytes" BIGINT,
    "duration_sec" INTEGER,
    "status" "VideoUploadStatus" NOT NULL,
    "error_code" TEXT,
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploaded_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "videos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "video_events" (
    "id" TEXT NOT NULL,
    "video_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "video_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "videos_s3_key_key" ON "videos"("s3_key");

-- CreateIndex
CREATE INDEX "idx_videos_shop_created_at" ON "videos"("shop_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_videos_shop_user_created_at" ON "videos"("shop_id", "uploader_user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_videos_shop_module_created_at" ON "videos"("shop_id", "module", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_videos_shop_order" ON "videos"("shop_id", "order_id");

-- CreateIndex
CREATE INDEX "idx_videos_shop_status" ON "videos"("shop_id", "status");

-- CreateIndex
CREATE INDEX "idx_video_events_video_created_at" ON "video_events"("video_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "videos" ADD CONSTRAINT "videos_uploader_user_id_fkey" FOREIGN KEY ("uploader_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "video_events" ADD CONSTRAINT "video_events_video_id_fkey" FOREIGN KEY ("video_id") REFERENCES "videos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

