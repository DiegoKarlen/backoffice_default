/**
 * Filtra líneas del log diario de pagos por depósito o request.
 *
 * Uso (desde api/):
 *   npx tsx scripts/filter-payment-logs.ts --external-ref 2451
 *   npx tsx scripts/filter-payment-logs.ts --deposit-id 00ad7824-b75d-4ff9-aba5-8f95bd18b0c6
 *   npx tsx scripts/filter-payment-logs.ts --request-id d92fe96b
 *   npx tsx scripts/filter-payment-logs.ts --external-ref 2451 --date 2026-08-20
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1]) return process.argv[i + 1]!.trim();
  return undefined;
}

function localDateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const externalRef = arg("--external-ref");
const depositId = arg("--deposit-id");
const requestId = arg("--request-id");
const date = arg("--date") ?? localDateKey();

if (!externalRef && !depositId && !requestId) {
  console.error(
    "Indicá al menos uno: --external-ref <mixer_id> | --deposit-id <uuid> | --request-id <8chars>",
  );
  process.exit(1);
}

const logPath = path.join(process.cwd(), "logs", `${date}.log`);
if (!existsSync(logPath)) {
  console.error(`No existe el archivo: ${logPath}`);
  process.exit(1);
}

const needles: string[] = [];
if (externalRef) needles.push(`"externalRef":"${externalRef}"`, `"id":${externalRef}`);
if (depositId) needles.push(depositId);
if (requestId) needles.push(`"requestId":"${requestId}"`);

const lines = readFileSync(logPath, "utf8").split(/\r?\n/).filter(Boolean);
const matched = lines.filter((line) => needles.some((n) => line.includes(n)));

console.log(`# ${logPath} — ${matched.length} línea(s)`);
if (externalRef) console.log(`# externalRef: ${externalRef}`);
if (depositId) console.log(`# depositId: ${depositId}`);
if (requestId) console.log(`# requestId: ${requestId}`);
console.log("");

for (const line of matched) {
  console.log(line);
}

if (requestId && matched.length > 0) {
  console.log("");
  console.log(`# Tip: todas las líneas del mismo HTTP request comparten requestId "${requestId}"`);
}
