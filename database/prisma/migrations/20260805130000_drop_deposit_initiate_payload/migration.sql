-- `initiatePayload` duplicated `providerPayload`; webhook audit uses dedicated columns.
ALTER TABLE "Deposit" DROP COLUMN IF EXISTS "initiatePayload";
