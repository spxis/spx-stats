import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  bigSeasons, cleanNote, CHAMPIONSHIP_CODE, codeOfSlug, dedupe, factsOf, holders, leagueOfCode, playedFor, streaks, tally, trophiesPath, trophyHead, trophyLines, trophyPath,
  trophyRowsPath, trophySlug, TROPHY_HEAD, type TrophyRow,
} from "../src/lib/awardTrophy.ts";
import { ALWAYS_STATIC } from "../src/lib/routing.ts";

/** Run in web/: pnpm test:trophypages */

const row = (over: Partial<TrophyRow>): TrophyRow => ({ year: 2020, award_code: "nhl_hart", award: "Hart Memorial Trophy", kind: "person_award", winner: "A", note: null, franchise_id: null, person_id: 1, ...over });

test("the address of a trophy is made from its award code and back", () => {
  assert.equal(leagueOfCode("nhl_stanley_cup"), "nhl");
  assert.equal(trophySlug("nhl_stanley_cup"), "stanley-cup");
  assert.equal(trophyPath("nhl_stanley_cup"), "/nhl/trophy/stanley-cup");
  assert.equal(trophyPath("mlb_gold_glove"), "/mlb/trophy/gold-glove");
  assert.equal(trophyRowsPath("nhl_hart"), "/nhl/trophy/hart/rows");
  assert.equal(trophiesPath(), "/trophies");
  assert.equal(trophiesPath("nba"), "/nba/trophies");
  assert.equal(codeOfSlug("nhl", "stanley-cup"), "nhl_stanley_cup");
  assert.equal(codeOfSlug("nhl", "Stanley Cup"), null);
  assert.equal(codeOfSlug("nhl", "a/b"), null);
  assert.equal(codeOfSlug("nhl", ""), null);
  // A trophy lives under the league its code starts with: the National Association (league na) wins mlb_pennant_na, at /mlb/trophy/pennant-na.
  for (const code of Object.values(CHAMPIONSHIP_CODE)) assert.equal(codeOfSlug(leagueOfCode(code), trophySlug(code)), code, code);
  assert.equal(trophyPath(CHAMPIONSHIP_CODE.na), "/mlb/trophy/pennant-na");
});

test("two sources naming the same winner are one winner, and the note and team of either are kept", () => {
  const list = dedupe([
    row({ year: 2024, winner: "SGA", person_id: 150545, note: null }),
    row({ year: 2024, winner: "SGA", person_id: 150545, note: "Played for Oklahoma City Thunder; G", franchise_id: 7 }),
    row({ year: 2023, winner: "B", person_id: 2 }),
    row({ year: 2023, winner: "C", person_id: 3 }),
  ]);
  assert.equal(list.length, 3);
  assert.deepEqual(list.map((r) => r.year), [2024, 2023, 2023], "newest first");
  assert.equal(list[0].note, "Played for Oklahoma City Thunder; G");
  assert.equal(list[0].franchise_id, 7);
  const clubs = dedupe([
    row({ award_code: "nhl_stanley_cup", kind: "championship", person_id: null, franchise_id: 1638, winner: "Vegas Golden Knights", note: "Won the final 4 games to 1" }),
    row({ award_code: "nhl_stanley_cup", kind: "championship", person_id: null, franchise_id: null, winner: "Vegas Golden Knights", note: null }),
  ]);
  assert.equal(clubs.length, 1, "the same club named by a source that has no franchise is the same winner");
  assert.equal(clubs[0].franchise_id, 1638);
  assert.equal(clubs[0].note, "Won the final 4 games to 1");
});

test("notes: the team and position of a player are not repeated, a score is kept", () => {
  assert.equal(playedFor("Played for New York Islanders; D"), "New York Islanders");
  assert.equal(playedFor("OF; American League"), null);
  assert.equal(cleanNote("Played for New York Islanders; D", true), "D");
  assert.equal(cleanNote("Played for New York Islanders", true), null);
  assert.equal(cleanNote("Played for New York Islanders; D", false), "Played for New York Islanders; D");
  assert.equal(cleanNote("Won the final 4 games to 2 against Edmonton Oilers", false), "Won the final 4 games to 2 against Edmonton Oilers");
  assert.equal(cleanNote(null, true), null);
});

test("who won most: by person, franchise or name, most first, then the latest", () => {
  const t = tally([row({ year: 2000 }), row({ year: 2001 }), row({ year: 2002, person_id: 2, winner: "B" }), row({ year: 2003, person_id: 2, winner: "B" }), row({ year: 1999, person_id: 3, winner: "C" })]);
  assert.deepEqual(t.map((x) => [x.name, x.n]), [["B", 2], ["A", 2], ["C", 1]], "a tie goes to the latest winner");
  assert.equal(t[0].first, 2002);
  assert.equal(t[0].last, 2003);
  const teams = tally([row({ person_id: null, franchise_id: 9, winner: "Club", year: 1 }), row({ person_id: null, franchise_id: 9, winner: "Club", year: 2, award_code: "nhl_stanley_cup" })]);
  assert.equal(teams[0].n, 2);
  assert.equal(teams[0].awards, 2, "in two different awards");
});

