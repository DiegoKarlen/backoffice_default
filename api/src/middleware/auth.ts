import type { Request, Response, NextFunction } from "express";
import { verifyAccessToken, type AccessPayload } from "../lib/jwt.js";

export type AuthedRequest = Request & { auth?: AccessPayload };

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) {
    res.status(401).json({ error: "Missing Bearer token" });
    return;
  }
  try {
    req.auth = verifyAccessToken(token);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}
