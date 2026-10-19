import assert from "node:assert/strict";
import { test } from "node:test";
import type { BrandMap } from "../src/lib/brand.ts";
import type { CityRef, Placement } from "../src/lib/cityModel.ts";
import { buildGroups, currentGroups, currentYear, everIn, placeText, type AlignLike } from "../src/lib/teamGroups.ts";
import { filterTeams, isMember, leagueSpan, mostTitles, pageOf, readFilters, searchTextOf, TEAMS_CLIENT_KEYS, type BoardTeam } from "../src/lib/teamBoard.ts";
import { formerNames } from "../src/lib/teamFormer.ts";
import { latestHomes } from "../src/lib/teamHome.ts";

/** Run in web/: pnpm test:teamboard */

const row = (year: number, franchise_id: number, conference: string | null, conference_short: string | null, division: string | null, division_short: string | null): AlignLike =>
  ({ year, franchise_id, conference, conference_short, division, division_short });

// A small NHL: 1 sat in Wales/Adams then East/Northeast then East/Atlantic; 2 always West/Central; 3 only in the 2020 divisions (no conference), which also has a Central.
const nhl: AlignLike[] = [
  row(1985, 1, "Prince of Wales Conference", "Wales", "Adams Division", "Adams"),
  row(1992, 1, "Prince of Wales Conference", "Wales", "Adams Division", "Adams"),
  row(1993, 1, "Eastern Conference", "East", "Northeast Division", "Northeast"),
  row(2013, 1, "Eastern Conference", "East", "Atlantic Division", "Atlantic"),
  row(2022, 1, "Eastern Conference", "East", "Atlantic Division", "Atlantic"),
  row(1993, 2, "Western Conference", "West", "Central Division", "Central"),
  row(2022, 2, "Western Conference", "West", "Central Division", "Central"),
  row(2020, 3, null, null, "Central Division", "Central"),
  row(2021, 4, null, null, null, null),
];

test("every conference and division that ever existed is listed, newest first, with its years", () => {
  const g = buildGroups(nhl);
  assert.deepEqual(g.confs.map((c) => [c.id, c.from, c.to]), [["East", 1993, 2022], ["West", 1993, 2022], ["Wales", 1985, 1992]]);
  assert.deepEqual(g.divs.map((d) => [d.id, d.conf, d.from, d.to]), [
    ["Atlantic", "East", 2013, 2022], ["West Central", "West", 1993, 2022], ["Central", null, 2020, 2020], ["Northeast", "East", 1993, 1993], ["Adams", "Wales", 1985, 1992],
  ]);
});

test("two divisions with one short name are told apart by their conference; the one with none keeps the bare name", () => {
  const g = buildGroups(nhl);
  const central = g.divs.filter((d) => d.short === "Central");
  assert.deepEqual(central.map((d) => d.id).sort(), ["Central", "West Central"]);
  assert.equal(new Set(g.divs.map((d) => d.id)).size, g.divs.length);
});

test("a franchise sits under every place it ever belonged to, the current or last one first", () => {
  const g = buildGroups(nhl);
  assert.deepEqual(g.places.get(1), [["East", "Atlantic"], ["East", "Northeast"], ["Wales", "Adams"]]);
  assert.deepEqual(g.places.get(2), [["West", "West Central"]]);
  assert.deepEqual(g.places.get(3), [[null, "Central"]]);
  assert.equal(g.places.has(4), false, "a row with neither a conference nor a division places nobody");
});

test("everIn asks for both choices in the same place", () => {
  const g = buildGroups(nhl);
  const one = g.places.get(1);
  assert.equal(everIn(one, "", ""), true);
  assert.equal(everIn(one, "Wales", ""), true);
  assert.equal(everIn(one, "", "Adams"), true);
  assert.equal(everIn(one, "East", "Adams"), false);
  assert.equal(everIn(one, "East", "Northeast"), true);
  assert.equal(everIn(g.places.get(2), "East", ""), false);
  assert.equal(everIn(undefined, "East", ""), false);
  assert.equal(everIn(undefined, "", ""), true);
});

