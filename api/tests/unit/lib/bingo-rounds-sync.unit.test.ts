import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { roundStartsAtMs } from "../../../src/lib/bingo-rounds-sync.js";

describe("roundStartsAtMs", () => {
  it("truncates to whole seconds", () => {
    assert.equal(roundStartsAtMs(1_700_000_000_123), 1_700_000_000_000);
    assert.equal(roundStartsAtMs(new Date("2026-05-19T12:34:56.789Z")), Date.parse("2026-05-19T12:34:56.000Z"));
  });
});
