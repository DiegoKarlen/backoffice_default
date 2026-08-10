import type { PaymentProvider } from "../../payment-provider.interface.js";
import type {
  ListMethodsContext,
  PaymentMethodDto,
  ProviderInitiateContext,
  ProviderInitiateResult,
  WebhookDepositEvent,
  WebhookParseContext,
} from "../../types.js";
import { parseStubWebhook } from "./webhook.handler.js";

const STUB_METHODS: PaymentMethodDto[] = [
  {
    id: "stub-transfer",
    providerId: "stub",
    name: "Transferencia bancaria (demo)",
    currencyCode: "ARS",
    minCents: 100_000,
    maxCents: 50_000_000,
  },
  {
    id: "stub-card",
    providerId: "stub",
    name: "Tarjeta débito / crédito (demo)",
    currencyCode: "ARS",
    minCents: 50_000,
    maxCents: 10_000_000,
  },
  {
    id: "stub-wallet",
    providerId: "stub",
    name: "Billetera virtual (demo)",
    currencyCode: "ARS",
    minCents: 10_000,
    maxCents: 20_000_000,
  },
];

export class StubPaymentProvider implements PaymentProvider {
  readonly id = "stub" as const;

  async listDepositMethods(ctx: ListMethodsContext): Promise<PaymentMethodDto[]> {
    return STUB_METHODS.filter((m) => m.currencyCode === ctx.currencyCode).map((m) => ({ ...m }));
  }

  async initiateDeposit(ctx: ProviderInitiateContext): Promise<ProviderInitiateResult> {
    const method = STUB_METHODS.find((m) => m.id === ctx.paymentMethodId);
    return {
      externalRef: `stub-${ctx.depositId}`,
      providerPayload: {
        mode: "stub",
        paymentMethodId: ctx.paymentMethodId,
        paymentMethodName: method?.name ?? ctx.paymentMethodName,
        message: "Depósito demo registrado. Simulá la acreditación con POST /webhooks/payments/stub.",
      },
    };
  }

  parseWebhook(ctx: WebhookParseContext): WebhookDepositEvent {
    void ctx.headers;
    return parseStubWebhook(ctx.rawBody);
  }
}

export { STUB_METHODS };
