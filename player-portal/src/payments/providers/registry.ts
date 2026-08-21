import type { PaymentProviderUiAdapter } from "./types.js";
import { mixerGamingProviderUiAdapter } from "./mixer-gaming/index.js";

const adapters: PaymentProviderUiAdapter[] = [mixerGamingProviderUiAdapter];

export function getPaymentProviderUiAdapter(providerId: string): PaymentProviderUiAdapter | undefined {
  return adapters.find((a) => a.id === providerId);
}
