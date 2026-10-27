/* The cups and medals the pages draw, from John's package @johnmorrisdotca/dougu-sports (MIT): its generic cups suggest each league's trophy rather than reproduce it.
   Drawn on the server, when a page is built, from each emblem's own module (never the package's registry, which holds every emblem), so no drawing code reaches the
   browser. Line style where the cup is small (a table, a badge), metal where it is large (a banner, a medal). Credited on /terms. */
import "server-only";
import { TROPHY_BASEBALL } from "@johnmorrisdotca/dougu-sports/trophy/baseball";
import { TROPHY_BASKETBALL } from "@johnmorrisdotca/dougu-sports/trophy/basketball";
import { TROPHY_BOWL } from "@johnmorrisdotca/dougu-sports/trophy/bowl";
import { TROPHY_CANADIAN_BOWL } from "@johnmorrisdotca/dougu-sports/trophy/canadian-bowl";
import { TROPHY_CUP } from "@johnmorrisdotca/dougu-sports/trophy/cup";
import { TROPHY_FOOTBALL } from "@johnmorrisdotca/dougu-sports/trophy/football";
import { TROPHY_AVCO_WORLD_TROPHY } from "@johnmorrisdotca/dougu-sports/trophy/avco-world-trophy";
import { TROPHY_HOCKEY_CUP } from "@johnmorrisdotca/dougu-sports/trophy/hockey-cup";
import { TROPHY_OBRIEN_CUP } from "@johnmorrisdotca/dougu-sports/trophy/obrien-cup";
import { TROPHY_PATERSON_CUP } from "@johnmorrisdotca/dougu-sports/trophy/paterson-cup";
import { TROPHY_SOCCER_BALL } from "@johnmorrisdotca/dougu-sports/trophy/soccer-ball";
import { TROPHY_SOCCER_GLOBE } from "@johnmorrisdotca/dougu-sports/trophy/soccer-globe";
import { MEDAL_BRONZE } from "@johnmorrisdotca/dougu-sports/medal/bronze";
import { MEDAL_GOLD } from "@johnmorrisdotca/dougu-sports/medal/gold";
import { MEDAL_SILVER } from "@johnmorrisdotca/dougu-sports/medal/silver";
import type { Emblem } from "@johnmorrisdotca/dougu-sports/emblems";
import { TROPHY_TILT } from "./trophyTurn.ts";

/** Each league's (or tournament's) cup, keyed by the league the page passes in, with the name of the trophy a team won as the drawing's title. */
const CUPS: Record<string, readonly [Emblem, string]> = {
  nhl: [TROPHY_HOCKEY_CUP, "Stanley Cup"],
  pwhl: [TROPHY_HOCKEY_CUP, "Walter Cup"],
  nba: [TROPHY_BASKETBALL, "Larry O'Brien Trophy"],
  wnba: [TROPHY_BASKETBALL, "WNBA Championship"],
  nwsl: [TROPHY_SOCCER_BALL, "NWSL Championship"],
  mlb: [TROPHY_BASEBALL, "Commissioner's Trophy"],
  nfl: [TROPHY_FOOTBALL, "Vince Lombardi Trophy"],
  cfl: [TROPHY_CANADIAN_BOWL, "Grey Cup"],
  afl: [TROPHY_FOOTBALL, "AFL Championship"],
  aafc: [TROPHY_FOOTBALL, "AAFC Championship"],
  nha: [TROPHY_OBRIEN_CUP, "O'Brien Cup"],
  pcha: [TROPHY_PATERSON_CUP, "Paterson Cup"],
  wchl: [TROPHY_HOCKEY_CUP, "WCHL Championship"],
  wha: [TROPHY_AVCO_WORLD_TROPHY, "Avco World Trophy"],
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

/** A banner trophy, drawn large: polished metal, leaning a little toward the eye, no title (the page labels it in the reader's language). It is the first frame of the turn the browser then runs. */
export function bannerCupSvg(league: string): string {
  const [emblem] = CUPS[league] ?? CUPS.nhl;
  return unsized(emblem.frame({ style: "metal", size: 64, yaw: 0, pitch: TROPHY_TILT, title: false }));
}

/** The leagues whose trophy has its own drawing in the package, so a large cup is drawn in metal for them; the others keep the line cup. */
const FULL_DRAWING = new Set(["nhl", "nba", "mlb", "nfl", "cfl", "nha", "pcha", "wha"]);

/** A cup for a large place beside a count: the full metal drawing (titled with the trophy's name) for a league that has one, else the line cup. */
export function bigCupSvg(league: string): string {
  const entry = CUPS[league];
  if (!entry || !FULL_DRAWING.has(league)) return cupSvg(league);
  return unsized(entry[0].frame({ style: "metal", size: 64, yaw: 0, pitch: TROPHY_TILT, title: entry[1] }));
}

/** The gold, silver or bronze medal of a first, second or third place, in metal so that each keeps its colour, or "" for any other place. */
export function medalSvg(place: number): string {
  const found = MEDALS[place];
  return found ? unsized(found[0].svg({ style: "metal", size: 64, title: found[1] })) : "";
}

/**
 * The drawing of one award for the trophy pages (lib/awardTrophy.ts, app/[locale]/s/[league]/trophy). A league's championship is drawn as its cup above. Every other
 * award has no drawing of its own in the package yet, so it is drawn with a plain stand-in: a generic cup for an award to a person, a bowl for an award to a team,
 * and the page says so (`named` is false). When the package gets a named drawing (the Calder, the Hart, the Vezina), add it to NAMED by the award's code (one import and
 * one line): the pages then draw it, in the list and large on the award's own page, and drop the note.
 */
const NAMED: Record<string, Emblem> = {};

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
    const cup = CUPS[league];
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
