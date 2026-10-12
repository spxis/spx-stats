import "server-only";
import { z } from "zod";
import { rows as allRows, rowsSlice } from "./api/client";
import { playerIndexSchema, type PlayerIndexRow } from "./api/people";
import { teamIndexSchema, type TeamIndexRow } from "./api/teams";
import { logoFor } from "./brand";
import { getBrands } from "./data";
import { LG, isLeague } from "./leagues";
import { afterValues, nextCursor, parseListParams, parseSuggestParams } from "./listParams";
import { fold, listQuery, searchWords } from "./listQuery";
import { memo } from "./memo";
import { playerOrder, PLAYER_SORTS, readPlayers } from "./playerIndex";
import { getPlayerPaths } from "./playerLinks";
import { readTeams, teamOrder, TEAM_SORTS, type TeamStatus } from "./teamIndex";
import { getPaths } from "./teamSlugs";

/* The JSON of /api/players, /api/teams and their /suggest. The route handlers only parse the query string and send what these return. */

const HOLD = 5 * 60_000;
const playerPaths = memo(HOLD, getPlayerPaths);
const teamPaths = memo(HOLD, getPaths);
const brands = memo(HOLD, getBrands);

export interface Page { limit: number; offset: number | null; sort: string; next: string | null; total: number | null }
export interface Listing<T> { data: Partial<T>[]; page: Page }

export const PLAYER_FIELDS = ["id", "name", "position", "leagues", "first_season", "last_season", "seasons", "awards", "url"] as const;
export const TEAM_FIELDS_OUT = ["id", "league", "name", "former_names", "first_season", "last_season", "seasons", "titles", "share", "active", "logo", "url"] as const;

const pick = <T extends Record<string, unknown>>(o: T, fields: readonly string[] | null): Partial<T> =>
  fields ? (Object.fromEntries(Object.entries(o).filter(([k]) => k === "id" || fields.includes(k))) as Partial<T>) : o;

const years = (a: number | null, b: number | null, active = false): string => (a == null ? "" : active ? `${a}–present` : b != null && b !== a ? `${a}–${b}` : String(a));
const lg = (code: string | undefined): string => (code && isLeague(code) ? LG[code] : (code ?? "").toUpperCase());

/* ---------- players ------------------------------------------------------------------- */

const playerItem = (p: PlayerIndexRow, url: (id: number, name: string, league?: string | null) => string) => ({
  id: p.person_id, name: p.name, position: p.position, leagues: p.leagues ?? [], first_season: p.first_season, last_season: p.last_season,
  seasons: p.seasons_played, awards: p.award_count, url: url(p.person_id, p.name, p.leagues?.[0]),
});

export async function listPlayers(sp: URLSearchParams): Promise<Listing<ReturnType<typeof playerItem>>> {
  const { values: v, sort, sortText, fields } = parseListParams("players", sp, { sorts: Object.keys(PLAYER_SORTS), fields: PLAYER_FIELDS, defSort: "name.asc" });
  const order = playerOrder(sort);
  const after = afterValues(v.after, sortText, order);
  const { rows, total, more } = await readPlayers({ league: v.league ?? "", words: searchWords(v.q ?? ""), position: v.position }, order, { offset: v.offset, limit: v.limit, after });
  const url = fields && !fields.includes("url") ? () => "" : await playerPaths();
  return {
    data: rows.map((p) => pick(playerItem(p, url), fields)),
    page: { limit: v.limit, offset: after ? null : v.offset, sort: sortText, next: nextCursor(more, sortText, order, rows), total },
  };
}

/** Players for autocomplete: names that start with the text first, then names with a word that starts with it, then names that contain it; the long careers first within each. */
export async function suggestPlayers(sp: URLSearchParams) {
  const { words, league, limit } = parseSuggestParams(sp);
  const q = words.join(" ");
  if (!q) return { data: [] };
  const base = [league ? `leagues=cs.${encodeURIComponent(`{${league}}`)}` : ""].filter(Boolean);
  const tiers = [`${q}*`, `* ${q}*`, ...(q.length >= 3 ? [`*${q}*`] : [])];
  const order = playerOrder([{ key: "seasons", dir: "desc" }, { key: "awards", dir: "desc" }]);
  const select = ["person_id", "name", "position", "leagues", "first_season", "last_season", "seasons_played", "award_count"];
  const found = await Promise.all(tiers.map((t) =>
    rowsSlice("player_search", listQuery({ filters: [...base, `search=like.${encodeURIComponent(t)}`], select, order }), 0, limit, playerIndexSchema)));
  const seen = new Set<number>();
  const picked = found.flat().filter((p) => !seen.has(p.person_id) && !!seen.add(p.person_id)).slice(0, limit);
  const url = await playerPaths();
  return {
    data: picked.map((p) => {
      const place = url(p.person_id, p.name, p.leagues?.[0]);
      const home = /^\/([a-z]+)\//.exec(place)?.[1] ?? p.leagues?.[0];
      return {
        id: p.person_id, name: p.name, league: lg(home), leagues: p.leagues ?? [], position: p.position, first_season: p.first_season, last_season: p.last_season,
        subtitle: [(p.leagues ?? []).map(lg).join("/"), p.position, years(p.first_season, p.last_season)].filter(Boolean).join(" · "), url: place,
      };
    }),
  };
}