test("streaks are consecutive seasons of one winner in one award, longest first", () => {
  const list = [2001, 2002, 2003, 2005, 2006, 2010].map((year) => row({ year }));
  const s = streaks(list);
  assert.deepEqual(s.map((x) => [x.from, x.to, x.length]), [[2001, 2003, 3], [2005, 2006, 2]]);
  assert.equal(streaks(list, 3).length, 1);
  assert.equal(streaks([row({ year: 2001 }), row({ year: 2001 }), row({ year: 2002 })])[0].length, 2, "a winner listed twice in a season counts once");
  assert.equal(streaks([row({ year: 2001 }), row({ year: 2002, award_code: "nhl_vezina" })]).length, 0, "another award is no run");
  assert.equal(streaks([row({ year: 2001 }), row({ year: 2002, person_id: 5 })]).length, 0, "another winner is no run");
});

test("several awards in one season: person awards only, most first", () => {
  const list = [
    row({ award_code: "nhl_hart" }), row({ award_code: "nhl_art_ross", award: "Art Ross" }), row({ award_code: "nhl_hart" }),
    row({ award_code: "nhl_stanley_cup", kind: "championship", person_id: null, franchise_id: 3 }),
    row({ person_id: 2, winner: "B", award_code: "nhl_hart" }),
  ];
  const b = bigSeasons(list);
  assert.equal(b.length, 1);
  assert.equal(b[0].person_id, 1);
  assert.deepEqual(b[0].codes, ["nhl_hart", "nhl_art_ross"]);
  assert.equal(bigSeasons(list, 3).length, 0);
});

test("holders are the winners of each award's latest season; facts count the seasons", () => {
  const h = holders([row({ year: 2023 }), row({ year: 2024 }), row({ year: 2024, person_id: 2, winner: "B" }), row({ year: 2022, award_code: "nhl_vezina" })]);
  assert.equal(h.get("nhl_hart")?.year, 2024);
  assert.equal(h.get("nhl_hart")?.rows.length, 2);
  assert.equal(h.get("nhl_vezina")?.year, 2022);
  assert.deepEqual(factsOf([row({ year: 2023 }), row({ year: 2024 }), row({ year: 2024, person_id: 2 })]), { first: 2023, last: 2024, given: 3, seasons: 2 });
  assert.deepEqual(factsOf([]), { first: null, last: null, given: 0, seasons: 0 });
});

test("the winners table: the head and the rest agree on the logos, and a team award is named by its team", () => {
  const rows: TrophyRow[] = Array.from({ length: 40 }, (_, i) => row({
    year: 2000 + i, winner: `W${i}`, person_id: 100 + i, franchise_id: 1 + (i % 3), note: `Played for Club ${i % 3}; C`,
  }));
  const all = trophyLines(rows, { player: (id) => `/p/${id}`, logo: (f) => `logo-${f}` });
  assert.equal(all.lines.length, 40);
  assert.equal(all.lines[0].y, 2039, "newest first");
  assert.equal(all.lines[0].h, "/p/139");
  assert.equal(all.lines[0].t, "Club 0");
  assert.equal(all.lines[0].n, "C");
  assert.equal(all.logos.length, 3);
  const head = trophyHead(all, TROPHY_HEAD);
  assert.equal(head.lines.length, TROPHY_HEAD);
  for (const l of head.lines) assert.ok(l.lo == null || l.lo < head.logos.length, "the head's logos are a prefix of the list");
  const team = trophyLines([row({ award_code: "nhl_stanley_cup", kind: "championship", person_id: null, franchise_id: 4, winner: "Club", note: "Won the final 4 games to 2" })], { player: () => "", logo: () => null });
  assert.equal(team.lines[0].f, 4);
  assert.equal(team.lines[0].t, undefined, "a team winner is named by w");
  assert.equal(team.lines[0].n, "Won the final 4 games to 2");
});

const root = join(import.meta.dirname, "..", "src", "app", "[locale]");
const read = (p: string) => readFileSync(join(root, p), "utf8");

test("the pages are kept: a literal revalidate, a twin in q/ where the address can carry a query, and /trophies is always the static copy", () => {
  for (const p of ["s/trophies/page.tsx", "s/[league]/trophies/page.tsx", "s/[league]/trophy/[slug]/page.tsx", "s/[league]/trophy/[slug]/rows/route.ts"]) {
    assert.match(read(p), /export const revalidate = \d+;/, p);
  }
  for (const p of ["q/[league]/trophies/page.tsx", "q/[league]/trophy/[slug]/page.tsx"]) assert.ok(existsSync(join(root, p)), p);
  assert.ok((ALWAYS_STATIC as readonly string[]).includes("trophies"));
  for (const p of ["s/trophies/page.tsx", "s/[league]/trophies/page.tsx", "s/[league]/trophy/[slug]/page.tsx"]) {
    assert.doesNotMatch(read(p), /searchParams|cookies\(|headers\(/, `${p} reads nothing from the request`);
  }
});

test("the winners table is cut to a head and the rest is fetched, never all sent", () => {
  assert.ok(TROPHY_HEAD <= 40);
  const page = read("s/[league]/trophy/[slug]/page.tsx");
  assert.ok(page.includes("trophyHead(all, TROPHY_HEAD)"));
  assert.ok(read("s/[league]/trophy/[slug]/rows/route.ts").includes("all.lines.slice(head.lines.length)"));
});

test("a trophy's drawing is chosen in one place, and every other award has a stand-in until its own drawing is added", () => {
  const cups = readFileSync(join(import.meta.dirname, "..", "src", "lib", "cups.ts"), "utf8");
  assert.match(cups, /const NAMED: Record<string, Emblem> = \{/);
  assert.match(cups, /export function trophyArt\(/);
});
