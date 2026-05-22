import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Logic mirror of live-draw-auth (no env import — avoids bootstrapping full AppEnv in unit tests).
 */
function wouldAuthorize(params: {
  liveDrawAuthOptional: boolean;
  serverSecret?: string;
  headerKey?: string;
  bearerValid: boolean;
}): boolean {
  if (params.liveDrawAuthOptional) return true;
  if (params.serverSecret && params.headerKey === params.serverSecret) return true;
  return params.bearerValid;
}

describe("requireLiveDrawAuth rules", () => {
  it("allows all when optional", () => {
    assert.equal(
      wouldAuthorize({ liveDrawAuthOptional: true, bearerValid: false }),
      true,
    );
  });

  it("allows matching display key", () => {
    assert.equal(
      wouldAuthorize({
        liveDrawAuthOptional: false,
        serverSecret: "sekrit",
        headerKey: "sekrit",
        bearerValid: false,
      }),
      true,
    );
  });

  it("denies without key or bearer when required", () => {
    assert.equal(
      wouldAuthorize({
        liveDrawAuthOptional: false,
        serverSecret: "sekrit",
        bearerValid: false,
      }),
      false,
    );
  });
});
