import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BingoRoundStatus } from "@prisma/client";
import { isRoundOpenForPurchase, isTerminalRoundStatus } from "../../../src/lib/bingo-round-kickoff.js";

describe("isRoundOpenForPurchase", () => {
  const future = new Date("2026-06-01T12:00:00.000Z");
  const past = new Date("2026-05-01T12:00:00.000Z");
  const atStart = new Date("2026-06-01T12:00:00.000Z");

  it("allows purchase when SCHEDULED and startsAt is in the future", () => {
    assert.equal(
      isRoundOpenForPurchase({ status: BingoRoundStatus.SCHEDULED, startsAt: future }, past),
      true,
    );
  });

  it("blocks purchase at or after startsAt", () => {
    assert.equal(
      isRoundOpenForPurchase({ status: BingoRoundStatus.SCHEDULED, startsAt: future }, atStart),
      false,
    );
  });

  it("blocks purchase when not SCHEDULED", () => {
    assert.equal(
      isRoundOpenForPurchase({ status: BingoRoundStatus.DRAWING, startsAt: future }, past),
      false,
    );
  });
});

describe("isTerminalRoundStatus", () => {
  it("detects cancelled and completed", () => {
    assert.equal(isTerminalRoundStatus(BingoRoundStatus.CANCELLED), true);
    assert.equal(isTerminalRoundStatus(BingoRoundStatus.COMPLETED), true);
    assert.equal(isTerminalRoundStatus(BingoRoundStatus.SCHEDULED), false);
    assert.equal(isTerminalRoundStatus(BingoRoundStatus.DRAWING), false);
  });
});
