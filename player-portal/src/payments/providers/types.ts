import type { DepositInitResult, PaymentProviderId } from "../types.js";

/** Comportamiento UI específico por proveedor (redirect, QR, etc.). */
export type PaymentProviderUiAdapter = {
  id: PaymentProviderId;
  label: string;
  handleInitResponse(result: DepositInitResult): "message" | "redirect" | "embedded" | "qr";
};
