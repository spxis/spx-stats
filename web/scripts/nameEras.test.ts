import assert from "node:assert/strict";
import { test } from "node:test";
import { groupBrands } from "../src/lib/brand.ts";
import { dayOf, eraLogo, nameEras, seasonUnder } from "../src/lib/nameEras.ts";
import type { TeamBrandRow } from "../src/lib/api/types.ts";

/** Run in web/: pnpm test:eras */
const brand = (franchise_id: number, brand_from: string | null, brand_to: string | null, logo_url: string | null): TeamBrandRow => ({
  league: "mlb", franchise_id, brand_from, brand_to, primary_hex: null, secondary_hex: null, logo_url, logo_licence: null, logo_page: null,
  source: "test", home_venue: null, latitude: null, longitude: null,
});
const years = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

test("a bare year is its first day, a date keeps ten characters, nothing stays nothing", () => {
  assert.equal(dayOf("1915"), "1915-01-01");
  assert.equal(dayOf("1915-03-04T00:00:00"), "1915-03-04");
  assert.equal(dayOf(null), null);
});

test("a name that ends on 1 January 2022 owns 2021 and not 2022; one that begins on that day owns 2022", () => {
  assert.equal(seasonUnder({ from: "1915-01-01", to: "2022-01-01" }, 2021), true);
  assert.equal(seasonUnder({ from: "1915-01-01", to: "2022-01-01" }, 2022), false);
  assert.equal(seasonUnder({ from: "2022-01-01", to: null }, 2022), true);
  assert.equal(seasonUnder({ from: "2022-01-01", to: null }, 2021), false);
});

test("a rename in the off-season of a fall league goes to the season that follows", () => {
  assert.equal(seasonUnder({ from: null, to: "1997-06-30" }, 1996), true);
  assert.equal(seasonUnder({ from: null, to: "1997-06-30" }, 1997), false);
  assert.equal(seasonUnder({ from: "1997-06-30", to: null }, 1997), true);
});

test("a name with no days owns every season", () => {
  assert.equal(seasonUnder({ from: null, to: null }, 1850), true);
});

test("the logo worn in most of a name's seasons stands for it, the latest on a tie, none when no season has one", () => {
  const b = groupBrands([brand(1, null, "1950-01-01", "old.svg"), brand(1, "1950-01-01", null, "new.svg")]);
  assert.equal(eraLogo(b, 1, years(1940, 1949)), "old.svg");
  assert.equal(eraLogo(b, 1, [...years(1940, 1949), ...years(1950, 1959)]), "new.svg");
  assert.equal(eraLogo(b, 1, [1949, 1950]), "new.svg");
  assert.equal(eraLogo(groupBrands([brand(2, "1990-01-01", null, "x.svg")]), 2, years(1900, 1950)), null);
});

test("each name gets its seasons and logo; one with none of its own wears the current logo, flagged", () => {
  const b = groupBrands([brand(1, "1994-01-01", "2022-01-01", "chief.svg"), brand(1, "2022-01-01", null, "guard.svg")]);
  const out = nameEras(
    [{ name: "Naps", from: "1903-01-01", to: "1915-01-01" }, { name: "Indians", from: "1915-01-01", to: "2022-01-01" }, { name: "Guardians", from: "2022-01-01", to: null }],
    years(1903, 2026), b, 1,
  );
  assert.deepEqual(out.map((e) => e.seasons), [12, 107, 5]);
  assert.deepEqual(out.map((e) => e.logo), ["guard.svg", "chief.svg", "guard.svg"]);
  assert.deepEqual(out.map((e) => e.current), [true, false, false]);
});

test("seasons a club skipped do not count, and a name with no logo at all draws none", () => {
  const out = nameEras([{ name: "A", from: "2000-01-01", to: "2010-01-01" }], [2000, 2001, 2005, 2009], groupBrands([]), 1);
  assert.equal(out[0].seasons, 4);
  assert.equal(out[0].logo, null);
  assert.equal(out[0].current, false);
});

test("a name no season falls in counts zero but takes the logo of the years it covers", () => {
  const b = groupBrands([brand(1, "1990-01-01", "2000-01-01", "mid.svg"), brand(1, "2000-01-01", null, "now.svg")]);
  const out = nameEras([{ name: "Short", from: "1992-01-01", to: "1996-01-01" }], [1980, 2005], b, 1);
  assert.equal(out[0].seasons, 0);
  assert.equal(out[0].logo, "mid.svg");
});
