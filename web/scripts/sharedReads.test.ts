import assert from "node:assert/strict";
import { test } from "node:test";
import type { FranchiseNameRow, SeasonSummaryRow, TeamBrandRow } from "../src/lib/api/types.ts";
import { brandPackSchema, brandRowsFromPack } from "../src/lib/brandPack.ts";
import { logoFitPackSchema, logoFitsFromPack } from "../src/lib/logoFitPack.ts";
import { namePackSchema, nameRowsFromPack, runsFromPack } from "../src/lib/namePack.ts";
import { summaryPackSchema, summaryRowsFromPack } from "../src/lib/summaryPack.ts";

/**
 * Run in web/: pnpm test:sharedreads. The packs of migrations 176 to 179 hold the rows of the views the first visit to any page read whole; the readers must give back
 * exactly those rows, in the order the views give them. The packers here do what the migrations do, on a few rows with the awkward cases.
 */

const brand = (o: Partial<TeamBrandRow>): TeamBrandRow => ({
  league: "nhl", franchise_id: 1, brand_from: null, brand_to: null, primary_hex: null, secondary_hex: null, logo_url: null, logo_licence: null, logo_page: null,
  source: "wikipedia", home_venue: null, latitude: null, longitude: null, ...o,
});
const BRANDS: TeamBrandRow[] = [
  brand({ franchise_id: 1, brand_from: null, brand_to: "1990-01-01", home_venue: "Old Arena", latitude: 40.5, longitude: -74.1 }),
  brand({ franchise_id: 1, brand_from: "1990-01-01", league: "nhl", primary_hex: "AA0000", secondary_hex: "FFFFFF", logo_url: "https://x/a.svg", logo_licence: "PD", logo_page: "https://x/File:a" }),
  brand({ franchise_id: 1, brand_from: "1990-01-01", league: "wha", primary_hex: "AA0000", secondary_hex: "FFFFFF", logo_url: "https://x/a.svg", logo_licence: "PD", logo_page: "https://x/File:a" }),
  brand({ franchise_id: 1, brand_from: "2000-01-01", logo_url: "https://x/b.svg", logo_licence: null, logo_page: null }),
  brand({ franchise_id: 2, brand_from: "1980-01-01", logo_url: "https://x/a.svg", logo_licence: "fair use", logo_page: "https://x/File:a" }),
];

/** What migration 176 does. */
function packBrands(list: TeamBrandRow[]) {
  const by = new Map<number, TeamBrandRow[]>();
  for (const b of list) by.set(b.franchise_id, [...(by.get(b.franchise_id) ?? []), b]);
  return [...by].sort((a, b) => a[0] - b[0]).map(([franchise_id, eras]) => {
    const logos: [string, string | null, string | null][] = [];
    const at = (b: TeamBrandRow) => {
      const i = logos.findIndex((l) => l[0] === b.logo_url && l[1] === b.logo_licence && l[2] === b.logo_page);
      if (i >= 0) return i;
      logos.push([b.logo_url!, b.logo_licence, b.logo_page]);
      return logos.length - 1;
    };
    return { franchise_id, logos, eras: eras.map((b) => [b.league, b.brand_from, b.brand_to, b.primary_hex, b.secondary_hex, b.logo_url ? at(b) : null, b.source, b.home_venue, b.latitude, b.longitude]) };
  });
}

test("brand eras come back as the rows of api.team_brand, each logo kept once", () => {
  const pack = packBrands(BRANDS).map((p) => brandPackSchema.parse(p));
  assert.deepEqual(brandRowsFromPack(pack), BRANDS);
  assert.equal(pack[0].logos.length, 2, "two leagues wearing one logo share its entry");
});

test("a brand era pointing at a logo that is not there is an error, not a missing logo", () => {
  assert.throws(() => brandRowsFromPack([{ franchise_id: 1, logos: [], eras: [["nhl", null, null, null, null, 0, "wikipedia", null, null, null]] }]), /logo 0/);
});

