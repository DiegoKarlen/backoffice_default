import { publicJson } from "./api.js";
import type { OccRow, RoomOpt } from "../types.js";

export async function loadRooms(): Promise<RoomOpt[]> {
  const data = (await publicJson("/public/bingos/rooms")) as { rooms?: RoomOpt[] };
  return data.rooms ?? [];
}

export async function loadUpcomingForRoom(slug: string): Promise<OccRow[]> {
  const q = new URLSearchParams({
    roomSlug: slug,
    limit: "48",
    horizonDays: "21",
  });
  const data = (await publicJson(`/public/bingos/upcoming?${q.toString()}`)) as {
    upcoming?: OccRow[];
  };
  return data.upcoming ?? [];
}
