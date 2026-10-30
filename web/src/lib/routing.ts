/**
 * How a request reaches a page that can be kept (next.config.ts builds its rewrites from this; no Next imports, so a node script can test it).
 *
 * The public pages are static, kept a day (live) or 30 days (historical) and refreshed on demand after each release (POST /api/revalidate), so a visit costs no server render. Two things used to force a render
 * per request, and both are now part of the route instead:
 *
 *   the language   app/[locale]/...   One copy of each page per language. The address a reader sees has no language in it:
 *                                     the request is rewritten to /en, /fr or /ja from the cookie the footer's picker sets,
 *                                     then Accept-Language, then English. Same answer as before, decided by the router.
 *   the query      app/[locale]/s/    Served when the address has none of the QUERY_KEYS below (the page reads no query).
 *                  app/[locale]/q/    Served when it has one of them: drawn per request, as every page was before.
 *
 * A page that reads `searchParams` lives in q/ and has a thin twin in s/ (see lib/noQuery.ts). A page that reads none lives in
 * s/ and has a thin twin in q/. Keep QUERY_KEYS complete: a key missing from it is ignored on a static page (scripts/routing.test.ts
 * checks the source for keys that are not listed).
 */
import { LEAGUE_CODES } from "./leagues.ts";
import { LOCALES, DEFAULT_LOCALE, LOCALE_COOKIE_NAME, effectiveLocale, type Locale } from "./locale.ts";

/** Every query parameter some public page reads on the server (sort_* are the tables' own sort parameters). */
export const QUERY_KEYS = [
  "sort", "sort_alignment", "sort_awards", "sort_clubs", "sort_coach", "sort_coachawards", "sort_games", "sort_meet", "sort_members", "sort_men", "sort_names", "sort_past", "sort_players", "sort_post", "sort_roster", "sort_scorers", "sort_seasons", "sort_series", "sort_staff", "sort_teams", "sort_venues", "sort_women",
  "phase", "team", "teams", "month", "day", "week", "date", "all", "season", "view", "loc", "result", "conf", "div", "group", "full",
  "map", "mapteam", "stat", "pos", "nat", "list", "active",
  "sort_allstar", "sort_countries", "sort_firsts", "sort_leagues", "sort_rank", "sort_stack",
  "sort_cup", "sort_leaders_passing", "sort_leaders_rushing", "sort_leaders_receiving", "sort_leaders_offence", "sort_nhl", "sort_nha", "sort_pcha", "sort_wchl", "sort_wha", "sort_nfl", "sort_afl", "sort_aafc",
  "sort_mlb", "sort_na", "sort_aa", "sort_ua", "sort_pl", "sort_fl",
  "q", "league", "status", "page", "from", "to", "after", "offset", "letter", "letter_by", "vs",
] as const;

/** Query keys a player page reads in the browser (components/PlayerBoard.tsx: the seasons shown, the phase and the clubs; components/PlayerCompare.tsx: the player compared with), so on a player page they
    do not ask for a copy drawn per request: the one static page serves them all. Everywhere else they are read on the server as before. */
export const PLAYER_CLIENT_KEYS = ["from", "to", "phase", "teams", "season", "vs"] as const;

/** The keys of PLAYER_CLIENT_KEYS a city page also reads in the browser (components/CityBoard.tsx: the years its clubs, timeline and titles count); the city page's other keys still ask the server. */
export const CITY_CLIENT_KEYS = ["from", "to"] as const;

/** Pages that read no query at all, even on the server: always the static copy, whatever the address carries (the home page and
    the league pages keep their year range and the like in the browser; so does /teams, whose keys are TEAMS_CLIENT_KEYS in lib/teamBoard.ts). */
export const ALWAYS_STATIC = ["about", "cities", "teams", "logos", "privacy", "quality", "sources", "help-wikipedia", "releases", "terms", "venues", "countries", "trophies", "soccer", "worldcup", "mls", "more-hockey", ...LEAGUE_CODES] as const;

/** The first path segments that start pages with more in their address: anything else is not a page (a typo, a scanner) and is answered, unkept, with the 404. */
export const PAGE_ROOTS = [...LEAGUE_CODES, "players", "teams", "city", "venue", "worldcup", "mls", "soccer", "country", "releases", "countries"] as const;

type Cond = { type: "header" | "cookie" | "query"; key: string; value?: string };

/** A pattern that matches `word` whatever its case: "fr" gives "[fF][rR]". */
const anyCase = (word: string) => [...word].map((c) => `[${c.toLowerCase()}${c.toUpperCase()}]`).join("");

