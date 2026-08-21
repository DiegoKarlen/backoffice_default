import type { AdminAuditAction, Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";

export type AdminAuditTargetType = "player" | "bingo_round" | "room";

export type LogAdminAuditInput = {
  adminUserId: string;
  action: AdminAuditAction;
  targetType: AdminAuditTargetType;
  targetId: string;
  amountCents?: number;
  note?: string | null;
  depositId?: string;
  metadata?: Prisma.InputJsonValue;
};

export async function logAdminAudit(
  tx: Prisma.TransactionClient,
  input: LogAdminAuditInput,
): Promise<void> {
  await tx.adminAuditLog.create({
    data: auditLogData(input),
  });
}

export async function logAdminAuditRecord(input: LogAdminAuditInput): Promise<void> {
  await prisma.adminAuditLog.create({
    data: auditLogData(input),
  });
}

function auditLogData(input: LogAdminAuditInput) {
  return {
    adminUserId: input.adminUserId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    amountCents: input.amountCents,
    note: input.note?.trim() || null,
    depositId: input.depositId,
    metadata: input.metadata,
  };
}
