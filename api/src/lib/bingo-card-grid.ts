export type CardGridCell = { number: number | null; isFree: boolean };

export function cellsToGrid5(
  cells: { row: number; col: number; number: number | null; isFree: boolean }[],
): CardGridCell[][] {
  const grid: CardGridCell[][] = Array.from({ length: 5 }, () =>
    Array.from({ length: 5 }, () => ({ number: null as number | null, isFree: false })),
  );
  for (const c of cells) {
    if (c.row >= 0 && c.row < 5 && c.col >= 0 && c.col < 5) {
      grid[c.row]![c.col] = { number: c.number, isFree: c.isFree };
    }
  }
  return grid;
}