/** One language tag that is not en, fr or ja (two letters not among those, any three letters, or *): a tag the site does not speak. */
const OTHER_TAG = "(?:[a-dg-ik-zA-DG-IK-Z][a-zA-Z]|[eE][a-mo-zA-MO-Z]|[fF][a-qs-zA-QS-Z]|[jJ][b-zB-Z]|[a-zA-Z]{3}|\\*)";
const TAG_REST = "(?:-[^,;]*)?(?:;[^,]*)?";

/** Accept-Language whose first tag among en, fr and ja is `code`, (en-CA,fr;q=0.8 gives en). The weights are not sorted: browsers send them in order. */
export function acceptsFirst(code: Locale): string {
  return `\\s*(?:${OTHER_TAG}${TAG_REST}\\s*,\\s*)*${anyCase(code)}${TAG_REST}(?:\\s*,.*)?\\s*`;
}

/** The ways a request names its language, best first: [conditions, language]. The last has none: English. */
function languageRules(): { has: Cond[]; missing: Cond[]; locale: Locale }[] {
  const saved = `(?:${LOCALES.join("|")})`;
  const unsaved: Cond = { type: "cookie", key: LOCALE_COOKIE_NAME, value: saved };
  return [
    ...LOCALES.map((l) => ({ has: [{ type: "cookie", key: LOCALE_COOKIE_NAME, value: l } as Cond], missing: [], locale: l })),
    ...LOCALES.filter((l) => l !== DEFAULT_LOCALE).map((l) => ({ has: [{ type: "header", key: "accept-language", value: acceptsFirst(l) } as Cond], missing: [unsaved], locale: l })),
    { has: [], missing: [], locale: DEFAULT_LOCALE },
  ];
}

const internal = new RegExp(`^/(?:${LOCALES.join("|")})(?:/|$)`);
/** True for an address inside the language tree, which the rewrites below must not wrap a second time. */
export const isInternalPath = (path: string) => internal.test(path);

/** First path segments that belong to something other than the public pages: the API (app/api; its auth route is a catch-all, [...nextauth]), the build's own
    files, the playing-surface drawings (app/surface/[file]) and the signed-in pages (app/(dyn)). Next matches a route with a dynamic segment AFTER the rewrites,
    so rule 4 below must leave these alone, or it wraps them in the language tree and answers the 404 page (sign-in broke that way). scripts/routing.test.ts
    reads app/ and fails when a first segment found there is missing from this list. */
export const RESERVED_ROOTS = ["api", "_next", "surface", "admin", "me", "login", "invite-only", "tickets", "sitemap.xml", "robots.txt", "venues.csv", "venues.geojson", "soccer-flags.svg", "soccer-flags-round.svg", "trophy-sprite.svg", "soccer-flag", "flag", "soccer-road", "bracket-svg", "field-plays", "jersey-banner", "title-banner", "brand", "mascot", "team-logos", "favicon.ico", "manifest.webmanifest"] as const;

const RESERVED_FIRST = new Set<string>(RESERVED_ROOTS);

/** Query keys from QUERY_KEYS that this request actually carries (presence, including an empty value). */
export function presentQueryKeys(query: URLSearchParams | Record<string, string | undefined>): string[] {
  const has = (key: string) => (query instanceof URLSearchParams ? query.has(key) : Object.prototype.hasOwnProperty.call(query, key) && query[key] !== undefined);
  return QUERY_KEYS.filter(has);
}

function localeCookieValue(cookie: string | null | undefined): string | null {
  if (!cookie) return null;
  const m = cookie.match(/(?:^|;\s*)spxn-locale=([^;]*)/i);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1].trim());
  } catch {
    return m[1].trim();
  }
}

/**
 * Whether this address with these query keys is drawn from q/ (per request) rather than s/ (kept).
 * Player pages keep PLAYER_CLIENT_KEYS in the browser; city pages keep from/to. /teams never reaches
 * here: it is ALWAYS_STATIC. /players with from/to does: the list is filtered on the server.
 */
function drawsPerRequest(segs: string[], present: readonly string[]): boolean {
  if (!present.length) return false;
  const first = segs[0] ?? "";
  const onlyPlayerClient = present.every((k) => (PLAYER_CLIENT_KEYS as readonly string[]).includes(k));
  const onlyCityClient = present.every((k) => (CITY_CLIENT_KEYS as readonly string[]).includes(k));
  if ((LEAGUE_CODES as readonly string[]).includes(first) && segs[1] === "player" && onlyPlayerClient) return false;
  if (first === "city" && segs.length >= 2 && onlyCityClient) return false;
  return true;
}

/**
 * Where a public address is served from under app/[locale]/{s,q}. Null means leave the request
 * alone (an internal language path, or a first segment in RESERVED_ROOTS). Same destinations as
 * pageRewrites(); src/proxy.ts applies this on every request (including client RSC navigations),
 * because next.config afterFiles rewrites are skipped in Vercel's minimal mode and Next 16's
 * client router assumes a pathname's rewrite does not change with the query string.
 */
