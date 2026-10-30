import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, test } from "node:test";
import { getLiveScores } from "../src/lib/turso/live.ts";
import { tursoProvenance, tursoQuality, tursoTotals } from "../src/lib/turso/aggregates.ts";
import { withChecked } from "../src/lib/turso/checked.ts";
import { TURSO_ANSWER_BUDGET } from "../src/lib/turso/client.ts";
import { QUALITY_ISSUES_SHOWN, QUALITY_ISSUES_SQL } from "../src/lib/turso/qualitySql.ts";

/**
 * No Turso answer may come near 2 MB: Next's data cache will not keep one that big ("items over 2MB can not be cached"), so every build worker and
 * every regeneration reads it again. On 2026-10-29 /quality's read of api_quality was 2,934,529 bytes. These tests run the real readers against an
 * SQLite database holding today's row counts and several times more, with a fetch that answers in Turso's pipeline format, and hold every answer to
 * TURSO_ANSWER_BUDGET (1.5 MB). Readers that need modules node cannot load here (gameField, playerSprayData, the admin pages) are held by the
 * call-site list at the bottom.
 */

/**
 * Headroom on the compact pipeline JSON written below. That model matches a real libSQL server's answer to within 0.1% (2,234,025 bytes against
 * 2,232,611 for DS1's 6,436 api_quality rows), but live Turso's answer was 2,934,529 bytes, 31% over DS1's preview copy of the table, so every
 * size is raised by 35% before it is held to the budget.
 */
const REAL_OVER_MODEL = 1.35;

const db = new DatabaseSync(":memory:");
const sizes: { sql: string; bytes: number; rows: number }[] = [];
const realFetch = globalThis.fetch;

const cell = (v: unknown) =>
  v === null || v === undefined ? { type: "null" } : typeof v === "number" ? (Number.isInteger(v) ? { type: "integer", value: String(v) } : { type: "float", value: v }) : { type: "text", value: String(v) };

function installTurso() {
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    const stmt = JSON.parse(String(init.body)).requests[0].stmt as { sql: string; args: { value: string | number; type: string }[] };
    const args = stmt.args.map((a) => (a.type === "integer" ? Number(a.value) : a.value));
    const prepared = db.prepare(stmt.sql);
    const rows = prepared.all(...(args as never[])) as Record<string, unknown>[];
    const cols = prepared.columns().map((c) => c.name);
    const body = JSON.stringify({
      results: [
        { type: "ok", response: { type: "execute", result: { cols: cols.map((name) => ({ name, decltype: null })), rows: rows.map((r) => cols.map((c) => cell(r[c]))), affected_row_count: 0, last_insert_rowid: null, rows_read: rows.length, rows_written: 0 } } },
        { type: "ok", response: { type: "close" } },
      ],
    });
    sizes.push({ sql: stmt.sql, bytes: Math.round(body.length * REAL_OVER_MODEL), rows: rows.length });
    return new Response(body);
  }) as typeof fetch;
}

beforeEach(() => {
  sizes.length = 0;
  process.env.TURSO_DATABASE_URL = "http://127.0.0.1:7742";
  installTurso();
});
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.TURSO_DATABASE_URL;
});

const biggest = () => Math.max(0, ...sizes.map((s) => s.bytes));

// A small deterministic generator, so the fixtures are the same on every run.
let seed = 12345;
const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % n);
const TEAMS = ["Chicago Bulls", "St. Louis Hawks", "Montreal Canadiens", "Toronto Maple Leafs", "Boston Red Sox", "Green Bay Packers", "Hamilton Tiger-Cats"];

/** api_quality as DS1 makes it (scripts/release/turso.py): 6,436 rows on 2026-10-29, 34 of them check lines, issue texts with their digits already turned into #. */
function fillQuality(issueRows: number) {
  db.exec("drop table if exists api_quality; create table api_quality (kind text, source text, entity text, what text, resolution text, n integer, primary key (kind, source, entity, what, resolution))");
  const ins = db.prepare("insert or ignore into api_quality values (?, ?, ?, ?, ?, ?)");
  for (const source of ["wikipedia", "spx", "retrosheet", "nflverse", "wikidata", "cfbd"])
    for (const entity of ["game", "soccer_match", "team_season", "person"])
      for (const status of ["confirmed", "disputed", "single"]) ins.run("check", source, entity, status, "", 1 + rnd(90000));
  for (let i = 0; i < issueRows; i++) {
    const a = TEAMS[rnd(TEAMS.length)], b = TEAMS[rnd(TEAMS.length)];
    const what = `Duplicate of wpnba:#:regular:#-#-#:${a}:${b}:#: same teams on #-#-# (${i})`;
    const resolution = `Removed; betting lines moved to game ${rnd(1000000)} and ${rnd(100)}.${rnd(100)} kept`;
    ins.run("issue", ["wikipedia", "wikidata", "spx"][rnd(3)], ["game", "person_wikidata_enrichment", "city_unplaced"][rnd(3)], what, resolution, 1 + rnd(3000));
  }
}

