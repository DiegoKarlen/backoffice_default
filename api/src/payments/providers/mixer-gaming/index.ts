import { paymentsEnv } from "../../config.js";
import type { PaymentProvider } from "../../payment-provider.interface.js";
import type { ListMethodsContext, PaymentMethodDto, ProviderInitiateContext, ProviderInitiateResult, WebhookDepositEvent, WebhookParseContext } from "../../types.js";
import { MixerGamingClient, parseMethodLimitCents } from "./client.js";
import { parseMixerGamingWebhook } from "./webhook.handler.js";

export class MixerGamingPaymentProvider implements PaymentProvider {
  readonly id = "mixer-gaming" as const;
  private client: MixerGamingClient | null = null;

  private requireClient(): MixerGamingClient {
    if (!this.client) {
      const cfg = paymentsEnv.mixerGaming;
      if (!cfg) {
        throw new Error("MixerGaming is not configured");
      }
      this.client = new MixerGamingClient(cfg);
    }
    return this.client;
  }

  async listDepositMethods(ctx: ListMethodsContext): Promise<PaymentMethodDto[]> {
    const rows = await this.requireClient().listPaymentMethods(ctx.currencyCode, 1);
    return rows.map((row) => ({
      id: String(row.id),
      providerId: this.id,
      name: row.name,
      currencyCode: row.currency_iso,
      minCents: parseMethodLimitCents(row.min, 100),
      maxCents: parseMethodLimitCents(row.max, 50_000_000),
    }));
  }

  async initiateDeposit(ctx: ProviderInitiateContext): Promise<ProviderInitiateResult> {
    const amount = ctx.amountCents / 100;
    const data = await this.requireClient().createDeposit({
      userId: ctx.player.paymentsUserId,
      email: ctx.player.email,
      amount,
      paymentMethodId: ctx.paymentMethodId,
      currency: ctx.player.currencyCode,
      country: ctx.profile.countryCode,
      phoneCode: ctx.profile.phoneCode,
      phone: ctx.profile.phone,
      dni: ctx.profile.dni,
      name: ctx.profile.firstName,
      lastName: ctx.profile.lastName,
      returnUrl: ctx.returnUrl,
    });

    return {
      externalRef: String(data.transaction.id),
      redirectUrl: data.url ?? null,
      qrCode: data.qr_code ?? null,
      providerPayload: data,
    };
  }

  parseWebhook(ctx: WebhookParseContext): WebhookDepositEvent {
    void ctx.headers;
    return parseMixerGamingWebhook(ctx.rawBody);
  }
}