test("a place reads as conference and division, or the division alone where its name already carries the conference", () => {
  const g = buildGroups(nhl);
  assert.equal(placeText(g, ["East", "Atlantic"]), "East · Atlantic");
  assert.equal(placeText(g, ["West", "West Central"]), "West · Central");
  assert.equal(placeText(g, [null, "Central"]), "Central");
  assert.equal(placeText(g, ["East", null]), "East");
  const mlb = buildGroups([row(2000, 9, "American League", "AL", "American League East", "AL East"), row(1950, 8, "American League", "AL", null, null)]);
  assert.equal(placeText(mlb, ["AL", "AL East"]), "AL East");
  assert.equal(placeText(mlb, ["AL", null]), "AL");
});

const team = (lg: string, f: number, name: string, extra: Partial<BoardTeam> = {}): BoardTeam => ({
  lg, f, name, former: [], first: 1950, last: 2026, seasons: 70, titles: 0, share: 0.5, active: true, logo: -1, cc: null, lat: null, lon: null, place: null, places: [], ...extra,
});
const g = buildGroups(nhl);
const teams: BoardTeam[] = [
  team("nhl", 1, "Carolina Hurricanes", { former: [["Hartford Whalers", 0]], first: 1979, titles: 1, cc: "US", places: g.places.get(1) ?? [] }),
  team("nhl", 2, "Calgary Flames", { first: 1980, titles: 1, cc: "CA", places: g.places.get(2) ?? [] }),
  team("nhl", 3, "Hamilton Tigers", { first: 1920, last: 1925, active: false, titles: 0 }),
  team("nba", 10, "Boston Celtics", { first: 1946, titles: 18 }),
  team("mlb", 20, "Philadelphia Athletics", { first: 1882, last: 1891, active: false, former: [["Kansas City Athletics", -1]] }),
];
const groups = { nhl: { confs: g.confs, divs: g.divs } };
const texts = new Map(teams.map((t) => [t, searchTextOf(t)]));
const names = (f: ReturnType<typeof readFilters>) => filterTeams(teams, f, texts).map((t) => t.name);

test("no choice keeps every team", () => {
  assert.deepEqual(names(readFilters("", teams, groups)), teams.map((t) => t.name));
});

test("league, status and the words of any name it has had narrow the list", () => {
  assert.deepEqual(names(readFilters("?league=nhl", teams, groups)), ["Carolina Hurricanes", "Calgary Flames", "Hamilton Tigers"]);
  assert.deepEqual(names(readFilters("?league=nhl&status=defunct", teams, groups)), ["Hamilton Tigers"]);
  assert.deepEqual(names(readFilters("?status=active", teams, groups)), ["Carolina Hurricanes", "Calgary Flames", "Boston Celtics"]);
  assert.deepEqual(names(readFilters("?q=whalers", teams, groups)), ["Carolina Hurricanes"]);
  assert.deepEqual(names(readFilters("?q=KANSAS%20city", teams, groups)), ["Philadelphia Athletics"]);
  assert.deepEqual(names(readFilters("?league=bogus", teams, groups)), teams.map((t) => t.name));
});

test("the years keep the teams whose first..last overlap them, and the whole span is no filter", () => {
  assert.deepEqual(names(readFilters("?from=1921&to=1930", teams, groups)), ["Hamilton Tigers"]);
  assert.deepEqual(names(readFilters("?from=1880&to=1885", teams, groups)), ["Philadelphia Athletics"]);
  assert.deepEqual(names(readFilters("?from=1990", teams, groups)), ["Carolina Hurricanes", "Calgary Flames", "Boston Celtics"]);
  const all = readFilters("?from=1882&to=2026", teams, groups);
  assert.equal(all.range, null);
  // the span is the league's own
  assert.deepEqual(leagueSpan(teams, "nhl"), { min: 1920, max: 2026 });
  assert.deepEqual(leagueSpan(teams, ""), { min: 1882, max: 2026 });
  assert.equal(leagueSpan(teams, "cfl"), null);
  // a remembered range applies only when the address names none
  assert.deepEqual(readFilters("", teams, groups, "1990-2000").range, { from: 1990, to: 2000 });
  assert.equal(readFilters("?from=1882&to=2026", teams, groups, "1990-2000").range, null);
  assert.deepEqual(readFilters("?to=1900", teams, groups, "1990-2000").range, { from: 1882, to: 1900 });
});