test("the first fixture really is the 2 MB problem: reading all of api_quality is over Next's limit", () => {
  fillQuality(6402);
  const rows = db.prepare("select kind, source, entity, what, resolution, n from api_quality").all() as Record<string, unknown>[];
  const model = JSON.stringify(rows.map((r) => Object.values(r).map(cell))).length * REAL_OVER_MODEL;
  assert.ok(model > 2 * 1024 * 1024, `the old whole-table read is ${Math.round(model)} bytes in this fixture`);
});

test("/quality reads a few KB at today's size and at four times it", async () => {
  for (const issueRows of [6402, 25_000]) {
    sizes.length = 0;
    fillQuality(issueRows);
    const q = await tursoQuality();
    assert.equal(q.filter((x) => x.kind === "check").length, 72, "every check line");
    assert.equal(q.filter((x) => x.kind === "issue").length, QUALITY_ISSUES_SHOWN);
    assert.equal(sizes.length, 2);
    assert.ok(biggest() < 100_000, `${issueRows} issue rows: largest answer ${biggest()} bytes`);
    assert.ok(biggest() < TURSO_ANSWER_BUDGET);
  }
});

test("the issues Turso picks are the ones the page's own grouping and ranking would pick", () => {
  fillQuality(6402);
  // Resolutions with digit runs, a # next to a digit and an empty one, to hold the SQL digit rule to the page's /\d+/g -> "#".
  const ins = db.prepare("insert or ignore into api_quality values ('issue', 'x', 'k', ?, ?, ?)");
  ins.run("same text", "Moved 12 rows", 400001);
  ins.run("same text", "Moved 3456789 rows", 400002);
  ins.run("same text", "Moved #5 rows", 400004);
  ins.run("same text", "", 400008);
  ins.run("same text", "v1.2.3-4", 400016);
  ins.run("same text", "v9.8.7-6", 400032);
  const all = db.prepare("select source, entity, what, resolution, n from api_quality where kind = 'issue'").all() as { source: string; entity: string; what: string; resolution: string; n: number }[];
  const ref = new Map<string, number>();
  for (const r of all) {
    const k = JSON.stringify([r.source, r.entity, r.what, r.resolution.replace(/\d+/g, "#")]);
    ref.set(k, (ref.get(k) ?? 0) + r.n);
  }
  const want = [...ref.entries()].sort((a, b) => b[1] - a[1]).slice(0, QUALITY_ISSUES_SHOWN);
  const got = (db.prepare(QUALITY_ISSUES_SQL).all() as { source: string; entity: string; what: string; resolution: string; n: number }[]).map(
    (r) => [JSON.stringify([r.source, r.entity, r.what, r.resolution]), r.n] as const,
  );
  assert.deepEqual(got.map((g) => g[1]), want.map((w) => w[1]), "the same counts in the same order");
  for (const [i, [k, n]] of want.entries()) if (want.filter((w) => w[1] === n).length === 1) assert.equal(got[i]![0], k);
  const forced = new Map(got);
  assert.equal(forced.get(JSON.stringify(["x", "k", "same text", "Moved # rows"])), 400001 + 400002);
  assert.equal(forced.get(JSON.stringify(["x", "k", "same text", "Moved ## rows"])), 400004, "a # beside a digit is kept as the page keeps it");
  assert.equal(forced.get(JSON.stringify(["x", "k", "same text", "v#.#.#-#"])), 400016 + 400032);
});

test("the check of a game: a page of 5,000 games asks in answers of at most 1,000 ids, against 98k verification rows", async () => {
  db.exec("drop table if exists meta_verification; create table meta_verification (verification_id integer primary key, entity_kind text, entity_id integer, status text)");
  const ins = db.prepare("insert into meta_verification (entity_kind, entity_id, status) values (?, ?, ?)");
  db.exec("begin");
  for (let i = 1; i <= 98_000; i++) ins.run("game", i, ["confirmed", "disputed", "confirmed"][i % 3]!);
  db.exec("commit");
  const list = Array.from({ length: 5000 }, (_, i) => ({ game_id: 1 + i * 19, checked: null as number | null }));
  const out = await withChecked("games", list);
  assert.ok(out.some((g) => g.checked === 1) && out.some((g) => g.checked === -1));
  assert.equal(sizes.length, 5);
  assert.ok(biggest() < 250_000, `largest answer ${biggest()} bytes`);
  assert.ok(biggest() < TURSO_ANSWER_BUDGET);
});

test("provenance and totals are counts that stay far under the budget", async () => {
  db.exec("drop table if exists api_provenance; create table api_provenance (kind text, league text, source text, checked_by text, outcome text, n integer)");
  const ins = db.prepare("insert into api_provenance values (?, ?, ?, ?, ?, ?)");
  // Today: 158 rows. This is 2,880, eighteen times that.
  for (const kind of ["game", "team_season", "season", "person"])
    for (let l = 0; l < 30; l++) for (let s = 0; s < 8; s++) for (const o of ["confirmed", "disputed", "single"]) ins.run(kind, `league${l}`, `source${s}`, `checker${s}`, o, 1 + rnd(100000));
  db.exec("drop table if exists api_totals; create table api_totals (id integer, lines integer, confirmed integer, issues integer); insert into api_totals values (1, 100, 98000, 51000)");
  assert.ok((await tursoProvenance()).length > 2000);
  assert.deepEqual(await tursoTotals(), { lines: 100, confirmed: 98000, issues: 51000 });
  assert.ok(biggest() < TURSO_ANSWER_BUDGET, `largest answer ${biggest()} bytes`);
});

