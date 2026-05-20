import jwt, { type SignOptions } from "jsonwebtoken";

/** Backoffice `User` tokens use `user` (default). Public `Player` tokens use `player`. */
export type TokenKind = "user" | "player" | "2fa_pending";

export type AccessPayload = {
  sub: string;
  email: string;
  /** Omitted in legacy tokens → treated as backoffice user. */
  kind?: TokenKind;
};

export function signAccessToken(payload: AccessPayload): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  const expiresIn = (process.env.JWT_EXPIRES_IN ?? "8h") as SignOptions["expiresIn"];
  const kind = payload.kind ?? "user";
  return jwt.sign({ sub: payload.sub, email: payload.email, kind }, secret, { expiresIn });
}

export function signPlayerAccessToken(payload: { sub: string; email: string }): string {
  return signAccessToken({ ...payload, kind: "player" });
}

/** Short-lived JWT after correct password when TOTP is enabled (not valid for `requireAuth`). */
export function signTwoFactorPendingToken(payload: { sub: string; email: string }): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  const expiresIn = (process.env.JWT_2FA_EXPIRES_IN ?? "5m") as SignOptions["expiresIn"];
  return jwt.sign(
    { sub: payload.sub, email: payload.email, kind: "2fa_pending" },
    secret,
    { expiresIn },
  );
}

export function verifyAccessToken(token: string): AccessPayload {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is not set");
  const decoded = jwt.verify(token, secret);
  if (typeof decoded !== "object" || decoded === null) throw new Error("Invalid token");
  const { sub, email, kind } = decoded as Record<string, unknown>;
  if (typeof sub !== "string" || typeof email !== "string") {
    throw new Error("Invalid token payload");
  }
  if (kind !== undefined && kind !== "user" && kind !== "player" && kind !== "2fa_pending") {
    throw new Error("Invalid token payload");
  }
  return { sub, email, kind: kind as TokenKind | undefined };
}
