import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

type DbClient = Prisma.TransactionClient | typeof prisma;

/** Bumps tokenVersion so existing player JWTs for this account are rejected. */
export async function bumpPlayerTokenVersion(playerId: string, client: DbClient = prisma): Promise<void> {
  await client.player.update({
    where: { id: playerId },
    data: { tokenVersion: { increment: 1 } },
  });
}
