import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { sourceLabel } from "../src/lib/sourceLabels.ts";
import { dayIcon, historyDay, parseDay } from "../src/lib/todayHistory/day.ts";
import { ClubNames, unknownClubs, VenueNames, type NameRow, type SeasonName } from "../src/lib/todayHistory/names.ts";
import { leagueEnded } from "../src/lib/leagueEnded.ts";
import { newestFirst } from "../src/lib/todayHistory/order.ts";
import { HISTORY_LEAGUES, HISTORY_SPORTS, hasHistory, historyHost, sportLeagues, sportOfLeague, type HistoryFact, type HistoryFile } from "../src/lib/todayHistory/types.ts";
import { cupFinalText, isKind, KINDS, plainName, withoutDate } from "../src/lib/todayHistory/words.ts";

/** Run in web/: pnpm test:todayhistory (the `react-server` condition lets lib/todayHistory/day.ts import "server-only"). */

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const file = (sport: string): HistoryFile => JSON.parse(read(`../src/lib/todayHistory/data/${sport}.json`));
const pkg = JSON.parse(read("../package.json")) as { version: string; dependencies: Record<string, string> };
const SPORTS = ["hockey", "basketball", "baseball", "football"];

test("sentences lose their date and keep their meaning", () => {
  assert.equal(withoutDate("retired-number", "On November 12, 2005, the Montreal Canadiens retired Dickie Moore's No. 12."), "The Montreal Canadiens retired Dickie Moore's No. 12.");
  assert.equal(withoutDate("player-birthday", "Bobby Bauer, the Boston Bruins right wing, was born on February 16, 1915 (died 1964)."), "Bobby Bauer, the Boston Bruins right wing, was born (died 1964).");
  assert.equal(withoutDate("player-death", "Pat Burns, of the Boston Bruins, died on November 19, 2010, aged 58."), "Pat Burns, of the Boston Bruins, died, aged 58.");
  assert.equal(withoutDate("game-on-day", "On April 9, 1960, Boston Celtics beat St. Louis Hawks 122–103, playoffs (NBA)."), "Boston Celtics beat St. Louis Hawks 122–103, playoffs.");
  assert.equal(
    withoutDate("championship-final", "On June 14, 1995, Houston Rockets won the 1995 NBA Finals, sweeping the Orlando Magic 4–0 with a 113–101 win in Game 4 at Lakewood Church Central Campus, Houston. It was their 2nd title. They had finished the regular season 47–35."),
    "Houston Rockets won the 1995 NBA Finals, sweeping the Orlando Magic 4–0 with a 113–101 win in Game 4 at Lakewood Church Central Campus, Houston.",
  );
  assert.equal(withoutDate("player-birthday", "Somebody was born in 1915."), null, "a sentence with no date in the usual shape is dropped, not guessed at");
  assert.equal(withoutDate("player-birthday", "On May 1, 1990, X was born on May 2, 1991 (none)."), null);
  assert.ok(isKind("all-star") && !isKind("franchise-event"));
});

test("a Stanley Cup final is worded like the data's other finals", () => {
  const f = { year: 2010, winnerSide: 1 as const, team1: "Chicago Blackhawks", team2: "Philadelphia Flyers", team1Games: 4, team2Games: 2, game: { no: 6, playedOn: "2010-06-09", team1Score: 4, team2Score: 3, venue: "Wachovia Center", city: "Philadelphia" } };
  assert.equal(cupFinalText(f), "Chicago Blackhawks won the 2010 Stanley Cup, beating the Philadelphia Flyers 4 games to 2 with a 4–3 win in Game 6 at Wachovia Center, Philadelphia.");
  assert.match(cupFinalText({ ...f, winnerSide: 2, team1Games: 0, team2Games: 4, game: { ...f.game, team1Score: 1, team2Score: 2, venue: null } }), /^Philadelphia Flyers won the 2010 Stanley Cup, sweeping the Chicago Blackhawks 4–0 with a 2–1 win in Game 6\.$/);
  assert.equal(plainName("Max Pacioretty"), plainName("Max  PACIORETTY"));
  assert.equal(plainName("Montréal"), "montreal");
});