test("a least number of titles hides the teams below it", () => {
  assert.deepEqual(names(readFilters("?titles=1", teams, groups)), ["Carolina Hurricanes", "Calgary Flames", "Boston Celtics"]);
  assert.deepEqual(names(readFilters("?titles=2", teams, groups)), ["Boston Celtics"]);
  assert.deepEqual(names(readFilters("?league=nhl&titles=1", teams, groups)), ["Carolina Hurricanes", "Calgary Flames"]);
  // more than any team holds is held to the most there is, and junk is none
  assert.equal(readFilters("?league=nhl&titles=9", teams, groups).titles, 1);
  assert.equal(readFilters("?titles=abc", teams, groups).titles, 0);
  assert.equal(readFilters("?titles=-3", teams, groups).titles, 0);
  assert.equal(mostTitles(teams, "nhl"), 1);
  assert.equal(mostTitles(teams, ""), 18);
});

test("with historic divisions included, a conference or division keeps the teams that were ever in it, and only the league's own are accepted", () => {
  assert.deepEqual(names(readFilters("?league=nhl&hist=1&conf=Wales", teams, groups)), ["Carolina Hurricanes"]);
  assert.deepEqual(names(readFilters("?league=nhl&hist=1&conf=East", teams, groups)), ["Carolina Hurricanes"]);
  assert.deepEqual(names(readFilters("?league=nhl&hist=1&div=Adams", teams, groups)), ["Carolina Hurricanes"]);
  assert.deepEqual(names(readFilters("?league=nhl&hist=1&div=West%20Central", teams, groups)), ["Calgary Flames"]);
  assert.deepEqual(names(readFilters("?league=nhl&hist=1&conf=West&div=West%20Central", teams, groups)), ["Calgary Flames"]);
  // a division of another conference than the one chosen is dropped; so is any group with no league
  assert.equal(readFilters("?league=nhl&hist=1&conf=East&div=West%20Central", teams, groups).div, "");
  assert.equal(readFilters("?hist=1&conf=East", teams, groups).conf, "");
  assert.equal(readFilters("?league=nba&hist=1&conf=East", teams, groups).conf, "");
  assert.equal(readFilters("?league=nhl&hist=1&conf=Nope", teams, groups).conf, "");
});

test("historic divisions are off unless the address asks, and ?hist=1 is a key the page reads in the browser", () => {
  assert.equal(readFilters("?league=nhl", teams, groups).hist, false);
  assert.equal(readFilters("?league=nhl&hist=0", teams, groups).hist, false);
  assert.equal(readFilters("?league=nhl&hist=1", teams, groups).hist, true);
  assert.ok((TEAMS_CLIENT_KEYS as readonly string[]).includes("hist"));
});

test("the current groups are the ones in the league's latest alignment", () => {
  assert.equal(currentYear(g), 2022);
  const now = currentGroups(g);
  assert.deepEqual(now.confs.map((c) => c.id), ["East", "West"]);
  assert.deepEqual(now.divs.map((d) => d.id), ["Atlantic", "West Central"]);
  assert.equal(currentYear({ confs: [], divs: [] }), 0);
});

test("without historic divisions only the current conferences and divisions are accepted", () => {
  const f = (q: string) => readFilters(q, teams, groups);
  assert.equal(f("?league=nhl&conf=East").conf, "East");
  assert.equal(f("?league=nhl&div=Atlantic").div, "Atlantic");
  assert.equal(f("?league=nhl&conf=Wales").conf, "", "a conference that no longer exists is not offered");
  assert.equal(f("?league=nhl&div=Northeast").div, "");
  assert.equal(f("?league=nhl&div=Central").div, "", "the 2020 Central is historic; the current one is West Central");
  assert.equal(f("?league=nhl").since, 2022);
  assert.equal(f("?league=nhl&hist=1").since, 0);
  // a choice that is dropped keeps every team
  assert.deepEqual(names(f("?league=nhl&conf=Wales")), ["Carolina Hurricanes", "Calgary Flames", "Hamilton Tigers"]);
});

