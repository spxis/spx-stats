/**
 * A league's awards by season as plain data: a row a season, a column an award, a cell its winners (or how many, where there are many). No server code:
 * the league page, the route that serves the older seasons and the table in the browser agree on it. See components/AwardsGrid.tsx.
 */
export interface AwardWinner {
  /** The winner's name. */
  w?: string;
  /** The address of the winner's page, for a player. */
  h?: string;
  /** The franchise, for a team winner, and its logo that season (a place in the table's list of logos). */
  f?: number;
  lo?: number;
}
/** A cell: the winners, or how many there were where there are more than AWARD_MANY (drawn as a link to the season). */
export type AwardCell = number | AwardWinner[];
export interface AwardSeason { y: number; c: Record<string, AwardCell> }
export interface AwardColumn { code: string; name: string }
export interface AwardGrid { columns: AwardColumn[]; seasons: AwardSeason[]; logos: string[]; winners: number }

/** More winners than this in one season's cell are shown as a count. */
export const AWARD_MANY = 4;
/** How many of the newest seasons the league page itself carries. The rest are fetched when the reader asks for them (or sorts the table another way). */
export const AWARD_GRID_HEAD = 10;

export const awardGridRestPath = (league: string): string => `/${league}/rows/awards`;
export const awardGridPagePath = (league: string): string => `/${league}/awards`;

/** One row of `api.awards` as the grid reads it. */
export interface AwardInput { year: number; award_code: string; award: string; kind: string; winner: string | null; person_id: number | null; franchise_id: number | null }

/** The grid from the awards, with the columns ordered person awards first, then by how many times each was given, and the seasons newest first. */
export function buildAwardGrid(list: readonly AwardInput[], look: { player: (id: number, name: string) => string; logo: (franchise: number, year: number) => string | null | undefined }): AwardGrid {
  const cols = new Map<string, { code: string; name: string; kind: string; n: number }>();
  const by = new Map<number, Map<string, AwardInput[]>>();
  for (const a of list) {
    const c = cols.get(a.award_code) ?? cols.set(a.award_code, { code: a.award_code, name: a.award, kind: a.kind, n: 0 }).get(a.award_code)!;
    c.n += 1;
    const s = by.get(a.year) ?? by.set(a.year, new Map()).get(a.year)!;
    const w = s.get(a.award_code) ?? s.set(a.award_code, []).get(a.award_code)!;
    w.push(a);
  }
  const columns = [...cols.values()].sort((a, b) => (a.kind === b.kind ? b.n - a.n : a.kind === "person_award" ? -1 : 1)).map(({ code, name }) => ({ code, name }));
  const logos: string[] = [];
  const place = (logo: string | null | undefined): number | undefined => {
    if (!logo) return undefined;
    let i = logos.indexOf(logo);
    if (i < 0) i = logos.push(logo) - 1;
    return i;
  };
  const seasons = [...by.entries()].sort((a, b) => b[0] - a[0]).map(([y, s]): AwardSeason => {
    const c: Record<string, AwardCell> = {};
    for (const col of columns) {
      const w = s.get(col.code);
      if (!w) continue;
      c[col.code] = w.length > AWARD_MANY ? w.length : w.map((x): AwardWinner => {
        const o: AwardWinner = {};
        if (x.winner) o.w = x.winner;
        if (x.person_id != null) o.h = look.player(x.person_id, x.winner ?? "");
        else if (x.franchise_id != null) {
          o.f = x.franchise_id;
          const lo = place(look.logo(x.franchise_id, x.year));
          if (lo != null) o.lo = lo;
        }
        return o;
      });
    }
    return { y, c };
  });
  return { columns, seasons, logos, winners: list.length };
}

/** The first `head` seasons and the logos they use (numbered in the order the seasons meet them, so the head uses the first of the list). */
export function awardHead(grid: AwardGrid, head: number): { seasons: AwardSeason[]; logos: string[] } {
  const seasons = grid.seasons.slice(0, head);
  let used = 0;
  for (const s of seasons) for (const cell of Object.values(s.c)) if (typeof cell !== "number") for (const w of cell) used = Math.max(used, (w.lo ?? -1) + 1);
  return { seasons, logos: grid.logos.slice(0, used) };
}