/* ---------- teams --------------------------------------------------------------------- */

const teamItem = (t: TeamIndexRow, url: string, logo: string | null) => ({
  id: t.franchise_id, league: t.league, name: t.name, former_names: t.former_names, first_season: t.first_season, last_season: t.last_season,
  seasons: t.seasons, titles: t.titles, share: t.share, active: t.active, logo, url,
});

export async function listTeams(sp: URLSearchParams): Promise<Listing<ReturnType<typeof teamItem>>> {
  const { values: v, sort, sortText, fields } = parseListParams("teams", sp, { sorts: Object.keys(TEAM_SORTS), fields: TEAM_FIELDS_OUT, defSort: "name.asc" });
  const order = teamOrder(sort);
  const after = afterValues(v.after, sortText, order);
  const words = searchWords(v.q ?? "");
  const { rows, total, more } = await readTeams({ league: v.league ?? "", words, status: v.status as TeamStatus }, order, { offset: v.offset, limit: v.limit, after });
  const [paths, logos] = await Promise.all([teamPaths(), fields && !fields.includes("logo") ? {} : brands()]);
  return {
    data: rows.map((t) => pick(teamItem(t, paths.team(t.league, t.franchise_id), logoFor(logos, t.franchise_id)), fields)),
    page: { limit: v.limit, offset: after ? null : v.offset, sort: sortText, next: nextCursor(more, sortText, order, rows), total },
  };
}

const teamSearchSchema = teamIndexSchema.extend({ search: z.string() });
/** Every franchise (about 270 rows) with its folded names, kept a few minutes: suggestions for teams are ranked here, not asked of the database. */
const teamTable = memo(HOLD, () => allRows("team_index", "select=league,franchise_id,name,former_names,first_season,last_season,seasons,titles,share,active,search&order=league,franchise_id", teamSearchSchema));

/** Teams for autocomplete, in the same tiers as players (also by former name, which is said when it is what matched); clubs still playing and long histories first. */
export async function suggestTeams(sp: URLSearchParams) {
  const { words, league, limit } = parseSuggestParams(sp);
  const q = words.join(" ");
  if (!q) return { data: [] };
  const hits = (await teamTable()).flatMap((t) => {
    if (league && t.league !== league) return [];
    const name = fold(t.name);
    const former = t.former_names.map((n) => ({ n, f: fold(n) }));
    const tier = name.startsWith(q) ? 0 : name.includes(` ${q}`) || former.some((x) => x.f.startsWith(q) || x.f.includes(` ${q}`)) ? 1 : q.length >= 3 && t.search.includes(q) ? 2 : -1;
    if (tier < 0) return [];
    const via = tier === 0 || name.includes(q) ? null : (former.find((x) => x.f.startsWith(q) || x.f.includes(` ${q}`)) ?? former.find((x) => x.f.includes(q)))?.n ?? null;
    return [{ t, tier, via }];
  }).sort((a, b) => a.tier - b.tier || Number(b.t.active) - Number(a.t.active) || b.t.seasons - a.t.seasons || a.t.name.localeCompare(b.t.name)).slice(0, limit);
  const [paths, logos] = await Promise.all([teamPaths(), brands()]);
  return {
    data: hits.map(({ t, via }) => ({
      id: t.franchise_id, name: t.name, league: lg(t.league), first_season: t.first_season, last_season: t.last_season, active: t.active, matched: via,
      logo: logoFor(logos, t.franchise_id),
      subtitle: [lg(t.league), years(t.first_season, t.last_season, t.active), via ? `formerly ${via}` : ""].filter(Boolean).join(" · "),
      url: paths.team(t.league, t.franchise_id),
    })),
  };
}