test("without historic divisions a team counts by where it plays now, not where it once sat", () => {
  // Carolina sat in Wales/Adams, East/Northeast and now East/Atlantic; Calgary is West/West Central
  assert.deepEqual(names(readFilters("?league=nhl&conf=East", teams, groups)), ["Carolina Hurricanes"]);
  assert.deepEqual(names(readFilters("?league=nhl&conf=West", teams, groups)), ["Calgary Flames"]);
  assert.deepEqual(names(readFilters("?league=nhl&div=Atlantic", teams, groups)), ["Carolina Hurricanes"]);
  assert.deepEqual(names(readFilters("?league=nhl&conf=East&div=Atlantic", teams, groups)), ["Carolina Hurricanes"]);
  // with them included, Carolina is also found under its old homes
  assert.deepEqual(names(readFilters("?league=nhl&hist=1&div=Northeast", teams, groups)), ["Carolina Hurricanes"]);
});

test("a team that has folded is not a member now, even if its last division is still in use", () => {
  const folded = team("nhl", 7, "Folded West", { last: 2010, active: false, places: [["West", "West Central"]] });
  const live = { conf: "West", div: "", hist: false, since: 2022 };
  assert.equal(isMember(folded, live), false);
  assert.equal(isMember(folded, { ...live, hist: true, since: 0 }), true);
  assert.equal(isMember({ last: 2026, places: [["West", "West Central"]] }, live), true);
  // a team that moved: only its latest place is its place now
  const moved = { last: 2026, places: [["West", "Pacific"], ["West", "West Central"]] as BoardTeam["places"] };
  assert.equal(isMember(moved, { conf: "West", div: "Pacific", hist: false, since: 2022 }), true);
  assert.equal(isMember(moved, { conf: "West", div: "West Central", hist: false, since: 2022 }), false);
  assert.equal(isMember(moved, { conf: "West", div: "West Central", hist: true, since: 0 }), true);
});

test("a page of the list, and a page past the last is the last", () => {
  const list = Array.from({ length: 120 }, (_, i) => i);
  assert.deepEqual(pageOf(list, 1).items.length, 50);
  assert.deepEqual(pageOf(list, 3), { items: list.slice(100), page: 3, pages: 3 });
  assert.equal(pageOf(list, 9).page, 3);
  assert.equal(pageOf(list, 0).page, 1);
  assert.deepEqual(pageOf([], 4), { items: [], page: 1, pages: 1 });
  assert.equal(readFilters("?page=3", teams, groups).page, 3);
  assert.equal(readFilters("?page=0", teams, groups).page, 1);
});

const city = (slug: string, country: string, lat: number, lon: number, metro: string | null = null): CityRef =>
  ({ slug, name: slug, nameFr: slug === "montreal" ? "Montréal" : null, region: country === "CA" ? "CA-QC" : "US-NY", country, lat, lon, metro, metroName: null, metroNameFr: null });
const placed = (year: number, f: number, c: string, venue: [number, number] | null = null, venueCity: string | null = null): Placement =>
  ({ league: "nhl", year, f, city: c, basis: "identity", venueLat: venue?.[0] ?? null, venueLon: venue?.[1] ?? null, venueCity });

