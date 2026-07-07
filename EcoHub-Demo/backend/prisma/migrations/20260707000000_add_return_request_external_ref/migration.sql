-- AlterTable
ALTER TABLE "return_requests" ALTER COLUMN "customer_id" DROP NOT NULL;
ALTER TABLE "return_requests" ADD COLUMN "external_return_id" TEXT;
ALTER TABLE "return_requests" ADD COLUMN "platform" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "return_requests_external_return_id_key" ON "return_requests"("external_return_id");
