import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { sourceLabel } from "../src/lib/sourceLabels.ts";
import { dayIcon, historyDay, parseDay } from "../src/lib/todayHistory/day.ts";
import { HISTORY_LEAGUES, hasHistory, type HistoryFile } from "../src/lib/todayHistory/types.ts";
import { cupFinalText, isKind, plainName, withoutDate } from "../src/lib/todayHistory/words.ts";

/** Run in web/: pnpm test:todayhistory (the `react-server` condition lets lib/todayHistory/day.ts import "server-only"). */

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const file = (lg: string): HistoryFile => JSON.parse(read(`../src/lib/todayHistory/data/${lg}.json`));
const pkg = JSON.parse(read("../package.json")) as { version: string; dependencies: Record<string, string> };

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

test("the data files: three facts a day at most, true to their shape, every source named", () => {
  for (const lg of HISTORY_LEAGUES) {
    const d = file(lg);
    assert.equal(d.league, lg);
    assert.equal(d.package, pkg.dependencies["@johnmorrisdotca/meigen-sports"], `${lg}: made from the pinned package version`);
    const days = Object.keys(d.days);
    for (const md of days) {
      assert.ok(parseDay(md), `${lg} ${md} is a day of the year`);
      const facts = d.days[md];
      assert.ok(facts.length >= 1 && facts.length <= 3, `${lg} ${md}: ${facts.length} facts`);
      for (const f of facts) {
        assert.ok(Number.isInteger(f.y) && f.y > 1800 && f.y <= 2026, `${lg} ${md}: year ${f.y}`);
        assert.ok(isKind(f.k), `${lg} ${md}: kind ${f.k}`);
        assert.ok(["wikidata", "wikipedia", "retrosheet", "nflverse"].includes(f.s) && sourceLabel(f.s).url.startsWith("https://"), `${lg} ${md}: source ${f.s} is one the site credits`);
        assert.ok(f.t.length >= 12 && f.t.length <= 260, `${lg} ${md}: length ${f.t.length}`);
        assert.doesNotMatch(f.t, /(?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4}|\(none\)|undefined|null|NaN/, `${lg} ${md}: ${f.t}`);
        assert.equal(f.p === undefined, f.n === undefined, `${lg} ${md}: a link has an id and a name length`);
        if (f.p !== undefined) assert.ok(Number.isInteger(f.p) && f.n! >= 3 && f.n! < f.t.length && /^\p{L}[^()\d]*$/u.test(f.t.slice(0, f.n)), `${lg} ${md}: link text "${f.t.slice(0, f.n)}"`);
      }
    }
    // Enough days that the block shows on most visits (the NFL season has no games on many summer days; the block is then left out).
    const need = { nhl: 300, nba: 366, mlb: 350, nfl: 200, cfl: 366 }[lg];
    assert.ok(days.length >= need, `${lg}: ${days.length} days with a fact, expected at least ${need}`);
  }
  assert.ok(file("nba").days["02-29"], "a leap day has facts");
  const cup = file("nhl").days["06-09"].filter((f) => f.k === "championship-final");
  assert.ok(cup.length >= 1 && cup.every((f) => /Stanley Cup/.test(f.t)), "the Stanley Cup finals are in the NHL's days");
});

test("the package is pinned to one exact version", () => {
  assert.match(pkg.dependencies["@johnmorrisdotca/meigen-sports"], /^\d+\.\d+\.\d+$/);
});

test("a day's answer: the page and the facts, in the reader's language, or nothing", () => {
  const en = historyDay("nhl", "11-02", "en");
  assert.ok(en && en.facts.length >= 1);
  assert.match(en.icon, /<title>Nov 2<\/title>/);
  assert.match(historyDay("nhl", "11-02", "ja")!.icon, /11月/);
  assert.match(historyDay("nhl", "11-02", "fr")!.icon, /nov\./i);
  assert.equal(historyDay("nhl", "02-30", "en"), null, "no such day");
  assert.equal(historyDay("nhl", "2-3", "en"), null);
  assert.equal(historyDay("wnba", "11-02", "en"), null, "a league with no block");
  assert.equal(historyDay("nfl", "06-09", "en"), null, "a day with nothing says nothing");
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
  assert.doesNotMatch(comp, /setInterval|setTimeout|cookies\(|headers\(|searchParams/);
  const route = read("../src/app/[locale]/s/[league]/rows/today/[day]/route.ts");
  assert.match(route, /export const revalidate = 2592000;/);
  assert.doesNotMatch(route, /cookies\(|headers\(|searchParams|new Date\(|fetch\(/, "the answer reads no request, no clock and no database");
  const page = read("../src/app/[locale]/s/[league]/page.tsx");
  assert.match(page, /hasHistory\(lg\) \? <TodayInHistory league=\{lg\} short=\{info\.short\} \/> : null/);
  assert.match(read("../src/lib/i18n/phrases.constants.ts"), /"history\.title": "Today in \{league\} history"/);
});
