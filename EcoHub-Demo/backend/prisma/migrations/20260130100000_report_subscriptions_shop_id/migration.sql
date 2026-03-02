-- Add shopId to report_subscriptions: mỗi shop chỉ thấy và lưu đăng ký báo cáo của chính shop đó.
ALTER TABLE "report_subscriptions" ADD COLUMN "shop_id" TEXT;

-- Gán shop_id cho bản ghi cũ (lấy shop đầu tiên)
UPDATE "report_subscriptions" SET "shop_id" = (SELECT "id" FROM "shops" LIMIT 1) WHERE "shop_id" IS NULL;

ALTER TABLE "report_subscriptions" ALTER COLUMN "shop_id" SET NOT NULL;

ALTER TABLE "report_subscriptions" ADD CONSTRAINT "report_subscriptions_shop_id_fkey" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP INDEX "report_subscriptions_email_report_type_key";
CREATE UNIQUE INDEX "report_subscriptions_shop_id_email_report_type_key" ON "report_subscriptions"("shop_id", "email", "report_type");
