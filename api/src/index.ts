import "dotenv/config";
import { bootstrapLiveSessionsFromDatabase } from "./bootstrap/live-sessions.js";
import { env } from "./config/env.js";
import { assertProductionStartupConfig } from "./config/startup-guards.js";
import { createApp } from "./create-app.js";
import { logError, logInfo, getTodayLogFilePath } from "./lib/logger.js";

assertProductionStartupConfig({ jwtSecret: env.jwtSecret });

const app = createApp();

async function startServer(): Promise<void> {
  await bootstrapLiveSessionsFromDatabase();
  app.listen(env.port, () => {
    logInfo("api", "listening", {
      url: `http://localhost:${env.port}`,
      logFile: getTodayLogFilePath(),
    });
  });
}

void startServer().catch((err) => {
  logError("api", "failed to start", err);
  process.exit(1);
});
