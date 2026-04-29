import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { hashPassword } from "../lib/password.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";

export const usersRouter = Router();

usersRouter.use(requireAuth);

usersRouter.get("/", async (_req: AuthedRequest, res) => {
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
});

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().optional(),
  active: z.boolean().optional(),
  roleIds: z.array(z.string().uuid()).optional(),
});

usersRouter.post("/", async (req: AuthedRequest, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { email, password, displayName, active, roleIds } = parsed.data;

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) {
    res.status(409).json({ error: "Email already in use" });
    return;
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
});

const patchUserSchema = z.object({
  displayName: z.string().optional().nullable(),
  active: z.boolean().optional(),
  password: z.string().min(8).optional(),
  roleIds: z.array(z.string().uuid()).optional(),
});

usersRouter.patch("/:id", async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const parsed = patchUserSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const existing = await prisma.user.findFirst({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const { displayName, active, password, roleIds } = parsed.data;
  const data: {
    displayName?: string | null;
    active?: boolean;
    passwordHash?: string;
  } = {};
  if (displayName !== undefined) data.displayName = displayName;
  if (active !== undefined) data.active = active;
  if (password) data.passwordHash = await hashPassword(password);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data,
    });
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
});
