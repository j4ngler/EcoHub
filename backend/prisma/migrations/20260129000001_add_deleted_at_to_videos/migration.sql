-- AlterTable
ALTER TABLE "package_videos" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "receiving_videos" ADD COLUMN "deleted_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "package_videos_deleted_at_idx" ON "package_videos"("deleted_at");

-- CreateIndex
CREATE INDEX "receiving_videos_deleted_at_idx" ON "receiving_videos"("deleted_at");
