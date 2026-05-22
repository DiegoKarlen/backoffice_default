import assert from "node:assert/strict";
import {
  fingerprintCells as fpCells,
  generateBingo75Cells,
  type CardCellInput,
} from "../../../src/game-engine/bingo/bingo-75/player-card.js";

export function alignRow0FromSource(target: CardCellInput[], source: CardCellInput[]): void {
  for (let col = 0; col < 5; col++) {
    const s = source.find((c) => c.row === 0 && c.col === col);
    const t = target.find((c) => c.row === 0 && c.col === col);
    assert.ok(s && t);
    t.number = s.number;
    t.isFree = s.isFree;
  }
}

export function twoDistinctCardsSameRow0(): [CardCellInput[], CardCellInput[]] {
  const a = generateBingo75Cells();
  let b = generateBingo75Cells();
  alignRow0FromSource(b, a);
  let guard = 0;
  while (guard++ < 50) {
    const fa = fpCells(a);
    const fb = fpCells(b);
    if (fa !== fb) return [a, b];
    b = generateBingo75Cells();
    alignRow0FromSource(b, a);
  }
  throw new Error("could not produce two distinct card fingerprints");
}

export function row0DrawnNumbers(cells: CardCellInput[]): number[] {
  return cells
    .filter((c) => c.row === 0 && !c.isFree && c.number != null)
    .map((c) => c.number as number);
}
