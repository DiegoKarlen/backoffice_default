import type { BingoFigure } from "@prisma/client";

export type Bingo75Cell = {
  row: number;
  col: number;
  number: number | null;
  isFree: boolean;
};

const SIZE = 5;

/** Orden de evaluación: figuras más fáciles antes; cartón lleno cierra la partida. */
export const BINGO_FIGURE_EVAL_ORDER: BingoFigure[] = [
  "LINE",
  "DOUBLE_LINE",
  "LETTER_B",
  "LETTER_I",
  "LETTER_N",
  "LETTER_G",
  "LETTER_O",
  "PERIMETER",
  "JACKPOT",
  "FULL_HOUSE",
];

const LETTER_FIGURE_COL: Partial<Record<BingoFigure, number>> = {
  LETTER_B: 0,
  LETTER_I: 1,
  LETTER_N: 2,
  LETTER_G: 3,
  LETTER_O: 4,
};

export function buildMarkedGrid(cells: Bingo75Cell[], drawn: ReadonlySet<number>): boolean[][] {
  const m: boolean[][] = Array.from({ length: SIZE }, () => Array(SIZE).fill(false));
  for (const c of cells) {
    if (c.row < 0 || c.row >= SIZE || c.col < 0 || c.col >= SIZE) continue;
    const hit = c.isFree || (c.number != null && drawn.has(c.number));
    m[c.row]![c.col] = hit;
  }
  return m;
}

function isRowComplete(marked: boolean[][], row: number): boolean {
  return marked[row]!.every(Boolean);
}

function isColComplete(marked: boolean[][], col: number): boolean {
  for (let r = 0; r < SIZE; r++) {
    if (!marked[r]![col]) return false;
  }
  return true;
}

function isDiag1Complete(marked: boolean[][]): boolean {
  for (let i = 0; i < SIZE; i++) {
    if (!marked[i]![i]) return false;
  }
  return true;
}

function isDiag2Complete(marked: boolean[][]): boolean {
  for (let i = 0; i < SIZE; i++) {
    if (!marked[i]![SIZE - 1 - i]) return false;
  }
  return true;
}

function countCompleteLines(marked: boolean[][]): number {
  let n = 0;
  for (let r = 0; r < SIZE; r++) {
    if (isRowComplete(marked, r)) n++;
  }
  for (let c = 0; c < SIZE; c++) {
    if (isColComplete(marked, c)) n++;
  }
  if (isDiag1Complete(marked)) n++;
  if (isDiag2Complete(marked)) n++;
  return n;
}

function pushUniqueSlot(
  out: { row: number; col: number }[],
  seen: Set<string>,
  row: number,
  col: number,
): void {
  const k = `${row},${col}`;
  if (seen.has(k)) return;
  seen.add(k);
  out.push({ row, col });
}

function allCompleteLineSlots(marked: boolean[][]): { row: number; col: number }[] {
  const out: { row: number; col: number }[] = [];
  const seen = new Set<string>();
  for (let r = 0; r < SIZE; r++) {
    if (!isRowComplete(marked, r)) continue;
    for (let c = 0; c < SIZE; c++) pushUniqueSlot(out, seen, r, c);
  }
  for (let c = 0; c < SIZE; c++) {
    if (!isColComplete(marked, c)) continue;
    for (let r = 0; r < SIZE; r++) pushUniqueSlot(out, seen, r, c);
  }
  if (isDiag1Complete(marked)) {
    for (let i = 0; i < SIZE; i++) pushUniqueSlot(out, seen, i, i);
  }
  if (isDiag2Complete(marked)) {
    for (let i = 0; i < SIZE; i++) pushUniqueSlot(out, seen, i, SIZE - 1 - i);
  }
  return out;
}

export function winsLine(marked: boolean[][]): boolean {
  return countCompleteLines(marked) >= 1;
}

export function winsDoubleLine(marked: boolean[][]): boolean {
  return countCompleteLines(marked) >= 2;
}

