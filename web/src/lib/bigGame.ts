/**
 * What makes a postseason game a big one on a score card or a game page: the name of its round, its number in the series, where the series stands after it and
 * each club's wins. Worked out from the games with the same counting the series pages use (series.ts), so a card and the series page never disagree. Pure: the
 * page hands over the season's playoff games (a league that tells its postseason as games hands over the labels instead).
 */

import type { GameRow } from "./api/types";
import { bowlName, groupOf, roundTag } from "./postseason.ts";
import { describeRounds, deriveSeries, nickname, roundTitle } from "./series.ts";
import type { Say } from "./seriesCopy.ts";
import type { ConferenceSide } from "./trophyEra.ts";

export interface BigGame {
  /** The round's name: "World Series", "League Championship Series", a bowl game's name. */
  round: string;
  /** The league's last round (World Series, Stanley Cup Final, Super Bowl, Grey Cup, the national championship game): drawn strongest. */
  final: boolean;
  /** The game decides the title: the clinching game of the final series, a winner-take-all game 7, or a final of one game. Only ever true when `final` is. */
  decides: boolean;
  /** The game's number in its series (a best-of-N round), else null. */
  n: number | null;
  /** The round of a Playoff game in the college game's labels ("Semifinal"), else null. */
  tag: string | null;
  /** The series after this game; null for a round of single games, a series of total goals, or a series the archive holds too few games of to count. */
  series: { kind: "tied" | "leads" | "wins"; a: number; b: number; lead: { f: number; name: string } | null } | null;
  /** The series wins of this game's away and home club after it (the same order), null when the series is not counted. */
  wins: [number, number] | null;
  /** The game is in a conference final (the NBA's Conference Finals, the NFL's Conference Championship), not the league's last round: a smaller banner with the conference trophy. `side` is the conference, null while unknown. Left out of every other game. */
  conf?: { side: ConferenceSide | null };
}

/** The round keys (lib/playoffFormat.ts) that are a conference final whose winner lifts a conference trophy: the NBA's and NFL's, the NHL's Conference Final and, in 2020-21, its Stanley Cup semifinal. */
const CONFERENCE_FINAL = new Set(["confFinals", "confChamp", "confFinal", "scSemis"]);

/** The series of a season's playoff games, one entry per game that belongs to one (a game with none is left out). */
export function seriesBigGames(lg: string, year: number, games: readonly GameRow[], say: Say, robin: string, fallback: string, sideOf?: (franchise: number | null) => ConferenceSide | null): Map<number, BigGame> {
  const out = new Map<number, BigGame>();
  const byId = new Map(games.map((g) => [g.game_id, g]));
  const all = deriveSeries(lg, year, games);
  const desc = describeRounds(lg, year, all, say);
  all.forEach((s, i) => {
    const roundNo = desc.round[i];
    const round = roundTitle(desc.names, roundNo, robin) || fallback;
    const final = desc.final > 0 && roundNo === desc.final;
    const confFinal = !final && (lg === "nba" || lg === "nfl" || lg === "nhl") && CONFERENCE_FINAL.has(desc.keys?.[roundNo - 1] ?? "");
    const conf = confFinal ? { conf: { side: sideOf?.(s.sides[0].f) ?? sideOf?.(s.sides[1].f) ?? null } } : {};
    const leader = Math.max(s.sides[0].wins, s.sides[1].wins);
    // A series someone won with fewer wins than it takes is missing games: its numbers would be wrong, so the card names the round and nothing more.
    const counted = s.bestOf > 1 && s.basis !== "goals" && !(s.winner != null && leader < s.needed);
    for (const sg of s.games) {
      const g = byId.get(sg.id);
      if (!g) continue;
      const [w0, w1] = sg.run;
      const lead = w0 > w1 ? s.sides[0] : s.sides[1];
      const done = sg.played && s.winner != null && sg.n === s.games.length;
      // The clinching game is known from the result; "the last game of the round" only when the round's length is plausible (no side already past the wins it takes).
      const decides = final && (s.bestOf === 1 || (counted && (done || (sg.n === s.bestOf && leader <= s.needed))));
      const side = (f: number | null) => Math.max(0, s.sides.findIndex((t) => t.f === f));
      out.set(sg.id, {
        round, final, decides, tag: null,
        n: counted ? sg.n : null,
        series: counted ? { kind: w0 === w1 ? "tied" : done ? "wins" : "leads", a: Math.max(w0, w1), b: Math.min(w0, w1), lead: w0 === w1 ? null : { f: lead.f, name: nickname(lead.name) } } : null,
        wins: counted ? [sg.run[side(g.away_f)], sg.run[side(g.home_f)]] : null,
        ...conf,
      });
    }
  });
  return out;
}

/**
 * A game of a league that tells its postseason as games (college football) from its label: the national championship game is the strongest, a Playoff game
 * or a bowl game a quieter banner, a conference championship game the quietest. null for a game that is none of these.
 */
export function labelBigGame(phase: string, label: string | null, fallback: string): BigGame | null {
  const group = groupOf({ phase: phase === "playoffs" ? "p" : "r", label }, null);
  if (!group) return null;
  const tag = group === "playoff" ? roundTag(label) : "";
  return { round: group === "title" || group === "conference" ? (label ?? fallback) : bowlName(label) || fallback, final: group === "title", decides: group === "title", n: null, tag: tag || null, series: null, wins: null };
}
