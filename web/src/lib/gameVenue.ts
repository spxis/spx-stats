import "server-only";
import { cache } from "react";
import { z } from "zod";
import { rows } from "./api/client";

/**
 * Where one game was played, from api.game_venue (data release 2026.10.13-20) and the Wikidata item of that venue from api.venue_ref (migration 082).
 * `basis` says how it is known: `home` (the home club's venue that day) or the source that named it (event, retrosheet, nflverse, nhlapi).
 * `venueId` is null for a game no source places; `wid` is null while api.venue_ref is not on the server or does not hold the venue.
 * The whole answer is null when api.game_venue cannot be read: the caller then draws the standard surface.
 */
export interface GameVenue { venueId: number | null; basis: string; wid: string | null; name: string | null }

const gv = z.object({ venue_id: z.number().nullable(), basis: z.string() });
const ref = z.object({ venue_id: z.number(), wikidata_id: z.string(), name: z.string().nullable() });

export const getGameVenue = cache(async (gameId: number): Promise<GameVenue | null> => {
  if (!Number.isInteger(gameId) || gameId <= 0) return null;
  let row: z.infer<typeof gv> | undefined;
  try {
    row = (await rows("game_venue", `game_id=eq.${gameId}&select=venue_id,basis`, gv))[0];
  } catch {
    return null;
  }
  if (!row) return null;
  if (row.venue_id == null) return { venueId: null, basis: row.basis, wid: null, name: null };
  let place: z.infer<typeof ref> | undefined;
  try {
    place = (await rows("venue_ref", `venue_id=eq.${row.venue_id}&select=venue_id,wikidata_id,name`, ref))[0];
  } catch {
    place = undefined;
  }
  return { venueId: row.venue_id, basis: row.basis, wid: place?.wikidata_id ?? null, name: place?.name ?? null };
});
