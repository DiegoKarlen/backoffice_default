import { prisma } from "../../../src/lib/prisma.js";
import { BO } from "../../../src/lib/functionality-codes.js";
import { hashPassword } from "../../../src/lib/password.js";
import { signAccessToken } from "../../../src/lib/jwt.js";

export type RbacFixture = {
  suffix: string;
  adminRoleId: string;
  limitedRoleId: string;
  bingoOnlyRoleId: string;
  adminUserId: string;
  limitedUserId: string;
  bingoOnlyUserId: string;
  adminToken: string;
  limitedToken: string;
  bingoOnlyToken: string;
};

async function ensureFunctionality(code: string, name: string, module: string) {
  return prisma.functionality.upsert({
    where: { code },
    create: { code, name, module },
    update: {},
  });
}

export async function createRbacFixture(suffix: string): Promise<RbacFixture> {
  const passwordHash = await hashPassword("TestPass123!");

  const fUsers = await ensureFunctionality(BO.USERS_MANAGE, "Manage users", "admin");
  const fBingo = await ensureFunctionality(BO.BINGO_MANAGE, "Manage bingos", "game");
  const fPlayers = await ensureFunctionality(BO.PLAYERS_MANAGE, "Manage players", "game");
  const fRoles = await ensureFunctionality(BO.ROLES_MANAGE, "Manage roles", "admin");
  const fFunc = await ensureFunctionality(BO.FUNCTIONALITIES_MANAGE, "Manage funcs", "admin");
  const fRoom = await ensureFunctionality(BO.ROOM_MANAGE, "Manage rooms", "game");
  const fPayments = await ensureFunctionality(BO.PAYMENTS_MANAGE, "Manage payments", "admin");

  const adminRole =
    (await prisma.role.findUnique({ where: { code: "admin" } })) ??
    (await prisma.role.create({
      data: {
        code: "admin",
        name: "Administrator",
        functionalities: {
          create: [
            { functionalityId: fUsers.id },
            { functionalityId: fRoles.id },
            { functionalityId: fFunc.id },
            { functionalityId: fBingo.id },
            { functionalityId: fRoom.id },
            { functionalityId: fPlayers.id },
            { functionalityId: fPayments.id },
          ],
        },
      },
    }));

  const limitedRole = await prisma.role.create({
    data: {
      code: `rbac-limited-${suffix}`,
      name: `RBAC limited ${suffix}`,
      functionalities: { create: [{ functionalityId: fUsers.id }] },
    },
  });

  const bingoOnlyRole = await prisma.role.create({
    data: {
      code: `rbac-bingo-${suffix}`,
      name: `RBAC bingo ${suffix}`,
      functionalities: { create: [{ functionalityId: fBingo.id }] },
    },
  });

  const adminUser = await prisma.user.create({
    data: {
      email: `rbac-admin-${suffix}@test.local`,
      passwordHash,
      displayName: "RBAC Admin",
      roles: { create: [{ roleId: adminRole.id }] },
    },
  });

  const limitedUser = await prisma.user.create({
    data: {
      email: `rbac-limited-${suffix}@test.local`,
      passwordHash,
      displayName: "RBAC Limited",
      roles: { create: [{ roleId: limitedRole.id }] },
    },
  });

  const bingoOnlyUser = await prisma.user.create({
    data: {
      email: `rbac-bingo-${suffix}@test.local`,
      passwordHash,
      displayName: "RBAC Bingo",
      roles: { create: [{ roleId: bingoOnlyRole.id }] },
    },
  });

  return {
    suffix,
    adminRoleId: adminRole.id,
    limitedRoleId: limitedRole.id,
    bingoOnlyRoleId: bingoOnlyRole.id,
    adminUserId: adminUser.id,
    limitedUserId: limitedUser.id,
    bingoOnlyUserId: bingoOnlyUser.id,
    adminToken: signAccessToken({ sub: adminUser.id, email: adminUser.email }),
    limitedToken: signAccessToken({ sub: limitedUser.id, email: limitedUser.email }),
    bingoOnlyToken: signAccessToken({ sub: bingoOnlyUser.id, email: bingoOnlyUser.email }),
  };
}

export async function cleanupRbacFixture(fx: RbacFixture): Promise<void> {
  const userIds = [fx.adminUserId, fx.limitedUserId, fx.bingoOnlyUserId];
  await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });

  await prisma.roleFunctionality.deleteMany({
    where: { roleId: { in: [fx.limitedRoleId, fx.bingoOnlyRoleId] } },
  });
  await prisma.role.deleteMany({
    where: { id: { in: [fx.limitedRoleId, fx.bingoOnlyRoleId] } },
  });
}
