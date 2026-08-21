import { Router } from "express";
import { z } from "zod";
import { httpError, zodFlattenError } from "../lib/route-helpers.js";
import { prisma } from "../lib/prisma.js";
import { hashPassword } from "../lib/password.js";
import { bumpUserTokenVersion } from "../lib/user-token-version.js";
import { BO } from "../lib/functionality-codes.js";
import {
  assertActorCanAssignRoles,
  assertActorCanModifyUser,
  assertCanDeactivateUser,
} from "../lib/user-role-guards.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { getBackofficeUser, requireFunctionality, type AuthedBackofficeRequest } from "../middleware/require-functionality.js";
import { asyncHandler } from "../middleware/async-handler.js";

export const usersRouter = Router();

usersRouter.use(requireAuth);
usersRouter.use(requireFunctionality(BO.USERS_MANAGE));

usersRouter.get(
  "/",
  asyncHandler(async (_req: AuthedRequest, res) => {
    const list = await prisma.user.findMany({
      orderBy: { email: "asc" },
      include: {
        roles: { include: { role: { select: { id: true, code: true, name: true } } } },
      },
    });
    res.json({
      users: list.map((u) => ({
        id: u.id,
        email: u.email,
        displayName: u.displayName,
        active: u.active,
        createdAt: u.createdAt,
        roles: u.roles.map((r) => r.role),
      })),
    });
  }),
);

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().optional(),
  active: z.boolean().optional(),
  roleIds: z.array(z.string().uuid()).optional(),
});

usersRouter.post(
  "/",
  asyncHandler(async (req: AuthedBackofficeRequest, res) => {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) {
      throw zodFlattenError(parsed.error);
    }
    const { email, password, displayName, active, roleIds } = parsed.data;
    const actor = getBackofficeUser(req);
    if (roleIds?.length) {
      await assertActorCanAssignRoles(actor, roleIds);
    }

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) {
      throw httpError(409, "Email already in use");
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          email,
          passwordHash,
          displayName,
          active: active ?? true,
          roles: roleIds?.length
            ? {
                create: roleIds.map((roleId) => ({
                  role: { connect: { id: roleId } },
                })),
              }
            : undefined,
        },
      });
      return u;
    });

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        active: user.active,
      },
    });
  }),
);

const patchUserSchema = z.object({
  displayName: z.string().optional().nullable(),
  active: z.boolean().optional(),
  password: z.string().min(8).optional(),
  roleIds: z.array(z.string().uuid()).optional(),
});

usersRouter.patch(
  "/:id",
  asyncHandler(async (req: AuthedBackofficeRequest, res) => {
    const { id } = req.params;
    const parsed = patchUserSchema.safeParse(req.body);
    if (!parsed.success) {
      throw zodFlattenError(parsed.error);
    }

    const existing = await prisma.user.findFirst({ where: { id } });
    if (!existing) {
      throw httpError(404, "User not found");
    }

    const { displayName, active, password, roleIds } = parsed.data;
    const actor = getBackofficeUser(req);
    await assertActorCanModifyUser(actor, id);
    await assertCanDeactivateUser(id, active);
    if (roleIds) {
      await assertActorCanAssignRoles(actor, roleIds);
    }
    const data: {
      displayName?: string | null;
      active?: boolean;
      passwordHash?: string;
      totpSecret?: null;
      totpEnabled?: boolean;
    } = {};
    let invalidateSessions = false;
    if (displayName !== undefined) data.displayName = displayName;
    if (active !== undefined) {
      data.active = active;
      if (active === false) invalidateSessions = true;
    }
    if (password) {
      data.passwordHash = await hashPassword(password);
      data.totpSecret = null;
      data.totpEnabled = false;
      invalidateSessions = true;
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data,
      });
      if (invalidateSessions) {
        await bumpUserTokenVersion(id, tx);
      }
      if (roleIds) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        if (roleIds.length) {
          await tx.userRole.createMany({
            data: roleIds.map((roleId) => ({ userId: id, roleId })),
            skipDuplicates: true,
          });
        }
      }
    });

    res.json({ ok: true });
  }),
);
