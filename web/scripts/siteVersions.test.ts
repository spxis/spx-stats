import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PAGE_ROOTS, ALWAYS_STATIC } from "../src/lib/routing.ts";
import { SITE_RELEASES, versionCmp, versionSeries } from "../src/lib/siteReleases.ts";

/** Run in web/: pnpm test:siteversions */
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };
const FIRST_LEVEL = new Set<string>([...ALWAYS_STATIC, ...PAGE_ROOTS, "players", "teams"]);

test("versions are unique, written as x.y.z and listed newest first", () => {
  const seen = new Set<string>();
  for (const r of SITE_RELEASES) {
    assert.match(r.version, /^\d+\.\d+\.\d+$/, r.version);
    assert.ok(!seen.has(r.version), `duplicate ${r.version}`);
    seen.add(r.version);
  }
  for (let i = 1; i < SITE_RELEASES.length; i++) {
    assert.ok(versionCmp(SITE_RELEASES[i - 1].version, SITE_RELEASES[i].version) > 0, `${SITE_RELEASES[i - 1].version} should come before ${SITE_RELEASES[i].version}`);
  }
});

test("the list reaches the site's current version and never passes it", () => {
  const top = SITE_RELEASES[0].version;
  assert.ok(versionCmp(top, pkg.version) <= 0, `${top} is newer than package.json ${pkg.version}`);
  // A newer package version with no row means a bump went out without its entry: the page would lag. Allow a patch of slack only.
  assert.equal(versionSeries(top), versionSeries(pkg.version), `add a row to lib/siteReleases.ts for ${pkg.version}`);
});

test("dates, commits, titles and text are filled in properly", () => {
  for (let i = 0; i < SITE_RELEASES.length; i++) {
    const r = SITE_RELEASES[i];
    assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/, r.version);
    assert.ok(!Number.isNaN(Date.parse(`${r.date}T00:00:00Z`)), r.version);
    if (r.sha) assert.match(r.sha, /^[0-9a-f]{7}$/, r.version);
    assert.ok(r.title.length >= 8 && r.title.length <= 70, `${r.version} title length ${r.title.length}`);
    assert.ok(r.text.length >= 20 && r.text.length <= 400, `${r.version} text length ${r.text.length}`);
    assert.ok(!/cmv[a-z0-9]{10}|\.tsx?\b|\.sql\b/i.test(`${r.title} ${r.text}`), `${r.version} names a ticket id or a file`);
    if (i) assert.ok(r.date <= SITE_RELEASES[i - 1].date, `${r.version} is dated after the next version`);
  }
});

test("a link goes to a page the site has", () => {
  for (const r of SITE_RELEASES) {
    if (!r.href) continue;
    assert.ok(r.href.startsWith("/"), r.version);
    const first = r.href.split("/")[1];
    assert.ok(first === "" || FIRST_LEVEL.has(first), `${r.version}: ${r.href}`);
  }
});

test("/releases is a kept page with no query, and is in the sitemap", () => {
  assert.ok((ALWAYS_STATIC as readonly string[]).includes("releases"));
  assert.match(readFileSync(new URL("../src/app/sitemap.ts", import.meta.url), "utf8"), /"\/releases"/);
  assert.match(readFileSync(new URL("../src/app/[locale]/s/releases/page.tsx", import.meta.url), "utf8"), /export const revalidate = 86400;/);
});
