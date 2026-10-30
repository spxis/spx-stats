import assert from "node:assert/strict";
import { test } from "node:test";
import type { FranchiseNameRow, SeasonSummaryRow, TeamBrandRow } from "../src/lib/api/types.ts";
import { brandPackSchema, brandRowsFromPack } from "../src/lib/brandPack.ts";
import { logoFitPackSchema, logoFitsFromPack } from "../src/lib/logoFitPack.ts";
import { namePackSchema, nameRowsFromPack, runsFromPack } from "../src/lib/namePack.ts";
import { latestHomes } from "../src/lib/teamHome.ts";
import type { CityRef, Placement } from "../src/lib/cityModel.ts";
import { summaryPackSchema, summaryRowsFromPack } from "../src/lib/summaryPack.ts";
import { infoRowsFromPack, nameRowsFromPack as venueNamesFromPack, placeRowsFromPack, venuePackSchema } from "../src/lib/venuePack.ts";
import { byFranchise, standingPackSchema, standingsFromPack } from "../src/lib/standingPack.ts";
import { awardPackSchema, awardsFromPack, sourceCounts } from "../src/lib/awardPack.ts";
import { alignmentFromPack, alignmentPackSchema } from "../src/lib/alignmentPack.ts";
import type { AlignmentRow } from "../src/lib/alignment.ts";
import { cityStayPackSchema, stayRowsFromPack } from "../src/lib/cityStayPack.ts";
import type { StayRow } from "../src/lib/cityModel.ts";
import { peopleFromPack, playerLeaguePackSchema } from "../src/lib/playerLeaguePack.ts";
import { primaryLeague, primaryLeagueBy } from "../src/lib/playerPath.ts";
import { abbrPackSchema, abbrsFromPack } from "../src/lib/abbrPack.ts";

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

test("the teams list takes the same homes from each club's newest placement as from every placement (api.team_home_city)", () => {
  const city = (slug: string, lat: number): CityRef => ({ slug, name: slug, nameFr: null, region: "US-MA", country: "US", lat, lon: -71, metro: null, metroName: null, metroNameFr: null });
  const cities = [city("boston", 42.3), city("hartford", 41.7), city("worcester", 42.2)];
  const place = (league: string, year: number, f: number, slug: string, venue: boolean): Placement => ({ league, year, f, city: slug, basis: "identity", venueLat: venue ? 1 : null, venueLon: venue ? 2 : null, venueCity: venue ? slug : null });
  const all = [
    place("nhl", 1980, 1, "hartford", true), place("nhl", 1997, 1, "boston", false), place("nhl", 2010, 1, "worcester", true),
    place("nhl", 1990, 2, "boston", true), place("wha", 1975, 1, "hartford", false),
  ];
  const newest = (league: string, f: number) => all.filter((p) => p.league === league && p.f === f).sort((a, b) => b.year - a.year)[0];
  const latest = [newest("nhl", 1), newest("nhl", 2), newest("wha", 1)];
  const countryOnly = [{ league: "nhl", year: 2015, f: 2, cc: "CA" }];
  assert.deepEqual([...latestHomes(latest, cities, false, countryOnly)], [...latestHomes(all, cities, false, countryOnly)]);
  assert.deepEqual([...latestHomes(latest, cities, true)], [...latestHomes(all, cities, true)]);
});

/* The packs of migrations 181 to 187. The packers below do what the migrations do, on a few rows with the awkward cases (nothing known, a name used twice, a missing count). */

const col = <T, K extends keyof T>(rows: T[], k: K): T[K][] => rows.map((r) => r[k]);

