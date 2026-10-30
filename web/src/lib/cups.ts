/* The cups and medals the pages draw, from John's package @johnmorrisdotca/dougu-sports (MIT): its generic cups suggest each league's trophy rather than reproduce it.
   Drawn on the server, when a page is built, from each emblem's own module (never the package's registry, which holds every emblem), so no drawing code reaches the
   browser. Line style where the cup is small (a table, a badge), metal where it is large (a banner, a medal). Credited on /terms. */
import "server-only";
import { TROPHY_BASEBALL } from "@johnmorrisdotca/dougu-sports/trophy/baseball";
import { TROPHY_BASKETBALL } from "@johnmorrisdotca/dougu-sports/trophy/basketball";
import { TROPHY_BOWL } from "@johnmorrisdotca/dougu-sports/trophy/bowl";
import { TROPHY_BILL_RUSSELL_TROPHY } from "@johnmorrisdotca/dougu-sports/trophy/bill-russell-trophy";
import { TROPHY_BOB_COUSY_TROPHY } from "@johnmorrisdotca/dougu-sports/trophy/bob-cousy-trophy";
import { TROPHY_CALDER_CUP } from "@johnmorrisdotca/dougu-sports/trophy/calder-cup";
import { TROPHY_CANADIAN_BOWL } from "@johnmorrisdotca/dougu-sports/trophy/canadian-bowl";
import { TROPHY_CFP_TROPHY } from "@johnmorrisdotca/dougu-sports/trophy/cfp-trophy";
import { TROPHY_CUP } from "@johnmorrisdotca/dougu-sports/trophy/cup";
import { TROPHY_FOOTBALL } from "@johnmorrisdotca/dougu-sports/trophy/football";
import { TROPHY_GEORGE_HALAS_TROPHY } from "@johnmorrisdotca/dougu-sports/trophy/george-halas-trophy";
import { TROPHY_AVCO_WORLD_TROPHY } from "@johnmorrisdotca/dougu-sports/trophy/avco-world-trophy";
import { TROPHY_HOCKEY_CUP } from "@johnmorrisdotca/dougu-sports/trophy/hockey-cup";
import { TROPHY_JACKIE_ROBINSON_AWARD } from "@johnmorrisdotca/dougu-sports/trophy/jackie-robinson-award";
import { TROPHY_KELLY_CUP } from "@johnmorrisdotca/dougu-sports/trophy/kelly-cup";
import { TROPHY_LAMAR_HUNT_TROPHY } from "@johnmorrisdotca/dougu-sports/trophy/lamar-hunt-trophy";
import { TROPHY_LARRY_OBRIEN_TROPHY } from "@johnmorrisdotca/dougu-sports/trophy/larry-obrien-trophy";
import { TROPHY_LARRY_OBRIEN_TROPHY_1977 } from "@johnmorrisdotca/dougu-sports/trophy/larry-obrien-trophy-1977";
import { TROPHY_NBA_EASTERN_CONFERENCE_2001 } from "@johnmorrisdotca/dougu-sports/trophy/nba-eastern-conference-2001";
import { TROPHY_NBA_WESTERN_CONFERENCE_2001 } from "@johnmorrisdotca/dougu-sports/trophy/nba-western-conference-2001";
import { TROPHY_OBRIEN_CUP } from "@johnmorrisdotca/dougu-sports/trophy/obrien-cup";
import { TROPHY_OSCAR_ROBERTSON_TROPHY } from "@johnmorrisdotca/dougu-sports/trophy/oscar-robertson-trophy";
import { TROPHY_PATERSON_CUP } from "@johnmorrisdotca/dougu-sports/trophy/paterson-cup";
import { TROPHY_SOCCER_BALL } from "@johnmorrisdotca/dougu-sports/trophy/soccer-ball";
import { TROPHY_SOCCER_GLOBE } from "@johnmorrisdotca/dougu-sports/trophy/soccer-globe";
import { TROPHY_WALTER_CUP } from "@johnmorrisdotca/dougu-sports/trophy/walter-cup";
import { TROPHY_WNBA_CHAMPIONSHIP_TROPHY } from "@johnmorrisdotca/dougu-sports/trophy/wnba-championship-trophy";
import { TROPHY_ART_ROSS_TROPHY } from "@johnmorrisdotca/dougu-sports/trophy/art-ross-trophy";
import { TROPHY_CALDER_TROPHY } from "@johnmorrisdotca/dougu-sports/trophy/calder-trophy";
import { TROPHY_CAMPBELL_BOWL } from "@johnmorrisdotca/dougu-sports/trophy/campbell-bowl";
import { TROPHY_COMMISSIONERS_TROPHY } from "@johnmorrisdotca/dougu-sports/trophy/commissioners-trophy";
import { TROPHY_CONN_SMYTHE_TROPHY } from "@johnmorrisdotca/dougu-sports/trophy/conn-smythe-trophy";
import { TROPHY_CY_YOUNG_AWARD } from "@johnmorrisdotca/dougu-sports/trophy/cy-young-award";
import { TROPHY_GOLD_GLOVE_AWARD } from "@johnmorrisdotca/dougu-sports/trophy/gold-glove-award";
import { TROPHY_GREY_CUP } from "@johnmorrisdotca/dougu-sports/trophy/grey-cup";
import { TROPHY_HANK_AARON_AWARD } from "@johnmorrisdotca/dougu-sports/trophy/hank-aaron-award";
import { TROPHY_HART_TROPHY } from "@johnmorrisdotca/dougu-sports/trophy/hart-trophy";
import { TROPHY_JACK_ADAMS_TROPHY } from "@johnmorrisdotca/dougu-sports/trophy/jack-adams-trophy";
import { TROPHY_JENNINGS_TROPHY } from "@johnmorrisdotca/dougu-sports/trophy/jennings-trophy";
import { TROPHY_KING_CLANCY_TROPHY } from "@johnmorrisdotca/dougu-sports/trophy/king-clancy-trophy";
import { TROPHY_LADY_BYNG_TROPHY } from "@johnmorrisdotca/dougu-sports/trophy/lady-byng-trophy";
import { TROPHY_LOMBARDI_TROPHY } from "@johnmorrisdotca/dougu-sports/trophy/lombardi-trophy";
import { TROPHY_MASTERTON_TROPHY } from "@johnmorrisdotca/dougu-sports/trophy/masterton-trophy";
import { TROPHY_MLB_MVP_AWARD } from "@johnmorrisdotca/dougu-sports/trophy/mlb-mvp-award";
import { TROPHY_NORRIS_TROPHY } from "@johnmorrisdotca/dougu-sports/trophy/norris-trophy";
import { TROPHY_PRESIDENTS_TROPHY } from "@johnmorrisdotca/dougu-sports/trophy/presidents-trophy";
import { TROPHY_PRINCE_OF_WALES_TROPHY } from "@johnmorrisdotca/dougu-sports/trophy/prince-of-wales-trophy";
import { TROPHY_RELIEF_MAN_AWARD } from "@johnmorrisdotca/dougu-sports/trophy/relief-man-award";
import { TROPHY_ROCKET_RICHARD_TROPHY } from "@johnmorrisdotca/dougu-sports/trophy/rocket-richard-trophy";
import { TROPHY_SELKE_TROPHY } from "@johnmorrisdotca/dougu-sports/trophy/selke-trophy";
import { TROPHY_SILVER_SLUGGER_AWARD } from "@johnmorrisdotca/dougu-sports/trophy/silver-slugger-award";
import { TROPHY_STANLEY_CUP } from "@johnmorrisdotca/dougu-sports/trophy/stanley-cup";
import { TROPHY_TED_LINDSAY_AWARD } from "@johnmorrisdotca/dougu-sports/trophy/ted-lindsay-award";
import { TROPHY_VEZINA_TROPHY } from "@johnmorrisdotca/dougu-sports/trophy/vezina-trophy";
import { TROPHY_WORLD_SERIES_MVP_TROPHY } from "@johnmorrisdotca/dougu-sports/trophy/world-series-mvp-trophy";
import { MEDAL_BRONZE } from "@johnmorrisdotca/dougu-sports/medal/bronze";
import { MEDAL_GOLD } from "@johnmorrisdotca/dougu-sports/medal/gold";
import { MEDAL_SILVER } from "@johnmorrisdotca/dougu-sports/medal/silver";
import type { Emblem } from "@johnmorrisdotca/dougu-sports/emblems";
import type { EraTrophy } from "./trophyEra.ts";
import { TROPHY_TILT } from "./trophyTurn.ts";

