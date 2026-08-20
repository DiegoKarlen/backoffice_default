/**
 * Test runner with named suites for quick diagnostics.
 *
 * Usage (from api/):
 *   npx tsx scripts/run-tests.mts              # all
 *   npx tsx scripts/run-tests.mts unit         # fast, no DB
 *   npx tsx scripts/run-tests.mts integration  # DB scenarios
 *   npx tsx scripts/run-tests.mts prizes       # prize integration only
 *   npx tsx scripts/run-tests.mts wallet       # wallet / purchase
 *   npx tsx scripts/run-tests.mts --list
 */
import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

function globToRegExp(glob: string): RegExp {
  const normalized = glob.replace(/\\/g, "/");
  let re = "";
  for (let i = 0; i < normalized.length; ) {
    if (normalized[i] === "*" && normalized[i + 1] === "*") {
      if (normalized[i + 2] === "/") {
        re += "(?:.*/)?";
        i += 3;
      } else {
        re += ".*";
        i += 2;
      }
    } else if (normalized[i] === "*") {
      re += "[^/]*";
      i += 1;
    } else {
      re += normalized[i].replace(/[.+?^${}()|[\]\\]/g, "\\$&");
      i += 1;
    }
  }
  return new RegExp(`^${re}$`);
}

function globSync(pattern: string, opts: { cwd: string }): string[] {
  const cwd = opts.cwd;
  const re = globToRegExp(pattern.replace(/\\/g, "/"));
  const out: string[] = [];

  const walk = (relDir: string) => {
    const absDir = path.join(cwd, relDir);
    for (const name of readdirSync(absDir)) {
      const rel = relDir ? `${relDir}/${name}` : name;
      const abs = path.join(cwd, rel);
      if (statSync(abs).isDirectory()) {
        walk(rel);
      } else if (re.test(rel.replace(/\\/g, "/"))) {
        out.push(rel.replace(/\\/g, "/"));
      }
    }
  };

  walk("");
  return out;
}

const SUITES: Record<string, { pattern: string; label: string }> = {
  all: { pattern: "tests/**/*.test.ts", label: "All API tests" },
  unit: { pattern: "tests/unit/**/*.unit.test.ts", label: "Unit (no database)" },
  integration: { pattern: "tests/integration/**/*.integration.test.ts", label: "Integration (database)" },
  engine: { pattern: "tests/unit/game-engine/**/*.unit.test.ts", label: "Game engine unit" },
  lib: { pattern: "tests/unit/lib/**/*.unit.test.ts", label: "Lib unit" },
  security: { pattern: "tests/unit/middleware/**/*.unit.test.ts", label: "Security / middleware unit" },
  payments: { pattern: "tests/unit/payments/**/*.unit.test.ts", label: "Payments unit" },
  prizes: { pattern: "tests/integration/prizes/**/*.integration.test.ts", label: "Prize scenarios" },
  wallet: { pattern: "tests/integration/wallet/**/*.integration.test.ts", label: "Wallet / purchase scenarios" },
};

const arg = process.argv[2] ?? "all";

if (arg === "--list" || arg === "-h" || arg === "--help") {
  console.log("\nAPI test suites:\n");
  for (const [name, { label, pattern }] of Object.entries(SUITES)) {
    const count = globSync(pattern, { cwd: apiRoot }).length;
    console.log(`  ${name.padEnd(14)} ${label} (${count} files) — ${pattern}`);
  }
  console.log("\nExamples:");
  console.log("  npm test");
  console.log("  npm run test:unit");
  console.log("  npm run test:integration");
  console.log("  npm run test:prizes");
  console.log("  npx tsx scripts/run-tests.mts prizes\n");
  process.exit(0);
}

const suite = SUITES[arg];
if (!suite) {
  console.error(`Unknown suite "${arg}". Run with --list`);
  process.exit(1);
}

const relFiles = globSync(suite.pattern, { cwd: apiRoot }).sort();
if (relFiles.length === 0) {
  console.error(`No files matched ${suite.pattern}`);
  process.exit(1);
}

const absFiles = relFiles.map((f) => path.join(apiRoot, f));
console.log(`\n▶ ${suite.label}`);
console.log(`  pattern: ${suite.pattern}`);
console.log(`  files:   ${relFiles.length}\n`);

const result = spawnSync(
  "npx",
  ["tsx", "--test", "--test-reporter", "spec", ...absFiles],
  { cwd: apiRoot, stdio: "inherit", env: process.env, shell: true },
);

process.exit(result.status === null ? 1 : result.status);
