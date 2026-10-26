import "server-only";
import { ApiError } from "../api/error.ts";
import { type LiveAnswer, inLiveWindow, liveRowSchema } from "../liveScores.ts";
import { tursoConfigured, tursoRows } from "./client.ts";

/** Seconds one answer is shared by every visitor (Next's data cache, then the CDN in front of the route). */
export const LIVE_SHARE_SECONDS = 30;

const COLUMNS =
  "game_id, status, home_score, away_score, overtime, period, disputed, ready, n_sources, n_agree, confirm_agree, confirm_differ, sources, fetched_at";

/**
 * The live rows of one league and day: ONE Turso read, shared for 30 seconds by every visitor of that scoreboard (not per game, not per visitor).
 * A day outside the window the writer keeps, a site without Turso and a Turso without the table (nothing written yet) all answer with no rows and
 * read nothing more. Turso being down is an ApiError, which the route turns into a short-lived empty answer: the overlay is optional.
 */
export async function getLiveScores(league: string, day: string, today: string): Promise<LiveAnswer> {
  if (!inLiveWindow(day, today) || !tursoConfigured()) return { rows: [] };
  try {
    const rows = await tursoRows(
      `select ${COLUMNS} from live_score where league = ? and game_date = ?`,
      [league, day],
      liveRowSchema,
      { tables: ["live_score"], revalidate: LIVE_SHARE_SECONDS },
    );
    return { rows };
  } catch (e) {
    if (e instanceof ApiError && !e.transient && /no such table/i.test(e.message)) return { rows: [] };
    throw e;
  }
}
