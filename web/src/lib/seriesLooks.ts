/**
 * Colours for a showdown: each team's block colour (its own brand, drawn the same in both themes) and the
 * colour its lines and bars take on the page, worked out for the light and the dark paper so that two teams
 * with alike colours still read apart (the second falls back to its other colour, then to a neutral).
 */
import type { TeamBrandRow } from "./api/types";
import { contrast, PAPER } from "./brand";

export interface SideLook {
  /** The block behind the team's name, a hex without #. */
  block: string;
  /** Text on the block: white or near-black, whichever reads. */
  on: string;
  /** Chart colour on each theme's paper. */
  light: string;
  dark: string;
}

const rgb = (h: string): [number, number, number] => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
const dist = (a: string, b: string): number => {
  const [x, y] = [rgb(a), rgb(b)];
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};
const lower = (h: string) => h.toLowerCase();

/** The league's own colour in each theme (the --nhl... tokens), used when a team has no colours on record. */
const LEAGUE_HEX: Record<string, { light: string; dark: string }> = {
  nhl: { light: "1f6fb2", dark: "5aa6e6" }, nba: { light: "c8571b", dark: "f08a4b" }, mlb: { light: "b5283a", dark: "ef5a6c" },
  nfl: { light: "2f6b3c", dark: "6fb37f" }, cfl: { light: "9b2335", dark: "e06a7c" },
};
const NEUTRALS = [{ light: "5d6874", dark: "9aa4ad" }, { light: "b07a12", dark: "e0a83d" }];

const ON_DARK = "ffffff", ON_LIGHT = "12161b";
const onBlock = (hex: string) => (contrast(hex, ON_DARK) >= contrast(hex, ON_LIGHT) ? ON_DARK : ON_LIGHT);

type Theme = "light" | "dark";
const candidates = (b: TeamBrandRow | null): string[] => [b?.primary_hex, b?.secondary_hex].filter((h): h is string => !!h).map(lower);

/** The two teams' looks. `a` is the first side (the winner on a series page). */
export function seriesLooks(league: string, a: TeamBrandRow | null, b: TeamBrandRow | null): [SideLook, SideLook] {
  const lg = LEAGUE_HEX[league] ?? LEAGUE_HEX.nhl;

  // Block colours: the team's own, the second side taking its other colour when the two are close.
  const ca = candidates(a), cb = candidates(b);
  const blockA = ca[0] ?? lg.light;
  const blockB = cb.find((h) => dist(h, blockA) >= 90) ?? (cb.length && dist(cb[0], blockA) >= 90 ? cb[0] : NEUTRALS[0].light);

  // Chart colours per theme: the first that reads on the paper; the second side must also differ from the first.
  const pick = (theme: Theme, own: string[], fallbacks: string[], apart: string | null) => {
    const paper = PAPER[theme];
    const pool = [...own, ...fallbacks];
    return pool.find((h) => contrast(h, paper) >= 3 && (!apart || dist(h, apart) >= 80)) ?? pool.find((h) => contrast(h, paper) >= 3) ?? lg[theme];
  };
  const out = (theme: Theme) => {
    const x = pick(theme, ca, [lg[theme]], null);
    const y = pick(theme, cb, [NEUTRALS[0][theme], NEUTRALS[1][theme], lg[theme]], x);
    return [x, y] as const;
  };
  const [lx, ly] = out("light"), [dx, dy] = out("dark");
  return [
    { block: blockA, on: onBlock(blockA), light: lx, dark: dx },
    { block: blockB, on: onBlock(blockB), light: ly, dark: dy },
  ];
}
