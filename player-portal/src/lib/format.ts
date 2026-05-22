import { formatDecimalPrice as sharedDecimal, formatMoneyFromCents } from "@shared/index.ts";

export function formatMoney(cents: number, currencyCode: string): string {
  return formatMoneyFromCents(cents, currencyCode);
}

export { sharedDecimal as formatDecimalPrice };

export function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("es-AR", {
      weekday: "short",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function translatePlayerApiError(message: string): string {
  const pairs: Array<[string, string]> = [
    ["Insufficient balance", "Saldo insuficiente para esta compra."],
    ["Round is not open for purchases", "Esta partida ya no admite compras."],
    ["Bingo is not active", "El bingo no está activo."],
    ["Only BINGO_75 carton purchase is implemented", "Solo se pueden comprar cartones en bingos tipo 75."],
    ["quantity must be between", "Cantidad no válida (debe ser entre 1 y 99)."],
    ["Round not found", "Partida no encontrada."],
    ["Player not found", "Jugador no encontrado."],
    ["Player is inactive", "Tu cuenta está desactivada."],
    ["Invalid credentials", "Email o contraseña incorrectos."],
    ["Unauthorized", "No autorizado. Iniciá sesión de nuevo."],
    ["Email or username already registered", "Ese email o usuario ya está registrado."],
  ];
  for (const [en, es] of pairs) {
    if (message.includes(en)) return es;
  }
  return message;
}

export function friendlyError(err: unknown): string {
  if (!(err instanceof Error)) return "Error desconocido.";
  if (err.message === "Failed to fetch") {
    return "No se pudo conectar con el servidor. Comprobá que la API esté en marcha.";
  }
  return translatePlayerApiError(err.message);
}
