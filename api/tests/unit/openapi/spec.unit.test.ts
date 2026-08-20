import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildOpenApiDocument } from "../../../src/openapi/spec.js";

describe("[unit] OpenAPI spec", () => {
  it("builds a valid document with core paths", () => {
    const doc = buildOpenApiDocument({ serverUrl: "http://localhost:4001" });
    assert.equal(doc.openapi, "3.0.3");
    assert.ok(doc.paths["/health"]?.get);
    assert.ok(doc.paths["/auth/login"]?.post);
    assert.ok(doc.paths["/backoffice/bingos/live/draw-ball"]?.post);
    assert.ok(doc.paths["/public/bingos/live/state"]?.get);
    assert.ok(doc.components?.securitySchemes?.backofficeBearer);
    assert.ok(doc.components?.securitySchemes?.playerBearer);
  });
});
