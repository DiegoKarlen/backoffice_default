-- AlterTable
ALTER TABLE "WalletTransaction" ADD COLUMN "refundForCartonPurchaseId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "WalletTransaction_refundForCartonPurchaseId_key" ON "WalletTransaction"("refundForCartonPurchaseId");

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_refundForCartonPurchaseId_fkey" FOREIGN KEY ("refundForCartonPurchaseId") REFERENCES "CartonPurchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
