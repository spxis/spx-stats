import "server-only";
import { cache } from "react";
import { z } from "zod";
import { rows } from "./api/client";
import type { SprayWire, WireRow } from "./playerSpray";
import { tursoConfigured, tursoRows } from "./turso/client";

/**
 * A player's located MLB batted balls for the player page's spray charts (core.batted_ball_player_hand: migration 165, db/build/237; **a Turso table**, never
 * production; the site reads Turso, or `api.batted_ball_player_hand` on a local preview of DS1). One row for each season, role and side the batter hit from, the counts
 * still packed (the browser unpacks them, lib/battedBall.ts), so a career is a few kilobytes. Null when the player has none.
 */
const rowSchema = z.object({ year: z.number(), role: z.enum(["bat", "pit"]), bat_hand: z.enum(["L", "R"]), n: z.number(), traj: z.string(), cells: z.string() });

export const getPlayerSpray = cache(async (personId: number): Promise<SprayWire | null> => {
  if (!Number.isInteger(personId) || personId < 1) return null;
  const found = tursoConfigured()
    ? await tursoRows("select year, role, bat_hand, n, traj, cells from core_batted_ball_player_hand where person_id = ? order by year, role, bat_hand", [personId], rowSchema, { tables: ["core_batted_ball_player_hand"] })
    : await rows("batted_ball_player_hand", `person_id=eq.${personId}&select=year,role,bat_hand,n,traj,cells&order=year,role,bat_hand`, rowSchema);
  if (!found.length) return null;
  return { rows: found.map((r): WireRow => [r.year, r.role === "pit" ? 1 : 0, r.bat_hand === "R" ? 1 : 0, r.n, r.traj, r.cells]) };
});
