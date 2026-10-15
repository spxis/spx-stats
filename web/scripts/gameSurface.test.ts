import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { BrandMap } from "../src/lib/brand.ts";
import type { TeamBrandRow } from "../src/lib/api/types.ts";
import { drawGame, gameOptions, groundOf, homeVenueIn, neutralSite, parkFits, parkOf, sportOf, type GameDrawing, type VenueLookup } from "../src/lib/gameSurface.ts";
import { kyogijoCss } from "./kyogijoCss.ts";

/** Run in web/: pnpm test:surface */

const game = (over: Partial<GameDrawing> = {}): GameDrawing => ({
  sport: "nhl", year: 2024, language: "en", status: "Final / OT", competition: "Stanley Cup Final · Game 6", date: "June 17, 2025",
  away: { name: "Edmonton Oilers", abbr: "EDM", score: 1, color: "041e42", ink: "ffffff", logo: "https://example.com/oilers.svg" },
  home: { name: "Florida Panthers", abbr: "FLA", score: 5, color: "c8102e", ink: "ffffff" },
  ...over,
});

test("kyogijo.css is the stylesheet the installed kyogijo writes (run: node scripts/kyogijoCss.ts)", () => {
  assert.equal(readFileSync(new URL("../src/components/kyogijo.css", import.meta.url), "utf8"), kyogijoCss());
  assert.ok(kyogijoCss().includes(".ky-mark-bg"), "the round team mark's rules are in the stylesheet the pitch's marks use");
});

test("a drawing has no stylesheet, no title and no description: it is aria-hidden, and the score is in it as text", () => {
  const d = drawGame(game())!;
  assert.ok(d.svg.startsWith("<svg"));
  assert.ok(!d.svg.includes("<style"), "the stylesheet is the page's");
  assert.ok(!d.svg.includes("<title") && !d.svg.includes("<desc") && !d.svg.includes('role="img"'));
  assert.ok(d.svg.includes('aria-hidden="true"'));
  assert.ok(/>EDM</.test(d.svg) && />FLA</.test(d.svg) && />5</.test(d.svg));
  assert.ok(d.width > 0 && d.height > 0);
});

