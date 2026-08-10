-- `webhookTransactionId` duplicated `externalRef` (same gateway transaction id).
ALTER TABLE "Deposit" DROP COLUMN IF EXISTS "webhookTransactionId";
