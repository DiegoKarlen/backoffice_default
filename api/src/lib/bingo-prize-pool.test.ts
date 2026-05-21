import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BingoPrizeMode } from "@prisma/client";
import { computePrizePayoutCents } from "./bingo-prize-pool.js";
import { Prisma } from "@prisma/client";

describe("computePrizePayoutCents", () => {
  it("returns fixed amount in cents", () => {
    const cents = computePrizePayoutCents(
      BingoPrizeMode.FIXED,
      { amount: new Prisma.Decimal("25.50") },
      60_000,
    );
    assert.equal(cents, 2550);
  });

  it("returns floor of pool * percent / 100", () => {
    const cents = computePrizePayoutCents(
      BingoPrizeMode.PERCENTAGE,
      { amount: new Prisma.Decimal("10") },
      60_000,
    );
    assert.equal(cents, 6000);
  });

  it("example: seed 100 + 50 cartons at 10 = pool 600, line 10% = 60", () => {
    const poolCents = 10_000 + 50 * 1000;
    const cents = computePrizePayoutCents(
      BingoPrizeMode.PERCENTAGE,
      { amount: new Prisma.Decimal("10") },
      poolCents,
    );
    assert.equal(poolCents, 60_000);
    assert.equal(cents, 6000);
  });
});