test("venue places, facts and names come back as the rows of their views, in the order the site read them", () => {
  const places = [
    { league: "nhl", franchise_id: 1, home_venue: "Old Arena", latitude: 40.5, longitude: -74.1, city: "Newark", region: "US-NJ", country_code: "US", wikipedia_title: "Old Arena", wikidata_id: "Q1" },
    { league: "nhl", franchise_id: 2, home_venue: "Gardens", latitude: 45.5, longitude: -73.5, city: null, region: null, country_code: null, wikipedia_title: null, wikidata_id: null },
  ];
  const infos = [
    { wikidata_id: "Q1", capacity: 17000, opened_year: 1950, closed_year: null, owner: null, surface: "ice", roof: "fixed", address: "1 Main St", postal_code: null, surface_raw: "ice", status: "demolished" },
    { wikidata_id: "Q9", capacity: null, opened_year: null, closed_year: null, owner: "Town", surface: null, roof: null, address: null, postal_code: "A1A 1A1", surface_raw: null, status: null },
  ];
  const names = [
    { wikidata_id: "Q1", name: "Old Arena", from_year: null, until_year: 1990, is_current: false },
    { wikidata_id: "Q1", name: "New Arena", from_year: 1990, until_year: null, is_current: true },
  ];
  const pack = venuePackSchema.parse({
    place_league: col(places, "league"), place_franchise_id: col(places, "franchise_id"), place_home_venue: col(places, "home_venue"), place_latitude: col(places, "latitude"),
    place_longitude: col(places, "longitude"), place_city: col(places, "city"), place_region: col(places, "region"), place_country_code: col(places, "country_code"),
    place_wikipedia_title: col(places, "wikipedia_title"), place_wikidata_id: col(places, "wikidata_id"),
    info_wikidata_id: col(infos, "wikidata_id"), info_capacity: col(infos, "capacity"), info_opened_year: col(infos, "opened_year"), info_closed_year: col(infos, "closed_year"),
    info_owner: col(infos, "owner"), info_surface: col(infos, "surface"), info_roof: col(infos, "roof"), info_address: col(infos, "address"), info_postal_code: col(infos, "postal_code"),
    info_surface_raw: col(infos, "surface_raw"), info_status: col(infos, "status"),
    name_wikidata_id: col(names, "wikidata_id"), name_name: col(names, "name"), name_from_year: col(names, "from_year"), name_until_year: col(names, "until_year"), name_is_current: col(names, "is_current"),
  });
  assert.deepEqual(placeRowsFromPack(pack), places);
  assert.deepEqual(infoRowsFromPack(pack), infos);
  assert.deepEqual(venueNamesFromPack(pack), names);
  assert.throws(() => placeRowsFromPack({ ...pack, place_city: [] }), /place columns/);
});

test("a league's standings come back as the rows of api.standing_index, in both orders the readers ask for", () => {
  const row = (year: number, team_id: number, franchise_id: number, team: string | null, conference: string | null, w: number | null) =>
    ({ year, team_id, franchise_id, team, gp: 82, w, l: 10, t: 0, otl: null, pts: 90, pf: 250, pa: 200, conference });
  const rows = [row(2000, 5, 9, "Bruins", "East", 40), row(2000, 7, 3, "Canadiens", null, null), row(2001, 4, 9, null, "East", 41), row(2001, 6, 3, "Canadiens", "West", 30)];
  const names = ["Bruins", "Canadiens"], confs = ["East", "West"];
  const flat = rows.flatMap((r) => [r.year, r.team_id, r.franchise_id, r.team == null ? null : names.indexOf(r.team), r.gp, r.w, r.l, r.t, r.otl, r.pts, r.pf, r.pa, r.conference == null ? null : confs.indexOf(r.conference)]);
  const decoded = standingsFromPack(standingPackSchema.parse({ league: "nhl", teams: names, conferences: confs, standings: flat }));
  assert.deepEqual(decoded, rows);
  assert.deepEqual(byFranchise(decoded).map((r) => r.team_id), [7, 5, 6, 4], "year, then franchise_id, then team_id");
  assert.throws(() => standingsFromPack({ league: "nhl", teams: [], conferences: [], standings: [1, 2, 3] }), /whole number/);
  assert.throws(() => standingsFromPack({ league: "nhl", teams: [], conferences: [], standings: [...flat.slice(0, 3), 4, ...flat.slice(4, 13)] }), /club name 4/);
});

