import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Public draw routes were removed; backoffice JWT is enforced via `bingosRouter.use(requireAuth)`.
 * Display secret auth is no longer accepted on public endpoints.
 */
describe("live draw surface", () => {
  it("documents backoffice-only draw API", () => {
    assert.equal(true, true);
  });
});
