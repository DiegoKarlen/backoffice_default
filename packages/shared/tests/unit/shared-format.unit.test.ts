import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  escapeHtml,
  formatDecimalPrice,
  formatMoneyFromCents,
  formatMoneyFromCentsIntl,
  parseDecimalMoneyAmount,
} from "../../src/index.js";

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

  it("formatMoneyFromCentsIntl uses currency style", () => {
    const s = formatMoneyFromCentsIntl(2500, "ARS", "es-AR");
    assert.match(s, /25/);
  });

  it("parseDecimalMoneyAmount", () => {
    assert.equal(parseDecimalMoneyAmount("1,5"), 1.5);
    assert.equal(parseDecimalMoneyAmount("2.00"), 2);
    assert.ok(Number.isNaN(parseDecimalMoneyAmount("")));
  });
});
