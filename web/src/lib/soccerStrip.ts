import type { Speaker } from "./i18n/i18n.ts";
import type { PhraseKey } from "./i18n/phrases.constants.ts";
import type { TournamentTeam } from "./soccer.ts";
import { soccerAbbr } from "./soccerLook.ts";
import { reachRank, reached } from "./soccerView.ts";

/**
 * The teams of a tournament as the strip under its heading and the map in its corner show them (components/TeamStrip.tsx, components/TournamentMap.tsx), both
 * pointing at each team's squad further down the page (`#squad-<code>`). Pure: no server code, so the checks (scripts/soccerStrip.test.ts) share it.
 */

/** How far a team went, in six steps, from the group stage to the title: the colour of its ring in the strip and of its country on the map. */
export type Tier = 0 | 1 | 2 | 3 | 4 | 5;

/** The colours of the tiers, light to dark, then gold for the champions (the same on the strip and the map; the legend reads them from here). */
export const TIER_COLORS: readonly [string, string, string, string, string, string] = ["#c3d9f2", "#8fbbe8", "#5a97d6", "#2f6fb8", "#184f95", "#d4a017"];

/** The words that name a tier: a stage or a place, each one the site already says. */
export const TIER_PHRASES: readonly [PhraseKey, PhraseKey, PhraseKey, PhraseKey, PhraseKey, PhraseKey] = [
  "wc.stage.group", "wc.map.early", "wc.stage.quarter", "wc.stage.semi", "wc.reach.runnerUp", "wc.reach.champions",
];

/** The tier of a team's `reachRank` (lib/soccerView.ts): the group stages, the early knockout rounds, the quarter-finals, the semi-finals (and the places they led to), the final, the title. */
export function tierOf(rank: number): Tier {
  if (rank >= 99) return 5;
  if (rank === 98 || rank === 9) return 4;
  if (rank === 97 || rank === 96 || rank === 7 || rank === 8) return 3;
  if (rank === 6) return 2;
  if (rank >= 4 && rank <= 5) return 1;
  return 0;
}

/** The region of Chizu's world map a team with no flag code of its own stands for: the country that holds its ground today (the Germanys share one). */
const REGION_OF_SLUG: Record<string, string> = {
  czechoslovakia: "CZ", "dutch-east-indies": "ID", "east-germany": "DE", "serbia-and-montenegro": "RS", "soviet-union": "RU", yugoslavia: "RS", zaire: "CD",
};

/** The code of a team's region on the world map: its flag's country (the home nations of the United Kingdom all stand on `GB`), else the country of a team that is gone. */
export function regionOf(t: { flag_code: string | null; team_slug: string }): string | null {
  if (t.flag_code) return t.flag_code.startsWith("GB-") ? "GB" : t.flag_code.toUpperCase();
  return REGION_OF_SLUG[t.team_slug] ?? null;
}

export interface StripTeam {
  /** The team's id in the archive (the key of its squad). */
  id: string;
  /** The anchor of the team's squad on the page, `squad-<code>`: its FIFA code in lower case (a second team with the same code takes its slug). */
  anchor: string;
  /** The three-letter code shown on the strip. */
  code: string;
  region: string | null;
  slug: string;
  /** Whether the tournament page holds this team's squad (`#<anchor>` leads there); else the strip and the map lead to the team's page. */
  squad: boolean;
  name: string;
  flag: string | null;
  /** How far it went, in words (the table's own: "Champions", "Quarter-finals"). */
  stage: string;
  tier: Tier;
  p: number; w: number; d: number; l: number; gf: number; ga: number;
}

/** The tournament's teams in alphabetical order of the names `nameOf` gives them. */
export function stripTeams(teams: readonly TournamentTeam[], say: Speaker["say"], nameOf: (t: TournamentTeam) => string, hasSquad: (teamId: string) => boolean): StripTeam[] {
  const taken = new Set<string>();
  const list = teams.map((t) => {
    const code = soccerAbbr(t.team_id, t.team);
    let anchor = `squad-${code.toLowerCase()}`;
    if (taken.has(anchor)) anchor = `squad-${t.team_slug}`;
    taken.add(anchor);
    return {
      id: t.team_id, anchor, code, region: regionOf(t), slug: t.team_slug, squad: hasSquad(t.team_id), name: nameOf(t), flag: t.flag_code, stage: reached(say, t), tier: tierOf(reachRank(t)),
      p: t.played, w: t.won, d: t.drawn, l: t.lost, gf: t.goals_for, ga: t.goals_against,
    } satisfies StripTeam;
  });
  return list.sort((a, b) => a.name.localeCompare(b.name));
}
