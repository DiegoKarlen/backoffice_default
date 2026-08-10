import type { PaymentMethodOption } from "../../types.js";

/** Métodos demo para Fase 1 (sin gateway real). */
export const STUB_PAYMENT_METHODS: PaymentMethodOption[] = [
  {
    id: "stub-transfer",
    providerId: "stub",
    name: "Transferencia bancaria (demo)",
    currencyCode: "ARS",
    minCents: 1_000_00,
    maxCents: 500_000_00,
  },
  {
    id: "stub-card",
    providerId: "stub",
    name: "Tarjeta débito / crédito (demo)",
    currencyCode: "ARS",
    minCents: 500_00,
    maxCents: 100_000_00,
  },
  {
    id: "stub-wallet",
    providerId: "stub",
    name: "Billetera virtual (demo)",
    currencyCode: "ARS",
    minCents: 100_00,
    maxCents: 200_000_00,
  },
];
