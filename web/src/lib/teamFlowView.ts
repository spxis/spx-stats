import "server-only";
import type { SankeyLinkIn, SankeyNodeIn, SankeyRoute } from "@/components/Sankey";
import type { StandingRow } from "./api/types";
import { brandFor, teamTone } from "./brand";
import { getBrands, getSeasonStandings, getSummary } from "./data";
import type { Speaker } from "./i18n/i18n";
import { seasonLabel } from "./leagues";
import { getSeasonRoster, neighbours } from "./outageData";
import { getPlayerPaths } from "./playerLinks";
import { isComplete, rosterFlow, type FlowGroup, type GroupKind, type Side } from "./rosterFlow";
import { nickname } from "./series";
import { getPaths } from "./teamSlugs";

/** What the roster flow of a club's season shows: a note when there is nothing to draw, else the diagram (its blocks, bands and routes, all words made) and the notes under it. */
export interface FlowAnswer {
  /** The only thing to say when no diagram can be drawn. */
  note?: string;
  chart?: { lede: string; nodes: SankeyNodeIn[]; links: SankeyLinkIn[]; routes: SankeyRoute[]; columnTitles: string[]; hint: string; aria: string; foot: string[] };
}

const RESIDUE = { first: "flow.first", last: "flow.last", absent: "flow.absent", unknown: "flow.unknown" } as const satisfies Record<Exclude<GroupKind, "club">, string>;
const RESIDUE_NOTE = { first: "flow.firstNote", last: "flow.lastNote", absent: "flow.absentNote", unknown: "flow.unknownNote" } as const satisfies Record<Exclude<GroupKind, "club">, string>;

/**
 * Where a club's players of one season came from (the season before) and where they went (the season after). Only for seasons the archive holds a roster for;
 * otherwise it says so. A side whose season has no roster in the archive is left out. It reads the whole league's rosters of three seasons, so it is fetched
 * when the reader gets near it (the route `rows/flow`), never drawn with the page.
 */
