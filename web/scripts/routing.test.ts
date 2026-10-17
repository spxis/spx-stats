import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { createRequire } from "node:module";
import { TEAMS_CLIENT_KEYS } from "../src/lib/teamBoard.ts";
import { isQueryVariant, QUERY_ROBOTS, queryFollowRel } from "../src/lib/queryLink.ts";
import { acceptsFirst, ALWAYS_STATIC, CITY_CLIENT_KEYS, hideInternalPaths, MAX_CONDITIONS, pageRewrites, PAGE_ROOTS, PLAYER_CLIENT_KEYS, QUERY_KEYS, RESERVED_ROOTS } from "../src/lib/routing.ts";

/** Run in web/: pnpm test:routing */

// The two pieces of Next that decide a rewrite, used as the server uses them, so the test checks what next.config.ts really does.
const need = createRequire(import.meta.url);
const { match } = need("next/dist/compiled/path-to-regexp") as { match: (source: string, options: { decode: (s: string) => string }) => (path: string) => false | { params: Record<string, unknown> } };
const { matchHas } = need("next/dist/shared/lib/router/utils/prepare-destination") as { matchHas: (req: unknown, query: Record<string, string>, has: unknown, missing: unknown) => false | Record<string, string> };

type Req = { path: string; query?: Record<string, string>; cookie?: string; acceptLanguage?: string };

