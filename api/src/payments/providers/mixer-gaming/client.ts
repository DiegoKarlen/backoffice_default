type MixerEnvelope<T> = {
  status?: string;
  code?: number;
  data?: T;
  error?: string;
  message?: string;
};

type OAuthData = {
  expires_in: number;
  access_token: string;
};

type PaymentMethodRow = {
  id: number;
  name: string;
  currency_iso: string;
  transaction_type_id: number;
  min: string | null;
  max: string | null;
  status: boolean;
};

type CreditTransaction = {
  id: number;
  user_id: number;
  currency: string;
  transaction_type: number;
  amount: string;
  payment_method: string;
};

type CreditData = {
  transaction: CreditTransaction;
  url?: string;
  qr_code?: string;
  orderId?: string;
};

let cachedToken: { token: string; expiresAtMs: number } | null = null;

function parseMoneyToCents(raw: string): number {
  const n = Number(String(raw).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

async function readEnvelope<T>(res: Response): Promise<T> {
  const body = (await res.json()) as MixerEnvelope<T>;
  if (!res.ok || body.status === "ERROR" || body.status === "FAILED") {
    const msg =
      (body.data as { message?: string } | undefined)?.message ??
      body.message ??
      body.error ??
      `Gateway HTTP ${res.status}`;
    throw new Error(msg);
  }
  if (!body.data) {
    throw new Error("Gateway response missing data");
  }
  return body.data;
}

export type MixerGamingClientConfig = {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
};

export class MixerGamingClient {
  constructor(private readonly cfg: MixerGamingClientConfig) {}

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (cachedToken && cachedToken.expiresAtMs > now + 60_000) {
      return cachedToken.token;
    }

    const form = new FormData();
    form.append("grant_type", "client_credentials");
    form.append("client_id", this.cfg.clientId);
    form.append("client_secret", this.cfg.clientSecret);

    const res = await fetch(`${this.cfg.baseUrl}/oauth/token`, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: form,
    });

    const data = await readEnvelope<OAuthData>(res);
    cachedToken = {
      token: data.access_token,
      expiresAtMs: now + Math.max(60, data.expires_in) * 1000,
    };
    return data.access_token;
  }

  async listPaymentMethods(currency: string, transactionType = 1): Promise<PaymentMethodRow[]> {
    const token = await this.getAccessToken();
    const url = new URL(`${this.cfg.baseUrl}/api/clients/payment-methods`);
    url.searchParams.set("currency", currency);
    url.searchParams.set("transaction_type", String(transactionType));

    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await readEnvelope<{ payment_methods: PaymentMethodRow[] }>(res);
    return (data.payment_methods ?? []).filter((m) => m.status);
  }

  async createDeposit(params: {
    userId: number;
    email: string;
    amount: number;
    paymentMethodId: string;
    currency: string;
    country: string;
    phoneCode: string;
    phone: string;
    dni: string;
    name: string;
    lastName: string;
    returnUrl: string;
  }): Promise<CreditData> {
    const token = await this.getAccessToken();
    const form = new FormData();
    form.append("user_id", String(params.userId));
    form.append("email", params.email);
    form.append("amount", String(params.amount));
    form.append("payment_method", params.paymentMethodId);
    form.append("currency", params.currency);
    form.append("country", params.country);
    form.append("phone_code", params.phoneCode);
    form.append("phone", params.phone);
    form.append("dni", params.dni);
    form.append("name", params.name);
    form.append("last_name", params.lastName);
    form.append("return_url", params.returnUrl);

    const res = await fetch(`${this.cfg.baseUrl}/api/transactions/credit`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: form,
    });

    return readEnvelope<CreditData>(res);
  }
}

export { parseMoneyToCents };

/** Mixer a veces devuelve min/max null (ej. método test 84). */
export function parseMethodLimitCents(raw: string | null | undefined, fallbackCents: number): number {
  if (raw === null || raw === undefined) return fallbackCents;
  const trimmed = String(raw).trim();
  if (!trimmed || trimmed.toLowerCase() === "null") return fallbackCents;
  const cents = parseMoneyToCents(trimmed);
  return cents > 0 ? cents : fallbackCents;
}
