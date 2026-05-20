import type { BingoFigure } from "@prisma/client";

export type Bingo75Cell = {
  row: number;
  col: number;
  number: number | null;
  isFree: boolean;
};

const SIZE = 5;

export const BINGO_FIGURE_EVAL_ORDER: BingoFigure[] = ["LINE", "PERIMETER", "FULL_HOUSE"];

export function buildMarkedGrid(cells: Bingo75Cell[], drawn: ReadonlySet<number>): boolean[][] {
  const m: boolean[][] = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
  for (const c of cells) {
    if (c.row < 0 || c.row >= SIZE || c.col < 0 || c.col >= SIZE) continue;
    const hit = c.isFree || (c.number != null && drawn.has(c.number));
    m[c.row]![c.col] = hit;
  }
  return m;
}

export function winsLine(marked: boolean[][]): boolean {
  for (let r = 0; r < SIZE; r++) {
    if (marked[r]!.every(Boolean)) return true;
  }
  for (let c = 0; c < SIZE; c++) {
    let colOk = true;
    for (let r = 0; r < SIZE; r++) {
      if (!marked[r]![c]) {
        colOk = false;
        break;
      }
    }
    if (colOk) return true;
  }
  let d1 = true;
  let d2 = true;
  for (let i = 0; i < SIZE; i++) {
    if (!marked[i]![i]) d1 = false;
    if (!marked[i]![SIZE - 1 - i]) d2 = false;
  }
  return d1 || d2;
}

export function winsPerimeter(marked: boolean[][]): boolean {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const edge = r === 0 || r === SIZE - 1 || c === 0 || c === SIZE - 1;
      if (edge && !marked[r]![c]) return false;
    }
  }
  return true;
}

export function winsFullHouse(marked: boolean[][]): boolean {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!marked[r]![c]) return false;
    }
  }
  return true;
}

export function figureSatisfied(figure: BingoFigure, marked: boolean[][]): boolean {
  switch (figure) {
    case "LINE":
      return winsLine(marked);
    case "PERIMETER":
      return winsPerimeter(marked);
    case "FULL_HOUSE":
      return winsFullHouse(marked);
    default:
      return false;
  }
}

export function firstCompleteLineSlots(marked: boolean[][]): { row: number; col: number }[] | null {
  for (let r = 0; r < SIZE; r++) {
    if (marked[r]!.every(Boolean)) {
      return Array.from({ length: SIZE }, (_, c) => ({ row: r, col: c }));
    }
  }
  for (let c = 0; c < SIZE; c++) {
    let colOk = true;
    for (let r = 0; r < SIZE; r++) {
      if (!marked[r]![c]) {
        colOk = false;
        break;
      }
    }
    if (colOk) return Array.from({ length: SIZE }, (_, r) => ({ row: r, col: c }));
  }
  let d1 = true;
  for (let i = 0; i < SIZE; i++) {
    if (!marked[i]![i]) d1 = false;
  }
  if (d1) return Array.from({ length: SIZE }, (_, i) => ({ row: i, col: i }));
  let d2 = true;
  for (let i = 0; i < SIZE; i++) {
    if (!marked[i]![SIZE - 1 - i]) d2 = false;
  }
  if (d2) return Array.from({ length: SIZE }, (_, i) => ({ row: i, col: SIZE - 1 - i }));
  return null;
}

export function figureHighlightSlots(figure: BingoFigure, marked: boolean[][]): { row: number; col: number }[] {
  switch (figure) {
    case "FULL_HOUSE": {
      const out: { row: number; col: number }[] = [];
      for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) out.push({ row: r, col: c });
      return out;
    }
    case "PERIMETER": {
      const out: { row: number; col: number }[] = [];
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          if (r === 0 || r === SIZE - 1 || c === 0 || c === SIZE - 1) out.push({ row: r, col: c });
        }
      }
      return out;
    }
    case "LINE":
      return firstCompleteLineSlots(marked) ?? [];
    default:
      return [];
  }
}
