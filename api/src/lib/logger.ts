type LogLevel = "info" | "warn" | "error";

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
