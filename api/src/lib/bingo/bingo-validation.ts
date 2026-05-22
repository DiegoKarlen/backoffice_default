export function validateScheduleBounds(start: Date, end: Date | null | undefined): string | null {
  if (end != null && end.getTime() < start.getTime()) {
    return "endDateTime must be on or after startDateTime";
  }
  return null;
}

export function validateBingo(body: {
  repeatEveryMinutes?: number | null;
  cardPrice?: unknown;
  minPlayersToStart?: number;
}): string | null {
  if (body.repeatEveryMinutes != null && body.repeatEveryMinutes < 1) {
    return "repeatEveryMinutes must be >= 1";
  }
  if (body.cardPrice !== undefined) {
    const n = Number(String(body.cardPrice).replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return "cardPrice must be a positive number";
  }
  if (body.minPlayersToStart !== undefined && body.minPlayersToStart < 1) {
    return "minPlayersToStart must be >= 1";
  }
  return null;
}
