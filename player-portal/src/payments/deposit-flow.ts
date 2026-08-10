import { formatMoneyFromCents, parseDecimalMoneyAmount } from "@shared/index.ts";
import type { PaymentMethodOption } from "./types.js";

export function parseAmountInputToCents(raw: string): number | null {
  const n = parseDecimalMoneyAmount(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  const cents = Math.round(n * 100);
  if (!Number.isInteger(cents) || cents <= 0) return null;
  return cents;
}

export function validateDepositAmount(
  amountCents: number | null,
  method: PaymentMethodOption | null,
): string | null {
  if (amountCents == null) return "Ingresá un monto válido mayor a cero.";
  if (!method) return "Seleccioná un método de depósito.";
  if (amountCents < method.minCents) {
    return `El monto mínimo para este método es ${formatMoneyFromCents(method.minCents, method.currencyCode)}.`;
  }
  if (amountCents > method.maxCents) {
    return `El monto máximo para este método es ${formatMoneyFromCents(method.maxCents, method.currencyCode)}.`;
  }
  return null;
}

export function formatMethodLimits(method: PaymentMethodOption | null): string {
  if (!method) return "Seleccioná un método para ver límites.";
  return `Mín. ${formatMoneyFromCents(method.minCents, method.currencyCode)} · Máx. ${formatMoneyFromCents(method.maxCents, method.currencyCode)}`;
}
