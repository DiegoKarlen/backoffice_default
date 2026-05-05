import { Router } from "express";
import { z } from "zod";
import { RoomStatus } from "@prisma/client";
import { ensureLiveSessionForRoom } from "../bingo-game/live-session.js";
import { prisma } from "../lib/prisma.js";
import { type AuthedRequest, requireAuth } from "../middleware/auth.js";

export const roomsRouter = Router();
roomsRouter.use(requireAuth);

const slugSchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug: lowercase letters, numbers, single hyphens");

function publicDisplayBase(): string {
  const raw = process.env.PUBLIC_BINGO_DISPLAY_ORIGIN?.trim();
  if (!raw) {
    throw new Error("PUBLIC_BINGO_DISPLAY_ORIGIN is required (base URL of the bingo-display app, no trailing slash)");
  }
  return raw.replace(/\/$/, "");
}

function displayUrlForSlug(slug: string): string {
  return `${publicDisplayBase()}/r/${encodeURIComponent(slug)}`;
}

function serializeRoom(r: {
  id: string;
  name: string;
  slug: string;
  status: RoomStatus;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    displayUrl: displayUrlForSlug(r.slug),
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

const createSchema = z.object({
  name: z.string().min(1).max(200),
  slug: slugSchema,
  status: z.nativeEnum(RoomStatus).optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  slug: slugSchema.optional(),
  status: z.nativeEnum(RoomStatus).optional(),
});

roomsRouter.get("/", async (req: AuthedRequest, res) => {
  const q = req.query;
  const name = typeof q.name === "string" ? q.name.trim() : "";
  const status = typeof q.status === "string" ? q.status : "";

  const where: { name?: { contains: string; mode: "insensitive" }; status?: RoomStatus } = {};
  if (name) where.name = { contains: name, mode: "insensitive" };
  if (status && Object.values(RoomStatus).includes(status as RoomStatus)) {
    where.status = status as RoomStatus;
  }

  const list = await prisma.room.findMany({
    where,
    orderBy: [{ name: "asc" }],
  });

  res.json({ rooms: list.map(serializeRoom) });
});

roomsRouter.get("/:id", async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const room = await prisma.room.findFirst({ where: { id } });
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  res.json({ room: serializeRoom(room) });
});

roomsRouter.post("/", async (req: AuthedRequest, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const body = parsed.data;

  const created = await prisma.room.create({
    data: {
      name: body.name.trim(),
      slug: body.slug.trim().toLowerCase(),
      status: body.status ?? RoomStatus.INACTIVE,
    },
  });

  void ensureLiveSessionForRoom(created.id).catch(console.error);

  res.status(201).json({ room: serializeRoom(created) });
});

roomsRouter.put("/:id", async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const body = parsed.data;

  const existing = await prisma.room.findFirst({ where: { id } });
  if (!existing) {
    res.status(404).json({ error: "Room not found" });
    return;
  }

  const updated = await prisma.room.update({
    where: { id },
    data: {
      name: body.name !== undefined ? body.name.trim() : undefined,
      slug: body.slug !== undefined ? body.slug.trim().toLowerCase() : undefined,
      status: body.status,
    },
  });

  res.json({ room: serializeRoom(updated) });
});

roomsRouter.patch("/:id/activate", async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const room = await prisma.room.findFirst({ where: { id } });
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  const updated = await prisma.room.update({
    where: { id },
    data: { status: RoomStatus.ACTIVE },
  });
  res.json({ room: serializeRoom(updated) });
});

roomsRouter.patch("/:id/deactivate", async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const room = await prisma.room.findFirst({ where: { id } });
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  const updated = await prisma.room.update({
    where: { id },
    data: { status: RoomStatus.INACTIVE },
  });
  res.json({ room: serializeRoom(updated) });
});

roomsRouter.delete("/:id", async (req: AuthedRequest, res) => {
  const { id } = req.params;
  const room = await prisma.room.findFirst({ where: { id } });
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  const count = await prisma.bingo.count({ where: { roomId: id } });
  if (count > 0) {
    res.status(409).json({ error: "Room has bingos; remove or reassign them first" });
    return;
  }
  await prisma.room.delete({ where: { id } });
  res.status(204).send();
});
