-- Player profile + payments user id; Deposit gateway metadata

ALTER TABLE "Player" ADD COLUMN "paymentsUserId" SERIAL NOT NULL;
ALTER TABLE "Player" ADD CONSTRAINT "Player_paymentsUserId_key" UNIQUE ("paymentsUserId");

ALTER TABLE "Player" ADD COLUMN "firstName" TEXT;
ALTER TABLE "Player" ADD COLUMN "lastName" TEXT;
ALTER TABLE "Player" ADD COLUMN "phone" TEXT;
ALTER TABLE "Player" ADD COLUMN "phoneCode" TEXT DEFAULT '54';
ALTER TABLE "Player" ADD COLUMN "dni" TEXT;
ALTER TABLE "Player" ADD COLUMN "countryCode" TEXT DEFAULT 'AR';

ALTER TABLE "Deposit" ADD COLUMN "providerId" TEXT;
ALTER TABLE "Deposit" ADD COLUMN "paymentMethodId" TEXT;
ALTER TABLE "Deposit" ADD COLUMN "paymentMethodName" TEXT;
ALTER TABLE "Deposit" ADD COLUMN "providerPayload" JSONB;
ALTER TABLE "Deposit" ADD COLUMN "failedReason" TEXT;

CREATE UNIQUE INDEX "Deposit_providerId_externalRef_key" ON "Deposit"("providerId", "externalRef");
