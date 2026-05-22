import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cellsToGrid5 } from "../../../src/lib/bingo-card-grid.js";

describe("cellsToGrid5", () => {
  it("places cells on a 5x5 grid", () => {
    const grid = cellsToGrid5([
      { row: 0, col: 0, number: 1, isFree: false },
      { row: 2, col: 2, number: null, isFree: true },
    ]);
    assert.equal(grid[0]![0]!.number, 1);
    assert.equal(grid[2]![2]!.isFree, true);
    assert.equal(grid[4]![4]!.number, null);
  });
});
