import type { Request } from "express";
import { httpError } from "./route-helpers.js";
import { prisma } from "./prisma.js";

export async function roomFromSlugQuery(
  req: Request,
): Promise<{ id: string; slug: string; name: string } | null> {
  const slug = typeof req.query.roomSlug === "string" ? req.query.roomSlug.trim() : "";
  if (!slug) return null;
  return prisma.room.findFirst({
    where: { slug },
    select: { id: true, slug: true, name: true },
  });
}

export async function requireRoomFromSlugQuery(
  req: Request,
): Promise<{ id: string; slug: string; name: string }> {
  const room = await roomFromSlugQuery(req);
  if (!room) {
    throw httpError(400, "Missing or invalid roomSlug query parameter");
  }
  return room;
}
