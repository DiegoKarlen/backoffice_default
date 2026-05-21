import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildMarkedGrid,
  figureHighlightSlots,
  figureHighlightSlotsByDrawOrder,
  figureSatisfied,
  winsDoubleLine,
  winsFullHouse,
  winsLetterColumn,
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

describe("winsDoubleLine", () => {
  it("requires at least two complete lines", () => {
    const marked = Array.from({ length: 5 }, () => Array(5).fill(false));
    marked[0] = [true, true, true, true, true];
    assert.equal(winsDoubleLine(marked), false);
    marked[4] = [true, true, true, true, true];
    assert.equal(winsDoubleLine(marked), true);
  });
});

describe("winsLetterColumn", () => {
  it("requires the full B column marked", () => {
    const marked = Array.from({ length: 5 }, () => Array(5).fill(false));
    for (let r = 0; r < 5; r++) marked[r]![0] = true;
    assert.equal(winsLetterColumn(marked, 0), true);
    assert.equal(figureSatisfied("LETTER_B", marked), true);
    assert.equal(figureSatisfied("LETTER_I", marked), false);
  });
});

describe("figureSatisfied", () => {
  it("maps BingoFigure enum values to win detectors", () => {
    const rowWin = Array.from({ length: 5 }, () => Array(5).fill(false));
    rowWin[1] = [true, true, true, true, true];
    assert.equal(figureSatisfied("LINE", rowWin), true);
    assert.equal(figureSatisfied("DOUBLE_LINE", rowWin), false);
    assert.equal(figureSatisfied("PERIMETER", rowWin), false);
    assert.equal(figureSatisfied("FULL_HOUSE", rowWin), false);
  });
});

describe("figureHighlightSlots", () => {
  it("DOUBLE_LINE highlights all cells in complete lines", () => {
    const marked = Array.from({ length: 5 }, () => Array(5).fill(false));
    marked[0] = [true, true, true, true, true];
    marked[4] = [true, true, true, true, true];
    const hl = figureHighlightSlots("DOUBLE_LINE", marked);
    assert.equal(hl.length, 10);
  });

  it("LETTER_N highlights column 2", () => {
    const marked = Array.from({ length: 5 }, () => Array(5).fill(false));
    for (let r = 0; r < 5; r++) marked[r]![2] = true;
    const hl = figureHighlightSlots("LETTER_N", marked);
    assert.deepEqual(
      hl.map((s) => s.col),
      [2, 2, 2, 2, 2],
    );
  });
});

describe("figureHighlightSlotsByDrawOrder", () => {
  it("highlights the line that completed first in draw order, not the topmost row at end", () => {
    const cells = fullGrid([
      [4, 25, 31, 56, 70],
      [7, 28, 39, 55, 68],
      [13, 17, 0, 57, 63],
      [11, 20, 32, 48, 69],
      [2, 27, 43, 58, 64],
    ]);
    const drawn = [
      2, 27, 43, 58, 9, 17, 40, 49, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 56, 55, 54,
      53, 52, 51, 50, 35, 36, 37, 38, 39, 24, 23, 22, 21, 20, 19, 34, 33, 48, 63, 4, 5, 6, 7, 8,
      25, 10, 11, 26, 41, 42, 57, 59, 60, 45, 44, 29, 30, 15, 14, 13, 28, 12, 3, 18, 32, 47, 62,
      61, 46,
    ];
    const hl = figureHighlightSlotsByDrawOrder("LINE", cells, drawn);
    const rows = new Set(hl.map((s) => s.row));
    assert.equal(rows.size, 1);
    assert.equal([...rows][0], 4);
    assert.equal(hl.length, 5);
  });
});