// ---- who a club was on the day: the franchise's name THEN (the bug of 2026-11-02: "the Quebec Nordiques retired Adam Foote's No. 52" in 2013) ----
// Rows as the database holds them (api.franchise_names repeats some rows; api.team_season_index gives the season's name where the dates leave a gap).
const NAMES: NameRow[] = [
  { league: "nhl", franchise_id: 1410, name: "Quebec Nordiques", name_from: "1972-07-01", name_to: "1979-07-01" },
  { league: "nhl", franchise_id: 1410, name: "Quebec Nordiques", name_from: "1979-07-01", name_to: "1995-07-01" },
  { league: "nhl", franchise_id: 1410, name: "Colorado Avalanche", name_from: "1995-07-01", name_to: null },
  { league: "mlb", franchise_id: 1480, name: "Philadelphia Athletics", name_from: "1901-04-26", name_to: "1955-04-12" },
  { league: "mlb", franchise_id: 1480, name: "Kansas City Athletics", name_from: "1955-04-12", name_to: "1968-04-10" },
  { league: "mlb", franchise_id: 1480, name: "Oakland Athletics", name_from: "1968-04-10", name_to: "2025-03-27" },
  { league: "mlb", franchise_id: 1480, name: "Sacramento Athletics", name_from: "2025-03-27", name_to: null },
  { league: "nba", franchise_id: 1455, name: "Seattle SuperSonics", name_from: "1967-07-01", name_to: "2002-10-06" },
  { league: "nba", franchise_id: 1455, name: "Seattle SuperSonics", name_from: "2008-04-17", name_to: "2008-07-01" },
  { league: "nba", franchise_id: 1455, name: "Oklahoma City Thunder", name_from: "2008-07-01", name_to: null },
  ...[1, 2].flatMap(() => [
    { league: "nfl", franchise_id: 1500, name: "Houston Oilers", name_from: "1960-03-01", name_to: "1997-03-01" },
    { league: "nfl", franchise_id: 1500, name: "Tennessee Oilers", name_from: "1997-03-01", name_to: "1999-03-01" },
    { league: "nfl", franchise_id: 1500, name: "Tennessee Titans", name_from: "1999-03-01", name_to: null },
  ]),
];
const SEASONS: SeasonName[] = [2003, 2004, 2005, 2006, 2007].map((year) => ({ league: "nba", franchise_id: 1455, year, team: "Seattle SuperSonics" }));
const clubs = new ClubNames(NAMES, SEASONS);

