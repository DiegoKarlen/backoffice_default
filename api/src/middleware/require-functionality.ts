import type { Response, NextFunction } from "express";
import { httpError } from "../lib/route-helpers.js";
import {
  loadBackofficeUserContext,
  userHasAnyFunctionality,
  userHasEveryFunctionality,
  type BackofficeUserContext,
} from "../lib/user-permissions.js";
import type { AuthedRequest } from "./auth.js";

export type AuthedBackofficeRequest = AuthedRequest & { backofficeUser?: BackofficeUserContext };

async function attachBackofficeUser(req: AuthedBackofficeRequest, res: Response): Promise<BackofficeUserContext | null> {
  if (req.backofficeUser) return req.backofficeUser;

  const sub = req.auth?.sub;
  if (!sub) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }

  const ctx = await loadBackofficeUserContext(sub);
  if (!ctx || !ctx.active) {
    res.status(401).json({ error: "User inactive or not found" });
    return null;
  }

  req.backofficeUser = ctx;
  return ctx;
}

/** Requires every listed functionality (AND). Run after `requireAuth`. */
export function requireFunctionality(...codes: string[]) {
  return async (req: AuthedBackofficeRequest, res: Response, next: NextFunction): Promise<void> => {
    const ctx = await attachBackofficeUser(req, res);
    if (!ctx) return;

    if (!userHasEveryFunctionality(ctx, codes)) {
      res.status(403).json({
        error: "Forbidden",
        missing: codes.filter((c) => !ctx.functionalityCodes.has(c)),
      });
      return;
    }

    next();
  };
}

/** Requires at least one listed functionality (OR). Run after `requireAuth`. */
export function requireAnyFunctionality(...codes: string[]) {
  return async (req: AuthedBackofficeRequest, res: Response, next: NextFunction): Promise<void> => {
    const ctx = await attachBackofficeUser(req, res);
    if (!ctx) return;

    if (!userHasAnyFunctionality(ctx, codes)) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }

    next();
  };
}

/** Load active backoffice user context (for route handlers). */
export async function requireBackofficeUser(req: AuthedBackofficeRequest, res: Response): Promise<BackofficeUserContext | null> {
  return attachBackofficeUser(req, res);
}

/** Helper for handlers that need ctx after middleware. */
export function getBackofficeUser(req: AuthedBackofficeRequest): BackofficeUserContext {
  const ctx = req.backofficeUser;
  if (!ctx) throw httpError(401, "Unauthorized");
  return ctx;
}