test("names come back as the rows of api.franchise_names, in both orders the readers ask for", () => {
  const rows: FranchiseNameRow[] = [
    { league: "nhl", franchise_id: 1, name: "Whalers", name_from: null, name_to: "1997-06-01" },
    { league: "nhl", franchise_id: 1, name: "Hurricanes", name_from: "1997-06-01", name_to: null },
    { league: "nhl", franchise_id: 1, name: "Hurricanes", name_from: "1997-06-01", name_to: null },
    { league: "wha", franchise_id: 1, name: "Whalers", name_from: "1972-01-01", name_to: "1979-01-01" },
    { league: "nhl", franchise_id: 2, name: "Bruins", name_from: null, name_to: null },
  ];
  const pack = namePackSchema.array().parse([
    { league: "nhl", franchise_id: 1, names: [["Hurricanes", "1997-06-01", null], ["Hurricanes", "1997-06-01", null], ["Whalers", null, "1997-06-01"]], runs: [["Whalers", 1979, 1996], [null, 1997, 1997]] },
    { league: "nhl", franchise_id: 2, names: [["Bruins", null, null]], runs: [] },
    { league: "wha", franchise_id: 1, names: [["Whalers", "1972-01-01", "1979-01-01"]], runs: [] },
  ]);
  const last = nameRowsFromPack(pack);
  assert.deepEqual(last.map((r) => r.name_from), ["1997-06-01", "1997-06-01", null, null, "1972-01-01"], "dated names first, the nameless date last (name_from ascending)");
  const first = nameRowsFromPack(pack, true);
  assert.deepEqual(first.map((r) => `${r.league}${r.franchise_id}${r.name_from}`), ["nhl1null", "nhl11997-06-01", "nhl11997-06-01", "nhl2null", "wha11972-01-01"]);
  assert.deepEqual(new Set(first.map((r) => JSON.stringify(r))), new Set(rows.map((r) => JSON.stringify(r))));
  assert.deepEqual(runsFromPack(pack), [
    { league: "nhl", franchise_id: 1, team: "Whalers", from_year: 1979, to_year: 1996 },
    { league: "nhl", franchise_id: 1, team: null, from_year: 1997, to_year: 1997 },
  ]);
});

test("season summaries come back a league at a time in year order", () => {
  const rows: SeasonSummaryRow[] = [
    { league: "nba", year: 2020, label: "2020-21", games: 1, finals: 1, playoff_finals: 0, teams: 30, champion: "Bucks", champion_note: null, champion_source: "spx", champion_franchise: 7 },
    { league: "nba", year: 2021, label: "2021-22", games: 0, finals: 0, playoff_finals: 0, teams: 0, champion: null, champion_note: null, champion_source: null, champion_franchise: null },
  ];
  const pack = summaryPackSchema.array().parse([{ league: "nba", seasons: rows.map((r) => [r.year, r.label, r.games, r.finals, r.playoff_finals, r.teams, r.champion, r.champion_note, r.champion_source, r.champion_franchise]) }]);
  assert.deepEqual(summaryRowsFromPack(pack), rows);
});

test("logo fits come back as the rows of api.logo_fit, and a status the site does not know is refused", () => {
  const fit = ["commons:A.svg", "nhl", "A", false, null, null, null, 1.15, 0, -4, "auto", "approved", "note"];
  const [row] = logoFitsFromPack([logoFitPackSchema.parse({ fits: [fit] })]);
  assert.deepEqual(row, { logo_file: "commons:A.svg", league: "nhl", team: "A", wordmark: false, mark_url: null, mark_licence: null, mark_page: null, scale: 1.15, dx: 0, dy: -4, bg: "auto", status: "approved", note: "note" });
  assert.throws(() => logoFitPackSchema.parse({ fits: [[...fit.slice(0, 11), "maybe", null]] }));
});