test("a club is named as it was called on the day: Foote's number, the Athletics, the SuperSonics, the Oilers and Titans", () => {
  assert.equal(clubs.at("nhl", 1410, "2013-11-02"), "Colorado Avalanche", "Foote's No. 52 was retired by the Avalanche, not the Nordiques");
  assert.equal(clubs.at("nhl", 1410, "1990-03-01"), "Quebec Nordiques");
  assert.equal(clubs.at("nhl", 1410, "1995-06-30"), "Quebec Nordiques", "the day before the move");
  assert.equal(clubs.at("nhl", 1410, "1995-07-01"), "Colorado Avalanche");
  assert.equal(clubs.at("nhl", 1410, "1970-01-01"), null, "before the franchise had a name: no guess");
  assert.equal(clubs.at("mlb", 1480, "1930-10-08"), "Philadelphia Athletics");
  assert.equal(clubs.at("mlb", 1480, "1960-07-12"), "Kansas City Athletics");
  assert.equal(clubs.at("mlb", 1480, "1989-10-28"), "Oakland Athletics");
  assert.equal(clubs.at("mlb", 1480, "2026-06-01"), "Sacramento Athletics");
  assert.equal(clubs.at("nba", 1455, "1979-06-01"), "Seattle SuperSonics");
  assert.equal(clubs.at("nba", 1455, "2005-04-20"), "Seattle SuperSonics", "a gap in the dates is settled by the season's own name");
  assert.equal(clubs.at("nba", 1455, "2012-06-21"), "Oklahoma City Thunder");
  assert.equal(clubs.at("nba", 1455, "1990-01-01"), "Seattle SuperSonics");
  assert.equal(clubs.at("nba", 1455, "2003-12-01"), "Seattle SuperSonics");
  assert.equal(clubs.at("nfl", 1500, "1990-12-30"), "Houston Oilers", "repeated rows are one name");
  assert.equal(clubs.at("nfl", 1500, "1997-02-02"), "Houston Oilers", "a Super Bowl Sunday before the March change");
  assert.equal(clubs.at("nfl", 1500, "1998-11-01"), "Tennessee Oilers");
  assert.equal(clubs.at("nfl", 1500, "2003-01-01"), "Tennessee Titans");
  assert.equal(clubs.at("nfl", 999, "2003-01-01"), null, "a franchise the database does not know");
});

test("a person's clubs: a name his franchise carried while he played for it", () => {
  const his = clubs.duringSeasons("nhl", 1410, 1997, 2010);
  assert.ok(his.has("colorado avalanche") && !his.has("quebec nordiques"), "Foote never played for the Nordiques");
  assert.ok(clubs.duringSeasons("nhl", 1410, 1993, 1996).has("quebec nordiques"));
  assert.deepEqual(unknownClubs("Adam Foote, the Quebec Nordiques defenseman, was born.", ["Colorado Avalanche (1997–2010)", "Quebec Nordiques (1997)"], his), ["Quebec Nordiques"]);
  assert.deepEqual(unknownClubs("Adam Foote, the Colorado Avalanche defenseman, was born.", ["Colorado Avalanche (1997–2010)", "Columbus Blue Jackets (2005–2007)"], his), []);
});

test("a building is named as it was called that year, or the clause goes", () => {
  const v = new VenueNames([
    { wikidata_id: "Q1", name: "The Summit", from_year: 1975, until_year: 2003 },
    { wikidata_id: "Q1", name: "Compaq Center", from_year: 2003, until_year: 2005 },
    { wikidata_id: "Q1", name: "Lakewood Church Central Campus", from_year: 2005, until_year: null },
    { wikidata_id: "Q2", name: "Old Arena", from_year: 1950, until_year: 1970 },
    { wikidata_id: "Q2", name: "Current Arena", from_year: 1990, until_year: null },
  ]);
  assert.deepEqual(v.in("Lakewood Church Central Campus", 1995), { name: "The Summit" });
  assert.deepEqual(v.in("Lakewood Church Central Campus", 2010), { keep: true });
  assert.equal(v.in("Current Arena", 1980), null, "the building had names, none for that year");
  assert.deepEqual(v.in("Fenway Park", 1999), { keep: true }, "a building with no name history in the database");
});

