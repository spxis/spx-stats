/**
 * A club's MLS matches as short lines of plain data, not drawn cells: a club that has played for twenty-five years has hundreds of matches, and a table of
 * them travelled twice (as markup and as the elements the page sent to the browser, 1 MB for a long-lived club). The table is drawn in the browser from these
 * lines and shows its newest rows until "Show all" (components/MlsClubMatches.tsx). Pure, so a node script can test it.
 */
export const MLS_CLUB_HEAD = 20;

/** The fields of a match the table reads. */
export interface MlsClubMatchInput {
  match_id: number; year: number; match_date: string; stage_key: string; stage_order: number; opponent: string; opponent_slug: string; is_home: boolean;
  gf: number; ga: number; result: "w" | "d" | "l"; extra_time: boolean; shootout: boolean; pens_for: number | null; pens_against: number | null;
  venue_name: string | null; venue_city: string | null;
}

/**
 * `o` the opponents ([slug, name]), `v` the grounds ([name, city]), `s` the stages ([key, order]) and one line a match, in the order of the data:
 *   [match id, season, date, stage, opponent, goals for, goals against, flags, ground (-1 none), penalties for, penalties against]
 * The flags add 1 at home, 2 after extra time, 4 for a shootout with its figures (the last two numbers), then 8 times 0 lost, 1 drawn, 2 won.
 */
export interface MlsClubWire { o: [string, string][]; v: [string, string][]; s: [string, number][]; lines: (string | number)[][] }

export function buildMlsClubMatches(matches: readonly MlsClubMatchInput[]): MlsClubWire {
  const o: [string, string][] = []; const oAt = new Map<string, number>();
  const v: [string, string][] = []; const vAt = new Map<string, number>();
  const s: [string, number][] = []; const sAt = new Map<string, number>();
  const index = <T extends (string | number)[]>(list: T[], at: Map<string, number>, row: T) => {
    const k = row.join("\n"); let i = at.get(k);
    if (i == null) { i = list.length; list.push(row); at.set(k, i); }
    return i;
  };
  const lines = matches.map((m) => {
    const pens = m.shootout && m.pens_for != null && m.pens_against != null;
    const flags = (m.is_home ? 1 : 0) + (m.extra_time ? 2 : 0) + (pens ? 4 : 0) + 8 * (m.result === "w" ? 2 : m.result === "d" ? 1 : 0);
    const ground = m.venue_name || m.venue_city ? index(v, vAt, [m.venue_name ?? "", m.venue_city ?? ""]) : -1;
    const line: (string | number)[] = [m.match_id, m.year, m.match_date, index(s, sAt, [m.stage_key, m.stage_order]), index(o, oAt, [m.opponent_slug, m.opponent]), m.gf, m.ga, flags, ground];
    if (pens) line.push(m.pens_for as number, m.pens_against as number);
    return line;
  });
  return { o, v, s, lines };
}

/** A line read back: everything the table draws, with the names looked up. */
export interface MlsClubRow {
  id: number; year: number; date: string; stageKey: string; stageOrder: number; opponent: string; opponentSlug: string; gf: number; ga: number;
  home: boolean; extraTime: boolean; pens: [number, number] | null; result: "w" | "d" | "l"; venue: string | null;
}

export function readMlsClubMatches(wire: MlsClubWire): MlsClubRow[] {
  return wire.lines.map((l) => {
    const flags = Number(l[7]); const [opponentSlug, opponent] = wire.o[Number(l[4])]; const st = wire.s[Number(l[3])]; const g = wire.v[Number(l[8])];
    const venue = g ? [g[0], g[1]].filter(Boolean).join(", ") : "";
    return {
      id: Number(l[0]), year: Number(l[1]), date: String(l[2]), stageKey: st[0], stageOrder: st[1], opponent, opponentSlug, gf: Number(l[5]), ga: Number(l[6]),
      home: (flags & 1) === 1, extraTime: (flags & 2) === 2, pens: (flags & 4) === 4 ? [Number(l[9]), Number(l[10])] : null,
      result: flags >> 3 === 2 ? "w" : flags >> 3 === 1 ? "d" : "l", venue: venue || null,
    };
  });
}
