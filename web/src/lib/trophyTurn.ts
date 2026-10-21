/* How a champion banner's trophy sits and turns. Shared by the server (lib/cups.ts, which draws the still it sends) and the browser (lib/turnCup.ts),
   so the still and the first turned frame are the same picture. */

/** Degrees the trophy leans toward the eye, at rest and while it turns. */
export const TROPHY_TILT = 10;

/** Degrees of turn a second: one full turn in 26 seconds. */
export const TROPHY_SPEED = 14;

/** The trophy's emblem module per league, loaded only by a page that shows its banner, and only once the banner is in view. */
export const TROPHY_EMBLEM_LOADERS = {
  nhl: () => import("@johnmorrisdotca/dougu-sports/trophy/hockey-cup").then((m) => m.TROPHY_HOCKEY_CUP),
  pwhl: () => import("@johnmorrisdotca/dougu-sports/trophy/hockey-cup").then((m) => m.TROPHY_HOCKEY_CUP),
  nba: () => import("@johnmorrisdotca/dougu-sports/trophy/basketball").then((m) => m.TROPHY_BASKETBALL),
  wnba: () => import("@johnmorrisdotca/dougu-sports/trophy/basketball").then((m) => m.TROPHY_BASKETBALL),
  nwsl: () => import("@johnmorrisdotca/dougu-sports/trophy/soccer-ball").then((m) => m.TROPHY_SOCCER_BALL),
  mlb: () => import("@johnmorrisdotca/dougu-sports/trophy/baseball").then((m) => m.TROPHY_BASEBALL),
  nfl: () => import("@johnmorrisdotca/dougu-sports/trophy/football").then((m) => m.TROPHY_FOOTBALL),
  cfl: () => import("@johnmorrisdotca/dougu-sports/trophy/canadian-bowl").then((m) => m.TROPHY_CANADIAN_BOWL),
  nha: () => import("@johnmorrisdotca/dougu-sports/trophy/obrien-cup").then((m) => m.TROPHY_OBRIEN_CUP),
  pcha: () => import("@johnmorrisdotca/dougu-sports/trophy/paterson-cup").then((m) => m.TROPHY_PATERSON_CUP),
  wha: () => import("@johnmorrisdotca/dougu-sports/trophy/avco-world-trophy").then((m) => m.TROPHY_AVCO_WORLD_TROPHY),
} as const;

export type TurnLeague = keyof typeof TROPHY_EMBLEM_LOADERS;