/** Each league's (or tournament's) cup, keyed by the league the page passes in, with the name of the trophy a team won as the drawing's title. */
const CUPS: Record<string, readonly [Emblem, string]> = {
  nhl: [TROPHY_HOCKEY_CUP, "Stanley Cup"],
  pwhl: [TROPHY_WALTER_CUP, "Walter Cup"],
  nba: [TROPHY_BASKETBALL, "Larry O'Brien Trophy"],
  wnba: [TROPHY_WNBA_CHAMPIONSHIP_TROPHY, "WNBA Championship"],
  nwsl: [TROPHY_SOCCER_BALL, "NWSL Championship"],
  mlb: [TROPHY_BASEBALL, "Commissioner's Trophy"],
  nfl: [TROPHY_FOOTBALL, "Vince Lombardi Trophy"],
  ncaaf: [TROPHY_CFP_TROPHY, "National Championship"],
  cfl: [TROPHY_CANADIAN_BOWL, "Grey Cup"],
  afl: [TROPHY_FOOTBALL, "AFL Championship"],
  aafc: [TROPHY_FOOTBALL, "AAFC Championship"],
  nha: [TROPHY_OBRIEN_CUP, "O'Brien Cup"],
  pcha: [TROPHY_PATERSON_CUP, "Paterson Cup"],
  wchl: [TROPHY_HOCKEY_CUP, "WCHL Championship"],
  wha: [TROPHY_AVCO_WORLD_TROPHY, "Avco World Trophy"],
  ahl: [TROPHY_CALDER_CUP, "Calder Cup"],
  echl: [TROPHY_KELLY_CUP, "Kelly Cup"],
  na: [TROPHY_BASEBALL, "National Association pennant"],
  aa: [TROPHY_BASEBALL, "American Association pennant"],
  ua: [TROPHY_BASEBALL, "Union Association pennant"],
  pl: [TROPHY_BASEBALL, "Players' League pennant"],
  fl: [TROPHY_BASEBALL, "Federal League pennant"],
  worldcup: [TROPHY_SOCCER_GLOBE, "World Cup"],
  wwc: [TROPHY_SOCCER_GLOBE, "World Cup"],
  mls: [TROPHY_SOCCER_BALL, "MLS Cup"],
  soccer: [TROPHY_SOCCER_BALL, "Trophy"],
};

