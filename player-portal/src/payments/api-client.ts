import { apiJson } from "../lib/api.js";
import type { DepositInitRequest, DepositInitResult, PaymentMethodOption } from "./types.js";

type PaymentMethodsResponse = {
  paymentMethods?: PaymentMethodOption[];
};

type DepositStatusResponse = {
  deposit?: {
    id: string;
    status: DepositStatusDto;
    amountCents: number;
    currencyCode: string;
    failedReason?: string | null;
  };
};

export type DepositStatusDto = "PENDING" | "COMPLETED" | "FAILED";

export async function fetchDepositPaymentMethods(): Promise<PaymentMethodOption[]> {
  const data = (await apiJson("/player/deposits/payment-methods")) as PaymentMethodsResponse;
  return data.paymentMethods ?? [];
}

export type DepositProfilePayload = {
  firstName?: string;
  lastName?: string;
  dni?: string;
  phone?: string;
  phoneCode?: string;
  countryCode?: string;
};

export async function initiateDeposit(
  req: DepositInitRequest,
  profile?: DepositProfilePayload,
): Promise<DepositInitResult> {
  const data = (await apiJson("/player/deposits", {
    method: "POST",
    body: JSON.stringify({
      amountCents: req.amountCents,
      paymentMethodId: req.paymentMethodId,
      providerId: req.providerId,
      profile,
    }),
  })) as DepositInitResult;
  return data;
}

export async function fetchDepositById(depositId: string): Promise<DepositStatusResponse["deposit"]> {
  const data = (await apiJson(`/player/deposits/${encodeURIComponent(depositId)}`)) as DepositStatusResponse;
  return data.deposit;
}