test("the data files: three lines a day at most, true to their shape, every source named", () => {
  for (const { sport, leagues } of HISTORY_SPORTS) {
    const d = file(sport);
    assert.equal(d.sport, sport);
    assert.deepEqual(d.leagues, [...leagues]);
    assert.equal(d.package, pkg.dependencies["@johnmorrisdotca/meigen-sports"], `${sport}: made from the pinned package version`);
    const days = Object.keys(d.days);
    for (const md of days) {
      assert.ok(parseDay(md), `${sport} ${md} is a day of the year`);
      const facts = d.days[md];
      assert.ok(facts.length >= 1 && facts.length <= 3, `${sport} ${md}: ${facts.length} lines`);
      for (const f of facts) {
        assert.ok((leagues as readonly string[]).includes(f.l), `${sport} ${md}: league ${f.l}`);
        assert.ok(Number.isInteger(f.y) && f.y > 1800 && f.y <= 2026, `${sport} ${md}: year ${f.y}`);
        assert.ok(isKind(f.k), `${sport} ${md}: kind ${f.k}`);
        assert.ok(["wikidata", "wikipedia", "retrosheet", "nflverse"].includes(f.s) && sourceLabel(f.s).url.startsWith("https://"), `${sport} ${md}: source ${f.s} is one the site credits`);
        assert.ok(f.t.length >= 12 && f.t.length <= 260, `${sport} ${md}: length ${f.t.length}`);
        assert.doesNotMatch(f.t, /(?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4}|\(none\)|undefined|null|NaN/, `${sport} ${md}: ${f.t}`);
        assert.equal(f.p === undefined, f.n === undefined, `${sport} ${md}: a link has an id and a name length`);
        if (f.p !== undefined) assert.ok(Number.isInteger(f.p) && f.n! >= 3 && f.n! < f.t.length && /^\p{L}[^()\d]*$/u.test(f.t.slice(0, f.n)), `${sport} ${md}: link text "${f.t.slice(0, f.n)}"`);
      }
    }
    // Enough days that the block shows on most visits (an NFL-only or NHL-only day with nothing leaves the block out).
    const need = { hockey: 300, basketball: 366, baseball: 350, football: 366 }[sport]!;
    assert.ok(days.length >= need, `${sport}: ${days.length} days with a line, expected at least ${need}`);
  }
  assert.ok(file("basketball").days["02-29"], "a leap day has lines");
  const cup = file("hockey").days["06-09"].filter((f) => f.k === "championship-final");
  assert.ok(cup.length >= 1 && cup.every((f) => /Stanley Cup/.test(f.t)), "the Stanley Cup finals are in the NHL's days");
});

test("lines run newest year first, always, a year's lines in a fixed order", () => {
  const order = new Map<string, number>(KINDS.map((k, i) => [k, i]));
  for (const { sport, leagues } of HISTORY_SPORTS) {
    for (const [md, facts] of Object.entries(file(sport).days)) {
      for (let i = 1; i < facts.length; i++) {
        const a = facts[i - 1], b = facts[i];
        assert.ok(a.y >= b.y, `${sport} ${md}: ${a.y} before ${b.y}`);
        if (a.y === b.y) {
          const key = (f: HistoryFact): [number, number, string] => [leagues.indexOf(f.l as never), order.get(f.k) ?? 99, f.t];
          const [ka, kb] = [key(a), key(b)];
          assert.ok(ka[0] < kb[0] || (ka[0] === kb[0] && (ka[1] < kb[1] || (ka[1] === kb[1] && ka[2] <= kb[2]))), `${sport} ${md}: the lines of ${a.y} are in league, kind, sentence order`);
        }
      }
    }
  }
  const mixed = (y: number, l: string, t: string): HistoryFact => ({ l, y, t, s: "wikidata", k: "player-birthday" });
  const shown = newestFirst([mixed(1953, "nhl", "a"), mixed(1921, "nhl", "b"), mixed(2013, "nhl", "c"), mixed(1953, "nhl", "d")]);
  assert.deepEqual(shown.map((f) => `${f.y}${f.t}`), ["2013c", "1953a", "1953d", "1921b"], "newest first, and a tie keeps its order");
  assert.deepEqual(historyDay("nhl", "11-02", "en")!.facts.map((f) => f.y), [...historyDay("nhl", "11-02", "en")!.facts.map((f) => f.y)].sort((a, b) => b - a));
});

