import type { TestContext } from "node:test";
import { prisma } from "../../src/lib/prisma.js";

let connectionKnown: boolean | null = null;

/** Ping Postgres once per process (integration tests). */
export async function isDatabaseAvailable(): Promise<boolean> {
  if (connectionKnown !== null) return connectionKnown;
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
    connectionKnown = true;
  } catch {
    connectionKnown = false;
  }
  return connectionKnown;
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect().catch(() => {});
}

/** Skip test when `DATABASE_URL` is missing or unreachable. */
export function skipIfNoDatabase(t: TestContext, available: boolean): boolean {
  if (!available) {
    t.skip("DATABASE_URL unreachable — integration skipped");
    return true;
  }
  return false;
}
