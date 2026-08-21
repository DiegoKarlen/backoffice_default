import jwt, { type SignOptions } from "jsonwebtoken";
import { env } from "../config/env.js";

/** Backoffice `User` tokens use `user` (default). Public `Player` tokens use `player`. */
export type TokenKind = "user" | "player" | "2fa_pending";

export type AccessPayload = {
  sub: string;
  email: string;
  /** Omitted in legacy tokens → treated as backoffice user. */
  kind?: TokenKind;
  /** Backoffice session version; must match User.tokenVersion (legacy tokens → 0). */
  tv?: number;
};

export function signAccessToken(payload: AccessPayload): string {
  const secret = env.jwtSecret;
  const expiresIn = env.jwtExpiresIn as SignOptions["expiresIn"];
  const kind = payload.kind ?? "user";
  const tv = payload.tv ?? 0;
  return jwt.sign({ sub: payload.sub, email: payload.email, kind, tv }, secret, { expiresIn });
}

export function signPlayerAccessToken(payload: { sub: string; email: string; tv?: number }): string {
  return signAccessToken({ ...payload, kind: "player", tv: payload.tv ?? 0 });
}

export function signTwoFactorPendingToken(payload: { sub: string; email: string }): string {
  const secret = env.jwtSecret;
  const expiresIn = env.jwt2faExpiresIn as SignOptions["expiresIn"];
  return jwt.sign(
    { sub: payload.sub, email: payload.email, kind: "2fa_pending" },
    secret,
    { expiresIn },
  );
}

export function verifyAccessToken(token: string): AccessPayload {
  const decoded = jwt.verify(token, env.jwtSecret);
  if (typeof decoded !== "object" || decoded === null) throw new Error("Invalid token");
  const { sub, email, kind, tv } = decoded as Record<string, unknown>;
  if (typeof sub !== "string" || typeof email !== "string") {
    throw new Error("Invalid token payload");
  }
  if (kind !== undefined && kind !== "user" && kind !== "player" && kind !== "2fa_pending") {
    throw new Error("Invalid token payload");
  }
  let parsedTv: number | undefined;
  if (tv !== undefined) {
    if (typeof tv !== "number" || !Number.isInteger(tv) || tv < 0) {
      throw new Error("Invalid token payload");
    }
    parsedTv = tv;
  }
  return { sub, email, kind: kind as TokenKind | undefined, tv: parsedTv };
}