export async function teamFlowView(lg: string, year: number, f: number, name: string, { say, plural }: Pick<Speaker, "say" | "plural">): Promise<FlowAnswer> {
  const summary = await getSummary();
  const near = neighbours(summary.seasons, lg, year);
  const years = { before: near.before?.year ?? null, after: near.after?.year ?? null };
  const [cur, bRows, aRows, bTable, aTable, brands, paths, playerPath] = await Promise.all([
    getSeasonRoster(lg, year),
    years.before != null ? getSeasonRoster(lg, years.before) : Promise.resolve([]),
    years.after != null ? getSeasonRoster(lg, years.after) : Promise.resolve([]),
    years.before != null ? getSeasonStandings(lg, years.before) : Promise.resolve([] as StandingRow[]),
    years.after != null ? getSeasonStandings(lg, years.after) : Promise.resolve([] as StandingRow[]),
    getBrands(),
    getPaths(),
    getPlayerPaths(),
  ]);
  if (!cur.some((r) => r.franchise_id === f)) return { note: say("flow.noRoster") };

  const side = (rows: typeof cur, table: StandingRow[]): Side | null => {
    if (!rows.length) return null;
    const held = new Set(rows.map((r) => r.franchise_id)).size;
    return { rows, complete: isComplete(held, new Set(table.map((r) => r.franchise_id)).size) };
  };
  const before = years.before != null ? side(bRows, bTable) : null;
  const after = years.after != null ? side(aRows, aTable) : null;
  const flow = rosterFlow(f, year, cur, before, after);
  const missing = [
    ...(years.before != null && !before ? [years.before] : []),
    ...(years.after != null && !after ? [years.after] : []),
  ];
  if (!flow.before && !flow.after) return { note: say("flow.noSides") };

  const hasBefore = !!flow.before;
  const meCol = hasBefore ? 1 : 0;
  const season = seasonLabel(lg, year);
  const tone = (club: number, y: number) => teamTone(brandFor(brands, club, y), "var(--muted)");
  const clubName = (club: number, table: StandingRow[]) => table.find((r) => r.franchise_id === club)?.team || `#${club}`;
  const items = (g: { players: { id: number; name: string }[] }) => g.players.map((p) => ({ label: p.name, href: playerPath(p.id, p.name, lg) }));
  const meName = name;
  const meTone = tone(f, year);

  const nodes: SankeyNodeIn[] = [{
    id: "me", column: meCol, order: 0, label: nickname(meName), sub: plural("flow.players", flow.me.length), tone: meTone,
    title: say("flow.meTitle", { team: meName, season }),
    lines: [plural("flow.players", flow.me.length)],
    items: items({ players: flow.me }),
  }];
  const links: SankeyLinkIn[] = [];
  const routes: SankeyRoute[] = [];

  const add = (dir: "before" | "after", groups: FlowGroup[], y: number, table: StandingRow[]) => {
    const col = dir === "before" ? 0 : meCol + 1;
    const ySeason = seasonLabel(lg, y);
    groups.forEach((g, i) => {
      const id = `${dir === "before" ? "b" : "a"}:${g.key}`;
      const n = g.players.length;
      const kind = g.kind;
      const isClub = kind === "club";
      const club = g.f ?? 0;
      const label = kind === "club" ? clubName(club, table) : say(RESIDUE[kind]);
      const href = isClub ? paths.teamSeason(lg, club, y) : undefined;
      const t = isClub ? tone(club, y) : "var(--muted)";
      const lines = kind === "club"
        ? [plural("flow.with", n, { team: label, season: ySeason })]
        : [plural("flow.players", n), say(RESIDUE_NOTE[kind], { season: kind === "first" || kind === "last" ? season : ySeason })];
      nodes.push({
        id, column: col, order: i + 1, label: isClub ? nickname(label) : label, sub: plural("flow.players", n), href, tone: t, muted: !isClub,
        title: isClub ? `${label} ${ySeason}` : label, lines, items: items(g),
      });
      links.push({
        id: `${dir === "before" ? "lb" : "la"}:${g.key}`,
        source: dir === "before" ? id : "me", target: dir === "before" ? "me" : id, value: n, tone: t, href,
        title: dir === "before" ? `${label} → ${meName}` : `${meName} → ${label}`, lines, items: items(g),
      });
    });
  };
  if (flow.before) add("before", flow.before, years.before!, bTable);
  if (flow.after) add("after", flow.after, years.after!, aTable);

  const seen = new Set<string>();
  for (const r of flow.routes) {
    const key = `${r.before}|${r.after}`;
    if (seen.has(key)) continue;
    seen.add(key);
    routes.push({
      nodes: [...(r.before ? [`b:${r.before}`] : []), "me", ...(r.after ? [`a:${r.after}`] : [])],
      links: [...(r.before ? [`lb:${r.before}`] : []), ...(r.after ? [`la:${r.after}`] : [])],
    });
  }
  // A player who was with two clubs is in each group; say so only when it happened.
  const twoClubs = [flow.before, flow.after].some((groups) => {
    const ids = (groups ?? []).flatMap((g) => g.players.map((p) => p.id));
    return new Set(ids).size < ids.length;
  });
  const partial = [before, after].some((s) => s && !s.complete);

  const columnTitles = [
    ...(years.before != null && flow.before ? [seasonLabel(lg, years.before)] : []),
    season,
    ...(years.after != null && flow.after ? [seasonLabel(lg, years.after)] : []),
  ];
  const foot = [
    ...missing.map((y) => say("flow.noSide", { season: seasonLabel(lg, y) })),
    ...(partial ? [say("flow.partial")] : []),
    ...(twoClubs ? [say("flow.twoClubs")] : []),
    say("flow.noteFirst"),
  ];
  return { chart: { lede: say("flow.lede"), nodes, links, routes, columnTitles, hint: say("flow.hint"), aria: say("flow.aria", { team: meName, season }), foot } };
}
