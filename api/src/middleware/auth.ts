import type { Response, NextFunction } from "express";
import { verifyAccessToken, type AccessPayload } from "../lib/jwt.js";
import {
  ACCOUNT_INACTIVE_OR_NOT_FOUND,
  checkBackofficeSession,
  checkPlayerSession,
  SESSION_INVALID,
} from "../lib/auth-revalidation.js";
import { asyncHandler } from "./async-handler.js";

export type AuthedRequest = import("express").Request & { auth?: AccessPayload };

/** Legacy JWTs have no `kind` → backoffice user. */
function isBackofficeToken(auth: AccessPayload): boolean {
  return auth.kind !== "player";
}

function readBearerToken(req: { headers: { authorization?: string } }): string | undefined {
  const header = req.headers.authorization;
  return header?.startsWith("Bearer ") ? header.slice(7) : undefined;
}

/**
 * Backoffice admin (`User`) routes: rejects player app tokens; revalidates user is active in DB.
 */
export const requireAuth = asyncHandler(async (req: AuthedRequest, res: Response, next: NextFunction) => {
  const token = readBearerToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing Bearer token" });
    return;
  }

  let auth: AccessPayload;
  try {
    auth = verifyAccessToken(token);
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  if (auth.kind === "2fa_pending") {
    res.status(401).json({ error: "Two-factor authentication required" });
    return;
  }
  if (!isBackofficeToken(auth)) {
    res.status(403).json({ error: "Player token cannot access backoffice routes" });
    return;
  }

  const session = await checkBackofficeSession(auth.sub, auth.tv);
  if (session === "inactive") {
    res.status(401).json({ error: ACCOUNT_INACTIVE_OR_NOT_FOUND });
    return;
  }
  if (session === "stale_token") {
    res.status(401).json({ error: SESSION_INVALID });
    return;
  }

  req.auth = auth;
  next();
});

/** Public player API: requires JWT with `kind: player`; revalidates player is active in DB. */
export const requirePlayer = asyncHandler(async (req: AuthedRequest, res: Response, next: NextFunction) => {
  const token = readBearerToken(req);
  if (!token) {
    res.status(401).json({ error: "Missing Bearer token" });
    return;
  }

  let auth: AccessPayload;
  try {
    auth = verifyAccessToken(token);
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  if (auth.kind !== "player") {
    res.status(403).json({ error: "Player authentication required" });
    return;
  }

  const session = await checkPlayerSession(auth.sub, auth.tv);
  if (session === "inactive") {
    res.status(401).json({ error: ACCOUNT_INACTIVE_OR_NOT_FOUND });
    return;
  }
  if (session === "stale_token") {
    res.status(401).json({ error: SESSION_INVALID });
    return;
  }

  req.auth = auth;
  next();
});
