import { prisma } from "./prisma.js";

export const ACCOUNT_INACTIVE_OR_NOT_FOUND = "Account inactive or not found";

/** Ensures backoffice user exists and is active (call after JWT verify). */
export async function assertActiveBackofficeUser(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { active: true },
  });
  return Boolean(user?.active);
}

/** Ensures player exists and is active (call after JWT verify). */
export async function assertActivePlayer(playerId: string): Promise<boolean> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { active: true },
  });
  return Boolean(player?.active);
}