test("a retired number names the club of its day, in every line of every file", () => {
  // Names that changed, and the years each was the name (dates of the identity in the database). A line that names one outside those years is the bug of 2026-11-02.
  const ERAS: Record<string, [number, number]> = {
    "Quebec Nordiques": [1979, 1995], "New England Whalers": [1972, 1979], "Hartford Whalers": [1979, 1997], "Minnesota North Stars": [1967, 1993], "Atlanta Flames": [1972, 1980],
    "Kansas City Athletics": [1955, 1968], "Philadelphia Athletics": [1901, 1955], "Montreal Expos": [1969, 2005], "Brooklyn Dodgers": [1932, 1958],
    "Seattle SuperSonics": [1967, 2008], "San Diego Clippers": [1978, 1984], "Buffalo Braves": [1970, 1978], "New Jersey Nets": [1977, 2012],
    "Houston Oilers": [1960, 1997], "Tennessee Oilers": [1997, 1999], "Los Angeles Raiders": [1982, 1995], "Baltimore Colts": [1953, 1984],
  };
  let checked = 0;
  for (const sport of SPORTS) for (const [md, facts] of Object.entries(file(sport).days)) for (const f of facts) {
    for (const [name, [from, to]] of Object.entries(ERAS)) {
      if (!f.t.includes(name)) continue;
      // A name appears in a line about its own years, or in a line about a person or a game of that club: the year of the line must fall inside the era.
      if (f.k === "retired-number" || f.k === "game-on-day" || f.k === "championship-final") { checked++; assert.ok(f.y >= from && f.y <= to, `${sport} ${md}: "${f.t}" names ${name} in ${f.y}`); }
    }
  }
  assert.ok(checked > 0);
  const foote = file("hockey").days["11-02"].find((f) => /Foote/.test(f.t));
  assert.equal(foote?.t, "The Colorado Avalanche retired Adam Foote's No. 52.");
  assert.ok(!Object.values(file("hockey").days).flat().some((f) => f.k === "retired-number" && /Nordiques/.test(f.t) && f.y >= 1995));
});

test("no line is dated after a person's death or names a birth year after the line", () => {
  for (const sport of SPORTS) for (const [md, facts] of Object.entries(file(sport).days)) for (const f of facts) {
    const died = /\(died (\d{4})\)/.exec(f.t)?.[1];
    if (died) assert.ok(Number(died) >= f.y && Number(died) <= 2026, `${sport} ${md}: ${f.t}`);
    const aged = /aged (\d+)/.exec(f.t)?.[1];
    if (aged) assert.ok(Number(aged) >= 15 && Number(aged) <= 115 && f.y - Number(aged) >= 1780, `${sport} ${md}: ${f.t}`);
    if (f.k === "player-birthday") assert.ok(f.y <= 2010, `${sport} ${md}: ${f.t}`);
  }
});

test("football is one block for the NFL and the CFL; the other sports have the one league", () => {
  assert.deepEqual(HISTORY_SPORTS.map((s) => s.sport), SPORTS);
  assert.deepEqual(sportLeagues("nfl"), ["nfl", "cfl"]);
  assert.deepEqual(sportLeagues("cfl"), ["nfl", "cfl"]);
  assert.deepEqual(sportLeagues("nhl"), ["nhl"]);
  assert.equal(sportOfLeague("cfl"), "football");
  assert.equal(sportOfLeague("ncaaf"), null, "college football has no facts, so no block");
  assert.ok(!hasHistory("ncaaf") && !hasHistory("wnba"));
  assert.equal(historyHost("cfl"), "nfl", "the CFL page reads the same file as the NFL page");
  assert.equal(historyHost("nba"), "nba");
  assert.equal(historyHost("ncaaf"), null);
  assert.deepEqual(HISTORY_LEAGUES, ["nhl", "nba", "mlb", "nfl", "cfl"]);
  const nfl = historyDay("nfl", "11-02", "en")!, cfl = historyDay("cfl", "11-02", "en")!;
  assert.deepEqual(nfl.facts, cfl.facts, "one answer for both leagues");
  const f = file("football");
  assert.ok(Object.values(f.days).some((d) => d.some((x) => x.l === "nfl")) && Object.values(f.days).some((d) => d.some((x) => x.l === "cfl")));
});

