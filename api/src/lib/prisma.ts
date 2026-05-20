import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

/** Siempre `api/.env` (no solo el cwd): evita mezclar con `DATABASE_URL` heredada del SO/Cursor (p. ej. otro puerto) → fallos “intermitentes”. */
const envPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../.env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath, override: true });
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
