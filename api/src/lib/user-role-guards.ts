import { httpError } from "./route-helpers.js";
import { prisma } from "./prisma.js";
import type { BackofficeUserContext } from "./user-permissions.js";
import { assertActorHasFunctionalityCodes, loadBackofficeUserContext } from "./user-permissions.js";

const ADMIN_ROLE_CODE = "admin";

async function functionalityCodesForRoles(roleIds: string[]): Promise<Set<string>> {
  if (!roleIds.length) return new Set();
  const roles = await prisma.role.findMany({
    where: { id: { in: roleIds } },
    include: { functionalities: { include: { functionality: true } } },
  });
  if (roles.length !== roleIds.length) {
    throw httpError(400, "Invalid role id");
  }
  const codes = new Set<string>();
  for (const role of roles) {
    for (const rf of role.functionalities) {
      codes.add(rf.functionality.code);
    }
  }
  return codes;
}

async function functionalityCodesForFunctionalityIds(functionalityIds: string[]): Promise<Set<string>> {
  if (!functionalityIds.length) return new Set();
  const list = await prisma.functionality.findMany({
    where: { id: { in: functionalityIds } },
    select: { code: true },
  });
  if (list.length !== functionalityIds.length) {
    throw httpError(400, "Invalid functionality id");
  }
  return new Set(list.map((f) => f.code));
}

/** Actor cannot assign roles that grant permissions the actor does not hold. */
export async function assertActorCanAssignRoles(
  actor: BackofficeUserContext,
  roleIds: string[],
): Promise<void> {
  if (!roleIds.length) return;
  const codes = await functionalityCodesForRoles(roleIds);
  assertActorHasFunctionalityCodes(
    actor,
    codes,
    "Cannot assign a role that includes permissions you do not have",
  );
}

/** Actor cannot grant functionalities on a role beyond their own set. */
export async function assertActorCanAssignRoleFunctionalities(
  actor: BackofficeUserContext,
  functionalityIds: string[],
): Promise<void> {
  if (!functionalityIds.length) return;
  const codes = await functionalityCodesForFunctionalityIds(functionalityIds);
  assertActorHasFunctionalityCodes(actor, codes, "Cannot grant functionalities you do not have");
}

/** Actor cannot modify another user who holds permissions the actor lacks. */
export async function assertActorCanModifyUser(
  actor: BackofficeUserContext,
  targetUserId: string,
): Promise<void> {
  if (actor.id === targetUserId) return;

  const target = await loadBackofficeUserContext(targetUserId);
  if (!target) {
    throw httpError(404, "User not found");
  }

  assertActorHasFunctionalityCodes(
    actor,
    target.functionalityCodes,
    "Cannot modify a user with permissions you do not have",
  );
}

export async function assertCanDeactivateUser(
  targetUserId: string,
  active: boolean | undefined,
): Promise<void> {
  if (active !== false) return;

  const targetIsAdmin = await prisma.userRole.findFirst({
    where: { userId: targetUserId, role: { code: ADMIN_ROLE_CODE } },
    select: { userId: true },
  });
  if (!targetIsAdmin) return;

  const otherActiveAdmins = await prisma.user.count({
    where: {
      active: true,
      id: { not: targetUserId },
      roles: { some: { role: { code: ADMIN_ROLE_CODE } } },
    },
  });

  if (otherActiveAdmins === 0) {
    throw httpError(403, "Cannot deactivate the last active administrator");
  }
}