test("every sport of a league draws, a football field without its hash marks, with the score on the surface and a round mark for each club", () => {
  for (const lg of ["nhl", "nba", "nfl", "cfl", "mlb"]) assert.ok(sportOf(lg), lg);
  assert.equal(sportOf("wwc"), null);
  for (const sport of ["nhl", "nba", "nfl", "cfl", "mlb"] as const) {
    const d = drawGame(game({ sport }))!;
    assert.ok(d, sport);
    assert.ok(d.svg.includes('data-size="full"') && !d.svg.includes('data-size="compact"'), `${sport}: the surface alone, with no strip under it`);
    assert.ok(/class="ky-plate/.test(d.svg) || d.svg.includes("ky-plate"), `${sport}: the score's plate is on the surface`);
  }
  const o = gameOptions(game());
  assert.deepEqual([o.size, o.score, o.markShape], ["full", "centre", "round"]);
  assert.equal((o.away as { markFit?: string }).markFit, "contain", "a logo is shown whole on its disc");
  assert.equal(gameOptions(game({ sport: "nfl" })).detail, "simple");
  assert.equal(gameOptions(game({ sport: "nhl" })).detail, undefined);
});

test("an MLB game takes its park and season; a park nobody knows falls back to the standard field", () => {
  const park = drawGame(game({ sport: "mlb", park: "fenway-park" }))!;
  const plain = drawGame(game({ sport: "mlb" }))!;
  assert.notEqual(park.svg, plain.svg);
  assert.equal(gameOptions(game({ sport: "mlb", park: "fenway-park" })).park, "fenway-park");
  assert.equal(gameOptions(game({ sport: "mlb", park: "fenway-park" }), true).park, undefined);
  assert.ok(drawGame(game({ sport: "mlb", park: "no-such-park" })));
  // A park is only for baseball.
  assert.equal(gameOptions(game({ sport: "nhl", park: "fenway-park" })).park, undefined);
});

test("a past park is drawn as of the season", () => {
  const a = drawGame(game({ sport: "mlb", park: "polo-grounds", year: 1915 }))!, b = drawGame(game({ sport: "mlb", park: "polo-grounds", year: 1930 }))!;
  assert.notEqual(a.svg, b.svg);
});

test("soccer draws a pitch, on a ground kyogijo knows by its Wikidata id, with the winner a shoot-out settled", () => {
  assert.equal(groundOf("Q1"), null);
  assert.equal(groundOf(null), null);
  const lusail = groundOf("Q498245");
  assert.ok(lusail, "Estadio Centenario is Q498245");
  const d = drawGame(game({ sport: "soccer", year: null, ground: lusail, winner: "home", status: "Final · 4–2 on penalties" }))!;
  assert.ok(d.svg.includes('data-sport="soccer"'));
  assert.ok(d.svg.includes("Final · 4–2 on penalties"));
});

test("a soccer pitch is a pageant: each side's flag as a carpet over its half, the score and the codes on the strip under it", () => {
  const soccer = game({
    sport: "soccer", year: null, winner: "home", status: "final-pens",
    home: { name: "Spain", abbr: "ESP", score: 2, penalties: 4, color: "c60b1e", ink: "ffffff", logo: "/soccer-flag/ES.rect.svg" },
    away: { name: "Argentina", abbr: "ARG", score: 2, penalties: 3, color: "74acdf", ink: "12161b", logo: "/soccer-flag/AR.rect.svg" },
  });
  const o = gameOptions(soccer);
  assert.deepEqual([o.homeSide, o.pageant, o.size], ["right", "carpet", "full"]);
  assert.equal(gameOptions(game()).homeSide, "right", "every sport: kyogijo's `away` is the team on the left (lib/sides.ts)");
  const svg = drawGame(soccer)!.svg;
  assert.ok(svg.includes('data-pageant="carpet"'));
  assert.ok(svg.indexOf(">ARG<") < svg.indexOf(">ESP<"), "the side given as away is on the left, whatever the sport");
  assert.ok(!svg.includes(">SPA<"));
  assert.ok(svg.includes("/soccer-flag/ES.rect.svg") && svg.includes("/soccer-flag/AR.rect.svg"), "a flag is the site's file for it");
  assert.equal((svg.match(/ky-pg-carpet /g) ?? []).length, 2, "one carpet for each side");
  // A club with no picture (MLS) is a carpet of its banner colours with its name.
  const club = drawGame({ ...soccer, home: { ...soccer.home, logo: null, abbr: "LAG", name: "LA Galaxy" }, away: { ...soccer.away, logo: null, abbr: "NYRB", name: "New York Red Bulls" } })!.svg;
  assert.ok(club.includes('data-pageant="carpet"') && club.includes(">LAG<") && club.includes(">NYRB<") && !club.includes("<image"));
});

test("a game only known by its home club claims no venue at a neutral site or in a bubble season", () => {
  assert.ok(neutralSite("nfl", 2023, "playoffs", true));
  assert.ok(neutralSite("nfl", 1970, "playoffs", true));
  assert.ok(!neutralSite("nfl", 1969, "playoffs", true));   // the NFL Championship Game was at a club's ground
  assert.ok(!neutralSite("nfl", 2023, "playoffs", false));
  assert.ok(neutralSite("cfl", 1950, "playoffs", true));
  // The 2019-20 NHL and NBA seasons are year 2019 (the year they start); MLB's postseason of 2020 is year 2020.
  assert.ok(neutralSite("nhl", 2019, "playoffs", false) && neutralSite("nba", 2019, "playoffs", false) && neutralSite("mlb", 2020, "playoffs", true));
  assert.ok(!neutralSite("nhl", 2020, "playoffs", true));
  assert.ok(!neutralSite("nhl", 2019, "regular", false));
});

const era = (f: number, venue: string | null, from: string | null, to: string | null): TeamBrandRow => ({
  league: "mlb", franchise_id: f, brand_from: from, brand_to: to, primary_hex: null, secondary_hex: null, logo_url: null, logo_licence: null, logo_page: null,
  source: "x", home_venue: venue, latitude: venue ? 41 : null, longitude: venue ? -81 : null,
});
const brands: BrandMap = {
  1: [era(1, null, "1990-01-01", "2010-01-01"), era(1, "Progressive Field", "2022-04-07", null)],
  2: [era(2, "Miami", null, "2012-04-04"), era(2, "LoanDepot Park", "2012-04-04", null)],
  3: [era(3, "Old Park", "1950-01-01", "1970-01-01"), era(3, "New Park", "1970-01-01", null)],
};
const look: VenueLookup = {
  place: (_f, v) => (v === "Miami" ? { wid: "Q1", city: "Miami" } : v === "Progressive Field" ? { wid: "Q1154053", city: "Cleveland" } : { wid: null, city: null }),
  span: (wid) => (wid === "Q1154053" ? { opened: 1994, closed: null } : null),
  nameIn: (_wid, year, fallback) => (year < 2008 ? "Jacobs Field" : fallback),
};

test("a venue comes from the era that covers the day, else the nearest era whose venue stood that season", () => {
  assert.equal(homeVenueIn(brands, 3, "1960-05-01", 1960, look)?.name, "Old Park");
  // 1999: the era that covers it names none; the nearest names Progressive Field, which opened in 1994 and is named as it was then.
  const v = homeVenueIn(brands, 1, "1999-06-01", 1999, look);
  assert.equal(v?.name, "Jacobs Field");
  assert.equal(v?.wid, "Q1154053");
  // 1930 is before it stood: no venue is claimed.
  assert.equal(homeVenueIn(brands, 1, "1930-06-01", 1930, look), null);
  // A venue with no years on record is not claimed for a season no era covers.
  assert.equal(homeVenueIn(brands, 3, "1940-06-01", 1940, look), null);
  assert.equal(homeVenueIn(brands, null, "2000-01-01", 2000, look), null);
});

test("a city is not a venue", () => {
  assert.equal(homeVenueIn(brands, 2, "2005-06-01", 2005, look), null);
  assert.equal(homeVenueIn(brands, 2, "2020-06-01", 2020, look)?.name, "LoanDepot Park");
});

test("a venue's park is found by its Wikidata id, and held to the seasons the park was used", () => {
  const v = homeVenueIn(brands, 1, "2016-10-01", 2016, look);
  assert.equal(parkOf(v), "progressive-field");
  assert.equal(parkOf(null), null);
  assert.ok(parkFits("progressive-field", 2016));
  assert.ok(parkFits("progressive-field", 1930), "kyogijo has no opening year for a current park: the venue's own years (api.venue_info) decide");
  assert.ok(parkFits("polo-grounds", 1915));
  assert.ok(!parkFits("polo-grounds", 1990));
  assert.ok(!parkFits(null, 2000));
});
