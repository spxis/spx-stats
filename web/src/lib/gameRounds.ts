import "server-only";
import { cache } from "react";
import { z } from "zod";
import { rows } from "./api/client";
import { orElse } from "./api/soften";

const roundSchema = z.object({ game_id: z.number(), round_label: z.string() });

/**
 * The labels of a season's games (api.game_round, migration 161): a bowl game's name, a Playoff round, a conference championship game. Empty while the
 * view is missing on the database, so a deploy ahead of the migration only loses the names.
 */
export const getRounds = cache(async (lg: string, y: number): Promise<ReadonlyMap<number, string>> =>
  new Map((await orElse(rows("game_round", `league=eq.${lg}&year=eq.${y}&select=game_id,round_label`, roundSchema), [])).map((r) => [r.game_id, r.round_label])));

/** One game's label, or null when it has none (or the view is missing). */
export const getRound = cache(async (lg: string, y: number, id: number): Promise<string | null> =>
  (await getRounds(lg, y)).get(id) ?? null);
