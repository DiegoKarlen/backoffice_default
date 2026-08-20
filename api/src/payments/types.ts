import type { DepositStatus } from "@prisma/client";
import type { PaymentsProviderId } from "./config.js";

export type PaymentMethodDto = {
  id: string;
  providerId: PaymentsProviderId;
  name: string;
  currencyCode: string;
  minCents: number;
  maxCents: number;
};

export type DepositProfileInput = {
  firstName?: string;
  lastName?: string;
  dni?: string;
  phone?: string;
  phoneCode?: string;
  countryCode?: string;
};

export type InitiateDepositInput = {
  playerId: string;
  amountCents: number;
  paymentMethodId: string;
  providerId?: PaymentsProviderId;
  profile?: DepositProfileInput;
};

export type InitiateDepositResult = {
  depositId: string;
  status: DepositStatus;
  redirectUrl?: string | null;
  qrCode?: string | null;
  message?: string;
};

export type DepositDto = {
  id: string;
  status: DepositStatus;
  amountCents: number;
  currencyCode: string;
  providerId: string | null;
  paymentMethodId: string | null;
  paymentMethodName: string | null;
  externalRef: string | null;
  failedReason: string | null;
  createdAt: string;
  completedAt: string | null;
};

export type PlayerDepositContext = {
  playerId: string;
  paymentsUserId: number;
  email: string;
  username: string;
  firstName: string | null;
  lastName: string | null;
  dni: string | null;
  phone: string | null;
  phoneCode: string | null;
  countryCode: string | null;
  currencyCode: string;
};

export type ProviderInitiateContext = {
  player: PlayerDepositContext;
  depositId: string;
  amountCents: number;
  paymentMethodId: string;
  paymentMethodName?: string;
  returnUrl: string;
  profile: Required<Pick<DepositProfileInput, "firstName" | "lastName" | "dni" | "phone" | "phoneCode" | "countryCode">>;
};

export type ProviderInitiateResult = {
  externalRef: string;
  redirectUrl?: string | null;
  qrCode?: string | null;
  providerPayload?: unknown;
};

export type ListMethodsContext = {
  currencyCode: string;
};

export type WebhookParseContext = {
  rawBody: unknown;
  headers: Record<string, string | string[] | undefined>;
  /** Correlates all log lines for one HTTP webhook request. */
  requestId?: string;
};

/** Evento normalizado tras parsear el webhook del proveedor. */
export type WebhookDepositEvent = {
  externalRef: string;
  success: boolean;
  /** Monto reportado por el gateway (centavos); opcional para validación cruzada. */
  amountCents?: number;
  failedReason?: string;
  providerPayload?: unknown;
};

export type WebhookHandleResult = {
  ok: boolean;
  depositId?: string;
  status?: DepositStatus;
  alreadyProcessed?: boolean;
  reason?: string;
};
