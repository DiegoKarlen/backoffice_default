/** Cartón con metadatos para desempate estable (misma bolilla o misma pasada). */
export type TieBreakCard = {
  id: string;
  createdAt: Date;
  cardIndex: number;
};

/**
 * Orden de desempate: compra más antigua → menor `cardIndex` → `id` lexicográfico.
 */
export function compareCardsForTieBreak(a: TieBreakCard, b: TieBreakCard): number {
  const t = a.createdAt.getTime() - b.createdAt.getTime();
  if (t !== 0) return t;
  if (a.cardIndex !== b.cardIndex) return a.cardIndex - b.cardIndex;
  return a.id.localeCompare(b.id);
}

export function sortCardsForTieBreak<T extends TieBreakCard>(cards: readonly T[]): T[] {
  return [...cards].sort(compareCardsForTieBreak);
}
