import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeReconnectDelayMs,
  DEFAULT_SSE_BACKOFF_FACTOR,
  DEFAULT_SSE_MAX_RECONNECT_MS,
  DEFAULT_SSE_RECONNECT_MS,
} from "../../src/sse.js";

describe("[unit][shared] SSE reconnect backoff", () => {
  const opts = {
    baseMs: DEFAULT_SSE_RECONNECT_MS,
    maxMs: DEFAULT_SSE_MAX_RECONNECT_MS,
    factor: DEFAULT_SSE_BACKOFF_FACTOR,
  };

  it("first retry uses base delay", () => {
    assert.equal(computeReconnectDelayMs(1, opts), 2000);
  });

  it("increases delay with attempt until cap", () => {
    assert.equal(computeReconnectDelayMs(2, opts), 3000);
    assert.equal(computeReconnectDelayMs(3, opts), 4500);
    assert.ok(computeReconnectDelayMs(10, opts) <= DEFAULT_SSE_MAX_RECONNECT_MS);
  });

  it("attempt 0 returns base (immediate reconnect scheduling uses attempt>=1)", () => {
    assert.equal(computeReconnectDelayMs(0, opts), 2000);
  });
});
