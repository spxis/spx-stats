import "server-only";
import { cache } from "react";
import { z } from "zod";
import { ApiError, rows } from "./api/client";
import type { StatNumbers } from "./api/player";
import { playerIndexSchema } from "./api/people";

const statSchema = z.object({ person_id: z.number(), stat_group: z.string(), games_played: z.number().nullable(), stats: z.record(z.string(), z.number()) });

/** The tables a team's roster is drawn in. */
export type RosterGroup = "forwards" | "defense" | "goalies" | "skaters" | "batters" | "pitchers";

export interface RosterPlayer {
  id: number;
  name: string;
  /** The player's main position as short as it can be written, or null when the archive has none. */
  pos: string | null;
  group: RosterGroup;
  /** The regular-season counting stats of the group's kind (skater, goalie, batting or pitching). */
  stats: StatNumbers;
  /** The statistic group the numbers belong to, to pick the columns. */
  kind: "skater" | "goalie" | "batting" | "pitching";
}

const SHORT: Record<string, string> = {
  d: "D", defenseman: "D", defender: "D", c: "C", centre: "C", center: "C", l: "L", lw: "L", "left wing": "L", "left winger": "L", winger: "W",
  r: "R", rw: "R", "right wing": "R", "right winger": "R", g: "G", goaltender: "G", goalie: "G", forward: "F",
  pitcher: "P", "starting pitcher": "SP", "relief pitcher": "RP", closer: "CL", catcher: "C", "first baseman": "1B", "second baseman": "2B",
  "third baseman": "3B", shortstop: "SS", "left fielder": "LF", "center fielder": "CF", "right fielder": "RF", outfielder: "OF", infielder: "IF",
  "designated hitter": "DH",
};
const short = (p: string | null): string | null => (p && p.trim() ? SHORT[p.trim().toLowerCase()] ?? p.trim() : null);

const FORWARD = new Set(["C", "L", "R", "W", "F"]);

/**
 * The players with statistics for one club's season (api.person_stats by team season), under their names and positions from api.player_index.
 * Two requests. Empty when the archive holds no player statistics for that club and year (every league but the NHL and MLB today) and
 * when either read fails: the roster is an extra on the page, not a reason to lose it.
 */
export const getRoster = cache(async (teamSeasonId: number): Promise<RosterPlayer[]> => {
  try {
    const stats = await rows("person_stats", `team_season_id=eq.${teamSeasonId}&phase=eq.regular&select=person_id,stat_group,games_played,stats`, statSchema);
    if (!stats.length) return [];
    const ids = [...new Set(stats.map((s) => s.person_id))];
    const people = new Map((await rows("player_index", `person_id=in.(${ids.join(",")})&select=person_id,name,position,leagues,first_season,last_season,seasons_played,award_count`, playerIndexSchema)).map((p) => [p.person_id, p]));
    const out: RosterPlayer[] = [];
    for (const id of ids) {
      const mine = stats.filter((s) => s.person_id === id);
      const p = people.get(id);
      if (!p) continue;
      const by = (g: string) => mine.find((s) => s.stat_group === g);
      const pitch = by("pitching"), bat = by("batting"), sk = by("skater"), gk = by("goalie");
      const pos = short(p.position);
      let row: Pick<RosterPlayer, "kind" | "group" | "stats"> | null = null;
      if (gk && (!sk || (gk.games_played ?? 0) >= (sk.games_played ?? 0))) row = { kind: "goalie", group: "goalies", stats: gk.stats };
      else if (sk) row = { kind: "skater", group: pos === "D" ? "defense" : pos && FORWARD.has(pos) ? "forwards" : "skaters", stats: sk.stats };
      else if (pitch && (!bat || (pitch.games_played ?? 0) >= (bat.games_played ?? 0))) row = { kind: "pitching", group: "pitchers", stats: pitch.stats };
      else if (bat) row = { kind: "batting", group: "batters", stats: bat.stats };
      if (row) out.push({ id, name: p.name, pos, ...row });
    }
    return out;
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    return [];
  }
});