/**
 * The named trophies, and the ones that depend on the season (lib/trophyEra.ts chooses): the Stanley Cup, MLB's Commissioner's Trophy, the Vince Lombardi Trophy and the Grey Cup, the NBA's
 * Larry O'Brien Trophy in its two designs, and the conference trophies of the NBA, the NFL and the NHL. A key here
 * wins over the league's cup above for the large drawings (a banner, a game page, a trophy's own page), which draw the real trophy; the small line cups of a table or a sprite keep
 * the league's cup, a symbol of "champion" that is the same for every season.
 */
const ERA: Record<EraTrophy, readonly [Emblem, string]> = {
  "nhl": [TROPHY_STANLEY_CUP, "Stanley Cup"],
  "nhl-east": [TROPHY_PRINCE_OF_WALES_TROPHY, "Prince of Wales Trophy"],
  "nhl-west": [TROPHY_CAMPBELL_BOWL, "Clarence S. Campbell Bowl"],
  "mlb": [TROPHY_COMMISSIONERS_TROPHY, "Commissioner's Trophy"],
  "mlb-1967": [TROPHY_BASEBALL, "World Series Trophy"],
  "nfl": [TROPHY_LOMBARDI_TROPHY, "Vince Lombardi Trophy"],
  "nfl-pre": [TROPHY_FOOTBALL, "NFL Championship"],
  "cfl": [TROPHY_GREY_CUP, "Grey Cup"],
  "nba": [TROPHY_LARRY_OBRIEN_TROPHY, "Larry O'Brien Trophy"],
  "nba-1977": [TROPHY_LARRY_OBRIEN_TROPHY_1977, "Larry O'Brien Trophy"],
  "nba-west": [TROPHY_OSCAR_ROBERTSON_TROPHY, "Oscar Robertson Trophy"],
  "nba-west-2001": [TROPHY_NBA_WESTERN_CONFERENCE_2001, "Western Conference Trophy"],
  "nba-east": [TROPHY_BOB_COUSY_TROPHY, "Bob Cousy Trophy"],
  "nba-east-2001": [TROPHY_NBA_EASTERN_CONFERENCE_2001, "Eastern Conference Trophy"],
  "nfc": [TROPHY_GEORGE_HALAS_TROPHY, "George Halas Trophy"],
  "afc": [TROPHY_LAMAR_HUNT_TROPHY, "Lamar Hunt Trophy"],
};

