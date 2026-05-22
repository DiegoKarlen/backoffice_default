import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { escapeHtml, formatDecimalPrice, formatMoneyFromCents } from "../../src/index.js";

describe("[unit][shared] format helpers", () => {
  it("escapeHtml escapes special chars", () => {
    assert.equal(escapeHtml(`a & b <c> "d"`), "a &amp; b &lt;c&gt; &quot;d&quot;");
  });

  it("formatMoneyFromCents", () => {
    assert.match(formatMoneyFromCents(1050, "ARS"), /10,50/);
    assert.match(formatMoneyFromCents(1050, "ARS"), /ARS/);
  });

  it("formatDecimalPrice", () => {
    assert.match(formatDecimalPrice("10.5", "ARS"), /10,50/);
  });
});
