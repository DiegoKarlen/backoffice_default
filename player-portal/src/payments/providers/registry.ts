import type { PaymentProviderUiAdapter } from "./types.js";
import { mixerGamingProviderUiAdapter } from "./mixer-gaming/index.js";
import { stubProviderUiAdapter } from "./_stub/index.js";

const adapters: PaymentProviderUiAdapter[] = [stubProviderUiAdapter, mixerGamingProviderUiAdapter];

export function getPaymentProviderUiAdapter(providerId: string): PaymentProviderUiAdapter | undefined {
  return adapters.find((a) => a.id === providerId);
}
