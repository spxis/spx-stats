import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { drawKnockout, drawKnockoutFiles, knockoutLook, knockoutScope } from "../src/lib/bracketDraw.ts";
import { buildBracket, halvesOf, type Tie } from "../src/lib/bracketLayout.ts";
import { buildSeries, seriesPlay, seriesTies, type PlayoffGame } from "../src/lib/series.ts";
import { seriesOrder } from "../src/lib/sides.ts";
import type { Match } from "../src/lib/soccer.ts";
import { knockoutOf, soccerPlay } from "../src/lib/soccerBracket.ts";

/** Run in web/: pnpm test:bracket (the layout is Taisen Brackets', which is sport-agnostic: ties of any two sides, here string teams as in a World Cup). */

const m = (id: number, stage: string, order: number, home: string, away: string, hg: number, ag: number, extra: Partial<Match> = {}): Match => ({
  match_id: id, source_key: "", league: "wc", year: 2000, tournament_id: "wc2000", stage_key: stage, stage_order: order, group_name: null, match_number: null,
  match_date: `2000-06-${String(id).padStart(2, "0")}`, kickoff_local: null, utc_offset: null, home_team_id: home, home, home_slug: home, home_flag: null, home_goals: hg,
  away_team_id: away, away, away_slug: away, away_flag: null, away_goals: ag, home_goals_90: null, away_goals_90: null, extra_time: false, shootout: false,
  home_penalties: null, away_penalties: null, winner_team_id: hg > ag ? home : ag > hg ? away : null, is_replay: false, venue_name: null, venue_city: null,
  venue_country: null, venue_wikidata_id: null, venue_id: null, lineup_players: 0, goal_rows: 0, source: null, checked: null, ...extra,
});

// Eight teams: A beats B, C beats D, E beats F, G beats H; A beats C, E beats G; E beats A in the final (A is at home: soccer lists the home side first, so A plays on the left, E on the right).
const eight = [
  m(1, "quarter", 6, "A", "B", 2, 0), m(2, "quarter", 6, "C", "D", 1, 0), m(3, "quarter", 6, "E", "F", 3, 1), m(4, "quarter", 6, "G", "H", 2, 1),
  m(5, "semi", 7, "A", "C", 1, 0), m(6, "semi", 7, "E", "G", 2, 0),
  m(7, "third_place", 8, "C", "G", 2, 1),
  m(8, "final", 9, "A", "E", 0, 1),
];

test("a knockout is one tie per pairing and stage, the third-place match apart, with the rounds numbered from the first", () => {
  const ko = knockoutOf(eight);
  assert.equal(ko.ties.length, 7);
  assert.equal(ko.third?.match_id, 7);
  assert.deepEqual(ko.stages, ["quarter", "semi", "final"]);
  assert.deepEqual(ko.round, [1, 1, 1, 1, 2, 2, 3]);
  assert.deepEqual(ko.ties[6].teams, ["A", "E"], "the home side first (FIFA's Team A), the visitor second (the final: A was at home)");
  assert.equal(ko.ties[6].winner, "E");
});

test("the bracket puts one half down each side and the final in the middle, each tie feeding the one its winner plays next", () => {
  const ko = knockoutOf(eight);
  const b = buildBracket(ko.ties, ko.round, () => null);
  assert.equal(b.final?.i, 6);
  assert.equal(b.sides.length, 2);
  assert.deepEqual(b.columns, [1, 2]);
  // The final's first side (the home side, A) leads the left half.
  assert.deepEqual(b.sides[0].boxes.map((x) => x.i).sort(), [0, 1, 4]);
  assert.deepEqual(b.sides[1].boxes.map((x) => x.i).sort(), [2, 3, 5]);
  const semiA = b.sides[0].boxes.find((x) => x.i === 4)!;
  assert.equal(semiA.fed, true);
  assert.equal(semiA.to, b.final!.y, "a semi-final's line runs to the final");
  const q1 = b.sides[0].boxes.find((x) => x.i === 0)!, q2 = b.sides[0].boxes.find((x) => x.i === 1)!;
  assert.equal(semiA.y, (q1.y + q2.y) / 2, "a tie sits halfway between the two that feed it");
  assert.equal(b.other.length, 0);
});

