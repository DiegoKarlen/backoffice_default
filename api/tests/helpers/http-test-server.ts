import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createApp } from "../../src/create-app.js";
import { shutdownAllLiveSessions } from "../../src/game-engine/bingo/live-session.js";

export type TestHttpServer = {
  baseUrl: string;
  close: () => Promise<void>;
};

export async function startTestHttpServer(): Promise<TestHttpServer> {
  const app = createApp();
  const server: Server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Failed to bind test HTTP server");
  }
  const port = (address as AddressInfo).port;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: async () => {
      await shutdownAllLiveSessions();
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },
  };
}

export async function apiFetch(
  baseUrl: string,
  path: string,
  init: RequestInit & { token?: string } = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (init.token) {
    headers.set("Authorization", `Bearer ${init.token}`);
  }
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${baseUrl}${path}`, { ...init, headers });
}
