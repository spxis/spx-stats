import "server-only";
import type { PersonAwardRow } from "./api/people";
import { brandFor, logoFor, teamTone, type BrandMap } from "./brand";
import { clubInfoKey, bucketOf, GROUPS, packRef, type BoardData, type ClubInfo, type RefPack, type RefRow, type SeasonInfo, type StatRow } from "./playerBoard";
import { packBoard, type BoardWire } from "./playerBoardWire";
import { getStatRefs, type PlayerRecord } from "./people";
import type { PersonTeamRow } from "./api/people";
import type { SeasonSummaryRow } from "./api/types";

/** A title: a season in a run of seasons with a franchise in which that franchise was the league champion, or a club-season the statistics file marks as champion. Newest first. */
export function careerTitles(teams: readonly PersonTeamRow[], record: PlayerRecord, seasons: readonly Pick<SeasonSummaryRow, "league" | "year" | "champion_franchise">[]): { league: string; year: number; team: string | null }[] {
  const champ = new Map(seasons.filter((s) => s.champion_franchise != null).map((s) => [`${s.league}|${s.year}`, s.champion_franchise]));
  const titles: { league: string; year: number; team: string | null }[] = [];
  for (const t of teams) for (let y = t.from_year; y <= t.to_year; y++) if (champ.get(`${t.league}|${y}`) === t.franchise_id) titles.push({ league: t.league, year: y, team: t.team });
  for (const s of record.seasonTeams) if (s.team_champion && !titles.some((t) => t.league === s.league && t.year === s.year)) titles.push({ league: s.league, year: s.year, team: s.team });
  return titles.sort((a, b) => b.year - a.year);
}

/**
 * Everything the player's board draws from, in the small shape the browser gets: the stat rows (clubs of a season kept apart), the club-seasons,
 * how each club looked then, titles and awards, packed (lib/playerBoardWire.ts). Returns null when there is nothing to show.
 * The league's figures are not in it: see buildRefs.
 */
export async function buildBoardData(o: {
  name: string;
  position: string | null;
  record: PlayerRecord;
  brands: BrandMap;
  titles: { league: string; year: number; team: string | null }[];
  awards: PersonAwardRow[];
  held: Set<string>;
}): Promise<BoardData | null> {
  const stats: StatRow[] = o.record.stats
    .filter((s) => s.stat_group in GROUPS && (s.phase === "regular" || s.phase === "playoffs"))
    .map((s) => ({ league: s.league, year: s.year, ts: s.team_season_id, f: s.franchise_id, team: s.team, phase: s.phase as StatRow["phase"], group: s.stat_group, stats: s.stats }));
  const seasons: SeasonInfo[] = o.record.seasonTeams.map((s) => ({ league: s.league, year: s.year, label: s.season_label, f: s.franchise_id, team: s.team,
    reg: s.played_regular, po: s.played_playoffs, teamPo: s.team_made_playoffs, champ: s.team_champion }));
  const years = [...stats.map((s) => s.year), ...seasons.map((s) => s.year)];
  if (!years.length) return null;
  const min = Math.min(...years), max = Math.max(...years);

  const clubs: Record<string, ClubInfo> = {};
  for (const r of [...stats, ...seasons]) {
    const k = clubInfoKey(r.league, r.f, r.year);
    if (clubs[k]) continue;
    clubs[k] = { team: r.team, logo: logoFor(o.brands, r.f, r.year), tone: teamTone(brandFor(o.brands, r.f, r.year)) };
  }

  return {
    name: o.name, min, max, bucket: bucketOf("skater", o.position), position: o.position, stats, seasons, clubs, titles: o.titles,
    held: [...o.held].filter((k) => { const [lg, y] = k.split("|"); return seasons.some((s) => s.league === lg) && Number(y) >= min && Number(y) <= max; }),
    awards: o.awards.filter((a) => a.kind !== "championship").map((a) => ({ league: a.league, year: a.year, award: a.award, team: a.team })),
  };
}

/** The board packed for the page (lib/playerBoardWire.ts). */
export async function buildBoard(o: Parameters<typeof buildBoardData>[0]): Promise<BoardWire | null> {
  const b = await buildBoardData(o);
  return b ? packBoard(b) : null;
}

/**
 * The league's figures behind a player's stat rows (api.stat_reference, packed), for every league and group the player has, over the seasons they played them.
 * They are about 50 KB for a long career, so the page does not carry them: the board fetches them once it is drawn (/api/players/<id>/refs).
 * A failed or empty read leaves them out and the board hides what needs them.
 */
export async function buildRefs(record: PlayerRecord, position: string | null): Promise<RefPack[]> {
  const combos = new Map<string, { league: string; group: string; from: number; to: number; playoffs: boolean }>();
  for (const s of record.stats) {
    if (!(s.stat_group in GROUPS) || (s.phase !== "regular" && s.phase !== "playoffs")) continue;
    const k = `${s.league}|${s.stat_group}`;
    const c = combos.get(k) ?? { league: s.league, group: s.stat_group, from: s.year, to: s.year, playoffs: false };
    c.from = Math.min(c.from, s.year);
    c.to = Math.max(c.to, s.year);
    c.playoffs ||= s.phase === "playoffs";
    combos.set(k, c);
  }
  const refs: RefRow[] = (await Promise.all([...combos.values()].map((c) =>
    getStatRefs(c.league, c.group, bucketOf(c.group, position), c.from, c.to, c.playoffs ? "regular,playoffs" : "regular")))).flat();
  return refs.map(packRef);
}
