import "server-only";
import { cache } from "react";
import { rows, viewMissing } from "./api/client";
import { venuePackSchema, type VenuePack } from "./venuePack";

/** api.venue_pack (migration 181): the places, facts and names of every home venue in one request, once for a page. Null while the view is a 404, so a reader asks for its own view as before. */
export const getVenuePack = cache(async (): Promise<VenuePack | null> => {
  try {
    return (await rows("venue_pack", "select=*&order=id", venuePackSchema))[0] ?? null;
  } catch (e) {
    if (!viewMissing(e)) throw e;
    return null;
  }
});
