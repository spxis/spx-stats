import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { createRequire } from "node:module";
import { acceptsFirst, ALWAYS_STATIC, hideInternalPaths, pageRewrites, PAGE_ROOTS, QUERY_KEYS } from "../src/lib/routing.ts";

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
  assert.equal(route({ path: "/nhl/2012-13", query: { utm_source: "x", fbclid: "y" } }), "/en/s/nhl/2012-13");
  assert.equal(route({ path: "/nhl/2012-13", query: { _rsc: "abc" } }), "/en/s/nhl/2012-13");
  for (const key of QUERY_KEYS) assert.match(route({ path: "/nhl/2012-13/leaders", query: { [key]: "1" } }), /^\/en\/q\//, key);
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
  assert.deepEqual([...PAGE_ROOTS], ["nhl", "nba", "mlb", "nfl", "cfl", "players", "teams"]);
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

test("the signed-in pages stay out of the language tree", () => {
  for (const dir of ["admin", "me", "login", "tickets"]) assert.ok(statSync(join(SRC, "app", "(dyn)", dir)).isDirectory(), dir);
});
