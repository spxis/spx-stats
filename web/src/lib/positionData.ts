import "server-only";
import { cache } from "react";
import { z } from "zod";
import { rows } from "./api/client";
import type { PositionRow } from "./positions";

const positionSchema = z.object({ league: z.string(), code: z.string(), sort: z.number(), group: z.string(), name_en: z.string(), name_fr: z.string(), name_ja: z.string() });

/** The positions of every league (api.position, migration 061), in order. Empty when the view is missing or cannot be read: the codes are shown as they are. */
export const getPositions = cache(async (): Promise<PositionRow[]> =>
  rows("position", "select=*&order=league,sort", positionSchema).catch(() => []));
