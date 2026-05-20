/** Convert configured bingo `cardPrice` (decimal string) to integer cents. */
export function decimalPriceToCents(d: { toString(): string } | string | number): number {
  const s = typeof d === "string" ? d : String(d);
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error("Invalid decimal amount");
  }
  return Math.round(n * 100);
}
