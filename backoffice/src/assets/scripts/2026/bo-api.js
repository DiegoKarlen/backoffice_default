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
};
