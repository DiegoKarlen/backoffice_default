import { getApiBase, getToken } from "./bo-config.js";

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

async function apiJson(path, options = {}) {
  const url = `${getApiBase().replace(/\/$/, "")}${path}`;
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  const t = getToken();
  if (t) headers.Authorization = `Bearer ${t}`;
  const res = await fetch(url, { ...options, headers });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = data?.error || data?.message || res.statusText || "Request failed";
    throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  return data;
}

export const api = {
  me: () => apiJson("/auth/me"),

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

  bingos: {
    list: (query) => {
      const q = new URLSearchParams();
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
    upcoming: (query) => {
      const q = new URLSearchParams();
      if (query?.limit != null) q.set("limit", String(query.limit));
      if (query?.horizonDays != null) q.set("horizonDays", String(query.horizonDays));
      const s = q.toString();
      return apiJson(`/backoffice/bingos/upcoming${s ? `?${s}` : ""}`);
    },
  },
};
