import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";
import { logInfo } from "./logger.js";

export type HttpTrafficLogOptions = {
  scope: string;
  sanitizeHeaders?: (headers: Record<string, string | string[] | undefined>) => Record<string, unknown>;
  summarizeRequestBody?: (body: unknown) => unknown;
};

export type TrafficLoggedRequest = Request & { trafficLogId?: string };

/** Logs request on entry and response on `finish` (status, duration, JSON body if any). */
export function createHttpTrafficLogger(options: HttpTrafficLogOptions) {
  return (req: TrafficLoggedRequest, res: Response, next: NextFunction): void => {
    const started = Date.now();
    const requestId = randomUUID().slice(0, 8);
    req.trafficLogId = requestId;

    logInfo(options.scope, "request in", {
      requestId,
      method: req.method,
      path: req.originalUrl,
      ip: req.ip,
      headers: options.sanitizeHeaders?.(req.headers) ?? {},
      body: options.summarizeRequestBody?.(req.body) ?? req.body,
    });

    let responseBody: unknown;
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      responseBody = body;
      return originalJson(body);
    };

    res.on("finish", () => {
      logInfo(options.scope, "response out", {
        requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Date.now() - started,
        body: responseBody,
      });
    });

    next();
  };
}
