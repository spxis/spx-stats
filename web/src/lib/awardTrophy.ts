/**
 * The trophy pages as plain data and sums: the address of a trophy, the winners of one with the doubles of two sources folded into one, who won it most,
 * the longest runs, the people who took several awards in a season, and who holds each trophy now. Pure (no server code, no React), so the pages, the
 * route that serves the older winners and the tests agree on it. The reads are in lib/trophyData.ts and the drawings in lib/cups.ts.
 *
 * An award's `code` is `<league>_<name>` (core.award.code, lowercase letters, digits and underscores, always led by its league's code), and its trophy
 * page is `/<league>/trophy/<name with hyphens>`: the address needs nothing but the code.
 */

/** One winner of an award in a season, as `api.awards` gives it (a season can have several: a rookie of each league, a gold glove at each position). */
export interface TrophyRow {
  year: number;
  award_code: string;
  award: string;
  kind: string;
  winner: string | null;
  note: string | null;
  franchise_id: number | null;
  person_id: number | null;
}

/** An award itself, as `api.award_list` gives it. */
export interface TrophyInfo { league: string; code: string; name: string; kind: string; description: string | null }

export const leagueOfCode = (code: string): string => code.slice(0, Math.max(0, code.indexOf("_")));
export const trophySlug = (code: string): string => code.slice(code.indexOf("_") + 1).replace(/_/g, "-");
/** The page of one trophy: `/nhl/trophy/stanley-cup`. */
export const trophyPath = (code: string): string => `/${leagueOfCode(code)}/trophy/${trophySlug(code)}`;
/** The page listing a league's trophies, or every league's with no league. */
export const trophiesPath = (league?: string): string => (league ? `/${league}/trophies` : "/trophies");
/** The older winners of a trophy as JSON, for its "Show all". */
export const trophyRowsPath = (code: string): string => `${trophyPath(code)}/rows`;
/** The code a trophy page's address names, or null when it is not an award's address. */
export function codeOfSlug(league: string, slug: string): string | null {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && /^[a-z]+$/.test(league) ? `${league}_${slug.replace(/-/g, "_")}` : null;
}

/** Each league's championship award (the trophy its champions win), for a banner or a champions table to link to. A league with none here has no entry. */
export const CHAMPIONSHIP_CODE: Readonly<Record<string, string>> = {
  nhl: "nhl_stanley_cup", pwhl: "pwhl_walter_cup", nba: "nba_larry_obrien", wnba: "wnba_championship", mlb: "mlb_world_series", nfl: "nfl_super_bowl",
  ncaaf: "ncaaf_championship", cfl: "cfl_grey_cup", nwsl: "nwsl_championship", afl: "afl_championship", aafc: "aafc_championship", nha: "nha_championship", pcha: "pcha_championship",
  wchl: "wchl_championship", wha: "wha_championship", ahl: "ahl_calder_cup", na: "mlb_pennant_na", aa: "mlb_pennant_aa", ua: "mlb_pennant_ua", pl: "mlb_pennant_pl", fl: "mlb_pennant_fl",
};

/** Who or what won: a person, a franchise or a bare name, as one key, so the same winner counts once whichever source named them. */
export const winnerKey = (r: Pick<TrophyRow, "person_id" | "franchise_id" | "winner">): string =>
  r.person_id != null ? `p${r.person_id}` : r.franchise_id != null ? `f${r.franchise_id}` : `n${r.winner ?? ""}`;

/**
 * The winners with each (award, season, winner) once. Two sources often name the same winner (the archive keeps a row per source), one with a note and
 * one without; the result keeps the first row, takes a note and a team from whichever row has one, and is ordered newest season first, then by award and name.
 */
export function dedupe(list: readonly TrophyRow[]): TrophyRow[] {
  const by = new Map<string, TrophyRow>();
  for (const r of list) {
    // A person is one winner by id; anyone else by name, because one source may know the franchise and another not (the same row, one with franchise_id empty).
    const name = (r.winner ?? "").trim().toLowerCase();
    const k = `${r.award_code}|${r.year}|${r.person_id != null ? `p${r.person_id}` : name ? `n${name}` : winnerKey(r)}`;
    const have = by.get(k);
    if (!have) by.set(k, { ...r });
    else {
      if (!have.note && r.note) have.note = r.note;
      else if (have.note && r.note && r.note.length > have.note.length) have.note = r.note;
      if (have.franchise_id == null && r.franchise_id != null) have.franchise_id = r.franchise_id;
      if (have.person_id == null && r.person_id != null) have.person_id = r.person_id;
    }
  }
  return [...by.values()].sort((a, b) => b.year - a.year || (a.award_code < b.award_code ? -1 : a.award_code > b.award_code ? 1 : 0) || (a.winner ?? "").localeCompare(b.winner ?? ""));
}

