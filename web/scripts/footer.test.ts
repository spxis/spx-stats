import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { test } from "node:test";
import { PHRASES } from "../src/lib/i18n/phrases.constants.ts";
import { FR } from "../src/lib/i18n/dictionaries/fr.constants.ts";
import { JA } from "../src/lib/i18n/dictionaries/ja.constants.ts";

/**
 * The unofficial-project sentence is in the footer of every page, in three languages, as static text.
 * Run in web/: pnpm test:footer. With FOOTER_BASE=http://localhost:<port> set it also fetches real pages from a running server.
 */
const read = (path: string) => readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
const english = PHRASES as Readonly<Record<string, string>>;
const SENTENCE = "SPXN is an unofficial fan project. It is not affiliated with, or endorsed by, the NHL, NBA, MLB, NFL, CFL or any team or league.";

test("the sentence is word for word what John asked for, with a French and a Japanese line", () => {
  assert.equal(english["footer.unofficial"], SENTENCE);
  for (const [name, dict] of [["French", FR], ["Japanese", JA]] as const) {
    const line = dict["footer.unofficial"];
    assert.ok(line && line !== SENTENCE, `${name} line is written`);
    for (const league of ["NHL", "NBA", "MLB", "NFL", "CFL"]) assert.ok(line.includes(league), `${name} names the ${league}`);
  }
});

test("the footer draws it on its own line, as plain static text with an address to link to", () => {
  const chrome = read("components/SiteChrome.tsx");
  assert.match(chrome, /<p className="foot-unofficial" id="unofficial">/);
  assert.match(chrome, /say\("footer\.unofficial"\)/);
  assert.match(chrome, /href="\/logos#owners"/);
  const footer = chrome.slice(chrome.indexOf("export async function SiteFooter"));
  assert.ok(footer.indexOf("foot-unofficial") < footer.indexOf('className="foot-fine"'), "above the small print, not inside it");
  assert.doesNotMatch(read("app/globals.css").match(/\.foot \.foot-unofficial \{[^}]*\}/)?.[0] ?? "", /font-size: 1[0-5]px/, "not small print");
  assert.match(read("app/[locale]/s/logos/page.tsx"), /<h2 id="owners">/, "the logo notice is the link target");
});

test("every public and signed-in page, and the error and not-found pages, are drawn inside the shell that has the footer", () => {
  assert.match(read("components/SiteShell.tsx"), /<\/main>\s*<SiteFooter \/>/);
  assert.match(read("app/[locale]/layout.tsx"), /<SiteShell locale=\{locale\}>/);
  assert.match(read("app/(dyn)/layout.tsx"), /<SiteShell/);
  for (const page of ["app/[locale]/error.tsx", "app/[locale]/not-found.tsx", "app/(dyn)/error.tsx", "app/(dyn)/not-found.tsx"]) {
    assert.ok(existsSync(new URL(`../src/${page}`, import.meta.url)), page);
    assert.doesNotMatch(read(page), /<html/, `${page} sits inside the layout`);
  }
  assert.match(read("app/global-error.tsx"), new RegExp(SENTENCE.replace(/[.,]/g, "\\$&")), "the one page without the shell says it too");
});

test("the footer reads nothing from the request, so kept pages stay kept", () => {
  const chrome = read("components/SiteChrome.tsx");
  assert.doesNotMatch(chrome, /\b(cookies|headers|searchParams|useSearchParams)\(/);
});

test("About and Terms carry the Wikipedia credit with both links; Terms has the unofficial and share-alike sections", () => {
  const credits = read("components/Credits.tsx");
  assert.match(credits, /https:\/\/creativecommons\.org\/licenses\/by-sa\/4\.0\//);
  assert.match(credits, /https:\/\/en\.wikipedia\.org\/wiki\/Wikipedia:Reusing_Wikipedia_content/);
  assert.match(read("app/[locale]/s/about/page.tsx"), /use=\{\["wikipedia"\]\}/);
  const terms = read("app/[locale]/s/terms/page.tsx");
  assert.match(terms, /use=\{\["wikipedia"\]\}/);
  assert.match(terms, /say\("footer\.unofficial"\)/);
  assert.match(terms, /say\("terms\.marks"\)/);
  assert.match(terms, /say\("terms\.wikiShare"\)/);
  assert.equal(english["credit.wikipedia"], "Biographical and other data are from {reuse} and are used under the {licence} licence.");
});

test("no NHL mark or logo address comes from an API: logo addresses are built from Wikimedia, Wikipedia and our own files only", () => {
  for (const file of ["lib/officialLinks.ts", "lib/logoFit.ts", "lib/brand.ts", "lib/logoSheet.ts"]) {
    assert.doesNotMatch(read(file).replace(/\/\*[\s\S]*?\*\//g, ""), /assets\.nhle\.com|nhl\.bamgrid|cms\.nhl\.bamgrid/, file);
  }
});

const BASE = process.env.FOOTER_BASE;
const PAGES = ["/", "/nhl", "/nhl/team/montreal-canadiens", "/nhl/player/wayne-gretzky-1866", "/about", "/terms", "/definitely-not-a-page"];
for (const [locale, line] of [["en", SENTENCE], ["fr", FR["footer.unofficial"]], ["ja", JA["footer.unofficial"]]] as const) {
  for (const path of PAGES) {
    test(`live: ${locale} ${path} has the sentence`, { skip: BASE ? false : "set FOOTER_BASE to a running server" }, async () => {
      const res = await fetch(`${BASE}${path}`, { headers: { cookie: `spxn-locale=${locale}` } });
      const html = (await res.text()).replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&");
      assert.ok(html.includes(line as string), `${res.status} ${path}`);
    });
  }
}