test("football's lines are shared fairly: neither league fills the block while the other has lines", () => {
  const days = Object.values(file("football").days);
  const mixed = days.filter((d) => d.some((x) => x.l === "nfl") && d.some((x) => x.l === "cfl"));
  assert.ok(mixed.length >= 150, `${mixed.length} days have both leagues`);
  const lines = mixed.flat();
  const nflShare = lines.filter((x) => x.l === "nfl").length / lines.length;
  assert.ok(nflShare > 0.3 && nflShare < 0.7, `the NFL has ${Math.round(nflShare * 100)}% of the lines of days both leagues have`);
  for (const d of mixed) assert.ok(d.filter((x) => x.l === "nfl").length <= 2 && d.filter((x) => x.l === "cfl").length <= 2, "no league has all three");
  // A day only one league has lines for is that league's, up to three.
  assert.ok(days.some((d) => d.length === 3 && d.every((x) => x.l === "cfl")), "a CFL-only day fills the block");
});

test("the package is pinned to one exact version", () => {
  assert.match(pkg.dependencies["@johnmorrisdotca/meigen-sports"], /^\d+\.\d+\.\d+$/);
});

test("a day's answer: the page and the lines, in the reader's language, or nothing", () => {
  const en = historyDay("nhl", "11-02", "en");
  assert.ok(en && en.facts.length >= 1);
  assert.match(en.icon, /<title>Nov 2<\/title>/);
  assert.match(historyDay("nhl", "11-02", "ja")!.icon, /11月/);
  assert.match(historyDay("nhl", "11-02", "fr")!.icon, /nov\./i);
  assert.equal(historyDay("nhl", "02-30", "en"), null, "no such day");
  assert.equal(historyDay("nhl", "2-3", "en"), null);
  assert.equal(historyDay("wnba", "11-02", "en"), null, "a league with no block");
  assert.equal(historyDay("ncaaf", "11-02", "en"), null, "college football has no block");
  assert.ok(hasHistory("cfl") && !hasHistory("pwhl"));
});

test("the calendar page is plain SVG in the three colours the stylesheet recolours", () => {
  const css = read("../src/app/globals.css");
  for (const md of ["01-01", "02-29", "10-31", "12-25"]) {
    const [m, d] = md.split("-").map(Number);
    const svg = dayIcon(m, d, "en");
    assert.doesNotMatch(svg, /<script|<style|on[a-z]+=|href=|<foreignObject|<image/i);
    assert.doesNotMatch(svg.slice(0, svg.indexOf(">")), / (?:width|height)=/, "the root is sized by the stylesheet");
    const colours = new Set([...svg.matchAll(/(?:fill|stroke)="(#[0-9a-f]{3,8})"/gi)].map((x) => x[1].toLowerCase()));
    assert.deepEqual([...colours].sort(), ["#080808", "#2f78bd", "#ffffff"], `${md}: colours`);
  }
  for (const hex of ["#ffffff", "#080808", "#2f78bd"]) assert.ok(css.includes(`.hist-cal [`) && css.includes(`"${hex}"`), `globals.css recolours ${hex}`);
});

