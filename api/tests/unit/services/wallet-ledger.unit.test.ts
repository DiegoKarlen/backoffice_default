import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Pure validation mirrored by applyWalletDelta (no DB).
 */
function validateDelta(deltaCents: number): void {
  if (!Number.isInteger(deltaCents) || deltaCents === 0) {
    throw new Error("deltaCents must be a non-zero integer");
  }
}

function balanceAfter(current: number, deltaCents: number): number {
  validateDelta(deltaCents);
  const next = current + deltaCents;
  if (next < 0) throw new Error("Insufficient balance");
  return next;
}

describe("wallet-ledger balance rules", () => {
  it("rejects zero or non-integer delta", () => {
    assert.throws(() => validateDelta(0), /non-zero integer/);
    assert.throws(() => validateDelta(1.5), /non-zero integer/);
  });

  it("computes credit and debit", () => {
    assert.equal(balanceAfter(1000, 500), 1500);
    assert.equal(balanceAfter(1000, -400), 600);
  });

  it("rejects overdraft", () => {
    assert.throws(() => balanceAfter(100, -101), /Insufficient balance/);
  });
});