const ERA_BY_KEY: Record<string, readonly [Emblem, string] | undefined> = ERA;

/** The drawing and name for a key: a season's trophy (ERA), else a league's cup; an unknown key gets the NHL's. */
const drawing = (key: string): readonly [Emblem, string] => ERA_BY_KEY[key] ?? CUPS[key] ?? CUPS.nhl;

const MEDALS: Record<number, readonly [Emblem, string]> = {
  1: [MEDAL_GOLD, "Gold medal"],
  2: [MEDAL_SILVER, "Silver medal"],
  3: [MEDAL_BRONZE, "Bronze medal"],
};

/** The package draws at a size in pixels; the page's CSS sizes every drawing, so the fixed width and height are dropped. */
const unsized = (svg: string): string => svg.replace(' width="64" height="64"', "");

/** A league's cup in line style (one colour, the page's: `currentColor`), titled with its trophy's name. An unknown league gets the NHL's. Trusted static markup, never user input. */
export function cupSvg(league: string): string {
  const [emblem, name] = CUPS[league] ?? CUPS.nhl;
  return unsized(emblem.svg({ style: "line", size: 64, title: name }));
}

/** The cups of some leagues (the ones named, each once), for a client component that draws them (components/CupsProvider.tsx): the markup travels as data, and no drawing code goes with it. */
export function cupsFor(leagues: Iterable<string>): Record<string, string> {
  return Object.fromEntries([...new Set(leagues)].map((league) => [league, cupSvg(league)]));
}

/** The line cup of some leagues as `<symbol>`s of one sprite (components/CupSprite.tsx): a cell draws one with `<use href="#cup-<league>">`, so each drawing is on the page once. */
export function cupSymbols(leagues: Iterable<string>): string {
  return [...new Set(leagues)].map((league) => {
    const svg = cupSvg(league);
    const viewBox = /viewBox="([^"]*)"/.exec(svg)?.[1];
    return `<symbol id="cup-${league}" viewBox="${viewBox}">${svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "")}</symbol>`;
  }).join("");
}

/**
 * The line cup of a league as a CSS mask, for a table with a cup beside every winner (a league's awards by season has about a thousand): the cell draws it with a
 * `::before` that paints the page's accent through the mask, so the drawing is in the page once and a cell carries no markup for it. Trusted static markup.
 */
