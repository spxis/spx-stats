import { roadToFinal } from "@johnmorrisdotca/kyogijo-stadiums/charts";
import type { Speaker } from "./i18n/i18n.ts";
import type { Match } from "./soccer.ts";
import { soccerFlagAddress } from "./soccerFlagSprite.ts";
import { SOCCER_LOOK, soccerAbbr } from "./soccerLook.ts";
import { teamName } from "./soccerNames.ts";
import { roadOf, type Road, type RoadTeam } from "./soccerRoad.ts";
import { stageName } from "./soccerView.ts";

/**
 * A tournament's road to the final, drawn with kyogijo in the reader's language: the SVG for the file the page loads (app/soccer-road/[file]), and what the page
 * itself writes (the table that stands for the drawing, the labels, the drawing's shape). One function for both, so the file and the table never disagree. Pure.
 *
 * The phone size is used at every width: one drawing about 17 KB, which the page does not carry in its HTML (a string given to a page is sent twice, once as
 * markup and once as data) but fetches when it comes into view. The flags are files of their own (/soccer-flag/<CODE>.svg), as the pitch's marks are.
 */
export interface RoadChart {
  road: Road;
  /** The drawing, decorative (aria-hidden, no titles): the page says what it shows and holds the table. */
  svg: string;
  width: number;
  height: number;
  /** The words of the rounds, by key, and of the group stage. */
  labels: Record<string, string>;
  groups: string;
  title: string;
}

export function roadChartFor(matches: readonly Match[], year: number, league: string, sp: Pick<Speaker, "say" | "locale">): RoadChart | null {
  const { say, locale } = sp;
  const team = (m: Match, id: string): RoadTeam => {
    const home = m.home_team_id === id;
    const t = home ? { name: m.home, slug: m.home_slug, flag: m.home_flag } : { name: m.away, slug: m.away_slug, flag: m.away_flag };
    const logo = soccerFlagAddress(t.flag), look = SOCCER_LOOK[id];
    return { name: teamName(t, locale), abbr: soccerAbbr(id, t.name), ...(logo ? { logo } : {}), ...(look ? { color: `#${look[1]}` } : {}) };
  };
  const words = (kind: "aet" | "pens" | "replay", pens?: readonly [number, number]) =>
    kind === "aet" ? say("wc.aetShort") : kind === "replay" ? say("wc.ko.replay") : say("wc.road.pens", { a: pens?.[0] ?? "", b: pens?.[1] ?? "" });
  const road = roadOf(matches, team, words);
  if (!road) return null;

  const title = say(league === "wwc" ? "wc.tournamentWomen" : "wc.tournamentMen", { year });
  const labels: Record<string, string> = {
    "round-of-32": stageName(say, "round_of_32"), "round-of-16": stageName(say, "round_of_16"), "quarter-final": stageName(say, "quarter"),
    "semi-final": stageName(say, "semi"), final: road.finalRound ? say("wc.road.decider") : stageName(say, "final"),
  };
  for (const r of road.rounds) if (r.replay) labels[r.key] = `${stageName(say, r.stage)} · ${say("wc.ko.replay")}`;
  const groups = road.secondGroups ? say("wc.road.groupsMulti") : say("wc.road.groups");
  const chart = roadToFinal(road.finalists, {
    language: locale === "ja" ? "ja" : "en", size: "phone", style: "none", id: `road-${league}-${year}`, title,
    subtitle: road.finalRound ? say("wc.road.decider") : say("wc.t.road"), final: road.final, labels, groupLabel: groups,
  });
  const svg = chart.draw()
    .replace(/ role="img" aria-labelledby="[^"]*"/, ' aria-hidden="true" focusable="false"')
    .replace(/<title\b[^>]*>[\s\S]*?<\/title>/g, "")
    .replace(/<desc\b[^>]*>[\s\S]*?<\/desc>/, "");
  const box = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg);
  return { road, svg, width: Math.round(Number(box?.[1] ?? 390)), height: Math.round(Number(box?.[2] ?? 600)), labels, groups, title };
}
