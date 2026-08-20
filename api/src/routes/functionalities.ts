import { Router } from "express";
import { z } from "zod";
import { httpError, zodFlattenError } from "../lib/route-helpers.js";
import { prisma } from "../lib/prisma.js";
import { BO } from "../lib/functionality-codes.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { requireAnyFunctionality, requireFunctionality } from "../middleware/require-functionality.js";
import { asyncHandler } from "../middleware/async-handler.js";

export const functionalitiesRouter = Router();
functionalitiesRouter.use(requireAuth);

functionalitiesRouter.get(
  "/",
  requireAnyFunctionality(BO.FUNCTIONALITIES_MANAGE, BO.ROLES_MANAGE, BO.USERS_MANAGE),
  asyncHandler(async (_req: AuthedRequest, res) => {
    const list = await prisma.functionality.findMany({
      orderBy: [{ module: "asc" }, { code: "asc" }],
    });
    res.json({ functionalities: list });
  }),
);

const createFunctionalitySchema = z.object({
  code: z.string().min(1).max(128),
  name: z.string().min(1),
  description: z.string().optional(),
  module: z.string().optional(),
});

functionalitiesRouter.post(
  "/",
  requireFunctionality(BO.FUNCTIONALITIES_MANAGE),
  asyncHandler(async (req: AuthedRequest, res) => {
    const parsed = createFunctionalitySchema.safeParse(req.body);
    if (!parsed.success) {
      throw zodFlattenError(parsed.error);
    }

    const f = await prisma.functionality.create({
      data: parsed.data,
    });

    res.status(201).json({ functionality: f });
  }),
);

const patchFunctionalitySchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  module: z.string().optional().nullable(),
});

functionalitiesRouter.patch(
  "/:id",
  requireFunctionality(BO.FUNCTIONALITIES_MANAGE),
  asyncHandler(async (req: AuthedRequest, res) => {
    const { id } = req.params;
    const parsed = patchFunctionalitySchema.safeParse(req.body);
    if (!parsed.success) {
      throw zodFlattenError(parsed.error);
    }

    const existing = await prisma.functionality.findFirst({ where: { id } });
    if (!existing) {
      throw httpError(404, "Functionality not found");
    }

    const f = await prisma.functionality.update({
      where: { id },
      data: parsed.data,
    });

    res.json({ functionality: f });
  }),
);
