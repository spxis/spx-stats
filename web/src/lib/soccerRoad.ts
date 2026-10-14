import type { RoadFinal, RoadFinalist, RoadGroupMatch, RoadMatch } from "@johnmorrisdotca/kyogijo-stadiums/charts";
import type { Match } from "./soccer.ts";

/**
 * The road to a World Cup's final, as the data kyogijo's `roadToFinal` takes (docs: the chart's finalists are teams with a `path` and a `group`). Pure: no
 * server code, so the checks (scripts/soccerRoad.test.ts) share it with the tournament page.
 *
 * The final is the match of stage `final` (the home side of the final is the first finalist, as in the data and the match page). 1950 had no final, only a
 * final round of four teams, so its last match (Uruguay 2-1 Brazil, which decided the title) stands as the final and says so (`finalRound`). A tournament with
 * neither has no road.
 *
 * Each finalist's matches before that match, the earliest first: the knockout matches are its `path` (one per round; a drawn match that was replayed, in 1934
 * and 1938, gives the replay a round of its own), and every group-stage match is its `group`, the second group stage of 1974 to 1982 and the final round of
 * 1950 included, because kyogijo draws the group stage as one row of small marks.
 */

/** How a team is drawn on the chart: its name in the reader's language, its three-letter code, its round flag's address and its colour. */
export type RoadTeam = { name: string; abbr: string; logo?: string; color?: string; ref?: TeamRef };

/** A team as the site names it in a list: the name before translation, its page and its flag (SoccerTeamName draws all three). */
export interface TeamRef { name: string; slug: string; flag: string | null }

export interface Road {
  finalists: [RoadFinalist, RoadFinalist];
  final: RoadFinal;
  /** The match the chart ends on. */
  decider: Match;
  /** The tournament has no final: `decider` is the last match of the final round. */
  finalRound: boolean;
  /** The round keys the paths use, the earliest first, each with the stage it is (a replay carries `replay`). */
  rounds: { key: string; stage: string; replay: boolean }[];
  /** Whether the groups of a finalist include a second group stage (or a final round). */
  secondGroups: boolean;
  /** Every match drawn, as text for the table that stands for the drawing: the first finalist's group and path, the second's, then the final. `stage` is `group`, a round key or `final`. */
  entries: RoadEntry[];
}

export interface RoadEntry { team: string; teamRef?: TeamRef; stage: string; opponent: string; opponentRef?: TeamRef; goals: number; against: number; note: string }

const ROUND_KEY: Record<string, string> = { round_of_32: "round-of-32", round_of_16: "round-of-16", quarter: "quarter-final", semi: "semi-final" };
/** The key a knockout stage has on the chart: kyogijo's own for the four it has words for, else the stage with its underscores turned into dashes. */
export const roundKey = (stage: string): string => ROUND_KEY[stage] ?? stage.replace(/_/g, "-");

const order = (a: Match, b: Match) => a.match_date.localeCompare(b.match_date) || a.match_id - b.match_id;
const GROUP_ORDER = 4;

/** The match a road ends on, or null. */
export function deciderOf(matches: readonly Match[]): { match: Match; finalRound: boolean } | null {
  const finals = matches.filter((m) => m.stage_key === "final").sort(order);
  if (finals.length) return { match: finals[finals.length - 1], finalRound: false };
  const round = matches.filter((m) => m.stage_key === "final_round").sort(order);
  return round.length ? { match: round[round.length - 1], finalRound: true } : null;
}

/** A match from one team's side: [for, against], and how it was decided (the shoot-out's numbers the team's first). */
type Result = { score: readonly [number, number]; decidedBy: "ft" | "aet" | "pens"; pens?: readonly [number, number] };
function resultOf(m: Match, id: string): Result {
  const home = m.home_team_id === id;
  const f = home ? m.home_goals : m.away_goals, a = home ? m.away_goals : m.home_goals;
  const pens = m.shootout && m.home_penalties != null && m.away_penalties != null
    ? (home ? [m.home_penalties, m.away_penalties] as const : [m.away_penalties, m.home_penalties] as const) : null;
  if (pens) return { score: [f, a], decidedBy: "pens", pens };
  return { score: [f, a], decidedBy: m.extra_time ? "aet" : "ft" };
}

/** The road to the final of one tournament, or null when it had none. `team` says how a team (by id, from a match it played) is drawn; `note` the words under a score. */
export function roadOf(
  matches: readonly Match[],
  team: (m: Match, id: string) => RoadTeam,
  note: (kind: "aet" | "pens" | "replay", pens?: readonly [number, number]) => string,
): Road | null {
  const found = deciderOf(matches);
  if (!found) return null;
  const { match: decider, finalRound } = found;
  const before = matches.filter((m) => m.stage_key !== "third_place" && m.match_id !== decider.match_id && order(m, decider) < 0).sort(order);
  const ids = [decider.home_team_id, decider.away_team_id] as const;
  const rounds: Road["rounds"] = [];
  const entries: RoadEntry[] = [];
  let secondGroups = false;

  const finalist = (id: string): RoadFinalist => {
    const mine = before.filter((m) => m.home_team_id === id || m.away_team_id === id);
    const opponent = (m: Match): RoadTeam => team(m, m.home_team_id === id ? m.away_team_id : m.home_team_id);
    const group: RoadGroupMatch[] = [], path: RoadMatch[] = [];
    const seen = new Set<string>();
    for (const m of mine) {
      if (m.stage_order < GROUP_ORDER) {
        if (m.stage_key !== "group") secondGroups = true;
        const g = resultOf(m, id);
        group.push({ opponent: opponent(m), score: g.score });
        entries.push({ team: team(decider, id).name, teamRef: team(decider, id).ref, stage: "group", opponent: opponent(m).name, opponentRef: opponent(m).ref, goals: g.score[0], against: g.score[1], note: "" });
        continue;
      }
      // A drawn match that was replayed (the same two teams in the same stage again) is two rows, the second with a round key of its own.
      const base = roundKey(m.stage_key), again = seen.has(base);
      seen.add(base);
      const key = again ? `${base}-replay` : base;
      const r = resultOf(m, id);
      const words = again ? note("replay") : r.decidedBy === "pens" ? note("pens", r.pens) : r.decidedBy === "aet" ? note("aet") : "";
      path.push({ round: key, opponent: opponent(m), ...r, note: words });
      entries.push({ team: team(decider, id).name, teamRef: team(decider, id).ref, stage: key, opponent: opponent(m).name, opponentRef: opponent(m).ref, goals: r.score[0], against: r.score[1], note: words });
      if (!rounds.some((x) => x.key === key)) rounds.push({ key, stage: m.stage_key, replay: again });
    }
    return { ...team(decider, id), path, ...(group.length ? { group } : {}) };
  };

  const finalists: [RoadFinalist, RoadFinalist] = [finalist(ids[0]), finalist(ids[1])];
  const r = resultOf(decider, ids[0]);
  const words = r.decidedBy === "pens" ? note("pens", r.pens) : r.decidedBy === "aet" ? note("aet") : "";
  const final: RoadFinal = { score: r.score, decidedBy: r.decidedBy, ...(r.pens ? { pens: r.pens } : {}), note: words };
  entries.push({ team: finalists[0].name, teamRef: team(decider, ids[0]).ref, stage: "final", opponent: finalists[1].name, opponentRef: team(decider, ids[1]).ref, goals: r.score[0], against: r.score[1], note: words });
  return { finalists, final, decider, finalRound, rounds, secondGroups, entries };
}
