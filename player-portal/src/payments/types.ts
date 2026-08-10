export type PaymentProviderId = "stub" | "mixer-gaming";

export type PaymentMethodOption = {
  id: string;
  providerId: PaymentProviderId;
  name: string;
  currencyCode: string;
  minCents: number;
  maxCents: number;
};

export type DepositInitRequest = {
  amountCents: number;
  paymentMethodId: string;
  providerId: PaymentProviderId;
};

export type DepositInitResult = {
  depositId: string;
  status: "PENDING" | "COMPLETED" | "FAILED";
  redirectUrl?: string | null;
  qrCode?: string | null;
  message?: string;
};

export type DepositMountContext = {
  currencyCode: string;
  depositReturnId?: string | null;
  showMessage: (text: string) => void;
  onBalanceChanged?: () => void | Promise<void>;
};

export type DepositReturnResult = {
  depositId: string | null;
};

export type PaymentsModule = {
  mountDepositView: (container: HTMLElement, ctx: DepositMountContext) => () => void;
  handleDepositReturnQuery: (params: URLSearchParams) => DepositReturnResult | null;
};
