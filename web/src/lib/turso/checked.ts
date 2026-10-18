import "server-only";
import { tursoConfigured, tursoQuery } from "./client.ts";

/**
 * The second-source check of a game or a soccer match (`checked`: 1 confirmed, -1 disputed, null unchecked), read from Turso's
 * meta_verification. The api.games and api.soccer_matches views used to work it out from meta.verification on production; that table now
 * lives in Turso, so after the data release that moves it the views answer null and this fills it in. Without Turso set up (a local preview
 * of DS1, whose views still carry it) the rows are left as the view gave them.
 */
const KINDS: Record<string, { kind: string; id: string }> = {
  games: { kind: "game", id: "game_id" },
  soccer_matches: { kind: "soccer_match", id: "match_id" },
};

const CHUNK = 1000;

export async function withChecked<T>(view: string, list: T[]): Promise<T[]> {
  const k = KINDS[view];
  if (!k || !list.length || !tursoConfigured() || typeof list[0] !== "object" || list[0] === null || !("checked" in list[0])) return list;
  const ids = [...new Set(list.map((r) => (r as Record<string, unknown>)[k.id]).filter((v): v is number => Number.isInteger(v)))].sort((a, b) => a - b);
  const got = new Map<number, number>();
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK);
    const found = await tursoQuery(
      `select entity_id, max(case status when 'confirmed' then 1 when 'disputed' then -1 end) as checked from meta_verification where entity_kind = ? and entity_id in (${part.join(",")}) group by entity_id`,
      [k.kind],
      { tables: ["meta_verification"] },
    );
    for (const r of found) if (typeof r.entity_id === "number" && typeof r.checked === "number") got.set(r.entity_id, r.checked);
  }
  return list.map((r) => ({ ...r, checked: got.get((r as Record<string, unknown>)[k.id] as number) ?? null }));
}
