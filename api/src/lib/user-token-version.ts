import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

type DbClient = Prisma.TransactionClient | typeof prisma;

/** Bumps tokenVersion so existing backoffice JWTs for this user are rejected. */
export async function bumpUserTokenVersion(userId: string, client: DbClient = prisma): Promise<void> {
  await client.user.update({
    where: { id: userId },
    data: { tokenVersion: { increment: 1 } },
  });
}