/** Where next.config.ts's rewrites send a request: the first rule whose source, has and missing all match (Next evaluates them in this order). */
function route({ path, query = {}, cookie, acceptLanguage }: Req): string {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  if (acceptLanguage) headers["accept-language"] = acceptLanguage;
  for (const rule of pageRewrites()) {
    const hit = match(rule.source, { decode: decodeURIComponent })(path);
    if (!hit) continue;
    const params = matchHas({ headers }, query, rule.has, rule.missing);
    if (params === false) continue;
    let dest = rule.destination;
    for (const [k, v] of Object.entries(hit.params as Record<string, string | string[] | undefined>)) {
      dest = dest.replace(`:${k}*`, v === undefined ? "" : Array.isArray(v) ? v.join("/") : v).replace(`:${k}`, Array.isArray(v) ? v.join("/") : (v ?? ""));
    }
    dest = dest.replace(/\/:[a-z]+\*/g, "");
    return dest.replace(/\/+$/, "").replace(/\/\//g, "/") || "/";
  }
  return `(none) ${path}`;
}

test("a bare address is the static copy, in the reader's language", () => {
  assert.equal(route({ path: "/" }), "/en/s");
  assert.equal(route({ path: "/about" }), "/en/s/about");
  assert.equal(route({ path: "/nhl" }), "/en/s/nhl");
  assert.equal(route({ path: "/nhl/2012-13" }), "/en/s/nhl/2012-13");
  assert.equal(route({ path: "/nhl/player/p-k-subban-2655" }), "/en/s/nhl/player/p-k-subban-2655");
  assert.equal(route({ path: "/players" }), "/en/s/players");
  assert.equal(route({ path: "/teams" }), "/en/s/teams");
  assert.equal(route({ path: "/cities" }), "/en/s/cities");
  assert.equal(route({ path: "/venues" }), "/en/s/venues");
  assert.equal(route({ path: "/venues", query: { league: "nhl", status: "former", nat: "CA" } }), "/en/s/venues");
  assert.equal(route({ path: "/city/vancouver" }), "/en/s/city/vancouver");
  assert.equal(route({ path: "/countries" }), "/en/s/countries");
  assert.equal(route({ path: "/country/CA" }), "/en/s/country/CA");
  assert.equal(route({ path: "/mlb/world" }), "/en/s/mlb/world");
  assert.equal(route({ path: "/nhl/2025-26/world" }), "/en/s/nhl/2025-26/world");
});

test("the language cookie decides first, then Accept-Language, then English", () => {
  assert.equal(route({ path: "/about", cookie: "spxn-locale=fr" }), "/fr/s/about");
  assert.equal(route({ path: "/about", cookie: "x=1; spxn-locale=ja; y=2" }), "/ja/s/about");
  assert.equal(route({ path: "/about", cookie: "spxn-locale=en", acceptLanguage: "fr-CA,fr;q=0.9" }), "/en/s/about");
  assert.equal(route({ path: "/about", cookie: "spxn-locale=fr", acceptLanguage: "ja" }), "/fr/s/about");
  assert.equal(route({ path: "/about", acceptLanguage: "fr-CA,fr;q=0.9,en;q=0.8" }), "/fr/s/about");
  assert.equal(route({ path: "/about", acceptLanguage: "ja,en-US;q=0.9" }), "/ja/s/about");
  assert.equal(route({ path: "/about", acceptLanguage: "JA-JP" }), "/ja/s/about");
  assert.equal(route({ path: "/about", acceptLanguage: "de,ja;q=0.8,en;q=0.5" }), "/ja/s/about");
  assert.equal(route({ path: "/about", acceptLanguage: "de-CH, fr;q=0.9" }), "/fr/s/about");
  assert.equal(route({ path: "/about", acceptLanguage: "en-US,en;q=0.9,fr;q=0.8" }), "/en/s/about");
  assert.equal(route({ path: "/about", acceptLanguage: "de,es;q=0.8" }), "/en/s/about");
  assert.equal(route({ path: "/about", acceptLanguage: "*" }), "/en/s/about");
  assert.equal(route({ path: "/about", acceptLanguage: "fil,fra;q=0.8" }), "/en/s/about");
  // A cookie that is no language is ignored, as lib/locale.ts effectiveLocale() does.
  assert.equal(route({ path: "/about", cookie: "spxn-locale=xx", acceptLanguage: "fr" }), "/fr/s/about");
  assert.equal(route({ path: "/about", cookie: "spxn-locale=", acceptLanguage: "ja" }), "/ja/s/about");
});

test("an address with a query the pages read is drawn for the request; one with only other keys is the static copy", () => {
  assert.equal(route({ path: "/nhl/2012-13", query: { view: "wildcard" } }), "/en/q/nhl/2012-13");
  assert.equal(route({ path: "/nhl/2012-13", query: { sort_games: "date.desc" }, cookie: "spxn-locale=ja" }), "/ja/q/nhl/2012-13");
  assert.equal(route({ path: "/players", query: { q: "gretzky" } }), "/en/q/players");
  assert.equal(route({ path: "/city/vancouver", query: { sort: "years.asc" } }), "/en/q/city/vancouver");
  assert.equal(route({ path: "/country/CA", query: { sort_leagues: "players.desc" } }), "/en/q/country/CA");
  assert.equal(route({ path: "/mlb/world", query: { sort_countries: "n.desc" } }), "/en/q/mlb/world");
  assert.equal(route({ path: "/countries", query: { sort_countries: "n.desc" } }), "/en/s/countries");
  assert.equal(route({ path: "/cities", query: { from: "1990", sort: "x" } }), "/en/s/cities");
  assert.equal(route({ path: "/worldcup/2022" }), "/en/s/worldcup/2022");
  assert.equal(route({ path: "/worldcup/2022", query: { sort_games: "date.desc" }, cookie: "spxn-locale=fr" }), "/fr/q/worldcup/2022");
  assert.equal(route({ path: "/worldcup", query: { sort_men: "year.asc" } }), "/en/s/worldcup");
  assert.equal(route({ path: "/soccer" }), "/en/s/soccer");
  assert.equal(route({ path: "/mls" }), "/en/s/mls");
  assert.equal(route({ path: "/mls", query: { sort_seasons: "year.asc" }, cookie: "spxn-locale=ja" }), "/ja/s/mls");
  assert.equal(route({ path: "/mls/2019" }), "/en/s/mls/2019");
  assert.equal(route({ path: "/mls/2019", query: { sort_games: "date.desc" } }), "/en/q/mls/2019");
  assert.equal(route({ path: "/mls/team/la-galaxy", query: { sort_past: "year.asc" } }), "/en/q/mls/team/la-galaxy");
  assert.equal(route({ path: "/nhl/2012-13", query: { utm_source: "x", fbclid: "y" } }), "/en/s/nhl/2012-13");
  assert.equal(route({ path: "/nhl/2012-13", query: { _rsc: "abc" } }), "/en/s/nhl/2012-13");
  for (const key of QUERY_KEYS) assert.match(route({ path: "/nhl/2012-13/leaders", query: { [key]: "1" } }), /^\/en\/q\//, key);
});

test("a player page reads its seasons, phase and clubs in the browser, so those keys leave it the static copy; its sorts and every other page still ask the server", () => {
  const player = "/nhl/player/mark-messier-2359";
  for (const key of PLAYER_CLIENT_KEYS) {
    assert.equal(route({ path: player, query: { [key]: "1" } }), `/en/s${player}`, key);
    assert.match(route({ path: "/nhl/2012-13", query: { [key]: "1" } }), /^\/en\/q\//, `${key} on a season`);
    assert.match(route({ path: "/players", query: { [key]: "1" } }), /^\/en\/q\//, `${key} on the players list`);
    assert.match(route({ path: "/mlb/team/yankees", query: { [key]: "1" } }), /^\/en\/q\//, `${key} on a team`);
  }
  assert.equal(route({ path: player, query: { from: "1985", to: "1990", phase: "p", teams: "nhl:1" }, cookie: "spxn-locale=ja" }), `/ja/s${player}`);
  assert.equal(route({ path: player, query: { from: "1985", sort_awards: "season.asc" } }), `/en/q${player}`);
  assert.equal(route({ path: player, query: { q: "x" } }), `/en/q${player}`);
  assert.equal(route({ path: "/nhl/player", query: { from: "1985" } }), "/en/s/nhl/player");
  assert.equal(route({ path: "/nhl/players-of-note", query: { from: "1985" } }), "/en/q/nhl/players-of-note");
});

test("a city page reads its years in the browser, so from and to leave it the static copy; its other keys and the other player keys still ask the server", () => {
  const city = "/city/vancouver";
  for (const key of CITY_CLIENT_KEYS) assert.equal(route({ path: city, query: { [key]: "1990" } }), `/en/s${city}`, key);
  assert.equal(route({ path: city, query: { from: "1990", to: "2000" }, cookie: "spxn-locale=fr" }), `/fr/s${city}`);
  assert.equal(route({ path: city, query: { from: "1990", sort: "years.asc" } }), `/en/q${city}`);
  assert.match(route({ path: city, query: { phase: "p" } }), /^\/en\/q\//);
  assert.match(route({ path: "/players", query: { from: "1990" } }), /^\/en\/q\//);
  assert.equal(route({ path: "/teams", query: { to: "1990" } }), "/en/s/teams");
});

test("the teams list reads every choice in the browser, so none of them asks the server for a copy; its sub-pages still can", () => {
  for (const key of TEAMS_CLIENT_KEYS) {
    assert.equal(route({ path: "/teams", query: { [key]: "1" } }), "/en/s/teams", key);
    assert.equal(route({ path: "/teams", query: { [key]: "1" }, cookie: "spxn-locale=fr" }), "/fr/s/teams", key);
  }
  assert.equal(route({ path: "/teams", query: { league: "nhl", conf: "East", div: "Atlantic", titles: "3", from: "1990", to: "2005", sort: "titles.desc", page: "2", q: "bruins", status: "active" } }), "/en/s/teams");
  assert.match(route({ path: "/teams/lineage", query: { league: "nhl" } }), /^\/en\/q\/teams\/lineage/);
  assert.match(route({ path: "/teams/coaches", query: { league: "nhl" } }), /^\/en\/q\/teams\/coaches/);
});

test("the home page and the pages that read no query stay static whatever the query is", () => {
  assert.equal(route({ path: "/", query: { from: "1990", to: "2000" } }), "/en/s");
  assert.equal(route({ path: "/nhl", query: { from: "1990", sort: "x" } }), "/en/s/nhl");
  for (const page of ALWAYS_STATIC) assert.equal(route({ path: `/${page}`, query: { sort: "x", view: "y" }, cookie: "spxn-locale=fr" }), `/fr/s/${page}`);
});

test("what is no page is answered, unkept, with the 404", () => {
  assert.equal(route({ path: "/wp-login.php" }), "/en/q/wp-login.php");
  assert.equal(route({ path: "/xx/yy/zz", cookie: "spxn-locale=fr" }), "/fr/q/xx/yy/zz");
  assert.equal(route({ path: "/about/more" }), "/en/q/about/more");
  assert.deepEqual([...PAGE_ROOTS], ["nhl", "pwhl", "nba", "wnba", "mlb", "nfl", "cfl", "nwsl", "afl", "aafc", "nha", "pcha", "wchl", "wha", "players", "teams", "city", "venue", "worldcup", "mls", "country"]);
});

test("the drawings of playing surfaces (app/surface/[file]) are no page: the 404 rule leaves them to their route handler", () => {
  assert.equal(route({ path: "/surface/nfl.en.svg" }), "(none) /surface/nfl.en.svg");
  assert.equal(route({ path: "/surfaces/nfl.en.svg" }), "/en/q/surfaces/nfl.en.svg");
  assert.ok(statSync(join(SRC, "app", "surface", "[file]", "route.ts")).isFile());
});

/** Every route the app serves outside app/[locale]: [its first segment, a concrete address]. Route groups like (dyn) add no segment; [x] and [...x] get sample values. */
function outsideLocaleRoutes(dir = join(SRC, "app"), at: string[] = []): [string, string][] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (!statSync(path).isDirectory() || (at.length === 0 && name === "[locale]")) return [];
    const seg = /^\(.*\)$/.test(name) ? [] : [/^\[\.\.\..+\]$/.test(name) ? "a/b" : /^\[.+\]$/.test(name) ? "x" : name];
    const here = [...at, ...seg];
    const own: [string, string][] = here.length && readdirSync(path).some((f) => /^(route|page)\.tsx?$/.test(f)) ? [[here[0], "/" + here.join("/")]] : [];
    return [...own, ...outsideLocaleRoutes(path, here)];
  });
}

test("no rewrite touches the API, the build's files, the drawings or the signed-in pages, whether Next matches them before or after the rewrites", () => {
  // Next matches a route with a dynamic segment AFTER the rewrites. Sign-in broke when the 404 rule wrapped /api/auth/* (app/api/auth/[...nextauth]).
  const found = outsideLocaleRoutes();
  assert.ok(found.length >= 12, "app/ was read");
  const addresses = new Set([
    "/api/auth/providers", "/api/auth/session", "/api/auth/csrf", "/api/auth/signin", "/api/auth/signout", "/api/auth/error", "/api/auth/callback/google", "/api/auth/callback/github",
    "/api/me", "/api/locale", "/api/revalidate", "/api/players", "/api/players/suggest", "/api/teams", "/api/teams/suggest", "/api/venues", "/api/anything/at/all", "/api",
    "/_next/static/chunks/main.js", "/_next/image", "/surface/nfl.en.svg", "/surface/nhl.fr.svg",
    "/sitemap.xml", "/robots.txt", "/venues.csv", "/venues.geojson", "/soccer-flags.svg", "/soccer-flags-round.svg", "/soccer-flag/ES.svg", "/flag/ES.svg", "/flag/CA.round.svg", "/soccer-flag/GB-ENG.svg", "/soccer-road/2022.en.svg", "/soccer-road/2019.fr.svg", "/bracket-svg/nba-2023.wide.en.svg", "/bracket-svg/nfl-2025.inphone.fr.svg", "/bracket-svg/soccer-2022.wide.ja.svg",
    "/admin", "/admin/data", "/admin/ops", "/admin/people", "/admin/people/review", "/admin/logos", "/admin/tickets", "/admin/tickets/new", "/admin/tickets/abc", "/me", "/me/profile", "/me/settings", "/login", "/tickets", "/tickets/abc",
    ...found.map(([, address]) => address),
  ]);
  const cases: Omit<Req, "path">[] = [{}, { cookie: "spxn-locale=fr" }, { acceptLanguage: "ja" }, { query: { q: "x", view: "y" } }];
  for (const path of addresses) for (const c of cases) assert.equal(route({ path, ...c }), `(none) ${path}`, path);
});

test("every first segment app/ serves outside app/[locale] is in RESERVED_ROOTS, so the 404 rule cannot shadow it", () => {
  const reserved = new Set<string>(RESERVED_ROOTS);
  const roots = [...new Set(outsideLocaleRoutes().map(([first]) => first))];
  assert.ok(roots.includes("api") && roots.includes("surface") && roots.includes("admin"));
  const missing = roots.filter((first) => !reserved.has(first));
  assert.deepEqual(missing, [], "add these to RESERVED_ROOTS in src/lib/routing.ts");
  for (const root of RESERVED_ROOTS) assert.equal(route({ path: `/${root}/zz/yy` }), `(none) /${root}/zz/yy`, root);
  // The lookahead covers the whole first segment: a longer word is still no page, and still the 404.
  assert.equal(route({ path: "/apis/auth" }), "/en/q/apis/auth");
  assert.equal(route({ path: "/api-docs" }), "/en/q/api-docs");
  assert.equal(route({ path: "/login2" }), "/en/q/login2");
});

test("a rewrite's own result is never rewritten again, and the language tree is closed to readers", () => {
  for (const path of ["/en/s/about", "/fr/q/nhl", "/ja/s", "/en"]) assert.equal(route({ path }), `(none) ${path}`);
  const hit = match(hideInternalPaths.source, { decode: decodeURIComponent });
  assert.ok(hit("/fr/s/nhl/2012-13"));
  assert.ok(hit("/en/q/players"));
  assert.ok(!hit("/nhl/2012-13"));
  assert.ok(!hit("/en/nhl"));
});

test("acceptsFirst() reads the header the way pickLocale() does, for the usual headers", async () => {
  const { pickLocale } = await import("../src/lib/locale.ts");
  const headers = ["fr-CA,fr;q=0.9,en;q=0.8", "en-CA,en;q=0.9", "ja", "ja-JP,ja;q=0.9,en-US;q=0.8", "de,fr;q=0.8", "es-419,es;q=0.9", "zh-TW,zh;q=0.9,ja;q=0.5", "en-US,fr;q=0.9"];
  for (const h of headers) {
    const picked = (["fr", "ja"] as const).find((l) => new RegExp(`^${acceptsFirst(l)}$`).test(h)) ?? "en";
    assert.equal(picked, pickLocale(h), h);
  }
});

/** Every .ts and .tsx file under a directory. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}

const SRC = join(import.meta.dirname, "..", "src");

test("every query key a public page reads on the server is in QUERY_KEYS (lib/routing.ts)", () => {
  const known = new Set<string>(QUERY_KEYS);
  // The speaker is also called `sp` in places (sp.say, sp.fmt, ...): those are not query keys.
  const notKeys = new Set(["say", "fmt", "plural", "locale", "dt", "keys", "get", "has", "set", "delete", "append", "forEach", "entries", "values", "toString", "size", "null", "find", "length", "filter", "slice", "join", "some", "every", "reduce", "at", "push", "includes", "sort_", "flatMap"]);
  const found = new Map<string, string>();
  const files = [...sources(join(SRC, "app", "[locale]", "q")), ...sources(join(SRC, "components")), join(SRC, "lib", "season.ts"), join(SRC, "lib", "h2h.ts"), join(SRC, "lib", "compare.ts")];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/\bsp\??\.([a-z][a-z_]*)/g)) if (!notKeys.has(m[1])) found.set(m[1], file);
    for (const m of text.matchAll(/\bsp\[\s*"([a-z_]+)"\s*\]/g)) found.set(m[1], file);
    for (const m of text.matchAll(/\bspOne\(\s*"([a-z_]+)"/g)) found.set(m[1], file);
    for (const m of text.matchAll(/\bparam="([a-z_]+)"/g)) found.set(m[1], file);
    for (const m of text.matchAll(/\bqueryHref\([^,]+,[^,]+,\s*\{([^}]*)\}/g)) for (const k of m[1].matchAll(/(?:^|[,{\s])([a-z_]+)\s*:/g)) found.set(k[1], file);
    for (const m of text.matchAll(/\braw\.([a-z]+)\b/g)) found.set(m[1], file);
    for (const m of text.matchAll(/\bsearchParams\.get\(\s*"([a-z_]+)"\s*\)/g)) found.set(m[1], file);
  }
  const missing = [...found].filter(([key]) => !known.has(key) && !notKeys.has(key)).map(([key, file]) => `${key} (${relative(SRC, file)})`);
  assert.deepEqual(missing, [], "add these to QUERY_KEYS in src/lib/routing.ts, or the static copy of a page will ignore them");
});

test("the kept pages (app/[locale]/s) read no query: a query is read in q/", () => {
  const offenders: string[] = [];
  for (const file of sources(join(SRC, "app", "[locale]", "s"))) {
    const text = readFileSync(file, "utf8").replace(/searchParams(?::\s*|=\{)NO_QUERY\}?/g, "");
    if (/\bsearchParams\b|useSearchParams|\bcookies\(|\bheaders\(|unstable_noStore|connection\(/.test(text)) offenders.push(relative(SRC, file));
  }
  assert.deepEqual(offenders, [], "a page that needs the query belongs in app/[locale]/q, with a twin in s (see lib/routing.ts)");
});

test(`no rewrite has more than ${MAX_CONDITIONS} has or missing conditions (Vercel refuses the build otherwise)`, () => {
  const rules = pageRewrites();
  assert.ok(rules.length > 0);
  for (const r of rules) {
    assert.ok((r.has?.length ?? 0) <= MAX_CONDITIONS, `has: ${r.source} -> ${r.destination}`);
    assert.ok((r.missing?.length ?? 0) <= MAX_CONDITIONS, `missing: ${r.source} -> ${r.destination}`);
  }
});

test("the routes Next wrote for the last build keep to that limit too (skipped when there is no build)", (t) => {
  const file = join(import.meta.dirname, "..", ".next", "routes-manifest.json");
  let manifest: { rewrites?: unknown; redirects?: unknown[]; headers?: unknown[] };
  try {
    manifest = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return t.skip("no .next/routes-manifest.json: run pnpm build first");
  }
  const rules = [
    ...(Array.isArray(manifest.rewrites) ? manifest.rewrites : Object.values((manifest.rewrites ?? {}) as Record<string, unknown[]>).flat()),
    ...(manifest.redirects ?? []), ...(manifest.headers ?? []),
  ] as { has?: unknown[]; missing?: unknown[]; source: string }[];
  assert.ok(rules.length > 0);
  for (const r of rules) {
    assert.ok((r.has?.length ?? 0) <= MAX_CONDITIONS, `has: ${r.source}`);
    assert.ok((r.missing?.length ?? 0) <= MAX_CONDITIONS, `missing: ${r.source}`);
  }
});

test("the venue downloads are route handlers in app/, which Next serves before any rewrite (they are no pages)", () => {
  for (const file of ["venues.csv", "venues.geojson"]) {
    assert.ok(statSync(join(SRC, "app", file, "route.ts")).isFile(), file);
    assert.ok(!(ALWAYS_STATIC as readonly string[]).includes(file) && !(PAGE_ROOTS as readonly string[]).includes(file), file);
  }
});

test("the signed-in pages stay out of the language tree", () => {
  for (const dir of ["admin", "me", "login", "tickets"]) assert.ok(statSync(join(SRC, "app", "(dyn)", dir)).isDirectory(), dir);
});

test("robots.txt blocks AI crawlers site-wide and every crawler from games, matches, rows and query strings", () => {
  const text = readFileSync(join(import.meta.dirname, "..", "public", "robots.txt"), "utf8");
  for (const bot of ["GPTBot", "ClaudeBot", "CCBot", "Google-Extended", "PerplexityBot", "Bytespider"]) {
    assert.match(text, new RegExp(`User-agent: ${bot}`));
  }
  const ai = text.split("User-agent: *")[0] ?? "";
  assert.match(ai, /Disallow: \//);
  const all = text.split("User-agent: *")[1] ?? "";
  for (const rule of ["Disallow: /*/game/", "Disallow: /*/match/", "Disallow: /*/rows/", "Disallow: /*?*", "Disallow: /en/q/", "Disallow: /fr/q/", "Disallow: /ja/q/"]) {
    assert.ok(all.includes(rule), rule);
  }
});

test("a query the server reads is a q/ variant (nofollow); live filters on always-static and player/city client keys are not", () => {
  assert.equal(isQueryVariant("/nhl/2012-13?view=wildcard"), true);
  assert.equal(queryFollowRel("/players?q=gretzky"), "nofollow");
  assert.equal(isQueryVariant("/nhl/2012-13"), false);
  assert.equal(isQueryVariant("/nhl?sort=x"), false);
  assert.equal(isQueryVariant("/teams?q=bruins"), false);
  assert.equal(isQueryVariant("/nhl/player/mark-messier-2359?from=1985&to=1990"), false);
  assert.equal(isQueryVariant("/nhl/player/mark-messier-2359?sort_awards=season.asc"), true);
  assert.equal(isQueryVariant("/city/vancouver?from=1990&to=2000"), false);
  assert.equal(isQueryVariant("/city/vancouver?sort=years.asc"), true);
  assert.equal(QUERY_ROBOTS.index, false);
  assert.equal(QUERY_ROBOTS.follow, false);
});

test("q/ copies are noindex,nofollow; public Link goes through the wrapper that adds rel=nofollow", () => {
  const qLayout = readFileSync(join(SRC, "app", "[locale]", "q", "layout.tsx"), "utf8");
  assert.match(qLayout, /robots: QUERY_ROBOTS/);
  const offenders: string[] = [];
  for (const dir of [join(SRC, "app", "[locale]"), join(SRC, "components")]) {
    for (const file of sources(dir)) {
      if (file.endsWith(`${join("components", "Link.tsx")}`)) continue;
      const text = readFileSync(file, "utf8");
      if (/from ["']next\/link["']/.test(text)) offenders.push(relative(SRC, file));
    }
  }
  assert.deepEqual(offenders, [], "public pages import Link from @/components/Link so query variants get rel=nofollow");
});

test("Link prefetch is off by default so a long table stays under the firewall; the header menu turns it on", () => {
  const link = readFileSync(join(SRC, "components", "Link.tsx"), "utf8");
  assert.match(link, /prefetch=\{prefetch \?\? false\}/);
  const header = readFileSync(join(SRC, "components", "SiteChrome.tsx"), "utf8");
  assert.match(header, /<header[\s\S]*prefetch/);
  assert.match(header, /href="\/teams" prefetch/);
  const nav = readFileSync(join(SRC, "components", "LeagueNav.tsx"), "utf8");
  assert.match(nav, /prefetch onClick/);
  assert.match(nav, /href="\/soccer" prefetch/);
});
