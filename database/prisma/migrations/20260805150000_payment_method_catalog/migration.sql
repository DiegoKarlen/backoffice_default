-- PaymentMethod catalog + Deposit FK (replaces gateway id string on Deposit.paymentMethodId)

CREATE TABLE "PaymentMethod" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'ARS',
    "minCents" INTEGER NOT NULL,
    "maxCents" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentMethod_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentMethod_providerId_externalId_key" ON "PaymentMethod"("providerId", "externalId");
CREATE INDEX "PaymentMethod_active_sortOrder_idx" ON "PaymentMethod"("active", "sortOrder");

INSERT INTO "PaymentMethod" (
    "id",
    "providerId",
    "externalId",
    "name",
    "currencyCode",
    "minCents",
    "maxCents",
    "active",
    "sortOrder",
    "createdAt",
    "updatedAt"
) VALUES (
    'a1000000-0000-4000-8000-000000000084',
    'mixer-gaming',
    '84',
    'PaymentTest',
    'ARS',
    100,
    50000000,
    true,
    0,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
);

ALTER TABLE "Deposit" RENAME COLUMN "paymentMethodId" TO "legacyGatewayMethodId";

ALTER TABLE "Deposit" ADD COLUMN "paymentMethodId" TEXT;

UPDATE "Deposit" d
SET "paymentMethodId" = pm."id"
FROM "PaymentMethod" pm
WHERE d."providerId" = pm."providerId"
  AND d."legacyGatewayMethodId" = pm."externalId";

ALTER TABLE "Deposit" DROP COLUMN "legacyGatewayMethodId";

ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_paymentMethodId_fkey"
    FOREIGN KEY ("paymentMethodId") REFERENCES "PaymentMethod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Deposit_paymentMethodId_idx" ON "Deposit"("paymentMethodId");
