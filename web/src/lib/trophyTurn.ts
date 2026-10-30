/* How a champion banner's trophy sits and turns. Shared by the server (lib/cups.ts, which draws the still it sends) and the browser (lib/turnCup.ts),
   so the still and the first turned frame are the same picture. */

/** Degrees the trophy leans toward the eye, at rest and while it turns. */
export const TROPHY_TILT = 10;

/** Degrees of turn a second: one full turn in 26 seconds. */
export const TROPHY_SPEED = 14;

/** The trophy's emblem module per league (the NBA's by design, lib/trophyEra.ts), loaded only by a page that shows its banner, and only once the banner is in view. */
export const TROPHY_EMBLEM_LOADERS = {
  nhl: () => import("@johnmorrisdotca/dougu-sports/trophy/stanley-cup").then((m) => m.TROPHY_STANLEY_CUP),
  pwhl: () => import("@johnmorrisdotca/dougu-sports/trophy/walter-cup").then((m) => m.TROPHY_WALTER_CUP),
  nba: () => import("@johnmorrisdotca/dougu-sports/trophy/larry-obrien-trophy").then((m) => m.TROPHY_LARRY_OBRIEN_TROPHY),
  "nba-1977": () => import("@johnmorrisdotca/dougu-sports/trophy/larry-obrien-trophy-1977").then((m) => m.TROPHY_LARRY_OBRIEN_TROPHY_1977),
  wnba: () => import("@johnmorrisdotca/dougu-sports/trophy/wnba-championship-trophy").then((m) => m.TROPHY_WNBA_CHAMPIONSHIP_TROPHY),
  nwsl: () => import("@johnmorrisdotca/dougu-sports/trophy/soccer-ball").then((m) => m.TROPHY_SOCCER_BALL),
  mlb: () => import("@johnmorrisdotca/dougu-sports/trophy/commissioners-trophy").then((m) => m.TROPHY_COMMISSIONERS_TROPHY),
  "mlb-1967": () => import("@johnmorrisdotca/dougu-sports/trophy/baseball").then((m) => m.TROPHY_BASEBALL),
  nfl: () => import("@johnmorrisdotca/dougu-sports/trophy/lombardi-trophy").then((m) => m.TROPHY_LOMBARDI_TROPHY),
  "nfl-pre": () => import("@johnmorrisdotca/dougu-sports/trophy/football").then((m) => m.TROPHY_FOOTBALL),
  cfl: () => import("@johnmorrisdotca/dougu-sports/trophy/grey-cup").then((m) => m.TROPHY_GREY_CUP),
  nha: () => import("@johnmorrisdotca/dougu-sports/trophy/obrien-cup").then((m) => m.TROPHY_OBRIEN_CUP),
  pcha: () => import("@johnmorrisdotca/dougu-sports/trophy/paterson-cup").then((m) => m.TROPHY_PATERSON_CUP),
  wha: () => import("@johnmorrisdotca/dougu-sports/trophy/avco-world-trophy").then((m) => m.TROPHY_AVCO_WORLD_TROPHY),
} as const;

export type TurnLeague = keyof typeof TROPHY_EMBLEM_LOADERS;
