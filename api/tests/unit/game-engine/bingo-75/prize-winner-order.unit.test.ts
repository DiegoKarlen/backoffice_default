import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compareCardsForTieBreak, sortCardsForTieBreak } from "../../../../src/game-engine/bingo/bingo-75/prize-winner-order.js";

describe("compareCardsForTieBreak", () => {
  it("prefers earlier purchase time", () => {
    const early = { id: "b", createdAt: new Date("2026-01-01T10:00:00Z"), cardIndex: 1 };
    const late = { id: "a", createdAt: new Date("2026-01-01T11:00:00Z"), cardIndex: 0 };
    assert.ok(compareCardsForTieBreak(early, late) < 0);
  });

  it("breaks ties by cardIndex when purchased together", () => {
    const t = new Date("2026-01-01T10:00:00Z");
    const c0 = { id: "z", createdAt: t, cardIndex: 0 };
    const c1 = { id: "a", createdAt: t, cardIndex: 1 };
    assert.ok(compareCardsForTieBreak(c0, c1) < 0);
  });

  it("breaks ties by id when time and index match", () => {
    const t = new Date("2026-01-01T10:00:00Z");
    const a = { id: "aaa", createdAt: t, cardIndex: 0 };
    const b = { id: "bbb", createdAt: t, cardIndex: 0 };
    assert.ok(compareCardsForTieBreak(a, b) < 0);
  });
});

describe("sortCardsForTieBreak", () => {
  it("returns a new sorted array", () => {
    const t = new Date("2026-01-01T10:00:00Z");
    const input = [
      { id: "c", createdAt: t, cardIndex: 2 },
      { id: "a", createdAt: t, cardIndex: 0 },
      { id: "b", createdAt: t, cardIndex: 1 },
    ];
    const sorted = sortCardsForTieBreak(input);
    assert.deepEqual(
      sorted.map((c) => c.cardIndex),
      [0, 1, 2],
    );
    assert.notEqual(sorted, input);
  });
});
