import { createHash } from "node:crypto";
import { pickDistinct } from "../../rng/index.js";

export type CardCellInput = {
  row: number;
  col: number;
  number: number | null;
  isFree: boolean;
};

/** Standard US 75-ball card: 5×5, columns B-I-N-G-O with disjoint ranges; center free. */
export function generateBingo75Cells(): CardCellInput[] {
  const B = pickDistinct(5, 1, 15);
  const I = pickDistinct(5, 16, 30);
  const N = pickDistinct(4, 31, 45);
  const G = pickDistinct(5, 46, 60);
  const O = pickDistinct(5, 61, 75);

  const cells: CardCellInput[] = [];
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 5; c++) {
      if (r === 2 && c === 2) {
        cells.push({ row: r, col: c, number: null, isFree: true });
        continue;
      }
      let num: number;
      if (c === 0) num = B[r]!;
      else if (c === 1) num = I[r]!;
      else if (c === 2) {
        const ni = r < 2 ? r : r - 1;
        num = N[ni]!;
      } else if (c === 3) num = G[r]!;
      else num = O[r]!;
      cells.push({ row: r, col: c, number: num, isFree: false });
    }
  }
  return cells;
}

export function fingerprintCells(cells: CardCellInput[]): string {
  const sorted = [...cells].sort((a, b) => a.row - b.row || a.col - b.col);
  const payload = sorted
    .map((c) => `${c.row},${c.col},${c.isFree ? "F" : String(c.number)}`)
    .join("|");
  return createHash("sha256").update(payload, "utf8").digest("hex");
}