export function cupMask(league: string): string {
  const svg = cupSvg(league).replace(/<title>.*?<\/title>/, "").replace(/currentColor/g, "#000").replace(/"/g, "'");
  const named = svg.includes("xmlns=") ? svg : svg.replace("<svg", "<svg xmlns='http://www.w3.org/2000/svg'");
  return `url("data:image/svg+xml,${named.replace(/%/g, "%25").replace(/</g, "%3C").replace(/>/g, "%3E").replace(/#/g, "%23")}")`;
}

/** A banner trophy, drawn large: polished metal, leaning a little toward the eye, no title (the page labels it in the reader's language). It is the first frame of the turn the browser then runs. `league` is a league or a season's trophy (lib/trophyEra.ts `titleTrophyKey`). */
export function bannerCupSvg(league: string): string {
  const [emblem] = drawing(league);
  return unsized(emblem.frame({ style: "metal", size: 64, yaw: 0, pitch: TROPHY_TILT, title: false }));
}

/** The cup of a big-game banner, untitled (the banner names the trophy in the reader's language): the line cup in the banner's own colour where it is small (a score card), polished metal where it is large (the game page). `league` is a league or a season's trophy (lib/trophyEra.ts). */
export function gameCupSvg(league: string, large: boolean): string {
  const [emblem] = drawing(league);
  return unsized(large ? emblem.frame({ style: "metal", size: 64, yaw: 0, pitch: TROPHY_TILT, title: false }) : emblem.svg({ style: "line", size: 64, title: false }));
}

/** The leagues whose trophy has its own drawing in the package, so a large cup is drawn in metal for them; the others keep the line cup. */
const FULL_DRAWING = new Set(["nhl", "pwhl", "nba", "wnba", "mlb", "nfl", "cfl", "nha", "pcha", "wha", "ahl", "echl", "ncaaf"]);

/** A cup for a large place beside a count: the full metal drawing (titled with the trophy's name) for a league that has one, else the line cup. */
export function bigCupSvg(league: string): string {
  const entry = ERA_BY_KEY[league] ?? CUPS[league];
  if (!entry || !(FULL_DRAWING.has(league) || league in ERA_BY_KEY)) return cupSvg(league);
  return unsized(entry[0].frame({ style: "metal", size: 64, yaw: 0, pitch: TROPHY_TILT, title: entry[1] }));
}

/** The gold, silver or bronze medal of a first, second or third place, in metal so that each keeps its colour, or "" for any other place. */
export function medalSvg(place: number): string {
  const found = MEDALS[place];
  return found ? unsized(found[0].svg({ style: "metal", size: 64, title: found[1] })) : "";
}

/**
 * The drawing of one award for the trophy pages (lib/awardTrophy.ts, app/[locale]/s/[league]/trophy). A league's championship is drawn as its cup above. Every other
 * award that has no drawing of its own in the package (docs/trophy-audit.md of the package lists them: the NBA's sculpted figures, the CFL's and the AP's awards, the
 * NHL's General Manager of the Year, the Super Bowl MVP and the managers of the year) is drawn with a plain stand-in: a generic cup for an award to a person, a bowl for an
 * award to a team, and the page says so (`named` is false). When the package gets a named drawing, add it to NAMED by the award's code (one import and one line): the
 * pages then draw it, in the list and large on the award's own page, and drop the note.
 */
const NAMED: Record<string, Emblem> = {
  nhl_hart: TROPHY_HART_TROPHY,
  nhl_vezina: TROPHY_VEZINA_TROPHY,
  nhl_norris: TROPHY_NORRIS_TROPHY,
  nhl_calder: TROPHY_CALDER_TROPHY,
  nhl_art_ross: TROPHY_ART_ROSS_TROPHY,
  nhl_conn_smythe: TROPHY_CONN_SMYTHE_TROPHY,
  nhl_lady_byng: TROPHY_LADY_BYNG_TROPHY,
  nhl_selke: TROPHY_SELKE_TROPHY,
  nhl_jennings: TROPHY_JENNINGS_TROPHY,
  nhl_masterton: TROPHY_MASTERTON_TROPHY,
  nhl_king_clancy: TROPHY_KING_CLANCY_TROPHY,
  nhl_jack_adams: TROPHY_JACK_ADAMS_TROPHY,
  nhl_presidents_trophy: TROPHY_PRESIDENTS_TROPHY,
  nhl_rocket_richard: TROPHY_ROCKET_RICHARD_TROPHY,
  nhl_ted_lindsay: TROPHY_TED_LINDSAY_AWARD,
  nba_finals_mvp: TROPHY_BILL_RUSSELL_TROPHY,
  mlb_mvp: TROPHY_MLB_MVP_AWARD,
  mlb_cy_young: TROPHY_CY_YOUNG_AWARD,
  mlb_gold_glove: TROPHY_GOLD_GLOVE_AWARD,
  mlb_silver_slugger: TROPHY_SILVER_SLUGGER_AWARD,
  mlb_world_series_mvp: TROPHY_WORLD_SERIES_MVP_TROPHY,
  mlb_rookie_of_the_year: TROPHY_JACKIE_ROBINSON_AWARD,
  mlb_hank_aaron: TROPHY_HANK_AARON_AWARD,
  mlb_rolaids_relief_man: TROPHY_RELIEF_MAN_AWARD,
};

export interface TrophyArt {
  /** One per distinct drawing: what the sprite's symbol and the cards share, so a drawing used by many awards is on the page once. */
  key: string;
  emblem: Emblem;
  /** The award has a drawing of its own (its league's cup, or a named one), not a stand-in. */
  named: boolean;
}

const GENERIC_PERSON: TrophyArt = { key: "generic-cup", emblem: TROPHY_CUP, named: false };
const GENERIC_TEAM: TrophyArt = { key: "generic-bowl", emblem: TROPHY_BOWL, named: false };

/** The drawing for an award by its code and kind (`championship`, `team_award` or `person_award`). */
export function trophyArt(code: string, kind: string): TrophyArt {
  const own = NAMED[code];
  if (own) return { key: code, emblem: own, named: true };
  if (kind === "championship") {
    const league = code.slice(0, Math.max(0, code.indexOf("_")));
    // MLB's pennants and its championship before the World Series are not the Commissioner's Trophy: the generic baseball stands for them.
    if (league === "mlb" && code !== "mlb_world_series") return { key: "cup-mlb-early", emblem: TROPHY_BASEBALL, named: true };
    const cup = ERA_BY_KEY[league] ?? CUPS[league];
    if (cup) return { key: `cup-${league}`, emblem: cup[0], named: true };
    return GENERIC_TEAM;
  }
  return kind === "team_award" ? GENERIC_TEAM : GENERIC_PERSON;
}

/** The line drawings of some trophies as `<symbol>`s of one sprite (components/TrophySprite.tsx): a card draws one with `<use href="#trophy-<key>">`, once however many cards share it. */
export function trophySymbols(arts: Iterable<TrophyArt>): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of arts) {
    if (seen.has(a.key)) continue;
    seen.add(a.key);
    const svg = unsized(a.emblem.svg({ style: "line", size: 64, title: false }));
    const viewBox = /viewBox="([^"]*)"/.exec(svg)?.[1];
    out.push(`<symbol id="trophy-${a.key}" viewBox="${viewBox}">${svg.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "")}</symbol>`);
  }
  return out.join("");
}

/** A trophy drawn large on its own page: polished metal, leaning a little toward the eye, titled with the award's name. */
export function trophyBigSvg(art: TrophyArt, name: string): string {
  return unsized(art.emblem.frame({ style: "metal", size: 64, yaw: 0, pitch: TROPHY_TILT, title: name }));
}
