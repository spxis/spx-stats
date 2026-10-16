/**
 * Query-string addresses that the router draws from app/[locale]/q (lib/routing.ts). Those copies are
 * noindex,nofollow; links into them carry rel=nofollow so crawlers stay on the kept pages.
 */
import { LEAGUE_CODES } from "./leagues.ts";
import { ALWAYS_STATIC, CITY_CLIENT_KEYS, PLAYER_CLIENT_KEYS, QUERY_KEYS } from "./routing.ts";

export const QUERY_ROBOTS = { index: false, follow: false } as const;

function pathAndSearch(href: string): { path: string; search: string } | null {
  const raw = href.trim();
  if (!raw || raw.startsWith("mailto:") || raw.startsWith("tel:") || raw.startsWith("javascript:")) return null;
  let pathSearch = raw.split("#")[0] ?? "";
  if (raw.startsWith("//") || /^https?:/i.test(raw)) {
    try {
      const u = new URL(raw, "https://spxn.com");
      const host = u.hostname.replace(/^www\./, "");
      if (host !== "spxn.com") return null;
      pathSearch = `${u.pathname}${u.search}`;
    } catch {
      return null;
    }
  }
  const cut = pathSearch.indexOf("?");
  if (cut < 0) return { path: pathSearch || "/", search: "" };
  return { path: pathSearch.slice(0, cut) || "/", search: pathSearch.slice(cut + 1) };
}

function hrefString(href: unknown): string {
  if (typeof href === "string") return href;
  if (href == null || typeof href !== "object") return "";
  const o = href as { pathname?: string; search?: string; query?: unknown; hash?: string };
  const path = o.pathname ?? "";
  if (typeof o.search === "string" && o.search) return `${path}${o.search.startsWith("?") ? o.search : `?${o.search}`}`;
  if (o.query && typeof o.query === "object" && !Array.isArray(o.query)) {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(o.query as Record<string, unknown>)) {
      if (v == null || v === "") continue;
      if (Array.isArray(v)) v.forEach((x) => q.append(k, String(x)));
      else q.set(k, String(v));
    }
    const s = q.toString();
    return s ? `${path}?${s}` : path;
  }
  if (typeof o.query === "string" && o.query) return `${path}?${o.query.replace(/^\?/, "")}`;
  return path;
}

/** True when this address is one the rewrites send to q/ (a query the server reads). */
export function isQueryVariant(href: unknown): boolean {
  const parsed = pathAndSearch(hrefString(href));
  if (!parsed || !parsed.search) return false;
  const present = [...new URLSearchParams(parsed.search).keys()].filter((k) => (QUERY_KEYS as readonly string[]).includes(k));
  if (!present.length) return false;
  const segs = parsed.path.replace(/\/+$/, "").split("/").filter(Boolean);
  if (!segs.length) return false;
  const first = segs[0]!.toLowerCase();
  if ((ALWAYS_STATIC as readonly string[]).includes(first) && segs.length === 1) return false;
  const player =
    (segs.length >= 3 && (LEAGUE_CODES as readonly string[]).includes(first as (typeof LEAGUE_CODES)[number]) && segs[1] === "player") ||
    (first === "players" && segs.length >= 2) ||
    (first === "worldcup" && segs[1] === "player");
  if (player && present.every((k) => (PLAYER_CLIENT_KEYS as readonly string[]).includes(k))) return false;
  if (first === "city" && segs.length >= 2 && present.every((k) => (CITY_CLIENT_KEYS as readonly string[]).includes(k))) return false;
  return true;
}

/** rel=nofollow for a link that would be drawn from q/; undefined otherwise. */
export function queryFollowRel(href: unknown): "nofollow" | undefined {
  return isQueryVariant(href) ? "nofollow" : undefined;
}
