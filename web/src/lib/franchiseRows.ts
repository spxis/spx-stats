import "server-only";
import type { NoSeasonKind } from "@/components/ui";
import { abbrFor, type AbbrMap } from "./abbr";
import type { SeasonSummaryRow, StandingRow } from "./api/types";
import { logoFor, type BrandMap } from "./brand";
import { getTeamPhases, type TeamData } from "./data";
import type { Speaker } from "./i18n/i18n";
import { idleYears } from "./noSeason";
import type { StandFlags, StandLine } from "./standLines";

/**
 * The seasons a franchise's standings table lists, worked out once for the page and for the route that serves the older ones.
 * The standings rows, plus a row for each season the club has but the standings do not: the quiet years (no games), and the seasons that
 * are only a Stanley Cup challenge, a playoff run or a season not begun. `bare` holds the label of each of those.
 */
export async function franchiseSeasonRows(lg: string, f: number, t: TeamData, rows: StandingRow[], seasons: SeasonSummaryRow[], say: Speaker["say"]) {
  const withGames = new Set(seasons.filter((x) => x.league === lg && x.games > 0).map((x) => x.year));
  const idle = idleYears(rows, seasons, lg);
  // Seasons the club has but the standings do not (no regular-season games on file): the early Stanley Cup challengers played only a series, a few
  // clubs have a champion year with no games loaded, and a season not begun has nothing. Each is listed with what it is, so the page agrees with the city page.
  const haveRow = new Set(rows.map((r) => r.year));
  const pending = t.unrecorded.filter(([y, champion]) => !haveRow.has(y) && (withGames.has(y) || champion));
  const phases = await getTeamPhases(lg, f, pending.map(([y]) => y).join(","));
  const bare = new Map(pending.map(([year, , team]) => {
    const ph = phases.get(year);
    const kind = ph?.has("playoffs") && !ph.has("regular") ? (lg === "nhl" && year < 1926 ? "bareCup" : "barePlayoffs") : ph?.size ? "bareOther" : "bareNone";
    return [year, { team, label: say(`team.${kind}` as const) }] as const;
  }));
  for (const y of bare.keys()) idle.delete(y);
  const blank = { team_id: 0, franchise_id: f, gp: null, w: null, l: null, t: null, otl: null, pts: null, pf: null, pa: null, home: null, road: null, pct: null, basis: "none", source: null };
  const gaps: StandingRow[] = [...idle].filter(([y]) => !rows.some((r) => r.year === y)).map(([y]) => ({ ...blank, league: lg, year: y, team: null }));
  const bareRows: StandingRow[] = [...bare].map(([y, x]) => ({ ...blank, league: lg, year: y, team: x.team }));
  const tableRows = [...rows, ...gaps, ...bareRows].sort((a, b) => b.year - a.year);
  return { withGames, idle, bare, tableRows };
}

/** The table's rows as plain data (lib/standLines.ts), newest season first, and what the table needs besides them. A blank field is left out, so the rows stay small in the page's payload. */
export function standLines(
  f: number, tableRows: StandingRow[], won: ReadonlySet<number>, idle: ReadonlyMap<number, NoSeasonKind>, bare: ReadonlyMap<number, { label: string }>,
  withGames: ReadonlySet<number>, brands: BrandMap, abbrs: AbbrMap, rows: StandingRow[],
): { lines: StandLine[]; flags: StandFlags } {
  const logos: string[] = [];
  const lines = tableRows.map((r): StandLine => {
    const l: StandLine = { y: r.year };
    const put = <K extends keyof StandLine>(k: K, v: StandLine[K] | null | undefined) => { if (v != null && v !== "") l[k] = v; };
    const quiet = idle.get(r.year);
    if (won.has(r.year)) l.c = 1;
    put("idle", quiet);
    if (!quiet) {
      put("team", r.team);
      put("ab", abbrFor(abbrs, f, r.year, r.team));
      const logo = logoFor(brands, f, r.year);
      if (logo) { let i = logos.indexOf(logo); if (i < 0) i = logos.push(logo) - 1; l.lo = i; }
    }
    put("bare", bare.get(r.year)?.label);
    put("gp", r.gp);
    if (r.gp != null && withGames.has(r.year)) l.g = 1;
    for (const k of ["w", "l", "t", "otl", "pts", "pf", "pa", "pct"] as const) put(k, r[k]);
    put("home", r.home);
    put("road", r.road);
    return l;
  });
  const flags: StandFlags = {
    showT: rows.some((r) => r.t), showO: rows.some((r) => r.otl), showP: rows.some((r) => r.pts != null),
    maxPct: Math.max(0, ...rows.map((r) => r.pct ?? 0)) || 1, logos,
  };
  return { lines, flags };
}