export function winsLetterColumn(marked: boolean[][], col: number): boolean {
  return isColComplete(marked, col);
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
    case "DOUBLE_LINE":
      return winsDoubleLine(marked);
    case "LETTER_B":
      return winsLetterColumn(marked, 0);
    case "LETTER_I":
      return winsLetterColumn(marked, 1);
    case "LETTER_N":
      return winsLetterColumn(marked, 2);
    case "LETTER_G":
      return winsLetterColumn(marked, 3);
    case "LETTER_O":
      return winsLetterColumn(marked, 4);
    case "PERIMETER":
      return winsPerimeter(marked);
    case "JACKPOT":
    case "FULL_HOUSE":
      return winsFullHouse(marked);
    default:
      return false;
  }
}

export function firstCompleteLineSlots(marked: boolean[][]): { row: number; col: number }[] | null {
  for (let r = 0; r < SIZE; r++) {
    if (isRowComplete(marked, r)) {
      return Array.from({ length: SIZE }, (_, c) => ({ row: r, col: c }));
    }
  }
  for (let c = 0; c < SIZE; c++) {
    if (isColComplete(marked, c)) {
      return Array.from({ length: SIZE }, (_, r) => ({ row: r, col: c }));
    }
  }
  if (isDiag1Complete(marked)) {
    return Array.from({ length: SIZE }, (_, i) => ({ row: i, col: i }));
  }
  if (isDiag2Complete(marked)) {
    return Array.from({ length: SIZE }, (_, i) => ({ row: i, col: SIZE - 1 - i }));
  }
  return null;
}

function letterColumnSlots(col: number): { row: number; col: number }[] {
  return Array.from({ length: SIZE }, (_, r) => ({ row: r, col }));
}

export function figureHighlightSlots(figure: BingoFigure, marked: boolean[][]): { row: number; col: number }[] {
  switch (figure) {
    case "FULL_HOUSE":
    case "JACKPOT": {
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
    case "DOUBLE_LINE":
      return winsDoubleLine(marked) ? allCompleteLineSlots(marked) : [];
    case "LETTER_B":
    case "LETTER_I":
    case "LETTER_N":
    case "LETTER_G":
    case "LETTER_O": {
      const col = LETTER_FIGURE_COL[figure];
      if (col == null || !winsLetterColumn(marked, col)) return [];
      return letterColumnSlots(col);
    }
    default:
      return [];
  }
}

/** Índice de bolilla (0-based) en la que la figura se cumple por primera vez en este cartón. */
export function figureCompletionDrawIndex(
  figure: BingoFigure,
  cells: Bingo75Cell[],
  drawnNumbersOrdered: readonly number[],
): number {
  const drawn = new Set<number>();
  for (let i = 0; i < drawnNumbersOrdered.length; i++) {
    drawn.add(drawnNumbersOrdered[i]!);
    const marked = buildMarkedGrid(cells, drawn);
    if (figureSatisfied(figure, marked)) return i;
  }
  return -1;
}

/**
 * Celdas a resaltar según el momento en que la figura se cumplió (orden de sorteo),
 * no el estado final del cartón (varias líneas pueden estar completas al cierre).
 */
export function figureHighlightSlotsByDrawOrder(
  figure: BingoFigure,
  cells: Bingo75Cell[],
  drawnNumbersOrdered: readonly number[],
): { row: number; col: number }[] {
  const drawn = new Set<number>();
  for (let i = 0; i < drawnNumbersOrdered.length; i++) {
    drawn.add(drawnNumbersOrdered[i]!);
    const marked = buildMarkedGrid(cells, drawn);
    if (figureSatisfied(figure, marked)) {
      return figureHighlightSlots(figure, marked);
    }
  }
  const allDrawn = new Set(drawnNumbersOrdered);
  return figureHighlightSlots(figure, buildMarkedGrid(cells, allDrawn));
}