test("the live scores of one league and day stay small", async () => {
  db.exec(
    "drop table if exists live_score; create table live_score (league text, game_date text, game_id integer, status text, home_score integer, away_score integer, overtime integer, period text, disputed integer, ready integer, n_sources integer, n_agree integer, confirm_agree integer, confirm_differ integer, sources text, fetched_at text)",
  );
  const ins = db.prepare("insert into live_score values ('mlb', '2026-10-29', ?, 'in_progress', 1, 2, 0, 'Top 5', 0, 1, 2, 2, 0, 0, ?, '2026-10-29T20:00:00Z')");
  const sources = JSON.stringify([{ s: "wikipedia", h: 1, a: 2, at: "2026-10-29T20:00:00Z" }, { s: "yahoo", h: 1, a: 2, at: "2026-10-29T20:01:00Z" }]);
  for (let i = 0; i < 400; i++) ins.run(i, sources);
  const answer = await getLiveScores("mlb", "2026-10-29", "2026-10-29");
  assert.equal(answer.rows.length, 400);
  assert.ok(biggest() < TURSO_ANSWER_BUDGET);
});

// ---------------------------------------------------------------------------------------------------------------- call sites

const SRC = new URL("../src/", import.meta.url).pathname;
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = `${dir}${n}`;
    return statSync(p).isDirectory() ? walk(`${p}/`) : /\.tsx?$/.test(n) ? [p] : [];
  });

/**
 * Every file that sends a query to Turso, why one answer of it cannot reach the budget, and a pattern that must stay in the file for that to remain
 * true. A new reader is not in this list, so this test fails until its bound is written down here (and, where node can load it, tested above).
 * The largest answers measured on DS1's rows on 2026-10-29 (bytes as Turso would send them) are in the hand-off of ticket SPX-764.
 */
const BOUNDS: Record<string, { why: string; keeps: RegExp }> = {
  "lib/turso/aggregates.ts": { why: "totals: one row; quality: check lines plus the QUALITY_ISSUES_SHOWN top issues; provenance: one row per league, source and outcome (158 rows)", keeps: /QUALITY_CHECKS_SQL, QUALITY_ISSUES_SQL/ },
  "lib/turso/checked.ts": { why: "at most CHUNK (1,000) entity ids a query", keeps: /const CHUNK = 1000;/ },
  "lib/turso/live.ts": { why: "one league and one day of live rows", keeps: /where league = \? and game_date = \?/ },
  "lib/gameField.ts": { why: "one game and one kind: one row, 2.5 KB at most on 97,631 rows", keeps: /where game_id = \? and kind = \?/ },
  "lib/playerSprayData.ts": { why: "one person's seasons: 69 rows and 34 KB at most on 9,310 players", keeps: /where person_id = \?/ },
  "lib/adminPeople.ts": { why: "never cached (live); a page of PEOPLE_PER_PAGE (100) rows, a count, a group-by on country or letter, or 10 suggestions", keeps: /live: true/ },
  "lib/runlog/client.ts": { why: "never cached (live); a page of PAGE_SIZE runs, at most 2,000 run lines without detail, one run's items, 200 alerts", keeps: /LIVE = \{ live: true \}/ },
  "app/api/admin/live/[id]/route.ts": { why: "never cached (live); one request row by id", keeps: /where id = \?/ },
};

test("every file that reads Turso is listed with the reason its answers stay small", () => {
  const readers = walk(SRC)
    .filter((p) => /\btursoQuery\(|\btursoRows\(/.test(readFileSync(p, "utf8")))
    .map((p) => p.slice(SRC.length))
    .filter((p) => p !== "lib/turso/client.ts")
    .sort();
  assert.deepEqual(readers, Object.keys(BOUNDS).sort(), "a new Turso reader needs an entry in BOUNDS (and its answer measured)");
  for (const [file, { keeps }] of Object.entries(BOUNDS)) assert.match(readFileSync(`${SRC}${file}`, "utf8"), keeps, `${file} no longer has what bounds its answer`);
});

test("a cached query is never an unbounded select of a table", () => {
  const offenders: string[] = [];
  for (const p of walk(SRC)) {
    const text = readFileSync(p, "utf8");
    for (const m of text.matchAll(/(?:tursoQuery|tursoRows)\(\s*([`"])((?:select|SELECT)[^`"]*)\1/g)) {
      const sql = m[2]!;
      if (/\bwhere\b|\blimit\b|\bcount\(|\bmin\(|\bmax\(/i.test(sql)) continue;
      offenders.push(`${p.slice(SRC.length)}: ${sql.slice(0, 80)}`);
    }
  }
  // api_provenance is the one whole-table read: a count per league, source and outcome, 158 rows.
  assert.deepEqual(offenders.filter((o) => !/from api_provenance/.test(o)), []);
});