test("a kept page: the block is drawn in the browser from the reader's own day", () => {
  const comp = read("../src/components/TodayInHistory.tsx");
  assert.match(comp, /useSyncExternalStore\(subscribe, \(\) => localDay\(\), \(\) => null\)/, "the server and the first render know no day");
  assert.match(comp, /newestFirst\(data\.facts\)/, "the block draws newest first");
  assert.match(comp, /labelled \? <span className="hist-l">/, "the league label only where the sport has more than one league");
  assert.match(comp, /<Rich text=\{say\("history\.credit"\)\} parts=\{\{ meigen: <LibCredit lib="meigen-sports" \/> \}\} \/>/, "the block credits Meigen Sports with its npm and GitHub links");
  const credits = read("../src/components/Credits.tsx");
  assert.match(credits, /"meigen-sports": "Meigen Sports"/);
  assert.match(credits, /\| "meigen-sports";/);
  assert.match(read("../src/lib/i18n/phrases.constants.ts"), /"history\.credit": "Calendar page and facts: \{meigen\}\."/);
  assert.doesNotMatch(comp, /setInterval|setTimeout|cookies\(|headers\(|searchParams/);
  const route = read("../src/app/[locale]/s/[league]/rows/today/[day]/route.ts");
  assert.match(route, /export const revalidate = 2592000;/);
  assert.doesNotMatch(route, /cookies\(|headers\(|searchParams|new Date\(|fetch\(/, "the answer reads no request, no clock and no database");
  const page = read("../src/app/[locale]/s/[league]/page.tsx");
  assert.match(page, /const showHistory = hasHistory\(lg\) && !!fam;/);
  assert.match(page, /\{showHistory \? <TodayInHistory host=\{historyHost\(lg\)!\} sport=\{say\(`league\.sport\.\$\{fam!\.sport\}`\)\} labelled=\{sportLeagues\(lg\)\.length > 1\} \/> : null\}/);
  assert.match(read("../src/lib/i18n/phrases.constants.ts"), /"history\.title": "Today in \{sport\} history"/);
  assert.match(read("../src/lib/i18n/phrases.constants.ts"), /"league\.sport\.football": "football"/);
});

test("the league page runs: heading and buttons, then the champion beside today in history, then the seasons, then the other leagues", () => {
  const page = read("../src/app/[locale]/s/[league]/page.tsx");
  const at = (needle: string) => { const i = page.indexOf(needle); assert.ok(i > 0, needle); return i; };
  const order = [at('className="head fade tight"'), at('<div className="toprow">'), at("<TrophyBanner"), at("<TodayInHistory"), at("<SeasonSync>"), at('say("league.otherLeagues")'), at('say("league.champions")')];
  assert.deepEqual(order, [...order].sort((a, b) => a - b), "head, champion, history, seasons, other leagues, champions");
  const css = read("../src/app/globals.css");
  assert.match(css, /\.toprow:not\(:has\(\.hist\)\) \{ grid-template-columns: minmax\(0, 1fr\); \}/, "no block, the champion takes the row");
  assert.match(css, /@media \(max-width: 760px\) \{ \.toprow \{ grid-template-columns: minmax\(0, 1fr\)/, "a phone stacks them, champion first");
  assert.match(css, /\.hist \{ min-height: 200px; \}/, "the block keeps its height from the first draw");
});

test("an ended league says Final champion, a league still playing (or between seasons) says Latest champion", () => {
  // The archive's newest season is 2026; the NHL has played it (or is between seasons), the WCHL stopped in 1925, the PWHL's last is the year before.
  assert.equal(leagueEnded("wchl", 1925, 2026), true);
  for (const lg of ["nha", "pcha", "wha", "aafc", "afl"]) assert.equal(leagueEnded(lg, 1950, 2026), true, lg);
  assert.equal(leagueEnded("nhl", 2026, 2026), false);
  assert.equal(leagueEnded("pwhl", 2025, 2026), false, "between seasons is not ended");
  assert.equal(leagueEnded("ahl", 2025, 2026), false);
  assert.equal(leagueEnded("ahl", 2020, 2026), true, "a league the archive stopped following years ago has ended, flag or not");
  assert.equal(leagueEnded("nhl", null, 2026), false);
  const page = read("../src/app/[locale]/s/[league]/page.tsx");
  assert.match(page, /const champLabel = ended \? "trophy\.final" : "trophy\.latest";/);
  assert.match(read("../src/lib/i18n/phrases.constants.ts"), /"trophy\.final": "Final champion"/);
});