test("a team's home is the city and venue of its latest season; a team with no placed season has none", () => {
  const cities = [city("montreal", "CA", 45.5, -73.6), city("hartford", "US", 41.7, -72.7), city("new-york", "US", 40.7, -74), city("brooklyn", "US", 40.6, -73.9, "new-york-metro"), city("newark", "US", 40.7, -74.2, "new-york-metro")];
  const homes = latestHomes([
    placed(1990, 1, "hartford"), placed(2020, 1, "montreal", [45.496, -73.569], "montreal"), placed(2010, 1, "hartford"),
    placed(2000, 2, "brooklyn", [40.68, -73.97], "newark"), placed(2001, 2, "brooklyn", [40.68, -73.97], "newark"),
    placed(2000, 3, "hartford", [10, 10], "montreal"),
  ], cities);
  assert.deepEqual(homes.get("nhl|1"), { cc: "CA", city: "montreal", name: "montreal", region: "QC", lat: 45.496, lon: -73.569 });
  // a venue in the club's metro area is kept; one in another metro area than the club's city is a mistake in the venue years, and the city's own point is used
  assert.deepEqual(homes.get("nhl|2")?.lat, 40.68);
  assert.deepEqual([homes.get("nhl|3")?.lat, homes.get("nhl|3")?.lon], [41.7, -72.7]);
  assert.equal(homes.has("nhl|4"), false);
  assert.equal(latestHomes([placed(2020, 1, "montreal")], cities, true).get("nhl|1")?.name, "Montréal");
  assert.equal(latestHomes([placed(2020, 1, "nowhere")], cities).size, 0, "a city we do not hold is no home");
});

test("a club whose latest season has no city but a country shows the country alone; an older country never hides a newer city", () => {
  const cities = [city("montreal", "CA", 45.5, -73.6), city("orlando", "US", 28.5, -81.4)];
  const only = (year: number, f: number, cc: string) => ({ league: "nhl", year, f, cc });
  const homes = latestHomes([placed(2002, 1, "orlando"), placed(2010, 2, "montreal")], cities, false, [only(2003, 1, "US"), only(2005, 2, "US"), only(2020, 3, "CA"), only(2001, 3, "CA")]);
  assert.deepEqual(homes.get("nhl|1"), { cc: "US", city: "", name: "", region: "", lat: null, lon: null }, "the newer season has no city: the country only, not the old city");
  assert.equal(homes.get("nhl|2")?.city, "montreal", "a newer placed season wins over an older country-only one");
  assert.equal(homes.get("nhl|3")?.cc, "CA", "a club with no placed season still has its country");
  assert.equal(latestHomes([], cities).size, 0);
});

const brands: BrandMap = {
  7: [
    { league: "nhl", franchise_id: 7, brand_from: null, brand_to: "1980-01-01", primary_hex: null, secondary_hex: null, logo_url: "old.svg", logo_licence: null, logo_page: null, source: "x", home_venue: null, latitude: null, longitude: null },
    { league: "nhl", franchise_id: 7, brand_from: "1980-01-01", brand_to: null, primary_hex: null, secondary_hex: null, logo_url: "now.svg", logo_licence: null, logo_page: null, source: "x", home_venue: null, latitude: null, longitude: null },
  ],
};

test("a former name shows the logo of its own years, and none where we hold none (never the current logo)", () => {
  const spans = [
    { name: "Old Name", from: null, to: "1970-07-01" },
    { name: "Middle Name", from: "1970-07-01", to: "1990-07-01" },
    { name: "Now Name", from: "1990-07-01", to: null },
  ];
  const out = formerNames(["Middle Name", "Old Name"], spans, 1950, 2026, brands, 7);
  // the oldest name first, though its start is unknown; 1950-1969 wore the old logo, and 1970-79 (old) tie 1980-89 (new) for the middle name, a tie going to the later one
  assert.deepEqual(out, [{ name: "Old Name", logo: "old.svg" }, { name: "Middle Name", logo: "now.svg" }]);
  const bare = formerNames(["Old Name"], spans, 1950, 2026, {}, 7);
  assert.deepEqual(bare, [{ name: "Old Name", logo: null }]);
  // a name with no dates is listed last, after the dated ones
  const mixed = formerNames(["Zed", "Old Name"], [...spans, { name: "Zed", from: null, to: null }], 1950, 2026, {}, 7);
  assert.deepEqual(mixed.map((x) => x.name), ["Old Name", "Zed"]);
});
