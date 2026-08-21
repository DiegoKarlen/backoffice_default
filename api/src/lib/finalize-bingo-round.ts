import { BingoRoundStatus } from "@prisma/client";
import { prisma } from "./prisma.js";
import { settleDeferredSplitPrizesForRound } from "../services/settle-deferred-split-prizes.js";

/**
 * Settles deferred prizes then marks the round COMPLETED.
 * Fail-closed: on any error the round status is left unchanged (typically DRAWING).
 */
export async function finalizeBingoRoundAfterDraw(bingoRoundId: string): Promise<void> {
  await settleDeferredSplitPrizesForRound({ bingoRoundId });
  await prisma.bingoRound.update({
    where: { id: bingoRoundId },
    data: { status: BingoRoundStatus.COMPLETED },
  });
}
