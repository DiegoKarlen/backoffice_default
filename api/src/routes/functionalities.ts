import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";

export const functionalitiesRouter = Router();
functionalitiesRouter.use(requireAuth);

functionalitiesRouter.get("/", async (_req: AuthedRequest, res) => {
  const list = await prisma.functionality.findMany({
    orderBy: [{ module: "asc" }, { code: "asc" }],
  });
  res.json({ functionalities: list });
});

const createFunctionalitySchema = z.object({
  code: z.string().min(1).max(128),
  name: z.string().min(1),
  description: z.string().optional(),
  module: z.string().optional(),
});

functionalitiesRouter.post("/", async (req: AuthedRequest, res) => {
  const parsed = createFunctionalitySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const f = await prisma.functionality.create({
    data: parsed.data,
  });

  res.status(201).json({ functionality: f });
});

const patchFunctionalitySchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  module: z.string().optional().nullable(),
});

functionalitiesRouter.patch("/:id", async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const parsed = patchFunctionalitySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const existing = await prisma.functionality.findFirst({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: "Functionality not found" });
    return;
  }

  const f = await prisma.functionality.update({
    where: { id },
    data: parsed.data,
  });

  res.json({ functionality: f });
});
