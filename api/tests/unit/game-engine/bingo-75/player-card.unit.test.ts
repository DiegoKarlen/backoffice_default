import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  fingerprintCells,
  generateBingo75Cells,
  type CardCellInput,
} from "../../../../src/game-engine/bingo/bingo-75/player-card.js";

const SAMPLE_A: CardCellInput[] = [
  { row: 0, col: 0, number: 1, isFree: false },
  { row: 2, col: 2, number: null, isFree: true },
  { row: 4, col: 4, number: 75, isFree: false },
];

const SAMPLE_B: CardCellInput[] = [
  { row: 4, col: 4, number: 75, isFree: false },
  { row: 0, col: 0, number: 1, isFree: false },
  { row: 2, col: 2, number: null, isFree: true },
];

describe("fingerprintCells", () => {
  it("is stable regardless of cell order in the input array", () => {
    assert.equal(fingerprintCells(SAMPLE_A), fingerprintCells(SAMPLE_B));
  });

  it("changes when grid content changes", () => {
    const altered: CardCellInput[] = [
      ...SAMPLE_A,
      { row: 1, col: 1, number: 16, isFree: false },
    ];
    assert.notEqual(fingerprintCells(SAMPLE_A), fingerprintCells(altered));
  });

  it("produces distinct fingerprints across many random cards", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const fp = fingerprintCells(generateBingo75Cells());
      assert.ok(!seen.has(fp), "duplicate fingerprint in random batch");
      seen.add(fp);
    }
  });
});

describe("generateBingo75Cells", () => {
  it("returns 25 cells with a single free center", () => {
    const cells = generateBingo75Cells();
    assert.equal(cells.length, 25);
    const free = cells.filter((c) => c.isFree);
    assert.equal(free.length, 1);
    assert.equal(free[0]!.row, 2);
    assert.equal(free[0]!.col, 2);
  });
});
