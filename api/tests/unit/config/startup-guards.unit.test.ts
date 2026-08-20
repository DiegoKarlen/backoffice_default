import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertProductionStartupConfig,
  INSECURE_JWT_SECRETS,
} from "../../../src/config/startup-guards.js";

describe("[unit] production startup guards", () => {
  it("allows dev jwt secret outside production", () => {
    assert.doesNotThrow(() =>
      assertProductionStartupConfig({
        nodeEnv: "development",
        jwtSecret: "dev-secret-change-in-production-min-32-chars-long-ok",
      }),
    );
  });

  it("rejects known dev jwt secret in production", () => {
    for (const secret of INSECURE_JWT_SECRETS) {
      assert.throws(
        () => assertProductionStartupConfig({ nodeEnv: "production", jwtSecret: secret }),
        /JWT_SECRET/,
      );
    }
  });

  it("rejects short jwt secret in production", () => {
    assert.throws(
      () => assertProductionStartupConfig({ nodeEnv: "production", jwtSecret: "short-but-not-in-list-xyz" }),
      /at least 32 characters/,
    );
  });

  it("rejects placeholder-like jwt secret in production", () => {
    assert.throws(
      () =>
        assertProductionStartupConfig({
          nodeEnv: "production",
          jwtSecret: "my-production-change-me-secret-32chars-min",
        }),
      /placeholder/,
    );
  });

  it("accepts strong jwt secret in production", () => {
    assert.doesNotThrow(() =>
      assertProductionStartupConfig({
        nodeEnv: "production",
        jwtSecret: "a7f3c9e2b1d8046f5a8c0e3b7d9124f6c8a0e5b9d2f7c1a4e8b0d3f6a9c2e5",
      }),
    );
  });
});
