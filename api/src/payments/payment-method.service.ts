import type { PaymentMethod } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import type { PaymentsProviderId } from "./config.js";
import type { PaymentMethodDto } from "./types.js";

export type BackofficePaymentMethodDto = {
  id: string;
  providerId: string;
  externalId: string;
  name: string;
  currencyCode: string;
  minCents: number;
  maxCents: number;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

function toPlayerDto(row: PaymentMethod): PaymentMethodDto {
  return {
    id: row.id,
    providerId: row.providerId as PaymentsProviderId,
    name: row.name,
    currencyCode: row.currencyCode,
    minCents: row.minCents,
    maxCents: row.maxCents,
  };
}

function toBackofficeDto(row: PaymentMethod): BackofficePaymentMethodDto {
  return {
    id: row.id,
    providerId: row.providerId,
    externalId: row.externalId,
    name: row.name,
    currencyCode: row.currencyCode,
    minCents: row.minCents,
    maxCents: row.maxCents,
    active: row.active,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listActiveDepositPaymentMethods(currencyCode: string): Promise<PaymentMethodDto[]> {
  const rows = await prisma.paymentMethod.findMany({
    where: {
      active: true,
      currencyCode,
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map(toPlayerDto);
}

export async function getActivePaymentMethodById(id: string): Promise<PaymentMethod | null> {
  return prisma.paymentMethod.findFirst({
    where: { id, active: true },
  });
}

export async function listBackofficePaymentMethods(): Promise<BackofficePaymentMethodDto[]> {
  const rows = await prisma.paymentMethod.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
  return rows.map(toBackofficeDto);
}

export async function setPaymentMethodActive(id: string, active: boolean): Promise<BackofficePaymentMethodDto> {
  const row = await prisma.paymentMethod.update({
    where: { id },
    data: { active },
  });
  return toBackofficeDto(row);
}
