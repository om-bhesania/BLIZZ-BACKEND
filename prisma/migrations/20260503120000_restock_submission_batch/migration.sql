-- AlterTable
ALTER TABLE "RestockRequest" ADD COLUMN "submissionBatchId" TEXT;

-- CreateIndex
CREATE INDEX "RestockRequest_submissionBatchId_idx" ON "RestockRequest"("submissionBatchId");
