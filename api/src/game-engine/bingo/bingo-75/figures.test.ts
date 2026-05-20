import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildMarkedGrid,
  figureSatisfied,
  winsFullHouse,
  winsLine,
  winsPerimeter,
  type Bingo75Cell,
} from "./figures.js";

function cell(row: number, col: number, number: number | null, isFree = false): Bingo75Cell {
  return { row, col, number, isFree };
}

function fullGrid(numbers: number[][]): Bingo75Cell[] {
  const cells: Bingo75Cell[] = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      const isFree = r === 2 && c === 2;
      cells.push(cell(r, c, isFree ? null : numbers[r]![c]!, isFree));
    }
  }
  return cells;
}

describe("buildMarkedGrid", () => {
  it("marks free center without a drawn number", () => {
    const cells = fullGrid([
      [1, 2, 3, 4, 5],
      [6, 7, 8, 9, 10],
      [11, 12, 0, 14, 15],
      [16, 17, 18, 19, 20],
      [21, 22, 23, 24, 25],
    ]);
    const marked = buildMarkedGrid(cells, new Set([1]));
    assert.equal(marked[2]![2], true);
    assert.equal(marked[0]![1], false);
  });
});

describe("winsLine", () => {
  it("detects a complete row", () => {
    const marked = Array.from({ length: 5 }, () => Array(5).fill(false));
    marked[0] = [true, true, true, true, true];
    assert.equal(winsLine(marked), true);
  });

  it("detects a complete column", () => {
    const marked = Array.from({ length: 5 }, () => Array(5).fill(false));
    for (let r = 0; r < 5; r++) marked[r]![3] = true;
    assert.equal(winsLine(marked), true);
  });
});

describe("winsPerimeter", () => {
  it("requires all edge cells marked", () => {
    const marked = Array.from({ length: 5 }, () => Array(5).fill(false));
    for (let c = 0; c < 5; c++) {
      marked[0]![c] = true;
      marked[4]![c] = true;
    }
    for (let r = 1; r < 4; r++) {
      marked[r]![0] = true;
      marked[r]![4] = true;
    }
    assert.equal(winsPerimeter(marked), true);
    marked[0]![0] = false;
    assert.equal(winsPerimeter(marked), false);
  });
});

describe("winsFullHouse", () => {
  it("requires every cell marked", () => {
    const marked = Array.from({ length: 5 }, () => Array(5).fill(true));
    assert.equal(winsFullHouse(marked), true);
    marked[4]![4] = false;
    assert.equal(winsFullHouse(marked), false);
  });
});

describe("figureSatisfied", () => {
  it("maps BingoFigure enum values to win detectors", () => {
    const rowWin = Array.from({ length: 5 }, () => Array(5).fill(false));
    rowWin[1] = [true, true, true, true, true];
    assert.equal(figureSatisfied("LINE", rowWin), true);
    assert.equal(figureSatisfied("PERIMETER", rowWin), false);
    assert.equal(figureSatisfied("FULL_HOUSE", rowWin), false);
  });
});
