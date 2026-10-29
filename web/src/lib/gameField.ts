import "server-only";
import { cache } from "react";
import { z } from "zod";
import { rows } from "./api/client";
import { personNameSchema } from "./api/leaders";
import { tursoConfigured, tursoRows } from "./turso/client";

/**
 * What a game page draws on the game's field (core.game_field: an MLB game's batted balls, an NFL game's drives; migration 164, db/build/235 and 236). It is a
 * Turso table, so production never holds it: the site reads Turso, and a run with none (a local preview of DS1) reads the api view of the same rows. The text
 * of `data` is read by lib/fieldPlays.ts.
 */
export type FieldKind = "mlb_balls" | "nfl_drives";

export interface FieldRow { season: number; n: number; data: string }

const fieldSchema = z.object({ season: z.number(), n: z.number(), data: z.string() });

/** One game's row of a kind, or null when the game has none (the archive does not hold it). A read the database could not answer throws. */
export const getGameField = cache(async (gameId: number, kind: FieldKind): Promise<FieldRow | null> => {
  if (!Number.isInteger(gameId) || gameId < 1) return null;
  const found = tursoConfigured()
    ? await tursoRows("select season, n, data from core_game_field where game_id = ? and kind = ?", [gameId, kind], fieldSchema, { tables: ["core_game_field"] })
    : await rows("game_field", `game_id=eq.${gameId}&kind=eq.${kind}&select=season,n,data`, fieldSchema);
  return found[0] ?? null;
});

/** The names of some people by id (a batter's tooltip). An id the archive does not know is simply missing. */
export const getBatterNames = cache(async (ids: readonly number[]): Promise<Map<number, string>> => {
  const unique = [...new Set(ids)].filter((n) => Number.isInteger(n) && n > 0).sort((a, b) => a - b);
  if (!unique.length) return new Map();
  const found = await rows("people", `person_id=in.(${unique.join(",")})&select=person_id,name`, personNameSchema).catch(() => []);
  return new Map(found.map((r) => [r.person_id, r.name]));
});
