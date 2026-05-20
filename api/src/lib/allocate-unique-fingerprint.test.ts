import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  allocateWithUniqueFingerprint,
  DuplicateFingerprintError,
} from "./allocate-unique-fingerprint.js";

describe("allocateWithUniqueFingerprint", () => {
  it("returns first value when fingerprint is free", async () => {
    const result = await allocateWithUniqueFingerprint({
      maxAttempts: 5,
      generate: () => ({ n: 1 }),
      getFingerprint: () => "fp-a",
      isTaken: async () => false,
      persist: async () => {},
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.deepEqual(result.value, { n: 1 });
      assert.equal(result.fingerprint, "fp-a");
    }
  });

  it("skips fingerprints already taken (pre-insert check)", async () => {
    const taken = new Set(["fp-clash"]);
    let attempts = 0;

    const result = await allocateWithUniqueFingerprint({
      maxAttempts: 5,
      generate: () => {
        attempts++;
        return { n: attempts };
      },
      getFingerprint: (v) => (v.n === 1 ? "fp-clash" : "fp-ok"),
      isTaken: async (fp) => taken.has(fp),
      persist: async () => {},
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.fingerprint, "fp-ok");
      assert.equal(attempts, 2);
    }
  });

  it("retries when persist reports duplicate (race / unique constraint)", async () => {
    const persisted = new Set<string>();
    let attempts = 0;

    const result = await allocateWithUniqueFingerprint({
      maxAttempts: 5,
      generate: () => {
        attempts++;
        return { n: attempts };
      },
      getFingerprint: (v) => `fp-${v.n}`,
      isTaken: async () => false,
      persist: async (_value, fp) => {
        if (fp === "fp-1") throw new DuplicateFingerprintError();
        persisted.add(fp);
      },
    });

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.fingerprint, "fp-2");
      assert.deepEqual([...persisted], ["fp-2"]);
      assert.equal(attempts, 2);
    }
  });

  it("returns exhausted after maxAttempts", async () => {
    const result = await allocateWithUniqueFingerprint({
      maxAttempts: 3,
      generate: () => ({ n: 1 }),
      getFingerprint: () => "always-taken",
      isTaken: async () => true,
      persist: async () => {},
    });

    assert.deepEqual(result, { ok: false, reason: "exhausted" });
  });
});
