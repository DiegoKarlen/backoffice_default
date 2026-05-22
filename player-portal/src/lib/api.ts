import { getToken, handleSessionExpiredFromApi } from "./session.js";

export const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined)?.trim().replace(/\/$/, "") ??
  "http://localhost:4001";

export async function apiJson(path: string, options: RequestInit = {}): Promise<unknown> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  const tok = getToken();
  const hadAuthHeader = !!tok;
  if (tok) headers.Authorization = `Bearer ${tok}`;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    if (res.status === 401 && hadAuthHeader) {
      handleSessionExpiredFromApi();
      const e = new Error(
        typeof (data as { error?: string })?.error === "string"
          ? (data as { error: string }).error
          : "Unauthorized",
      ) as Error & { status?: number; sessionHandled?: boolean };
      e.status = 401;
      e.sessionHandled = true;
      throw e;
    }
    const err = (data as { error?: string })?.error ?? res.statusText;
    const raw = typeof err === "string" ? err : JSON.stringify(err);
    const e = new Error(raw) as Error & { status?: number };
    e.status = res.status;
    throw e;
  }
  return data;
}

export async function publicJson(path: string): Promise<unknown> {
  const res = await fetch(`${API_BASE}${path}`);
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const err = (data as { error?: string })?.error ?? res.statusText;
    throw new Error(typeof err === "string" ? err : JSON.stringify(err));
  }
  return data;
}
