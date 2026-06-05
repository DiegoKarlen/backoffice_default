import { createApiClient } from "@shared/index.ts";
import { getToken, handleSessionExpiredFromApi } from "./session.js";

export const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined)?.trim().replace(/\/$/, "") ??
  "http://localhost:4001";

const client = createApiClient({
  baseUrl: API_BASE,
  getToken,
  onUnauthorized: (hadAuth) => {
    if (hadAuth) handleSessionExpiredFromApi();
  },
});

export async function apiJson(path: string, options: RequestInit = {}): Promise<unknown> {
  return client.request(path, options);
}

export async function publicJson(path: string): Promise<unknown> {
  return client.get(path);
}