test("a drawn match that was replayed is one tie, decided by the replay", () => {
  const ko = knockoutOf([
    m(1, "quarter", 6, "A", "B", 1, 1), m(2, "quarter", 6, "B", "A", 0, 1, { is_replay: true }),
    m(3, "quarter", 6, "C", "D", 2, 0), m(4, "semi", 7, "A", "C", 1, 0),
  ]);
  assert.equal(ko.ties.length, 3);
  const tie = ko.ties.find((t) => t.matches.length === 2)!;
  assert.equal(tie.winner, "A");
  assert.deepEqual(tie.matches.map((x) => x.match_id), [1, 2]);
  const b = buildBracket(ko.ties, ko.round, () => null);
  assert.equal(b.final?.i, ko.ties.findIndex((t) => t.stage_key === "semi"));
});

test("a tournament whose only knockout match is the final draws the final alone; a tie nobody won leads nowhere", () => {
  const only = knockoutOf([m(1, "third_place", 8, "A", "B", 1, 0), m(2, "final", 9, "C", "D", 1, 0)]);
  const b = buildBracket(only.ties, only.round, () => null);
  assert.equal(b.finalIndex, 0);
  assert.equal(b.final, null, "nothing feeds it, so no two halves meet at it");
  const ties: Tie[] = [{ teams: [1, 2], winner: null, start: "1" }, { teams: [1, 3], winner: 1, start: "2" }];
  assert.equal(buildBracket(ties, [1, 2], () => null).finalIndex, 1);
});

test("two halves take the conferences' names when the conferences split them cleanly", () => {
  const ko = knockoutOf(eight);
  const conf = (t: string) => (["A", "B", "C", "D"].includes(t) ? { name: "West", short: null } : { name: "East", short: null });
  const b = buildBracket(ko.ties, ko.round, conf);
  assert.deepEqual(b.sides.map((s) => s.label), ["West", "East"]);
});

test("a round-robin game (round 0) stays out of the tree, and a tie outside the final's tree is drawn apart", () => {
  const ties: Tie[] = [
    { teams: [1, 2], winner: 1, start: "1" }, { teams: [3, 4], winner: 3, start: "1" }, { teams: [1, 3], winner: 1, start: "2" },
    { teams: [7, 8], winner: 7, start: "1" }, // a tie nobody's winner goes on from
    { teams: [5, 6], winner: 5, start: "0" },
  ];
  const b = buildBracket(ties, [1, 1, 2, 1, 0], () => null);
  assert.equal(b.final?.i, 2);
  assert.deepEqual(b.robin, [4]);
  assert.deepEqual(b.other, [3]);
  assert.deepEqual([b.place[0], b.place[2], b.place[3], b.place[4]], ["l", "f", "o", "o"], "the places are an array, by tie");
});

test("a final nothing feeds (1974 and 1978 had only a final and a third-place match) is drawn, on a desk and on a phone", () => {
  const ko = knockoutOf([m(1, "third_place", 8, "A", "B", 1, 0), m(2, "final", 9, "C", "D", 1, 0)]);
  const ties: Tie<string>[] = [...ko.ties, { teams: ["A", "B"], winner: "A", start: "2000-06-01", third: true }];
  const layout = buildBracket(ties, [1, 1], () => null);
  assert.equal(layout.third, 1);
  const art = drawKnockout(layout, { href: (t) => `/match/${t.index}` });
  for (const svg of [art.wide, art.phone]) assert.equal((svg.match(/class="tb-link"/g) ?? []).length, 2);
});

test("Taisen Brackets is pinned at an exact version and credited with both links", () => {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { dependencies: Record<string, string> };
  assert.match(pkg.dependencies["@johnmorrisdotca/taisen-brackets"] ?? "", /^\d+\.\d+\.\d+$/);
  const credits = readFileSync(new URL("../src/components/Credits.tsx", import.meta.url), "utf8");
  assert.match(credits, /"taisen-brackets"/);
  assert.match(credits, /credit\.brackets/);
});

test("a tie is played as the package reads it: a replay is a second, flagged game; a shoot-out is the first team's first", () => {
  const ko = knockoutOf([
    m(1, "quarter", 6, "A", "B", 1, 1), m(2, "quarter", 6, "B", "A", 0, 1, { is_replay: true }),
    m(3, "quarter", 6, "C", "D", 2, 2, { extra_time: true, shootout: true, home_penalties: 3, away_penalties: 4 }), m(4, "semi", 7, "A", "C", 1, 0),
  ]);
  const replay = ko.ties.find((t) => t.matches.length === 2)!.play!;
  assert.equal(replay.kind, "replay");
  assert.deepEqual(replay.games?.map((g) => [...g.score]), [[1, 1], [0, 1]], "both games from the point of view of the first side (B, the replay's home side)");
  assert.deepEqual(replay.games?.map((g) => !!g.replay), [false, true]);
  const pens = soccerPlay([ko.ties.find((t) => t.teams.includes("D"))!.matches[0]], "D");
  assert.deepEqual(pens.games?.[0].pens, [4, 3]);
  assert.equal(pens.games?.[0].extraTime, true);
});

