import type { PaymentProviderUiAdapter } from "../types.js";

export const stubProviderUiAdapter: PaymentProviderUiAdapter = {
  id: "stub",
  label: "Demo",
  handleInitResponse() {
    return "message";
  },
};

export { STUB_PAYMENT_METHODS } from "./methods.js";
