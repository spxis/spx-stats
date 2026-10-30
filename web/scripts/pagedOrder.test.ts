import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { test } from "node:test";
import ts from "typescript";
import { UNIQUE_KEYS, hasOrder, hasUniqueOrder, orderColumns, withUniqueOrder } from "../src/lib/api/pagedOrder.ts";

/** Run in web/: pnpm test:pagedorder */
const SRC = join(import.meta.dirname, "..", "src");
const MIGRATIONS = join(import.meta.dirname, "..", "..", "db", "migrations");
const rel = (f: string) => relative(join(SRC, ".."), f).split(sep).join("/");

const walk = (d: string): string[] => readdirSync(d).flatMap((n) => {
  const p = join(d, n);
  return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(n) ? [p] : [];
});

/** Reads of a function under `rpc/`: each answers well under one page (a list of letters, of countries, the clubs of one day), so none is paged. */
const SINGLE_PAGE_RPC = new Set(["rpc/standings_as_of", "rpc/player_countries", "rpc/player_letters"]);

/**
 * Files whose reads take the view from a variable, with the views they can name. Every one must be listed in UNIQUE_KEYS. readSpan asks
 * for one row (the smallest or largest season) of a list view, so its order is the one it asks for.
 */
const DYNAMIC: Record<string, string[]> = {
  // wrappers of rows that turn a missing view (404) into no rows: they pass the view through, and their callers are the calls checked
  "src/lib/allStar.ts": [],
  "src/lib/soccer.ts": [],
  "src/lib/api/teamSeasons.ts": ["team_season_index", "team_seasons", "standing_index", "standings"],
  "src/lib/listSpan.ts": ["team_index", "player_index"],
  "src/lib/playerIndex.ts": ["player_index", "player_search", "player_team_search"],
};

/** Wrappers of rows that take only the query: the view they read is fixed. */
const QUERY_ONLY_WRAPPERS: Record<string, string> = { "src/lib/affiliation.ts": "team_season_affiliation" };

interface Call { file: string; line: number; fn: string; view: string | null; query: string | null }

/**
 * Every call of rows, rowsSlice, rowsWindow and rowsCsv imported from the api client (under any local name), and of the wrappers around them: a
 * function named rows that a file declares itself, and the rows that lib/soccer.ts exports.
 */
