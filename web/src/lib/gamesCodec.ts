import type { GameTuple, Phase } from "./season";

/**
 * A season's games packed into one short string for the page's data (a server page sends what it gives a client component as data, and a thousand tuples of
 * eleven fields are 100 KB of brackets, quotes and long dates). A row is its fields in base 36 joined by commas, the date as days since 1970, the source as a place in
 * a short list, a missing score or check as nothing; rows are joined by semicolons. `unpackGames(packGames(x))` is `x`. Pure.
 */
export interface PackedGames { sources: string[]; rows: string }

const DAY = 86_400_000;
const b36 = (n: number | null): string => (n == null ? "" : n.toString(36));
const num = (s: string): number | null => (s === "" ? null : parseInt(s, 36));

export function packGames(games: readonly GameTuple[]): PackedGames {
  const sources: string[] = [];
  const rows = games.map(([date, away, awayScore, homeScore, home, phase, status, source, overtime, checked, id]) => {
    let s = sources.indexOf(source);
    if (s < 0) s = sources.push(source) - 1;
    return [b36(Math.round(Date.parse(`${date}T00:00:00Z`) / DAY)), b36(away), b36(awayScore), b36(homeScore), b36(home), phase, status, s, overtime, b36(checked), b36(id)].join(",");
  });
  return { sources, rows: rows.join(";") };
}

export function unpackGames({ sources, rows }: PackedGames): GameTuple[] {
  if (!rows) return [];
  return rows.split(";").map((row) => {
    const [d, away, awayScore, homeScore, home, phase, status, source, overtime, checked, id] = row.split(",");
    return [
      new Date(parseInt(d, 36) * DAY).toISOString().slice(0, 10), parseInt(away, 36), num(awayScore), num(homeScore), parseInt(home, 36), phase as Phase, status,
      sources[Number(source)] ?? "", overtime === "1" ? 1 : 0, num(checked), parseInt(id, 36),
    ] satisfies GameTuple;
  });
}
