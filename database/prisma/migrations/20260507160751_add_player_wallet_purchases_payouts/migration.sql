-- CreateEnum
CREATE TYPE "WalletTransactionType" AS ENUM ('DEPOSIT', 'CARTON_PURCHASE', 'PRIZE_CREDIT', 'ADJUSTMENT', 'REFUND');

-- CreateEnum
CREATE TYPE "DepositStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "emailVerifiedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Wallet" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "balanceCents" INTEGER NOT NULL DEFAULT 0,
    "currencyCode" TEXT NOT NULL DEFAULT 'ARS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WalletTransaction" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "type" "WalletTransactionType" NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "balanceAfterCents" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "depositId" TEXT,
    "cartonPurchaseId" TEXT,
    "prizePayoutId" TEXT,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deposit" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currencyCode" TEXT NOT NULL DEFAULT 'ARS',
    "status" "DepositStatus" NOT NULL DEFAULT 'PENDING',
    "externalRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Deposit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartonPurchase" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "bingoRoundId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CartonPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayerRoundCard" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "bingoRoundId" TEXT NOT NULL,
    "cartonPurchaseId" TEXT NOT NULL,
    "cardIndex" INTEGER NOT NULL,
    "cardFingerprint" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerRoundCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BingoCardCell" (
    "id" TEXT NOT NULL,
    "playerRoundCardId" TEXT NOT NULL,
    "row" INTEGER NOT NULL,
    "col" INTEGER NOT NULL,
    "number" INTEGER,
    "isFree" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "BingoCardCell_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrizePayout" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "bingoPrizeId" TEXT NOT NULL,
    "playerRoundCardId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PrizePayout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Player_email_key" ON "Player"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Player_username_key" ON "Player"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Wallet_playerId_key" ON "Wallet"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletTransaction_depositId_key" ON "WalletTransaction"("depositId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletTransaction_cartonPurchaseId_key" ON "WalletTransaction"("cartonPurchaseId");

-- CreateIndex
CREATE UNIQUE INDEX "WalletTransaction_prizePayoutId_key" ON "WalletTransaction"("prizePayoutId");

-- CreateIndex
CREATE INDEX "WalletTransaction_walletId_createdAt_idx" ON "WalletTransaction"("walletId", "createdAt");

-- CreateIndex
CREATE INDEX "WalletTransaction_type_idx" ON "WalletTransaction"("type");

-- CreateIndex
CREATE INDEX "Deposit_playerId_createdAt_idx" ON "Deposit"("playerId", "createdAt");

-- CreateIndex
CREATE INDEX "CartonPurchase_playerId_createdAt_idx" ON "CartonPurchase"("playerId", "createdAt");

-- CreateIndex
CREATE INDEX "CartonPurchase_bingoRoundId_idx" ON "CartonPurchase"("bingoRoundId");

-- CreateIndex
CREATE INDEX "PlayerRoundCard_playerId_idx" ON "PlayerRoundCard"("playerId");

-- CreateIndex
CREATE INDEX "PlayerRoundCard_cartonPurchaseId_idx" ON "PlayerRoundCard"("cartonPurchaseId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerRoundCard_bingoRoundId_cardFingerprint_key" ON "PlayerRoundCard"("bingoRoundId", "cardFingerprint");

-- CreateIndex
CREATE INDEX "BingoCardCell_playerRoundCardId_idx" ON "BingoCardCell"("playerRoundCardId");

-- CreateIndex
CREATE UNIQUE INDEX "BingoCardCell_playerRoundCardId_row_col_key" ON "BingoCardCell"("playerRoundCardId", "row", "col");

-- CreateIndex
CREATE INDEX "PrizePayout_playerId_createdAt_idx" ON "PrizePayout"("playerId", "createdAt");

-- CreateIndex
CREATE INDEX "PrizePayout_bingoPrizeId_idx" ON "PrizePayout"("bingoPrizeId");

-- CreateIndex
CREATE INDEX "PrizePayout_playerRoundCardId_idx" ON "PrizePayout"("playerRoundCardId");

-- AddForeignKey
ALTER TABLE "Wallet" ADD CONSTRAINT "Wallet_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "Wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_depositId_fkey" FOREIGN KEY ("depositId") REFERENCES "Deposit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_cartonPurchaseId_fkey" FOREIGN KEY ("cartonPurchaseId") REFERENCES "CartonPurchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_prizePayoutId_fkey" FOREIGN KEY ("prizePayoutId") REFERENCES "PrizePayout"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deposit" ADD CONSTRAINT "Deposit_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartonPurchase" ADD CONSTRAINT "CartonPurchase_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerRoundCard" ADD CONSTRAINT "PlayerRoundCard_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayerRoundCard" ADD CONSTRAINT "PlayerRoundCard_cartonPurchaseId_fkey" FOREIGN KEY ("cartonPurchaseId") REFERENCES "CartonPurchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BingoCardCell" ADD CONSTRAINT "BingoCardCell_playerRoundCardId_fkey" FOREIGN KEY ("playerRoundCardId") REFERENCES "PlayerRoundCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrizePayout" ADD CONSTRAINT "PrizePayout_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrizePayout" ADD CONSTRAINT "PrizePayout_bingoPrizeId_fkey" FOREIGN KEY ("bingoPrizeId") REFERENCES "BingoPrize"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrizePayout" ADD CONSTRAINT "PrizePayout_playerRoundCardId_fkey" FOREIGN KEY ("playerRoundCardId") REFERENCES "PlayerRoundCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