function calls(): Call[] {
  const out: Call[] = [];
  for (const f of walk(SRC)) {
    const text = readFileSync(f, "utf8");
    if (!/\brows(Slice|Window|Csv)?\b/.test(text)) continue;
    const sf = ts.createSourceFile(f, text, ts.ScriptTarget.Latest, true);
    const local = new Map<string, string>();
    for (const st of sf.statements) {
      if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
      const from = st.moduleSpecifier.text;
      if (from === "./soccer") for (const el of st.importClause?.namedBindings && ts.isNamedImports(st.importClause.namedBindings) ? st.importClause.namedBindings.elements : []) if ((el.propertyName ?? el.name).text === "rows") local.set(el.name.text, "rows");
      const isClient = /(^|\/)api\/client$/.test(from) || (from === "./client" && f.includes(`${sep}lib${sep}api${sep}`));
      const bindings = st.importClause?.namedBindings;
      if (!isClient || !bindings || !ts.isNamedImports(bindings)) continue;
      for (const el of bindings.elements) {
        const name = (el.propertyName ?? el.name).text;
        if (name === "rows" || name === "rowsSlice" || name === "rowsWindow" || name === "rowsCsv") local.set(el.name.text, name);
      }
    }
    if (sf.statements.some((st) => ts.isFunctionDeclaration(st) && st.name?.text === "rows")) local.set("rows", "rows");
    if (!local.size) continue;
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && local.has(n.expression.text)) {
        const a = n.arguments[0];
        const q = n.arguments[1];
        out.push({
          file: rel(f), line: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1, fn: local.get(n.expression.text)!,
          view: QUERY_ONLY_WRAPPERS[rel(f)] ?? (a && (ts.isStringLiteral(a) || ts.isNoSubstitutionTemplateLiteral(a)) ? a.text : null),
          query: q ? q.getText() : null,
        });
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return out;
}

test("withUniqueOrder ends the order with the view's key and leaves the order asked for as it is", () => {
  assert.deepEqual(UNIQUE_KEYS.team_season_staff, ["team_season_id", "ord"]);
  assert.equal(withUniqueOrder("team_season_staff", "league=eq.nhl&order=person_id,year"), "league=eq.nhl&order=person_id,year,team_season_id,ord");
  assert.equal(withUniqueOrder("team_season_staff", "league=eq.nhl&order=person_id.desc,ord.asc&select=*"), "league=eq.nhl&order=person_id.desc,ord.asc,team_season_id&select=*");
  assert.equal(withUniqueOrder("games", "league=eq.nhl&year=eq.2010&select=*&order=game_date,game_id"), "league=eq.nhl&year=eq.2010&select=*&order=game_date,game_id");
  assert.equal(withUniqueOrder("games", "league=eq.nhl&year=eq.2010&select=*"), "league=eq.nhl&year=eq.2010&select=*&order=game_id");
  assert.equal(withUniqueOrder("games", ""), "order=game_id");
  assert.equal(withUniqueOrder("franchise_names", "order=name_from.nullsfirst,league"), "order=name_from.nullsfirst,league,franchise_id,name_to,name");
});

test("a view that is not listed, and a function, are left as they are", () => {
  assert.equal(withUniqueOrder("rpc/player_letters", "p_by=last"), "p_by=last");
  assert.equal(withUniqueOrder("not_a_view", "select=*&order=a"), "select=*&order=a");
});

test("the columns of an order are read without their direction and null placement", () => {
  assert.deepEqual(orderColumns("a=b&order=year.desc,team.asc.nullslast,x"), ["year", "team", "x"]);
  assert.equal(orderColumns("select=*"), null);
  assert.equal(hasOrder("select=*"), false);
  assert.equal(hasOrder("order=a"), true);
  assert.equal(hasUniqueOrder("games", "order=game_id.desc"), true);
  assert.equal(hasUniqueOrder("games", "order=game_date"), false);
  assert.equal(hasUniqueOrder("games", "select=*"), false);
});

test("an order that already names every column of the key is not changed, whatever its direction or position", () => {
  for (const [view, key] of Object.entries(UNIQUE_KEYS)) {
    const q = `select=*&order=${[...key].reverse().map((c) => `${c}.desc`).join(",")}`;
    assert.equal(withUniqueOrder(view, q), q, view);
    assert.ok(hasUniqueOrder(view, withUniqueOrder(view, "select=*")), view);
  }
});

test("every view has a key of plain column names, each named once", () => {
  for (const [view, key] of Object.entries(UNIQUE_KEYS)) {
    assert.ok(key.length > 0, `${view}: empty key`);
    assert.equal(new Set(key).size, key.length, `${view}: a column twice`);
    for (const c of key) assert.match(c, /^[a-z][a-z0-9_]*$/, `${view}: ${c}`);
  }
});

test("every read of a view by rows, rowsSlice or rowsWindow names a view with a key in lib/api/pagedOrder.ts", () => {
  const found = calls();
  assert.ok(found.length > 100, `only ${found.length} calls found: the scan is broken`);
  const bad: string[] = [];
  for (const c of found) {
    const at = `${c.file}:${c.line} ${c.fn}`;
    if (c.view === null) {
      const views = DYNAMIC[c.file];
      if (!views) bad.push(`${at}: the view is not a literal. List the file's views in DYNAMIC in this test and give each a key in UNIQUE_KEYS`);
      continue;
    }
    if (c.view.startsWith("rpc/")) {
      if (!SINGLE_PAGE_RPC.has(c.view)) bad.push(`${at}: ${c.view} is a function; add it to SINGLE_PAGE_RPC only if its answer always fits in one page`);
      if (c.fn !== "rows") bad.push(`${at}: ${c.view} is read with ${c.fn}`);
      continue;
    }
    if (!UNIQUE_KEYS[c.view]) {
      bad.push(`${at}: view "${c.view}" has no key in UNIQUE_KEYS (web/src/lib/api/pagedOrder.ts). Add the columns that tell its rows apart, `
        + "from its migration (a unique index, or the group by or primary key it is built on); a read in pages loses or repeats rows without one");
    }
  }
  assert.deepEqual(bad, []);
});

test("the views that files read through a variable all have a key", () => {
  for (const [file, views] of Object.entries(DYNAMIC)) {
    assert.ok(statSync(join(SRC, "..", file)).isFile(), file);
    for (const v of views) assert.ok(UNIQUE_KEYS[v], `${file}: ${v} has no key in UNIQUE_KEYS`);
  }
});

test("only lib/api/client.ts reads the database in pages (a Range header); a new paged read goes through rows, rowsSlice or rowsWindow", () => {
  const others = walk(SRC).filter((f) => rel(f) !== "src/lib/api/client.ts" && /["']Range["']|\bRange:/.test(readFileSync(f, "utf8")));
  assert.deepEqual(others.map(rel), []);
});

test("a key lists every column of a unique index that migrations put on the view (a key that is wider than the index is still unique)", () => {
  const indexes = new Map<string, string[][]>();
  for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith(".sql"))) {
    const sql = readFileSync(join(MIGRATIONS, f), "utf8").replace(/--.*$/gm, "");
    for (const m of sql.matchAll(/create\s+unique\s+index\s+(?:if\s+not\s+exists\s+)?\w+\s+on\s+api\.(\w+?)(?:_new|_swap|_build)?\s*\(([^)]*)\)/gi)) {
      const cols = m[2].split(",").map((c) => c.trim().split(/\s+/)[0]);
      indexes.set(m[1], [...(indexes.get(m[1]) ?? []), cols]);
    }
  }
  assert.ok(indexes.size > 5, "no unique index found in the migrations: the scan is broken");
  const bad: string[] = [];
  for (const [view, list] of indexes) {
    const key = UNIQUE_KEYS[view];
    if (!key) continue;
    if (!list.some((cols) => cols.every((c) => key.includes(c)))) bad.push(`${view}: key (${key.join(", ")}) holds no unique index of the migrations (${list.map((c) => c.join("+")).join(" | ")})`);
  }
  assert.deepEqual(bad, []);
});
