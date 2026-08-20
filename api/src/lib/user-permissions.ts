import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { httpError } from "./route-helpers.js";

const userPermissionsInclude = {
  roles: {
    include: {
      role: {
        include: {
          functionalities: { include: { functionality: true } },
        },
      },
    },
  },
} as const satisfies Prisma.UserInclude;

export type BackofficeUserContext = {
  id: string;
  email: string;
  active: boolean;
  roleIds: string[];
  roleCodes: string[];
  functionalityCodes: Set<string>;
};

function buildContext(user: Prisma.UserGetPayload<{ include: typeof userPermissionsInclude }>): BackofficeUserContext {
  const functionalityCodes = new Set<string>();
  const roleIds: string[] = [];
  const roleCodes: string[] = [];

  for (const ur of user.roles) {
    roleIds.push(ur.role.id);
    roleCodes.push(ur.role.code);
    for (const rf of ur.role.functionalities) {
      functionalityCodes.add(rf.functionality.code);
    }
  }

  return {
    id: user.id,
    email: user.email,
    active: user.active,
    roleIds,
    roleCodes,
    functionalityCodes,
  };
}

export async function loadBackofficeUserContext(userId: string): Promise<BackofficeUserContext | null> {
  const user = await prisma.user.findFirst({
    where: { id: userId },
    include: userPermissionsInclude,
  });
  if (!user) return null;
  return buildContext(user);
}

export function userHasFunctionality(ctx: BackofficeUserContext, code: string): boolean {
  return ctx.functionalityCodes.has(code);
}

export function userHasEveryFunctionality(ctx: BackofficeUserContext, codes: readonly string[]): boolean {
  return codes.every((c) => ctx.functionalityCodes.has(c));
}

export function userHasAnyFunctionality(ctx: BackofficeUserContext, codes: readonly string[]): boolean {
  return codes.some((c) => ctx.functionalityCodes.has(c));
}

/** Role's functionalities must be a subset of the actor's (no privilege escalation). */
export function assertActorHasFunctionalityCodes(
  actor: BackofficeUserContext,
  requiredCodes: Iterable<string>,
  message = "Forbidden: insufficient permissions for this assignment",
): void {
  for (const code of requiredCodes) {
    if (!actor.functionalityCodes.has(code)) {
      throw httpError(403, message);
    }
  }
}
