import { prisma } from "./prisma.js";

export const ACCOUNT_INACTIVE_OR_NOT_FOUND = "Account inactive or not found";
export const SESSION_INVALID = "Invalid or expired token";

export type BackofficeSessionStatus = "valid" | "inactive" | "stale_token";
export type PlayerSessionStatus = "valid" | "inactive" | "stale_token";

/** Ensures backoffice user exists, is active, and JWT tokenVersion matches (call after JWT verify). */
export async function checkBackofficeSession(
  userId: string,
  tokenVersion?: number,
): Promise<BackofficeSessionStatus> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { active: true, tokenVersion: true },
  });
  if (!user?.active) return "inactive";
  const tokenTv = tokenVersion ?? 0;
  if (tokenTv !== user.tokenVersion) return "stale_token";
  return "valid";
}

/** Ensures player exists, is active, and JWT tokenVersion matches (call after JWT verify). */
export async function checkPlayerSession(
  playerId: string,
  tokenVersion?: number,
): Promise<PlayerSessionStatus> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { active: true, tokenVersion: true },
  });
  if (!player?.active) return "inactive";
  const tokenTv = tokenVersion ?? 0;
  if (tokenTv !== player.tokenVersion) return "stale_token";
  return "valid";
}

/** @deprecated Prefer checkPlayerSession for tokenVersion-aware validation. */
export async function assertActivePlayer(playerId: string): Promise<boolean> {
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { active: true },
  });
  return Boolean(player?.active);
}
