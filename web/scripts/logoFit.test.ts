import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { BrandMap } from "../src/lib/brand.ts";
import { approvedTable, fitOf, fitsTile, isDefaultFit, logoKey, tileColour, type LogoFit } from "../src/lib/logoFit.ts";
import { sheetLogos, wornYears } from "../src/lib/logoSheet.ts";

/** Run in web/: pnpm test:logofit. The logo fit data (db/seed/logo_fit.csv) and the pure code that reads it. */

const SEED = new URL("../../db/seed/logo_fit.csv", import.meta.url).pathname;

/** A CSV with quoted fields (commas, doubled quotes), as the seed is written. */
function csv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  const [head, ...body] = rows;
  return body.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

const BLUES = "https://thumb.wikimedia.org/wikipedia/commons/thumb/d/db/BluesWordmark.gif/120px-BluesWordmark.gif?utm_source=commons.wikimedia.org&utm_campaign=imageinfo";
const KINGS = "https://upload.wikimedia.org/wikipedia/en/thumb/c/c4/Los_Angeles_Kings_2024_Logo.svg/250px-Los_Angeles_Kings_2024_Logo.svg.png";
const ORIGINAL = "https://upload.wikimedia.org/wikipedia/commons/d/db/BluesWordmark.gif";

test("a logo URL's key is the wiki and the file name, thumbnail or original", () => {
  assert.equal(logoKey(BLUES), "commons:BluesWordmark.gif");
  assert.equal(logoKey(ORIGINAL), "commons:BluesWordmark.gif");
  assert.equal(logoKey(KINGS), "en:Los_Angeles_Kings_2024_Logo.svg");
  assert.equal(logoKey("https://example.com/x.png"), null);
  assert.equal(logoKey(null), null);
  assert.equal(logoKey("/team-logos/sl/5044.gif"), "sl:5044.gif");
  assert.equal(logoKey("/team-logos/sl/hyhk1nf6yl2e5aflm7sxagthl.png"), "sl:hyhk1nf6yl2e5aflm7sxagthl.png");
  assert.equal(logoKey("/team-logos/other/5044.gif"), null);
  assert.equal(logoKey("/team-logos/sl/../x.gif"), null);
  // the file name stays as the URL spells it
  assert.equal(logoKey("https://thumb.wikimedia.org/wikipedia/en/thumb/a/ab/Nashville_Predators_Logo_%282011%29.svg/250px-N.png"), "en:Nashville_Predators_Logo_%282011%29.svg");
});

const row = (over: Partial<LogoFit>): LogoFit => ({
  logo_file: "commons:BluesWordmark.gif", league: "nhl", team: "St. Louis Blues", wordmark: false, mark_url: null, mark_licence: null, mark_page: null,
  scale: 1, dx: 0, dy: 0, bg: "auto", status: "proposed", note: null, ...over,
});

test("only approved fits that change something reach the public table", () => {
  const rows = [
    row({ status: "approved", wordmark: true, mark_url: "https://x/y.png", mark_licence: "PD", mark_page: "https://x/p" }),
    row({ logo_file: "en:A.svg", status: "approved" }),            // approved but changes nothing
    row({ logo_file: "en:B.svg", status: "proposed", scale: 1.2 }), // not approved
    row({ logo_file: "en:C.svg", status: "rejected", scale: 1.2 }),
    row({ logo_file: "en:D.svg", status: "approved", scale: 1.2, bg: "C8102E" }),
  ];
  const table = approvedTable(rows);
  assert.deepEqual(Object.keys(table).sort(), ["commons:BluesWordmark.gif", "en:D.svg"]);
  assert.deepEqual(table["en:D.svg"], ["", 1.2, 0, 0, "C8102E", 0]);
  assert.equal(isDefaultFit(row({})), true);
  assert.equal(isDefaultFit(row({ dy: 2 })), false);
});

