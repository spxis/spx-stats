/**
 * How a request reaches a page that can be kept (next.config.ts builds its rewrites from this; no Next imports, so a node script can test it).
 *
 * The public pages are static and revalidated every hour, so a visit costs no server render. Two things used to force a render
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
import { LOCALES, DEFAULT_LOCALE, LOCALE_COOKIE_NAME, type Locale } from "./locale.ts";

/** Every query parameter some public page reads on the server (sort_* are the tables' own sort parameters). */
export const QUERY_KEYS = [
  "sort", "sort_awards", "sort_clubs", "sort_coach", "sort_games", "sort_meet", "sort_members", "sort_names", "sort_past", "sort_roster", "sort_seasons", "sort_series", "sort_teams", "sort_venues",
  "phase", "team", "teams", "month", "day", "date", "all", "season", "view", "loc", "result", "conf", "div",
  "map", "mapteam", "stat", "pos", "nat", "list", "active",
  "q", "league", "status", "page", "from", "to", "after", "offset",
] as const;

/** Pages that read no query at all, even on the server: always the static copy, whatever the address carries (the home page and
    the league pages keep their year range and the like in the browser). */
export const ALWAYS_STATIC = ["about", "cities", "logos", "privacy", "quality", "sources", "terms", "venues", ...LEAGUE_CODES] as const;

/** The first path segments that start pages with more in their address: anything else is not a page (a typo, a scanner) and is answered, unkept, with the 404. */
export const PAGE_ROOTS = [...LEAGUE_CODES, "players", "teams", "city"] as const;

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

/** The first path segment of an address that is not a language (a lookahead, so a rewrite's own result is never rewritten again). */
const NOT_A_LOCALE = `(?!(?:${LOCALES.join("|")})(?:/|$))[^/]+`;

/** Vercel refuses a route whose has or missing list holds more than this many items. */
export const MAX_CONDITIONS = 16;

export interface Rewrite { source: string; destination: string; has?: Cond[]; missing?: Cond[] }

/** The rewrites, in order (first match wins). Page requests only: files, /api, /_next and the signed-in pages never reach them. */
export function pageRewrites(): Rewrite[] {
  const out: Rewrite[] = [];
  const each = (add: (lang: ReturnType<typeof languageRules>[number]) => void) => languageRules().forEach(add);
  // 1. The home page and the pages that read no query (a bare address, nothing after it): always the static copy.
  each((l) => out.push({ source: "/", destination: `/${l.locale}/s`, has: l.has, missing: l.missing }));
  each((l) => out.push({ source: `/:first(${ALWAYS_STATIC.join("|")})`, destination: `/${l.locale}/s/:first`, has: l.has, missing: l.missing }));
  // 2. A query key on the address: the copy drawn for this request. One rule per key, because Vercel refuses a has or missing list of
  //    more than MAX_CONDITIONS items, so "none of these keys" cannot be one rule. Inside each pass the language rules keep their order.
  each((l) => {
    for (const key of QUERY_KEYS) out.push({ source: `/:first(${PAGE_ROOTS.join("|")})/:rest*`, destination: `/${l.locale}/q/:first/:rest*`, has: [...l.has, { type: "query", key }], missing: l.missing });
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
