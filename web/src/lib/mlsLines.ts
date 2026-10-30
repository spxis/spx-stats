/**
 * An MLS season's matches as short lines of plain data, not drawn cells: a season's table is about 500 rows of seven cells, which travelled twice
 * (as markup and as the elements the page sent to the browser, 735 KB of payload for /mls/2025). The page draws its first rows from these lines and
 * the browser builds the others when "Show all" is pressed, so the rest is only data. Pure, so a node script can test it.
 */
export const MLS_MATCHES_HEAD = 12;

export const mlsMatchesPath = (year: number): string => `/mls/${year}/matches`;

/** The fields of a match the table reads. */
export interface MlsMatchInput {
  match_id: number; match_date: string; stage_key: string; stage_order: number;
  home_team_id: string; home: string; home_slug: string; home_goals: number;
  away_team_id: string; away: string; away_slug: string; away_goals: number;
  extra_time: boolean; shootout: boolean; home_penalties: number | null; away_penalties: number | null; winner_team_id: string | null; shootout_style?: string | null | undefined;
  venue_name: string | null; venue_city: string | null; venue_wikidata_id: string | null; venue_id: number | null; attendance?: number | null | undefined;
}

/**
 * A season: `c` the club names that appear ([slug, name]), `v` the grounds ([name, Wikidata id or "", city or "", linked 0|1]), `s` the stages ([key, order]),
 * and one line a match, in the date order of the data:
 *   [match id, date, stage, home club, home goals, away club, away goals, ground (-1 none), crowd (0 none), note, penalties home, penalties away]
 * The note is 0 none, 1 after extra time, 2 on penalties (the last two figures), 3 or 4 won the 1996-1999 shootout by the home or the away side.
 */
export interface MlsMatchesWire { c: [string, string][]; v: [string, string, string, number][]; s: [string, number][]; lines: (string | number)[][] }

export function buildMlsMatches(matches: readonly MlsMatchInput[]): MlsMatchesWire {
  const c: [string, string][] = []; const cAt = new Map<string, number>();
  const v: [string, string, string, number][] = []; const vAt = new Map<string, number>();
  const s: [string, number][] = []; const sAt = new Map<string, number>();
  const club = (slug: string, name: string) => { const k = `${slug}\n${name}`; let i = cAt.get(k); if (i == null) { i = c.length; c.push([slug, name]); cAt.set(k, i); } return i; };
  const ground = (m: MlsMatchInput) => {
    if (!m.venue_name && !m.venue_city) return -1;
    const row: [string, string, string, number] = [m.venue_name ?? "", m.venue_wikidata_id ?? "", m.venue_city ?? "", m.venue_id != null ? 1 : 0];
    const k = row.join("\n"); let i = vAt.get(k); if (i == null) { i = v.length; v.push(row); vAt.set(k, i); } return i;
  };
  const stage = (m: MlsMatchInput) => { let i = sAt.get(m.stage_key); if (i == null) { i = s.length; s.push([m.stage_key, m.stage_order]); sAt.set(m.stage_key, i); } return i; };
  const lines = matches.map((m) => {
    let note = 0; let hp = 0; let ap = 0;
    if (m.shootout && m.home_penalties != null && m.away_penalties != null) { note = 2; hp = m.home_penalties; ap = m.away_penalties; }
    else if (m.shootout_style === "mls" && m.winner_team_id) note = m.winner_team_id === m.home_team_id ? 3 : 4;
    else if (m.extra_time) note = 1;
    const line: (string | number)[] = [m.match_id, m.match_date, stage(m), club(m.home_slug, m.home), m.home_goals, club(m.away_slug, m.away), m.away_goals, ground(m), m.attendance ?? 0, note];
    if (note === 2) line.push(hp, ap);
    return line;
  });
  return { c, v, s, lines };
}

/** A line read back: everything the table draws, with the names and grounds looked up. */
export interface MlsMatchRow {
  id: number; date: string; stageKey: string; stageOrder: number; home: string; homeSlug: string; hg: number; away: string; awaySlug: string; ag: number;
  venue: string | null; venueQid: string | null; venueCity: string | null; venueLinked: boolean; crowd: number; note: number; hp: number; ap: number;
}

export function readMlsMatches(wire: MlsMatchesWire): MlsMatchRow[] {
  return wire.lines.map((l) => {
    const [homeSlug, home] = wire.c[Number(l[3])]; const [awaySlug, away] = wire.c[Number(l[5])];
    const g = wire.v[Number(l[7])]; const st = wire.s[Number(l[2])];
    return {
      id: Number(l[0]), date: String(l[1]), stageKey: st[0], stageOrder: st[1], home, homeSlug, hg: Number(l[4]), away, awaySlug, ag: Number(l[6]),
      venue: g && g[0] ? g[0] : null, venueQid: g && g[1] ? g[1] : null, venueCity: g && g[2] ? g[2] : null, venueLinked: g ? g[3] === 1 : false,
      crowd: Number(l[8]), note: Number(l[9]), hp: Number(l[10] ?? 0), ap: Number(l[11] ?? 0),
    };
  });
}
