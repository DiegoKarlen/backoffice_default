import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";

type LogLevel = "info" | "warn" | "error";

const LOG_DIR = path.join(process.cwd(), "logs");

function ensureLogDir(): void {
  mkdirSync(LOG_DIR, { recursive: true });
}

/** Local calendar date `YYYY-MM-DD` for daily log file names. */
function logFileDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function logFilePath(date = new Date()): string {
  return path.join(LOG_DIR, `${logFileDateKey(date)}.log`);
}

function serializeDetail(detail: unknown): string {
  if (detail === undefined) return "";
  try {
    return ` ${JSON.stringify(detail)}`;
  } catch {
    return ` ${String(detail)}`;
  }
}

function writeLogFile(level: LogLevel, scope: string, message: string, detail?: unknown): void {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] [${scope}] ${message}${serializeDetail(detail)}\n`;
  try {
    ensureLogDir();
    appendFileSync(logFilePath(), line, "utf8");
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[logger] failed to write log file", err);
  }
}

function line(level: LogLevel, scope: string, message: string, detail?: unknown): void {
  const ts = new Date().toISOString();
  const prefix = `[${ts}] [${level}] [${scope}]`;
  if (detail !== undefined) {
    // eslint-disable-next-line no-console
    console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](prefix, message, detail);
  } else {
    // eslint-disable-next-line no-console
    console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](prefix, message);
  }
  writeLogFile(level, scope, message, detail);
}

export function logInfo(scope: string, message: string, detail?: unknown): void {
  line("info", scope, message, detail);
}

export function logWarn(scope: string, message: string, detail?: unknown): void {
  line("warn", scope, message, detail);
}

export function logError(scope: string, message: string, detail?: unknown): void {
  line("error", scope, message, detail);
}

/** Absolute path to today's log file (for ops / QA). */
export function getTodayLogFilePath(): string {
  ensureLogDir();
  return logFilePath();
}
