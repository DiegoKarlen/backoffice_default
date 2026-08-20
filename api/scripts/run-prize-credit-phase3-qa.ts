/**
 * Fase 3 manual QA: Tests 12–14 (prize-credits con victoria, idempotencia, settlement).
 * Uso: npx tsx scripts/run-prize-credit-phase3-qa.ts
 */
import "dotenv/config";
import { evaluateRoundPrizesAfterBall } from "../src/game-engine/bingo/bingo-75/prize-evaluator.js";
import { prisma } from "../src/lib/prisma.js";
import { row0DrawnNumbers } from "../tests/helpers/fixtures/card-cells.js";
import {
  cleanupPrizeRoundFixture,
  createPrizeRoundFixture,
} from "../tests/helpers/fixtures/prize-round.js";

const API = process.env.API_BASE_URL ?? "http://localhost:4001";
const suffix = `manual-qa-${Date.now()}`;

const roundFx = await createPrizeRoundFixture({
  suffix,
  prizeSettlementTiming: "AT_ROUND_END",
});

console.log("Fixture creado:", {
  playerId: roundFx.playerAId,
  bingoPrizeId: roundFx.prizeLineId,
  playerRoundCardId: roundFx.cardAId,
  bingoRoundId: roundFx.roundId,
});

await evaluateRoundPrizesAfterBall({
  bingoRoundId: roundFx.roundId,
  bingoId: roundFx.bingoId,
  drawnNumbers: row0DrawnNumbers(roundFx.cellsA),
});

const deferredBefore = await prisma.deferredRoundPrizeWin.count({
  where: {
    bingoRoundId: roundFx.roundId,
    bingoPrizeId: roundFx.prizeLineId,
    playerRoundCardId: roundFx.cardAId,
  },
});
if (deferredBefore !== 1) {
  console.error("Setup falló: se esperaba 1 DeferredRoundPrizeWin, got", deferredBefore);
  await cleanupPrizeRoundFixture(roundFx);
  process.exit(1);
}

const email = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
const password = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
const loginRes = await fetch(`${API}/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email, password }),
});
if (!loginRes.ok) {
  console.error("Login admin falló:", loginRes.status, await loginRes.text());
  await cleanupPrizeRoundFixture(roundFx);
  process.exit(1);
}
const { accessToken } = (await loginRes.json()) as { accessToken: string };

const url = `${API}/backoffice/players/${roundFx.playerAId}/prize-credits`;
const body = JSON.stringify({
  bingoPrizeId: roundFx.prizeLineId,
  playerRoundCardId: roundFx.cardAId,
});

console.log("\n--- Test 12: primer POST prize-credits ---");
const first = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
  body,
});
const firstText = await first.text();
console.log("HTTP", first.status, firstText);
if (first.status !== 201) {
  await cleanupPrizeRoundFixture(roundFx);
  process.exit(1);
}
const firstJson = JSON.parse(firstText) as { payoutId: string; balanceCents: number };

console.log("\n--- Test 13: segundo POST (idempotente) ---");
const second = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
  body,
});
const secondText = await second.text();
console.log("HTTP", second.status, secondText);
if (second.status !== 409) {
  await cleanupPrizeRoundFixture(roundFx);
  process.exit(1);
}

console.log("\n--- Test 14: settlement en DB ---");
const deferredAfter = await prisma.deferredRoundPrizeWin.count({
  where: {
    bingoRoundId: roundFx.roundId,
    bingoPrizeId: roundFx.prizeLineId,
    playerRoundCardId: roundFx.cardAId,
  },
});
const payoutCount = await prisma.prizePayout.count({
  where: {
    bingoPrizeId: roundFx.prizeLineId,
    playerRoundCardId: roundFx.cardAId,
  },
});
const walletTxCount = await prisma.walletTransaction.count({
  where: { prizePayoutId: firstJson.payoutId },
});

console.log({
  deferredRows: deferredAfter,
  prizePayoutRows: payoutCount,
  walletTxForPayout: walletTxCount,
  payoutId: firstJson.payoutId,
  balanceCents: firstJson.balanceCents,
});

const test14Ok = deferredAfter === 0 && payoutCount === 1 && walletTxCount === 1;
if (!test14Ok) {
  console.error("Test 14 falló");
  await cleanupPrizeRoundFixture(roundFx);
  process.exit(1);
}

await cleanupPrizeRoundFixture(roundFx);
console.log("\n✓ Fase 3 Tests 12–14 OK (fixture limpiado)");