test("a series is played as best-of-N with the games it has: a single game is a game, a total-goals series an aggregate", () => {
  const g = (id: number, day: string, away: number, home: number, as: number, hs: number): PlayoffGame => ({
    game_id: id, game_date: day, status: "final", away_id: away, away: `Team ${away}`, away_score: as, home_id: home, home: `Team ${home}`, home_score: hs,
    overtime: false, source: "test", away_f: away, home_f: home, checked: null,
  } as PlayoffGame);
  const series = buildSeries("nhl", 2026, [g(1, "2026-04-20", 2, 1, 1, 3), g(2, "2026-04-22", 2, 1, 4, 2), g(3, "2026-04-24", 1, 2, 5, 1), g(4, "2026-04-26", 1, 2, 2, 0)], 1, { bestOf: 7 })!;
  const play = seriesPlay(series);
  assert.equal(play.kind, "series");
  assert.equal(play.bestOf, 7);
  assert.equal(play.games?.length, 4);
  assert.deepEqual(play.score, [series.sides[0].wins, series.sides[1].wins]);
  assert.deepEqual(seriesTies([series])[0].play, seriesPlay(series, seriesOrder(series)));
  const one = buildSeries("nfl", 2025, [g(9, "2026-01-10", 2, 1, 17, 20)], 1)!;
  assert.equal(seriesPlay(one).kind, "game");
});

test("a bracket is drawn twice, the desk's and the phone's, with a real link on every box and no script", () => {
  const ko = knockoutOf(eight);
  const ties: Tie<string>[] = [...ko.ties, { teams: ["C", "G"], winner: "C", start: "2000-06-07", third: true }];
  const layout = buildBracket(ties, [...ko.round, 3], () => null, (id) => ({ name: `Team ${id}`, abbr: id }));
  const art = drawKnockout(layout, { href: (t) => `/match/${t.index}`, roundNames: ["Quarter-finals", "Semi-finals", "Final"] });
  for (const svg of [art.wide, art.phone]) {
    assert.ok(svg.startsWith("<svg") && svg.endsWith("</svg>"));
    assert.equal((svg.match(/<a class="tb-link" href="\/match\/\d"/g) ?? []).length, 8, "seven ties and the third-place match each link to their page");
    assert.ok(!/<script|javascript:|onclick/i.test(svg));
  }
  assert.ok(art.wide.includes('viewBox="0 0 1200') && art.phone.includes('viewBox="0 0 390'));
  assert.equal((art.wide.match(/<style>/g) ?? []).length + (art.phone.match(/<style>/g) ?? []).length, 1, "the stylesheet is in the page once");
  assert.ok(art.wide.includes(`class="taisen tb-`) && art.wide.includes(` ${knockoutScope("tree")}`) && art.phone.includes(` ${knockoutScope("tree")}`), "both drawings wear the one class (styleScope) that the one stylesheet is written under");
  assert.ok(art.wide.includes("<style>") && !art.phone.includes("<style>"), "only the desk's drawing carries the stylesheet");
  assert.ok(/quarter-finals/i.test(art.wide), "the round names are the ones given");
  assert.ok(art.wide.includes(">Team E<") || art.wide.includes(">E<"), "a team is its name or its short name");
});

