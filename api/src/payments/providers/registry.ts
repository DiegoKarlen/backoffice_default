import type { PaymentsProviderId } from "../config.js";
import { paymentsEnv } from "../config.js";
import type { PaymentProvider } from "../payment-provider.interface.js";
import { MixerGamingPaymentProvider } from "./mixer-gaming/index.js";

const mixer = new MixerGamingPaymentProvider();

export function getPaymentProvider(providerId?: PaymentsProviderId): PaymentProvider {
  const id = providerId ?? paymentsEnv.defaultProvider;
  if (id !== "mixer-gaming") {
    throw new Error(`Unknown payment provider: ${String(id)}`);
  }
  return mixer;
}

/** Proveedores visibles en portal (listar métodos / iniciar depósito). */
export function listRegisteredProviderIds(): PaymentsProviderId[] {
  if (paymentsEnv.mixerGaming) return ["mixer-gaming"];
  return [];
}

/** Proveedores que aceptan webhook (no requieren OAuth para recibir notificaciones). */
export function listWebhookProviderIds(): PaymentsProviderId[] {
  return ["mixer-gaming"];
}