/** The club a player's note names ("Played for New York Islanders; D"), or null. */
export const playedFor = (note: string | null): string | null => /^Played for ([^;]+)/.exec(note ?? "")?.[1]?.trim() ?? null;

/** A winner's note without what the other columns already say ("Played for X; D" is the team and the position): what is left to print, or null. */
export function cleanNote(note: string | null, hasTeam: boolean): string | null {
  if (!note) return null;
  const n = note.trim();
  if (hasTeam && /^Played for [^;]+(;|$)/.test(n)) return n.replace(/^Played for [^;]+;?\s*/, "").trim() || null;
  return n || null;
}

/** How many times someone or something won, over some rows. */
export interface Tally {
  key: string;
  name: string;
  person_id: number | null;
  franchise_id: number | null;
  /** The league of the first row, for the address of a player or a team. */
  league: string;
  n: number;
  /** In how many different awards. */
  awards: number;
  first: number;
  last: number;
}

/** Winners by how often they won, most first; then the one who won most recently, then by name. `league` is the league of a row (a player page needs one). */
export function tally(list: readonly TrophyRow[], leagueOf: (r: TrophyRow) => string = (r) => leagueOfCode(r.award_code)): Tally[] {
  const by = new Map<string, Tally & { codes: Set<string> }>();
  for (const r of list) {
    const k = winnerKey(r);
    const t = by.get(k) ?? by.set(k, { key: k, name: r.winner ?? "", person_id: r.person_id, franchise_id: r.franchise_id, league: leagueOf(r), n: 0, awards: 0, first: r.year, last: r.year, codes: new Set() }).get(k)!;
    t.n += 1;
    t.codes.add(r.award_code);
    t.first = Math.min(t.first, r.year);
    t.last = Math.max(t.last, r.year);
    if (!t.name && r.winner) t.name = r.winner;
  }
  return [...by.values()].map(({ codes, ...t }) => ({ ...t, awards: codes.size })).sort((a, b) => b.n - a.n || b.last - a.last || a.name.localeCompare(b.name));
}

/** A run of seasons in a row in which one winner took the same award. */
export interface Streak {
  key: string;
  name: string;
  person_id: number | null;
  franchise_id: number | null;
  code: string;
  award: string;
  league: string;
  from: number;
  to: number;
  length: number;
}

/**
 * Runs of at least `min` consecutive seasons by the same winner in the same award, longest first (then the latest). The years must follow one another:
 * a season in between with another winner (or none) ends the run.
 */
export function streaks(list: readonly TrophyRow[], min = 2): Streak[] {
  const years = new Map<string, { row: TrophyRow; years: Set<number> }>();
  for (const r of list) {
    const k = `${r.award_code}|${winnerKey(r)}`;
    const e = years.get(k) ?? years.set(k, { row: r, years: new Set() }).get(k)!;
    e.years.add(r.year);
  }
  const out: Streak[] = [];
  for (const { row, years: ys } of years.values()) {
    const sorted = [...ys].sort((a, b) => a - b);
    let from = sorted[0];
    for (let i = 1; i <= sorted.length; i++) {
      if (i === sorted.length || sorted[i] !== sorted[i - 1] + 1) {
        const to = sorted[i - 1];
        if (to - from + 1 >= min) {
          out.push({ key: winnerKey(row), name: row.winner ?? "", person_id: row.person_id, franchise_id: row.franchise_id, code: row.award_code, award: row.award, league: leagueOfCode(row.award_code), from, to, length: to - from + 1 });
        }
        from = sorted[i];
      }
    }
  }
  return out.sort((a, b) => b.length - a.length || b.to - a.to || a.name.localeCompare(b.name));
}

