/**
 * Fase 4 manual QA: Tests 15–23 (tokens y límites BO/player).
 * Uso: npx tsx scripts/run-phase4-auth-qa.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";

const API = process.env.API_BASE_URL ?? "http://localhost:4001";
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
const PLAYER_EMAIL = process.env.QA_PLAYER_EMAIL ?? "dmourglia@gmail.com";
const PLAYER_PASSWORD = process.env.QA_PLAYER_PASSWORD ?? "123456789";

type StepResult = { test: string; status: number; body: string; ok: boolean };

const results: StepResult[] = [];

async function request(
  test: string,
  method: string,
  path: string,
  token?: string,
  expectedStatus?: number,
): Promise<{ status: number; body: string }> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { method, headers });
  const body = await res.text();
  const ok = expectedStatus === undefined || res.status === expectedStatus;
  results.push({ test, status: res.status, body, ok });
  console.log(`[${ok ? "OK" : "FAIL"}] ${test}: HTTP ${res.status} ${body.slice(0, 120)}`);
  if (!ok) throw new Error(`${test} expected ${expectedStatus}, got ${res.status}`);
  return { status: res.status, body };
}

async function loginAdmin(): Promise<string> {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const json = (await res.json()) as { accessToken?: string };
  if (!res.ok || !json.accessToken) throw new Error("Admin login failed");
  return json.accessToken;
}

async function loginPlayer(): Promise<string> {
  const res = await fetch(`${API}/player/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: PLAYER_EMAIL, password: PLAYER_PASSWORD }),
  });
  const json = (await res.json()) as { accessToken?: string };
  if (!res.ok || !json.accessToken) throw new Error("Player login failed");
  return json.accessToken;
}

const adminUser = await prisma.user.findFirst({ where: { email: ADMIN_EMAIL } });
const player = await prisma.player.findFirst({ where: { email: PLAYER_EMAIL } });
if (!adminUser || !player) {
  console.error("Admin o player de QA no encontrados en DB");
  process.exit(1);
}

try {
  console.log("\n=== Test 15 — Admin activo ===");
  const adminToken = await loginAdmin();
  await request("Test 15 GET /auth/me", "GET", "/auth/me", adminToken, 200);

  console.log("\n=== Tests 16–17 — Admin desactivado ===");
  await prisma.user.update({ where: { id: adminUser.id }, data: { active: false } });
  await request("Test 16 GET /auth/me (inactive)", "GET", "/auth/me", adminToken, 401);
  await request("Test 17 GET /users (inactive)", "GET", "/users", adminToken, 401);
  await prisma.user.update({ where: { id: adminUser.id }, data: { active: true } });
  console.log("Admin reactivado");

  console.log("\n=== Test 18 — Jugador activo ===");
  const playerToken = await loginPlayer();
  await request("Test 18 GET /player/wallet", "GET", "/player/wallet", playerToken, 200);

  console.log("\n=== Tests 19–21 — Jugador desactivado ===");
  await prisma.player.update({ where: { id: player.id }, data: { active: false } });
  await request("Test 19 GET /player/me (inactive)", "GET", "/player/me", playerToken, 401);
  await request("Test 20 GET /player/wallet (inactive)", "GET", "/player/wallet", playerToken, 401);
  await request(
    "Test 21 GET /player/deposits/payment-methods (inactive)",
    "GET",
    "/player/deposits/payment-methods",
    playerToken,
    401,
  );
  await prisma.player.update({ where: { id: player.id }, data: { active: true } });
  console.log("Player reactivado");

  console.log("\n=== Tests 22–23 — Límites de token ===");
  const adminToken2 = await loginAdmin();
  const playerToken2 = await loginPlayer();
  await request("Test 22 GET /player/wallet (admin token)", "GET", "/player/wallet", adminToken2, 403);
  await request("Test 23 GET /users (player token)", "GET", "/users", playerToken2, 403);

  console.log("\n✓ Fase 4 Tests 15–23 OK");
} catch (err) {
  console.error("\nFase 4 falló:", err);
  await prisma.user.update({ where: { id: adminUser.id }, data: { active: true } }).catch(() => {});
  await prisma.player.update({ where: { id: player.id }, data: { active: true } }).catch(() => {});
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
