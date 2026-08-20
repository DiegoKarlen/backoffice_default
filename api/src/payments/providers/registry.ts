import type { PaymentsProviderId } from "../config.js";
import { paymentsEnv } from "../config.js";
import type { PaymentProvider } from "../payment-provider.interface.js";
import { MixerGamingPaymentProvider } from "./mixer-gaming/index.js";
import { StubPaymentProvider } from "./stub/index.js";

const stub = new StubPaymentProvider();
const mixer = new MixerGamingPaymentProvider();

export function getPaymentProvider(providerId?: PaymentsProviderId): PaymentProvider {
  const id = providerId ?? paymentsEnv.defaultProvider;
  if (id === "mixer-gaming") {
    return mixer;
  }
  return stub;
}

/** Proveedores visibles en portal (listar métodos / iniciar depósito). */
export function listRegisteredProviderIds(): PaymentsProviderId[] {
  const ids: PaymentsProviderId[] = ["stub"];
  if (paymentsEnv.mixerGaming) ids.push("mixer-gaming");
  return ids;
}

/** Proveedores que aceptan webhook (no requieren OAuth para recibir notificaciones). */
export function listWebhookProviderIds(): PaymentsProviderId[] {
  const ids: PaymentsProviderId[] = [];
  if (paymentsEnv.webhookStubEnabled && !paymentsEnv.isProduction) {
    ids.push("stub");
  }
  ids.push("mixer-gaming");
  return ids;
}