test("a league's winners come back as the rows of api.awards, and the sources are counted", () => {
  const winners = [
    { year: 2020, award_code: "mvp", award: "Hart", kind: "player", winner: "A", note: null, franchise_id: 3, person_id: 11 },
    { year: 2020, award_code: "cup", award: "Cup", kind: "championship", winner: "Club", note: "Won 4-0", franchise_id: 3, person_id: null },
    { year: 2019, award_code: "mvp", award: "Hart Trophy", kind: null, winner: null, note: null, franchise_id: null, person_id: null },
  ];
  const dict = [["mvp", "Hart", "player"], ["cup", "Cup", "championship"], ["mvp", "Hart Trophy", null]] as const;
  const pack = awardPackSchema.parse({
    league: "nhl", dict_code: dict.map((d) => d[0]), dict_award: dict.map((d) => d[1]), dict_kind: dict.map((d) => d[2]),
    year: col(winners, "year"), dict: [0, 1, 2], winner: col(winners, "winner"), note: col(winners, "note"), franchise_id: col(winners, "franchise_id"), person_id: col(winners, "person_id"),
    source_name: ["spx", "wikipedia"], source_count: [2, 1],
  });
  assert.deepEqual(awardsFromPack(pack), winners);
  const other = awardPackSchema.parse({ ...pack, league: "nba", source_name: ["wikipedia", null], source_count: [4, 1] });
  assert.deepEqual([...sourceCounts([pack, other])].sort(), [["", 1], ["spx", 2], ["wikipedia", 5]]);
  assert.throws(() => awardsFromPack({ ...pack, dict: [0, 1, 9] }), /award 9/);
});

test("a league's alignment comes back as the rows of api.alignment", () => {
  const row = (year: number, team_id: number, conference: string | null, conference_short: string | null, division: string | null, division_short: string | null, team: string | null): AlignmentRow =>
    ({ league: "nhl", year, conference, division, franchise_id: 9, team, conference_short, division_short, team_id });
  const rows = [row(2000, 5, "East", "E", "Atlantic", "ATL", "Bruins"), row(2000, 6, "East", "E", null, null, null), row(2001, 7, null, null, null, null, "Bruins"), row(2001, 8, null, "?", null, null, "Habs")];
  const confs = [["East", "E"], [null, "?"]] as const, divs = [["Atlantic", "ATL"]] as const, teams = ["Bruins", "Habs"];
  const flat = [2000, 0, 0, 9, 0, 5, 2000, 0, null, 9, null, 6, 2001, null, null, 9, 0, 7, 2001, 1, null, 9, 1, 8];
  const decoded = alignmentFromPack(alignmentPackSchema.parse({
    league: "nhl", conferences: confs.map((c) => c[0]), conference_shorts: confs.map((c) => c[1]), divisions: divs.map((d) => d[0]), division_shorts: divs.map((d) => d[1]), teams, seasons: flat,
  }));
  assert.deepEqual(decoded, rows);
});

test("the stays of the cities come back as the rows of api.city_stay, with and without ties and overtime losses", () => {
  const stays: StayRow[] = [
    { league: "mlb", franchise_id: 1, city_slug: "boston", name: "Red Sox", names: ["Americans", "Red Sox"], first_year: 1901, last_year: 1904, active: false,
      runs: [[1901, 1904]], rows: [[1901, 0, 79, 57, 0, 0], [1902, 1, 77, 60, 0, 0], [1904, 0, -1, -1, 0, 0]], title_teams: ["Americans"] },
    { league: "nfl", franchise_id: 2, city_slug: "boston", name: "Patriots", names: ["Patriots"], first_year: 1960, last_year: 1961, active: true,
      runs: [[1960, 1961]], rows: [[1960, 0, 5, 9, 0, 0], [1961, 0, 9, 4, 1, 0]], title_teams: [] },
    { league: "nhl", franchise_id: 3, city_slug: "boston", name: "Bruins", names: ["Bruins"], first_year: 2000, last_year: 2003, active: true,
      runs: [[2000, 2000], [2003, 2003]], rows: [[2000, 0, 40, 30, 5, 7], [2003, 1, 41, 31, 0, 10]], title_teams: ["Bruins"] },
    { league: "nhl", franchise_id: 4, city_slug: "boston", name: "", names: [], first_year: 1999, last_year: 1999, active: false, runs: [], rows: [], title_teams: [] },
  ];
  // what migration 185 does
  const seasons = (s: StayRow) => {
    const ties = s.rows.some((r) => r[4] !== 0), otl = s.rows.some((r) => r[5] !== 0);
    let prev = s.first_year;
    return { columns: (ties ? 1 : 0) + (otl ? 2 : 0), flat: s.rows.flatMap((r) => { const dy = r[0] - prev; prev = r[0]; return [dy * 2 + r[1], r[2], r[3], ...(ties ? [r[4]] : []), ...(otl ? [r[5]] : [])]; }) };
  };
  const packed = stays.map(seasons);
  const pack = cityStayPackSchema.parse({
    league: col(stays, "league"), franchise_id: col(stays, "franchise_id"), city_slug: col(stays, "city_slug"), name: col(stays, "name"), first_year: col(stays, "first_year"),
    last_year: col(stays, "last_year"), active: col(stays, "active"), columns: packed.map((p) => p.columns),
    names_n: stays.map((s) => s.names.length), runs_n: stays.map((s) => s.runs.length * 2), seasons_n: packed.map((p) => p.flat.length), title_teams_n: stays.map((s) => s.title_teams.length),
    names: stays.flatMap((s) => s.names), runs: stays.flatMap((s) => s.runs.flat()), seasons: packed.flatMap((p) => p.flat), title_teams: stays.flatMap((s) => s.title_teams),
  });
  assert.deepEqual(stayRowsFromPack(pack), stays);
  assert.throws(() => stayRowsFromPack({ ...pack, title_teams: [] }), /title names/);
});

