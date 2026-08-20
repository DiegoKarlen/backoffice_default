import { createApiClient } from "@shared/http-client.js";
import { clearSession, getApiBase, getToken, redirectToSignIn } from "./bo-config.js";

const { request: apiRequest } = createApiClient({
  baseUrl: getApiBase,
  getToken,
  onUnauthorized: () => {
    clearSession();
    redirectToSignIn();
  },
});

export async function loginRequest(body) {
  const url = `${getApiBase().replace(/\/$/, "")}/auth/login`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error || res.statusText || "Login failed";
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data;
}

/** Second step after `login` returned `requiresTwoFactor` (TOTP / authenticator app). */
export async function loginTotpRequest(body) {
  const url = `${getApiBase().replace(/\/$/, "")}/auth/login/totp`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error || res.statusText || "Two-factor verification failed";
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data;
}

async function apiJson(path, options = {}) {
  try {
    return await apiRequest(path, {
      cache: "no-store",
      ...options,
    });
  } catch (e) {
    if (e?.status === 403) {
      const err = e instanceof Error ? e : new Error(String(e));
      if (err.message === "Forbidden" || !err.message) {
        err.message = "No tenés permiso para realizar esta acción.";
      }
      throw err;
    }
    throw e;
  }
}

export const api = {
  me: () => apiJson("/auth/me"),

  totpSetup: () => apiJson("/auth/totp/setup", { method: "POST", body: "{}" }),
  totpEnable: (body) => apiJson("/auth/totp/enable", { method: "POST", body: JSON.stringify(body) }),
  totpDisable: (body) => apiJson("/auth/totp/disable", { method: "POST", body: JSON.stringify(body) }),

  users: {
    list: () => apiJson("/users"),
    create: (body) => apiJson("/users", { method: "POST", body: JSON.stringify(body) }),
    patch: (id, body) => apiJson(`/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  },

  roles: {
    list: () => apiJson("/roles"),
    create: (body) => apiJson("/roles", { method: "POST", body: JSON.stringify(body) }),
    patch: (id, body) => apiJson(`/roles/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  },

  functionalities: {
    list: () => apiJson("/functionalities"),
    create: (body) => apiJson("/functionalities", { method: "POST", body: JSON.stringify(body) }),
    patch: (id, body) => apiJson(`/functionalities/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  },

  rooms: {
    list: (query) => {
      const q = new URLSearchParams();
      if (query?.name) q.set("name", query.name);
      if (query?.status) q.set("status", query.status);
      const s = q.toString();
      return apiJson(`/backoffice/rooms${s ? `?${s}` : ""}`);
    },
    get: (id) => apiJson(`/backoffice/rooms/${id}`),
    create: (body) =>
      apiJson("/backoffice/rooms", { method: "POST", body: JSON.stringify(body) }),
    put: (id, body) =>
      apiJson(`/backoffice/rooms/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    activate: (id) =>
      apiJson(`/backoffice/rooms/${id}/activate`, { method: "PATCH", body: "{}" }),
    deactivate: (id) =>
      apiJson(`/backoffice/rooms/${id}/deactivate`, { method: "PATCH", body: "{}" }),
    remove: (id) => apiJson(`/backoffice/rooms/${id}`, { method: "DELETE" }),
  },

  bingos: {
    list: (query) => {
      const q = new URLSearchParams();
      if (query?.name) q.set("name", query.name);
      if (query?.roomId) q.set("roomId", query.roomId);
      if (query?.roomName) q.set("roomName", query.roomName);
      if (query?.status) q.set("status", query.status);
      if (query?.bingoType) q.set("bingoType", query.bingoType);
      const s = q.toString();
      return apiJson(`/backoffice/bingos${s ? `?${s}` : ""}`);
    },
    get: (id) => apiJson(`/backoffice/bingos/${id}`),
    create: (body) =>
      apiJson("/backoffice/bingos", { method: "POST", body: JSON.stringify(body) }),
    put: (id, body) =>
      apiJson(`/backoffice/bingos/${id}`, { method: "PUT", body: JSON.stringify(body) }),
    activate: (id) =>
      apiJson(`/backoffice/bingos/${id}/activate`, { method: "PATCH", body: "{}" }),
    deactivate: (id) =>
      apiJson(`/backoffice/bingos/${id}/deactivate`, { method: "PATCH", body: "{}" }),
    remove: (id) => apiJson(`/backoffice/bingos/${id}`, { method: "DELETE" }),
    rounds: (id, query) => {
      const q = new URLSearchParams();
      if (query?.from) q.set("from", query.from);
      if (query?.to) q.set("to", query.to);
      if (query?.sequence != null && query.sequence !== "") q.set("sequence", String(query.sequence));
      if (query?.status) q.set("status", query.status);
      if (query?.finishedOnly) q.set("finishedOnly", String(query.finishedOnly));
      if (query?.limit != null && query.limit !== "") q.set("limit", String(query.limit));
      if (query?.sort) q.set("sort", query.sort);
      const s = q.toString();
      return apiJson(`/backoffice/bingos/${id}/rounds${s ? `?${s}` : ""}`);
    },
    roundCards: (bingoId, roundId) =>
      apiJson(`/backoffice/bingos/${bingoId}/rounds/${roundId}/cards`),
    roundPrizes: (bingoId, roundId) =>
      apiJson(`/backoffice/bingos/${bingoId}/rounds/${roundId}/prizes`),
    upcoming: (query) => {
      const q = new URLSearchParams();
      if (query?.limit != null) q.set("limit", String(query.limit));
      if (query?.horizonDays != null) q.set("horizonDays", String(query.horizonDays));
      if (query?.roomSlug != null && String(query.roomSlug).trim() !== "") {
        q.set("roomSlug", String(query.roomSlug).trim());
      }
      const s = q.toString();
      return apiJson(`/backoffice/bingos/upcoming${s ? `?${s}` : ""}`);
    },
    liveState: (query) => {
      const q = new URLSearchParams();
      q.set("roomSlug", String(query.roomSlug).trim());
      return apiJson(`/backoffice/bingos/live/state?${q}`);
    },
    liveDrawBall: (query, number) => {
      const q = new URLSearchParams();
      q.set("roomSlug", String(query.roomSlug).trim());
      return apiJson(`/backoffice/bingos/live/draw-ball?${q}`, {
        method: "POST",
        body: JSON.stringify({ number }),
      });
    },
    liveStop: (query) => {
      const q = new URLSearchParams();
      q.set("roomSlug", String(query.roomSlug).trim());
      return apiJson(`/backoffice/bingos/live/stop?${q}`, { method: "POST", body: "{}" });
    },
  },

  players: {
    list: (query) => {
      const q = new URLSearchParams();
      if (query?.q) q.set("q", query.q);
      if (query?.limit != null && query.limit !== "") q.set("limit", String(query.limit));
      const s = q.toString();
      return apiJson(`/backoffice/players${s ? `?${s}` : ""}`);
    },
    manualCredit: (playerId, body) =>
      apiJson(`/backoffice/players/${playerId}/wallet/manual-credits`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    purchases: (playerId) => apiJson(`/backoffice/players/${playerId}/purchases`),
    prizePayouts: (playerId) => apiJson(`/backoffice/players/${playerId}/prize-payouts`),
    prizeCredit: (playerId, body) =>
      apiJson(`/backoffice/players/${playerId}/prize-credits`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    walletTransactions: (playerId, query) => {
      const q = new URLSearchParams();
      if (query?.limit != null) q.set("limit", String(query.limit));
      if (query?.from) q.set("from", query.from);
      if (query?.to) q.set("to", query.to);
      const s = q.toString();
      return apiJson(`/backoffice/players/${playerId}/wallet/transactions${s ? `?${s}` : ""}`);
    },
    walletTransactionCardDetail: (playerId, transactionId) =>
      apiJson(`/backoffice/players/${playerId}/wallet/transactions/${transactionId}/card-detail`),
    depositDetail: (playerId, depositId) =>
      apiJson(`/backoffice/players/${playerId}/deposits/${depositId}`),
  },

  paymentMethods: {
    list: () => apiJson("/backoffice/payment-methods"),
    patch: (id, body) =>
      apiJson(`/backoffice/payment-methods/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
  },
};