/** A person who took several different awards in one season of one league. */
export interface BigSeason { person_id: number; name: string; league: string; year: number; codes: string[]; awards: string[] }

/** People with at least `min` different person awards in one season, most awards first, then the latest season. Team awards and championships do not count. */
export function bigSeasons(list: readonly TrophyRow[], min = 2): BigSeason[] {
  const by = new Map<string, BigSeason>();
  for (const r of list) {
    if (r.kind !== "person_award" || r.person_id == null) continue;
    const league = leagueOfCode(r.award_code);
    const k = `${r.person_id}|${league}|${r.year}`;
    const e = by.get(k) ?? by.set(k, { person_id: r.person_id, name: r.winner ?? "", league, year: r.year, codes: [], awards: [] }).get(k)!;
    if (!e.codes.includes(r.award_code)) {
      e.codes.push(r.award_code);
      e.awards.push(r.award);
    }
  }
  return [...by.values()].filter((e) => e.codes.length >= min).sort((a, b) => b.codes.length - a.codes.length || b.year - a.year || a.name.localeCompare(b.name));
}

/** The winners of the latest season each award was given, by code: who holds it now. */
export function holders(list: readonly TrophyRow[]): Map<string, { year: number; rows: TrophyRow[] }> {
  const out = new Map<string, { year: number; rows: TrophyRow[] }>();
  for (const r of list) {
    const e = out.get(r.award_code);
    if (!e || r.year > e.year) out.set(r.award_code, { year: r.year, rows: [r] });
    else if (r.year === e.year) e.rows.push(r);
  }
  return out;
}

/** The facts of one trophy for its card and its page. */
export interface TrophyFacts { first: number | null; last: number | null; given: number; seasons: number }
export function factsOf(list: readonly TrophyRow[]): TrophyFacts {
  if (!list.length) return { first: null, last: null, given: 0, seasons: 0 };
  const years = new Set(list.map((r) => r.year));
  return { first: Math.min(...years), last: Math.max(...years), given: list.length, seasons: years.size };
}

/** One line of a trophy page's winners table, plain data (the page, its JSON route and the table in the browser agree on it). A blank field is left out. */
export interface TrophyLine {
  /** The season. */
  y: number;
  /** The winner's name. */
  w?: string;
  /** The address of the player's page. */
  h?: string;
  /** The franchise: the winner of a team award, or the team a player was on (then `t` names it). */
  f?: number;
  /** The name of the team a player was on. */
  t?: string;
  /** The franchise's logo that season: a place in the list the answer carries. */
  lo?: number;
  /** What the source adds (a score, a position, a shared award). */
  n?: string;
}

/** How many of the newest winners the trophy page carries itself. */
export const TROPHY_HEAD = 30;

export interface TrophyLines { lines: TrophyLine[]; logos: string[] }

/** The lines of a trophy's winners, newest first, with the logos they point into (numbered in the order the lines meet them, so the head uses the first of the list). */
export function trophyLines(list: readonly TrophyRow[], look: { player: (id: number, name: string) => string; logo: (franchise: number, year: number) => string | null | undefined }): TrophyLines {
  const logos: string[] = [];
  const lines = dedupe(list).map((r): TrophyLine => {
    const l: TrophyLine = { y: r.year };
    if (r.winner) l.w = r.winner;
    if (r.person_id != null) l.h = look.player(r.person_id, r.winner ?? "");
    const team = r.person_id != null ? playedFor(r.note) : r.winner;
    if (r.franchise_id != null && team) {
      l.f = r.franchise_id;
      if (r.person_id != null) l.t = team;
      const logo = look.logo(r.franchise_id, r.year);
      if (logo) {
        let i = logos.indexOf(logo);
        if (i < 0) i = logos.push(logo) - 1;
        l.lo = i;
      }
    }
    const note = cleanNote(r.note, r.franchise_id != null && r.person_id != null);
    if (note) l.n = note;
    return l;
  });
  return { lines, logos };
}

/** The first `n` lines and the logos they use. */
export function trophyHead(all: TrophyLines, n: number): TrophyLines {
  const lines = all.lines.slice(0, n);
  let used = 0;
  for (const l of lines) used = Math.max(used, (l.lo ?? -1) + 1);
  return { lines, logos: all.logos.slice(0, used) };
}
