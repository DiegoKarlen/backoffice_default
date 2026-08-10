-- Audit trail for payment gateway webhooks (request + our HTTP response).
ALTER TABLE "Deposit" ADD COLUMN "initiatePayload" JSONB;
ALTER TABLE "Deposit" ADD COLUMN "webhookTransactionId" TEXT;
ALTER TABLE "Deposit" ADD COLUMN "webhookPayload" JSONB;
ALTER TABLE "Deposit" ADD COLUMN "webhookResponse" JSONB;
ALTER TABLE "Deposit" ADD COLUMN "webhookReceivedAt" TIMESTAMP(3);

-- Backfill initiate payload from legacy column.
UPDATE "Deposit" SET "initiatePayload" = "providerPayload" WHERE "providerPayload" IS NOT NULL AND "initiatePayload" IS NULL;
