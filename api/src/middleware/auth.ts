import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken, type AccessPayload } from "../lib/jwt.js";

export type AuthedRequest = Request & { auth?: AccessPayload };

/** Legacy JWTs have no `kind` → backoffice user. */
function isBackofficeToken(auth: AccessPayload): boolean {
  return auth.kind !== "player";
}

/**
 * Backoffice admin (`User`) routes: rejects player app tokens.
 */
export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) {
    res.status(401).json({ error: "Missing Bearer token" });
    return;
  }
  try {
    const auth = verifyAccessToken(token);
    if (auth.kind === "2fa_pending") {
      res.status(401).json({ error: "Two-factor authentication required" });
      return;
    }
    if (!isBackofficeToken(auth)) {
      res.status(403).json({ error: "Player token cannot access backoffice routes" });
      return;
    }
    req.auth = auth;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

/** Public player API: requires JWT with `kind: player`. Sets `req.auth`. */
export function requirePlayer(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) {
    res.status(401).json({ error: "Missing Bearer token" });
    return;
  }
  try {
    const auth = verifyAccessToken(token);
    if (auth.kind !== "player") {
      res.status(403).json({ error: "Player authentication required" });
      return;
    }
    req.auth = auth;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