test("a team's mark is written once for the page: the phone's drawing uses the desk's symbols, and a flag is named by its file", () => {
  const ko = knockoutOf(eight);
  const ties: Tie<string>[] = [...ko.ties, { teams: ["C", "G"], winner: "C", start: "2000-06-07", third: true }];
  const layout = buildBracket(ties, [...ko.round, 3], () => null, (id) => ({ name: `Team ${id}`, abbr: id, flag: id === "A" ? "gb-eng" : "ES" }));
  const art = drawKnockout(layout, { href: (t) => `/match/${t.index}`, flagHref: (c) => `/soccer-flag/${c.toUpperCase()}.svg`, tieClass: (t) => (t.index === 0 ? "ko-dim" : null) });
  assert.equal((art.wide.match(/<symbol /g) ?? []).length, 2, "one symbol for each flag in the desk's drawing");
  assert.equal((art.phone.match(/<symbol /g) ?? []).length, 0, "none in the phone's");
  const symbols = [...art.wide.matchAll(/<symbol id="([^"]+)"/g)].map((x) => x[1]);
  const used = [...art.phone.matchAll(/<use href="#([^"]+)"/g)].map((x) => x[1]);
  assert.ok(used.length > 0 && used.every((id) => symbols.includes(id)), "every mark the phone draws is a symbol of the desk's drawing");
  assert.ok(art.wide.includes('href="/soccer-flag/GB-ENG.svg"') && art.wide.includes('href="/soccer-flag/ES.svg"'), "a flag is the site's file for its code");
  for (const svg of [art.wide, art.phone]) assert.equal((svg.match(/class="tb-tie ko-dim/g) ?? []).length, 1, "the tie the page picked carries its class");
});

test("each league's playoffs have their layout: rows, columns with AT, the tree; two layouts on one page keep a stylesheet each", () => {
  assert.deepEqual(knockoutLook("nhl"), { layout: "rows", headers: true });
  assert.deepEqual(knockoutLook("nfl"), { layout: "columns", headers: true, at: true });
  for (const lg of ["nba", "mlb", "cfl"]) assert.equal(knockoutLook(lg).layout, "tree");
  const ko = knockoutOf(eight);
  const layout = buildBracket(ko.ties, ko.round, () => null, (id) => ({ name: `Team ${id}`, abbr: id }));
  for (const lg of ["nhl", "nfl", "nba"]) {
    const art = drawKnockout(layout, { ...knockoutLook(lg) });
    assert.equal((art.wide.match(/<style>/g) ?? []).length + (art.phone.match(/<style>/g) ?? []).length, 1, `${lg}: one stylesheet for the desk's and the phone's drawing`);
    assert.ok(art.wide.includes(knockoutScope(knockoutLook(lg).layout)) && art.phone.includes(knockoutScope(knockoutLook(lg).layout)));
  }
  assert.notEqual(knockoutScope("rows"), knockoutScope("tree"));
});

test("the postseason picture is a second look at the same ties: logo tiles, who won and the length of each series, from a file of its own", () => {
  assert.deepEqual(knockoutLook("mlb", true), { layout: "picture", headers: true });
  assert.deepEqual(knockoutLook("nfl", true), { layout: "picture", headers: true }, "the picture never takes the NFL's AT");
  assert.equal(knockoutScope("picture"), "kobk-picture");
  const ko = knockoutOf(eight);
  const ties: Tie<string>[] = ko.ties.map((t, i) => ({ ...t, play: { kind: "series" as const, bestOf: ko.round[i] === 1 ? 5 : 7, score: [4, 2] as [number, number] } }));
  const layout = buildBracket(ties, ko.round, () => null, (id) => ({ name: `Team ${id}`, abbr: id, mark: `/team-logos/${id}.png` }));
  const art = drawKnockoutFiles(layout, { ...knockoutLook("mlb", true), href: (t) => `/series/${t.index}` });
  for (const svg of [art.wide, art.phone]) {
    assert.ok(svg.includes("kobk-picture"), "the picture's own stylesheet scope");
    assert.match(svg, /wins/, "the result beside each pair");
    assert.ok(svg.includes("Best of 5") && svg.includes("Best of 7"), "the length of each round's series");
    assert.equal((svg.match(/<style>/g) ?? []).length, 1, "each file stands alone");
  }
});

test("a conference decides the halves, and where a season has divisions and no conferences the divisions do; the CFL's halves are its divisions", () => {
  const row = (f: number, conference: string | null, division: string | null) => ({ franchise_id: f, conference, conference_short: null, division, division_short: null });
  const nhl = halvesOf("nhl", [row(1, "Eastern Conference", "Atlantic"), row(2, "Western Conference", "Pacific")]);
  assert.equal(nhl.get(1)?.name, "Eastern Conference");
  const old = halvesOf("nhl", [row(1, null, "East Division"), row(2, null, "West Division")]);
  assert.equal(old.get(2)?.name, "West Division");
  const cfl = halvesOf("cfl", [row(1, "East", null), row(2, "West", null)]);
  assert.deepEqual([cfl.get(1)?.name, cfl.get(2)?.name], ["East Division", "West Division"]);
  assert.equal(halvesOf("nfl", [row(1, "AFC", "East"), row(2, "NFC", null)]).get(1)?.name, "AFC", "a season with conferences ignores the divisions");
  assert.equal(halvesOf("nhl", [row(1, null, null)]).size, 0);
});