test("the league a person is filed under is the same from the seasons or from the counts of the pack", () => {
  const seasons = (list: [string, number][]) => list.map(([league, year]) => ({ league, year }));
  const people = [
    { person_id: 1, leagues: ["nhl", "wha"], seasons: seasons([["nhl", 1980], ["nhl", 1980], ["wha", 1975], ["wha", 1976], ["wha", 1977]]) },
    { person_id: 2, leagues: ["mlb", "nl"], seasons: seasons([["mlb", 1900], ["nl", 1900]]) },
    { person_id: 3, leagues: ["cfl", "nfl"], seasons: seasons([["cfl", 1990], ["nfl", 1995]]) },
    { person_id: 4, leagues: ["nba", "wnba"], seasons: [] },
  ];
  const names = ["cfl", "mlb", "nba", "nfl", "nhl", "nl", "wha", "wnba"];
  const counts = people.map((p) => p.leagues.map((lg) => {
    const own = p.seasons.filter((s) => s.league === lg);
    return { seasons: new Set(own.map((s) => s.year)).size, last: Math.max(0, ...own.map((s) => s.year)) };
  }));
  const pack = playerLeaguePackSchema.parse({
    leagues: names, person_id: people.map((p) => p.person_id), league_count: people.map((p) => p.leagues.length),
    league: people.flatMap((p) => p.leagues.map((lg) => names.indexOf(lg))), seasons: counts.flat().map((c) => c.seasons), last: counts.flat().map((c) => c.last),
  });
  const decoded = peopleFromPack(pack);
  assert.deepEqual(decoded.map((p) => p.person_id), [1, 2, 3, 4]);
  for (const [i, p] of decoded.entries()) {
    assert.equal(primaryLeagueBy(p.leagues, p.stats), primaryLeague(people[i].leagues, people[i].seasons), `person ${p.person_id}`);
  }
  assert.deepEqual(decoded.map((p) => primaryLeagueBy(p.leagues, p.stats)), ["wha", "mlb", "nfl", "nba"], "most seasons, then the newest, then the code");
});

test("a league's abbreviations come back as the rows of api.team_abbr", () => {
  const rows = [
    { league: "nhl", franchise_id: 1, valid_from: null, valid_to: "1990-01-01", abbreviation: "OLD" },
    { league: "nhl", franchise_id: 1, valid_from: "1990-01-01", valid_to: null, abbreviation: "NEW" },
    { league: "nhl", franchise_id: 2, valid_from: "1961-04-11", valid_to: "1965-09-02", abbreviation: "LAA" },
  ];
  const pack = abbrPackSchema.parse({ league: "nhl", franchise_id: col(rows, "franchise_id"), valid_from: col(rows, "valid_from"), valid_to: col(rows, "valid_to"), abbreviation: col(rows, "abbreviation") });
  assert.deepEqual(abbrsFromPack(pack), rows);
});
