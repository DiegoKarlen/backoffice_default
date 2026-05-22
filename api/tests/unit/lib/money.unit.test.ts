import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Prisma } from "@prisma/client";
import { decimalPriceToCents } from "../../../src/lib/money.js";

describe("[unit] money", () => {
  it("decimalPriceToCents from string", () => {
    assert.equal(decimalPriceToCents("10.5000"), 1050);
  });

  it("decimalPriceToCents from Prisma.Decimal", () => {
    assert.equal(decimalPriceToCents(new Prisma.Decimal("1.0000")), 100);
  });

  it("rejects invalid amount", () => {
    assert.throws(() => decimalPriceToCents("abc"), /Invalid decimal/);
  });
});
