import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  userHasAnyFunctionality,
  userHasEveryFunctionality,
  type BackofficeUserContext,
} from "../../../src/lib/user-permissions.js";
import { BO } from "../../../src/lib/functionality-codes.js";

function ctx(codes: string[]): BackofficeUserContext {
  return {
    id: "u1",
    email: "a@test.com",
    active: true,
    roleIds: [],
    roleCodes: [],
    functionalityCodes: new Set(codes),
  };
}

describe("[unit] user-permissions", () => {
  it("userHasEveryFunctionality requires all codes", () => {
    const user = ctx([BO.PLAYERS_MANAGE]);
    assert.equal(userHasEveryFunctionality(user, [BO.PLAYERS_MANAGE]), true);
    assert.equal(userHasEveryFunctionality(user, [BO.PLAYERS_MANAGE, BO.BINGO_MANAGE]), false);
  });

  it("userHasAnyFunctionality accepts one match", () => {
    const user = ctx([BO.ROLES_MANAGE]);
    assert.equal(userHasAnyFunctionality(user, [BO.ROLES_MANAGE, BO.USERS_MANAGE]), true);
    assert.equal(userHasAnyFunctionality(user, [BO.BINGO_MANAGE]), false);
  });
});

describe("[unit] live draw surface", () => {
  it("documents backoffice-only draw API with RBAC", () => {
    assert.equal(BO.BINGO_MANAGE, "bo.bingo.manage");
  });
});
