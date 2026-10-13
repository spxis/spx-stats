import { brandFor, teamTone } from "@/lib/brand";
import { getAbbrs, getSeasonStandings } from "@/lib/data";
import { abbrFor } from "@/lib/abbr";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { LG, seasonLabel } from "@/lib/leagues";
import { guard } from "@/lib/loadGuard";
import { rankClubs } from "@/lib/outage";
import { OUT, pathGraph, teamId, type PathLink } from "@/lib/playoffPath";
import { loadPlayoffs } from "@/lib/playoffs";
import { recordText } from "@/lib/record";
import { roundSay } from "@/lib/roundWords";
import { nickname, scoreText, seriesPath } from "@/lib/series";
import { getPaths } from "@/lib/teamSlugs";
import { PlayoffPath } from "./PlayoffPath";
import type { SankeyLinkIn, SankeyNodeIn } from "./Sankey";

/**
 * Every club's path through a season's playoffs as a Sankey diagram, under the bracket: all the clubs on the left, then who made the
 * playoffs, each round (one block per series) and the champion. The words and links are made here, on the server; the diagram is drawn in
 * the browser (PlayoffPath). Draws nothing for a season with no playoff series.
 */
export const SeasonPath = guard(async function SeasonPath({ lg, year }: { lg: string; year: number }) {
  const speaker = await currentSpeaker();
  const { say, plural, fmt } = speaker;
  const [{ series, round, names, final, brands }, standings, abbrs, paths] = await Promise.all([loadPlayoffs(lg, year, roundSay(speaker)), getSeasonStandings(lg, year), getAbbrs(lg), getPaths()]);
  if (!round.some((r) => r > 0)) return null;

  const clubs = rankClubs(standings);
  const club = new Map(clubs.map((c) => [c.f, c]));
  const graph = pathGraph(series, round, clubs.map((c) => ({ f: c.f, place: c.rank })), final);
  const season = seasonLabel(lg, year);
  const nameOf = (f: number): string => club.get(f)?.name || series.flatMap((s) => s.sides).find((s) => s.f === f)?.name || `#${f}`;
  const tone = (f: number | null | undefined) => (f == null ? "var(--muted)" : teamTone(brandFor(brands, f, year)));
  const roundOf = (i: number) => names[round[i] - 1] ?? "";
  const clubPage = (f: number) => paths.teamSeason(lg, f, year);
  const abbr = (f: number, name: string) => abbrFor(abbrs, f, year, name);
  const qualified = graph.nodes.filter((n) => n.kind === "team" && graph.played.has(n.f!)).length;
  const missed = graph.nodes.filter((n) => n.kind === "team").length - qualified;

  /** What happened to a club in one of its series, in a sentence. */
  const result = (f: number, i: number): string => {
    const s = series[i];
    const other = s.sides.find((x) => x.f !== f)!.name;
    if (s.live) {
      const mine = s.sides.find((x) => x.f === f)!, theirs = s.sides.find((x) => x.f !== f)!;
      return say(mine.wins > theirs.wins ? "path.playingLeads" : mine.wins < theirs.wins ? "path.playingTrails" : "path.playingLevel", { opponent: other, round: roundOf(i), score: `${mine.wins}–${theirs.wins}` });
    }
    if (s.winner == null) return say("path.open", { opponent: other, round: roundOf(i) });
    const won = s.sides[0].f === f;
    return say(won ? "path.beat" : "path.lost", { opponent: other, round: roundOf(i), score: scoreText(s) });
  };
  const regular = (f: number): string[] => {
    const c = club.get(f);
    return c ? [say("path.regular", { record: recordText({ w: c.w ?? 0, l: c.l ?? 0, t: c.t, otl: c.otl }), place: fmt(c.rank), of: fmt(clubs.length) })] : [say("path.noRecord")];
  };

  const nodes: SankeyNodeIn[] = graph.nodes.map((n): SankeyNodeIn => {
    if (n.kind === "team") {
      const f = n.f!, name = nameOf(f), c = club.get(f);
      const mine = graph.played.get(f) ?? [];
      return {
        id: n.id, column: 0, order: n.order, label: nickname(name), sub: c ? recordText({ w: c.w ?? 0, l: c.l ?? 0, t: c.t, otl: c.otl }) : undefined,
        href: clubPage(f), tone: tone(f), muted: !mine.length, title: name,
        lines: [
          ...regular(f),
          ...(mine.length ? [] : [say("path.missed")]),
          ...(mine.length && round[mine[0]] > 1 ? [say("path.bye", { round: roundOf(mine[0]) })] : []),
          ...mine.map((i) => result(f, i)),
          ...(graph.champion === f ? [say("path.champions", { season })] : []),
        ],
      };
    }
    if (n.kind === "in" || n.kind === "out") {
      const count = n.kind === "in" ? qualified : missed;
      return { id: n.id, column: 1, order: n.order, label: say(n.kind === "in" ? "path.in" : "path.out"), sub: plural("count.teams", count), tone: "var(--muted)", muted: n.kind === "out", title: say(n.kind === "in" ? "path.in" : "path.out"), lines: [plural("count.teams", count)] };
    }
    if (n.kind === "series") {
      const i = n.series!, s = series[i];
      const [a, b] = s.sides;
      return {
        id: n.id, column: n.column, order: n.order, label: `${abbr(a.f, a.name)}–${abbr(b.f, b.name)}`, sub: s.winner != null || s.live ? scoreText(s) : undefined,
        href: seriesPath(paths, lg, year, s), tone: s.winner != null ? tone(a.f) : "var(--muted)",
        title: say("path.vs", { a: a.name, b: b.name }),
        lines: [
          roundOf(i),
          s.winner != null ? say("path.won", { winner: a.name, loser: b.name, score: scoreText(s) }) : s.live ? say("path.live", { score: scoreText(s) }) : say("path.unsettled"),
        ],
      };
    }
    const f = n.f!;
    return { id: n.id, column: n.column, order: 0, label: nickname(nameOf(f)), sub: say("path.colChampion"), href: clubPage(f), tone: tone(f), title: nameOf(f), lines: [say("path.champions", { season })] };
  });

  const link = (l: PathLink): SankeyLinkIn => {
    const name = nameOf(l.f);
    const base = { id: l.id, source: l.source, target: l.target, value: 1, tone: tone(l.f) };
    switch (l.kind) {
      case "qualify": return { ...base, href: clubPage(l.f), title: name, lines: [say("path.madeIt")] };
      case "miss": return { ...base, href: clubPage(l.f), title: name, lines: [say("path.missed")] };
      case "title": return { ...base, href: seriesPath(paths, lg, year, series[l.series!]), title: say("path.champions", { season }), lines: [name, result(l.f, l.series!)] };
      default: return { ...base, href: seriesPath(paths, lg, year, series[l.series!]), title: `${name}: ${roundOf(l.series!)}`, lines: [result(l.f, l.series!)] };
    }
  };
  const links = graph.links.map(link);

  const missedClubs = new Set(graph.nodes.filter((n) => n.kind === "team" && !graph.played.has(n.f!)).map((n) => n.f!));
  const columnTitles = [say("path.colSeason"), say("path.colPlayoffs"), ...names, ...(graph.champion != null ? [say("path.colChampion")] : [])];
  const notes = [say("path.noteBracket"), ...(round.includes(0) ? [say("path.noteRobin")] : [])];

  return (
    <section className="section" id="path">
      <h2>{say("path.title")}</h2>
      <p className="note">{say("path.lede")}</p>
      <PlayoffPath
        nodes={nodes} links={links} routes={graph.routes.map((r) => ({ nodes: r.nodes, links: r.links }))} columnTitles={columnTitles}
        hiddenNodes={[...(missed ? [OUT] : []), ...[...missedClubs].map(teamId)]}
        hiddenLinks={graph.links.filter((l) => missedClubs.has(l.f)).map((l) => l.id)}
        aria={say("path.aria", { season, league: LG[lg as keyof typeof LG] ?? lg.toUpperCase() })} notes={notes}
      />
    </section>
  );
});
