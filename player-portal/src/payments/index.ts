import { isPaymentsEnabled } from "./config.js";
import type { DepositMountContext, DepositReturnResult, PaymentsModule } from "./types.js";
import { mountDepositForm } from "./views/deposit-form.js";

export { isPaymentsEnabled };

export function handleDepositReturnQuery(params: URLSearchParams): DepositReturnResult | null {
  const mode = params.get("deposit");
  if (mode !== "return") return null;
  const depositId = params.get("depositId")?.trim() || null;
  return { depositId };
}

export function mountDepositView(container: HTMLElement, ctx: DepositMountContext): () => void {
  return mountDepositForm(container, ctx);
}

export function createPaymentsModule(): PaymentsModule {
  return {
    mountDepositView,
    handleDepositReturnQuery,
  };
}

export type {
  DepositInitRequest,
  DepositInitResult,
  DepositMountContext,
  DepositReturnResult,
  PaymentMethodOption,
  PaymentProviderId,
  PaymentsModule,
} from "./types.js";
