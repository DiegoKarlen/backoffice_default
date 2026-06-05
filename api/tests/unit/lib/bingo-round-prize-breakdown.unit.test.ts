import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BingoPrizeMode, Prisma } from "@prisma/client";
import { buildRoundPrizeBreakdown } from "../../../src/lib/bingo-round-prize-breakdown.js";

describe("buildRoundPrizeBreakdown", () => {
  it("includes pool and percentage payouts", () => {
    const breakdown = buildRoundPrizeBreakdown(
      BingoPrizeMode.PERCENTAGE,
      new Prisma.Decimal("100"),
      [{ figure: "LINE", amount: new Prisma.Decimal("10") }],
      10_000,
    );
    assert.equal(breakdown.prizePoolCents, 10_000);
    assert.equal(breakdown.prizeLines.length, 1);
    assert.equal(breakdown.prizeLines[0].displayAmount, "10%");
    assert.equal(breakdown.prizeLines[0].payoutCents, 1000);
  });

  it("omits pool for fixed mode without seed", () => {
    const breakdown = buildRoundPrizeBreakdown(
      BingoPrizeMode.FIXED,
      new Prisma.Decimal("0"),
      [{ figure: "LINE", amount: new Prisma.Decimal("500") }],
      50_000,
    );
    assert.equal(breakdown.prizePoolCents, null);
    assert.equal(breakdown.prizeLines[0].displayAmount, "500");
    assert.equal(breakdown.prizeLines[0].payoutCents, 50_000);
  });
});
