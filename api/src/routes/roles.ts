import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";

export const rolesRouter = Router();
rolesRouter.use(requireAuth);

rolesRouter.get("/", async (_req: AuthedRequest, res) => {
  const list = await prisma.role.findMany({
    orderBy: { name: "asc" },
    include: {
      functionalities: { include: { functionality: { select: { id: true, code: true, name: true, module: true } } } },
    },
  });
  res.json({
    roles: list.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      description: r.description,
      functionalities: r.functionalities.map((x) => x.functionality),
    })),
  });
});

const createRoleSchema = z.object({
  code: z.string().min(1).max(64),
  name: z.string().min(1),
  description: z.string().optional(),
  functionalityIds: z.array(z.string().uuid()).optional(),
});

rolesRouter.post("/", async (req: AuthedRequest, res) => {
  const parsed = createRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { code, name, description, functionalityIds } = parsed.data;

  const role = await prisma.$transaction(async (tx) => {
    const r = await tx.role.create({
      data: {
        code,
        name,
        description,
        functionalities: functionalityIds?.length
          ? {
              create: functionalityIds.map((functionalityId) => ({
                functionality: { connect: { id: functionalityId } },
              })),
            }
          : undefined,
      },
    });
    return r;
  });

  res.status(201).json({
    role: { id: role.id, code: role.code, name: role.name, description: role.description },
  });
});

const patchRoleSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  functionalityIds: z.array(z.string().uuid()).optional(),
});

rolesRouter.patch("/:id", async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const parsed = patchRoleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const existing = await prisma.role.findFirst({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: "Role not found" });
    return;
  }

  const { name, description, functionalityIds } = parsed.data;

  await prisma.$transaction(async (tx) => {
    await tx.role.update({
      where: { id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(description !== undefined ? { description } : {}),
      },
    });
    if (functionalityIds) {
      await tx.roleFunctionality.deleteMany({ where: { roleId: id } });
      if (functionalityIds.length) {
        await tx.roleFunctionality.createMany({
          data: functionalityIds.map((functionalityId) => ({ roleId: id, functionalityId })),
          skipDuplicates: true,
        });
      }
    }
  });

  res.json({ ok: true });
});
