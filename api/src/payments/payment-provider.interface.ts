import type { PaymentsProviderId } from "./config.js";
import type {
  ListMethodsContext,
  PaymentMethodDto,
  ProviderInitiateContext,
  ProviderInitiateResult,
  WebhookDepositEvent,
  WebhookParseContext,
} from "./types.js";

export interface PaymentProvider {
  readonly id: PaymentsProviderId;
  listDepositMethods(ctx: ListMethodsContext): Promise<PaymentMethodDto[]>;
  initiateDeposit(ctx: ProviderInitiateContext): Promise<ProviderInitiateResult>;
  parseWebhook(ctx: WebhookParseContext): WebhookDepositEvent;
}
