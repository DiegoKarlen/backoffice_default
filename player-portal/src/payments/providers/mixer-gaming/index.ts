import type { DepositInitResult } from "../../types.js";
import type { PaymentProviderUiAdapter } from "../types.js";

export const mixerGamingProviderUiAdapter: PaymentProviderUiAdapter = {
  id: "mixer-gaming",
  label: "MixerGaming",
  handleInitResponse(result: DepositInitResult) {
    if (result.redirectUrl) return "embedded";
    if (result.qrCode) return "qr";
    return "message";
  },
};
