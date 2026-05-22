import { registerLiveSession } from "../game-engine/bingo/live-session.js";
import { prisma } from "../lib/prisma.js";
import { logInfo } from "../lib/logger.js";

/** Carga sesiones live para todas las salas (llamar una vez al arrancar la API). */
export async function bootstrapLiveSessionsFromDatabase(): Promise<void> {
  const rooms = await prisma.room.findMany({
    select: { id: true, slug: true, name: true },
  });
  for (const room of rooms) {
    registerLiveSession(room);
  }
  logInfo("live-sessions", `bootstrapped ${rooms.length} room session(s)`);
}
