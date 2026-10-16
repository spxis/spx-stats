/* The cups and medals the pages draw, from John's package @johnmorrisdotca/dougu-sports (MIT): its generic cups suggest each league's trophy rather than reproduce it.
   Drawn on the server, when a page is built, from each emblem's own module (never the package's registry, which holds every emblem), so no drawing code reaches the
   browser. Line style where the cup is small (a table, a badge), metal where it is large (a banner, a medal). Credited on /terms. */
import "server-only";
import { TROPHY_BASEBALL } from "@johnmorrisdotca/dougu-sports/trophy/baseball";
import { TROPHY_BASKETBALL } from "@johnmorrisdotca/dougu-sports/trophy/basketball";
import { TROPHY_CANADIAN_BOWL } from "@johnmorrisdotca/dougu-sports/trophy/canadian-bowl";
import { TROPHY_FOOTBALL } from "@johnmorrisdotca/dougu-sports/trophy/football";
import { TROPHY_HOCKEY_CUP } from "@johnmorrisdotca/dougu-sports/trophy/hockey-cup";
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
  nba: [TROPHY_BASKETBALL, "Larry O'Brien Trophy"],
  wnba: [TROPHY_BASKETBALL, "WNBA Championship"],
  mlb: [TROPHY_BASEBALL, "Commissioner's Trophy"],
  nfl: [TROPHY_FOOTBALL, "Vince Lombardi Trophy"],
  cfl: [TROPHY_CANADIAN_BOWL, "Grey Cup"],
  afl: [TROPHY_FOOTBALL, "AFL Championship"],
  aafc: [TROPHY_FOOTBALL, "AAFC Championship"],
  nha: [TROPHY_HOCKEY_CUP, "O'Brien Cup"],
  pcha: [TROPHY_HOCKEY_CUP, "PCHA Championship"],
  wchl: [TROPHY_HOCKEY_CUP, "WCHL Championship"],
  wha: [TROPHY_HOCKEY_CUP, "Avco World Trophy"],
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

/** A banner trophy, drawn large: polished metal, leaning a little toward the eye, no title (the page labels it in the reader's language). It is the first frame of the turn the browser then runs. */
export function bannerCupSvg(league: string): string {
  const [emblem] = CUPS[league] ?? CUPS.nhl;
  return unsized(emblem.frame({ style: "metal", size: 64, yaw: 0, pitch: TROPHY_TILT, title: false }));
}

/** The gold, silver or bronze medal of a first, second or third place, in metal so that each keeps its colour, or "" for any other place. */
export function medalSvg(place: number): string {
  const found = MEDALS[place];
  return found ? unsized(found[0].svg({ style: "metal", size: 64, title: found[1] })) : "";
}
