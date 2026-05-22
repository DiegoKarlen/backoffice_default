import type { Request, Response, NextFunction } from "express";
import { env } from "../config/env.js";
import { verifyAccessToken } from "../lib/jwt.js";

function bearerToken(req: Request): string | undefined {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return undefined;
  return header.slice(7).trim() || undefined;
}

function headerDrawKey(req: Request): string | undefined {
  const raw = req.headers["x-bingo-display-key"];
  if (typeof raw === "string") return raw.trim() || undefined;
  if (Array.isArray(raw) && typeof raw[0] === "string") return raw[0].trim() || undefined;
  return undefined;
}

function isAuthorizedDrawKey(key: string | undefined): boolean {
  const secret = env.bingoDisplayDrawSecret;
  if (!secret || !key) return false;
  return key === secret;
}

function isAuthorizedBearer(token: string | undefined): boolean {
  if (!token) return false;
  try {
    const auth = verifyAccessToken(token);
    if (auth.kind === "2fa_pending" || auth.kind === "player") return false;
    return auth.kind === "display" || auth.kind === "user" || auth.kind === undefined;
  } catch {
    return false;
  }
}

/**
 * Protects bingo Live operator endpoints (`draw-ball`, `stop`).
 * Skipped when `LIVE_DRAW_AUTH_OPTIONAL=true` (default in non-production).
 *
 * Accepts:
 * - `X-Bingo-Display-Key` matching `BINGO_DISPLAY_DRAW_SECRET`
 * - `Authorization: Bearer` backoffice user JWT or `kind: display` operator JWT
 */
export function requireLiveDrawAuth(req: Request, res: Response, next: NextFunction): void {
  if (env.liveDrawAuthOptional) {
    next();
    return;
  }

  if (isAuthorizedDrawKey(headerDrawKey(req)) || isAuthorizedBearer(bearerToken(req))) {
    next();
    return;
  }

  res.status(401).json({
    error: "Live draw authentication required",
    hint: "Use X-Bingo-Display-Key, Bearer backoffice token, or POST /public/bingos/live/operator-token",
  });
}