test("a fit that only swaps the picture does not need a tile; one that moves or recolours it does", () => {
  assert.equal(fitsTile(fitOf(row({ mark_url: "https://x/y.png", wordmark: true }))), false);
  assert.equal(fitsTile(fitOf(row({ scale: 1.1 }))), true);
  assert.equal(fitsTile(fitOf(row({ bg: "dark" }))), true);
  assert.equal(tileColour("auto"), null);
  assert.equal(tileColour("light"), "#ffffff");
  assert.equal(tileColour("C8102E"), "#C8102E");
  assert.equal(tileColour("javascript:1"), null);
});

test("the contact sheet lists each logo file once, with every franchise that wears it", () => {
  const b = (f: number, from: string | null, to: string | null, url: string, league = "nhl") =>
    ({ league, franchise_id: f, brand_from: from, brand_to: to, primary_hex: null, secondary_hex: null, logo_url: url, logo_licence: "PD", logo_page: "p", source: "wikidata", home_venue: null, latitude: null, longitude: null });
  const brands: BrandMap = {
    1: [b(1, null, "1967-01-01", KINGS), b(1, "1967-01-01", null, KINGS)],
    2: [b(2, null, null, BLUES), b(2, null, null, "https://nope/x.png")],
    3: [b(3, null, null, BLUES, "nba")],
  };
  const out = sheetLogos(brands, new Map([["nhl|1", "Kings"], ["nhl|2", "Blues"]]), [row({})]);
  assert.deepEqual(out.map((l) => l.file), ["commons:BluesWordmark.gif", "en:Los_Angeles_Kings_2024_Logo.svg"]);
  assert.equal(out.length, 2);
  const blues = out.find((l) => l.file === "commons:BluesWordmark.gif")!;
  assert.deepEqual(blues.teams.map((t) => t.name), ["Blues", "Franchise 3"]);
  assert.equal(blues.fit?.status, "proposed");
  const kings = out.find((l) => l.file.startsWith("en:"))!;
  assert.equal(kings.from, null);
  assert.equal(kings.to, null);
  assert.equal(wornYears("1967-01-01", "1999-01-01"), "1967–1999");
  assert.equal(wornYears("1999-01-01", null), "since 1999");
  assert.equal(wornYears(null, "1967-01-01"), "to 1967");
  assert.equal(wornYears(null, null), "all years");
});

test("the seed is well formed: keys, statuses, tiles and a licence for every mark", () => {
  const rows = csv(readFileSync(SEED, "utf8"));
  assert.ok(rows.length > 0);
  const seen = new Set<string>();
  for (const r of rows) {
    assert.match(r.logo_file, /^[a-z]+:[^/?]+$/, r.logo_file);
    assert.ok(!seen.has(r.logo_file), `duplicate ${r.logo_file}`);
    seen.add(r.logo_file);
    assert.ok(r.team, r.logo_file);
    assert.ok(["true", "false"].includes(r.wordmark), r.logo_file);
    assert.ok(["proposed", "approved", "rejected"].includes(r.status), `${r.logo_file} status ${r.status}`);
    assert.ok(Number(r.scale) >= 0.3 && Number(r.scale) <= 3, `${r.logo_file} scale`);
    for (const k of ["dx", "dy"]) assert.ok(Math.abs(Number(r[k])) <= 50, `${r.logo_file} ${k}`);
    assert.ok(["auto", "light", "dark"].includes(r.bg) || /^[0-9A-F]{6}$/.test(r.bg), `${r.logo_file} bg ${r.bg}`);
    if (r.mark_url) {
      // marks come from Wikimedia (Commons, or the English Wikipedia the site's other logos already come from), with the licence and the file page recorded
      assert.match(r.mark_url, /^https:\/\/(upload|thumb)\.wikimedia\.org\/wikipedia\/(commons|en)\//, r.logo_file);
      assert.ok(r.mark_licence && /^https:\/\/(commons\.wikimedia|en\.wikipedia)\.org\/wiki\/File:/.test(r.mark_page), `${r.logo_file} mark licence/page`);
    }
    assert.ok(r.note, `${r.logo_file} needs a note saying the problem and the fix`);
  }
});