export function resolvePageDestination(
  path: string,
  query: URLSearchParams | Record<string, string | undefined> = {},
  cookie?: string | null,
  acceptLanguage?: string | null,
): string | null {
  const pathname = (path.split("?")[0] || "/").replace(/\/+$/, "") || "/";
  if (isInternalPath(pathname)) return null;
  const segs = pathname === "/" ? [] : pathname.split("/").filter(Boolean);
  const first = segs[0] ?? "";
  if (first && RESERVED_FIRST.has(first)) return null;
  const locale = effectiveLocale(localeCookieValue(cookie), acceptLanguage);
  const present = presentQueryKeys(query);
  const tail = segs.length > 1 ? `/${segs.slice(1).join("/")}` : "";
  if (segs.length === 0) return `/${locale}/s`;
  if (segs.length === 1 && (ALWAYS_STATIC as readonly string[]).includes(first)) return `/${locale}/s/${first}`;
  if (drawsPerRequest(segs, present)) return `/${locale}/q/${first}${tail}`;
  if ((PAGE_ROOTS as readonly string[]).includes(first)) return `/${locale}/s/${first}${tail}`;
  return `/${locale}/q/${first}${tail}`;
}

/** The first path segment of an address that is not a language (a lookahead, so a rewrite's own result is never rewritten again) or one of RESERVED_ROOTS. */
const NOT_A_LOCALE = `(?!(?:${[...LOCALES, ...RESERVED_ROOTS.map((r) => r.replace(/\./g, "\\."))].join("|")})(?:/|$))[^/]+`;

/** Vercel refuses a route whose has or missing list holds more than this many items. */
export const MAX_CONDITIONS = 16;

export interface Rewrite { source: string; destination: string; has?: Cond[]; missing?: Cond[] }

/** The rewrites, in order (first match wins). Page requests only: no rule matches /api, /_next, /surface or the signed-in pages (RESERVED_ROOTS), whether Next matches them before or after the rewrites. */
export function pageRewrites(): Rewrite[] {
  const out: Rewrite[] = [];
  const each = (add: (lang: ReturnType<typeof languageRules>[number]) => void) => languageRules().forEach(add);
  // 1. The home page and the pages that read no query (a bare address, nothing after it): always the static copy.
  each((l) => out.push({ source: "/", destination: `/${l.locale}/s`, has: l.has, missing: l.missing }));
  each((l) => out.push({ source: `/:first(${ALWAYS_STATIC.join("|")})`, destination: `/${l.locale}/s/:first`, has: l.has, missing: l.missing }));
  // 2. A query key on the address: the copy drawn for this request. One rule per key, because Vercel refuses a has or missing list of
  //    more than MAX_CONDITIONS items, so "none of these keys" cannot be one rule. Inside each pass the language rules keep their order.
  //    The keys a player page reads in the browser (PLAYER_CLIENT_KEYS) skip the player pages (/nhl/player/...) and keep the rest.
  const notPlayer = `/:first(${LEAGUE_CODES.join("|")})/:second((?!player(?:/|$))[^/]+)/:rest*`, others = `/:first(players|teams|city)/:rest*`, notCity = `/:first(players|teams)/:rest*`;
  each((l) => {
    for (const key of QUERY_KEYS) {
      const has: Cond[] = [...l.has, { type: "query", key }];
      if ((PLAYER_CLIENT_KEYS as readonly string[]).includes(key)) {
        out.push({ source: (CITY_CLIENT_KEYS as readonly string[]).includes(key) ? notCity : others, destination: `/${l.locale}/q/:first/:rest*`, has, missing: l.missing });
        out.push({ source: notPlayer, destination: `/${l.locale}/q/:first/:second/:rest*`, has, missing: l.missing });
      } else out.push({ source: `/:first(${PAGE_ROOTS.join("|")})/:rest*`, destination: `/${l.locale}/q/:first/:rest*`, has, missing: l.missing });
    }
  });
  // 3. No rule above matched, so the address has none of the keys: the static copy.
  each((l) => out.push({ source: `/:first(${PAGE_ROOTS.join("|")})/:rest*`, destination: `/${l.locale}/s/:first/:rest*`, has: l.has, missing: l.missing }));
  // 4. Everything else is no page: the 404, drawn for this request and never kept, so addresses made up by a scanner leave nothing behind.
  each((l) => out.push({ source: `/:first(${NOT_A_LOCALE})/:rest*`, destination: `/${l.locale}/q/:first/:rest*`, has: l.has, missing: l.missing }));
  return out;
}

/** An address inside the language tree is not for readers: send it to the plain address (which then picks the language). */
export const hideInternalPaths = {
  source: `/:locale(${LOCALES.join("|")})/:mode(s|q)/:rest*`,
  destination: "/:rest*",
  permanent: false,
} as const;
