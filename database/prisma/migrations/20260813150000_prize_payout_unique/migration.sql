-- CreateIndex
CREATE UNIQUE INDEX "PrizePayout_bingoPrizeId_playerRoundCardId_key" ON "PrizePayout"("bingoPrizeId", "playerRoundCardId");
