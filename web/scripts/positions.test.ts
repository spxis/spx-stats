import assert from "node:assert/strict";
import { test } from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  keyGroups, positionCode, positionCodes, positionName, positionNames, positionsShort, POSITION_SEP, POSITIONS_KEY_ID, resolveLeague, SOCCER_POSITIONS,
  type PositionRow,
} from "../src/lib/positions.ts";

/** Run in web/: pnpm test:positions */
const row = (league: string, code: string, name_en: string, name_fr: string, name_ja: string): PositionRow => ({ league, code, sort: 1, group: "x", name_en, name_fr, name_ja });
const list = [
  row("nhl", "C", "Centre", "Centre", "センター"),
  row("mlb", "C", "Catcher", "Receveur", "捕手"),
  row("mlb", "P", "Pitcher", "Lanceur", "投手"),
  row("mlb", "DH", "Designated hitter", "Frappeur désigné", "指名打者"),
  row("nhl", "LW", "Left wing", "Ailier gauche", "左ウイング"),
  row("nhl", "RW", "Right wing", "Ailier droit", "右ウイング"),
  row("nhl", "F", "Forward", "Attaquant", "フォワード"),
];

test("a code stays a code, upper case", () => {
  assert.equal(positionCode("LW"), "LW");
  assert.equal(positionCode("lw"), "LW");
  assert.equal(positionCode("1B"), "1B");
  assert.equal(positionCode("G-F"), "G-F");
});

test("an older word becomes its code, so old addresses keep working", () => {
  assert.equal(positionCode("Defenseman"), "D");
  assert.equal(positionCode("left winger"), "LW");
  assert.equal(positionCode("Goaltender"), "G");
  assert.equal(positionCode("starting pitcher"), "P");
  assert.equal(positionCode("L"), "LW");
  assert.equal(positionCode("R"), "RW");
});

test("the football group and special codes LN and LS are codes, and their words map to them (L stays the older word for LW)", () => {
  assert.equal(positionCode("LN"), "LN");
  assert.equal(positionCode("ls"), "LS");
  assert.equal(positionCode("Lineman"), "LN");
  assert.equal(positionCode("long snapper"), "LS");
  assert.equal(positionCode("L"), "LW");
  assert.equal(positionsShort(["LN", "LS"], "LN"), "LN/LS");
  const fb = [row("nfl", "LN", "Lineman", "Lineman", "Lineman"), row("cfl", "LS", "Long snapper", "Long snapper", "Long snapper")];
  assert.equal(positionNames(["LN"], "nfl", fb, "en"), "Lineman");
  assert.equal(positionNames(["LS"], "cfl", fb, "ja"), "Long snapper");
  assert.equal(resolveLeague("LS", ["cfl"], fb), "cfl");
});

test("text that is neither a code nor a known word is not a code", () => {
  assert.equal(positionCode("winger"), null);
  assert.equal(positionCode(""), null);
  assert.equal(positionCode(null), null);
  assert.equal(positionCode("Home Run"), null);
});

test("a person's codes: the list when there is one, else the main position, each once", () => {
  assert.deepEqual(positionCodes(["P", "DH", "P"], "P"), ["P", "DH"]);
  assert.deepEqual(positionCodes(null, "C"), ["C"]);
  assert.deepEqual(positionCodes([], null), []);
  assert.deepEqual(positionCodes(["left winger"], null), ["LW"]);
  assert.equal(positionsShort(["P", "DH", "OF"], "P"), "P/DH/OF");
  assert.equal(positionsShort(null, null), "");
});

test("names come from the league's own list, in the reader's language", () => {
  assert.equal(positionNames(["C"], "nhl", list, "en"), "Centre");
  assert.equal(positionNames(["C"], "mlb", list, "en"), "Catcher");
  assert.equal(positionNames(["P", "DH"], "mlb", list, "fr"), "Lanceur / Frappeur désigné");
  assert.equal(positionNames(["LW"], "nhl", list, "ja"), "左ウイング");
  assert.equal(positionNames(["LW", "RW"], "nhl", list, "en"), "Left wing / Right wing");
  assert.equal(positionNames(["F"], "nhl", list, "fr"), "Attaquant");
});

test("a code the league lacks is looked up elsewhere, and one nobody holds is shown as it is", () => {
  assert.equal(positionNames(["DH"], "nhl", list, "en"), "Designated hitter");
  assert.equal(positionNames(["ZZ"], "nhl", list, "en"), "ZZ");
  assert.equal(positionNames(["C"], null, list, "en"), "Centre");
});

// the lookup behind the hover names and the key

const full: PositionRow[] = [
  { ...row("nhl", "C", "Centre", "Centre", "センター"), sort: 1 },
  { ...row("nhl", "G", "Goaltender", "Gardien de but", "ゴールテンダー"), sort: 6 },
  { ...row("nba", "C", "Center", "Pivot", "センター"), sort: 5 },
  { ...row("nba", "G", "Guard", "Garde", "ガード"), sort: 6 },
  { ...row("mlb", "C", "Catcher", "Receveur", "捕手"), sort: 2 },
  { ...row("mlb", "P", "Pitcher", "Lanceur", "投手"), sort: 1 },
  { ...row("nfl", "G", "Guard", "Garde", "ガード"), sort: 7 },
  { ...row("nfl", "QB", "Quarterback", "Quart-arrière", "クォーターバック"), sort: 1 },
];

test("one separator, main position first, the order the database gives", () => {
  assert.equal(POSITION_SEP, "/");
  assert.equal(positionsShort(["RW", "LW"], "RW"), "RW/LW");
  assert.equal(positionsShort(["LW", "RW"], "LW"), "LW/RW");
  assert.equal(positionsShort(null, "d"), "D");
  assert.deepEqual(positionCodes(["RW", "LW"], "LW"), ["RW", "LW"]);
});

test("a code is explained by the league it is read in", () => {
  assert.equal(positionName("C", "nhl", full, "en"), "Centre");
  assert.equal(positionName("C", "mlb", full, "fr"), "Receveur");
  assert.equal(positionName("C", "nba", full, "ja"), "センター");
  assert.equal(positionName("C", "nfl", full, "en"), null, "the NFL list in this fixture lacks C");
  assert.equal(positionName("GK", "soccer", full, "en"), "Goalkeeper", "soccer names live in the site, not api.position");
  assert.equal(positionName("GK", "soccer", full, "fr"), "Gardien de but");
});

test("the league that explains a code: the page's own first, then any that holds it, else none", () => {
  assert.equal(resolveLeague("C", ["mlb", "nhl"], full), "mlb");
  assert.equal(resolveLeague("C", ["nfl", "nhl"], full), "nhl", "the first league that has the code");
  assert.equal(resolveLeague("QB", ["nhl"], full), "nfl", "none of his leagues has it: the one that does");
  assert.equal(resolveLeague("ZZ", ["nhl"], full), null);
  assert.equal(resolveLeague("GK", ["soccer"], full), "soccer");
});

test("a one-league page gets one group, in the list's own order, each code once", () => {
  const groups = keyGroups([
    { league: "nhl", code: "G" }, { league: "nhl", code: "C" }, { league: "nhl", code: "G" },
  ], full, "en");
  assert.deepEqual(groups, [{ league: "nhl", items: [{ code: "C", name: "Centre" }, { code: "G", name: "Goaltender" }] }]);
});

test("colliding codes on a multi-league page are each explained under their league", () => {
  const groups = keyGroups([
    { league: "mlb", code: "C" }, { league: "nhl", code: "C" }, { league: "nba", code: "C" }, { league: "nfl", code: "G" }, { league: "nba", code: "G" }, { league: "soccer", code: "GK" },
  ], full, "en");
  assert.deepEqual(groups.map((g) => g.league), ["nhl", "nba", "mlb", "nfl", "soccer"], "a fixed league order, not the order the page met them");
  assert.deepEqual(groups.find((g) => g.league === "nhl")?.items, [{ code: "C", name: "Centre" }]);
  assert.deepEqual(groups.find((g) => g.league === "mlb")?.items, [{ code: "C", name: "Catcher" }]);
  assert.deepEqual(groups.find((g) => g.league === "nba")?.items, [{ code: "C", name: "Center" }, { code: "G", name: "Guard" }]);
  assert.deepEqual(groups.find((g) => g.league === "nfl")?.items, [{ code: "G", name: "Guard" }]);
  assert.deepEqual(groups.find((g) => g.league === "soccer")?.items, [{ code: "GK", name: "Goalkeeper" }]);
});

test("the key speaks the reader's language, and leaves out a code nobody can explain", () => {
  const uses = [{ league: "mlb", code: "P" }, { league: "mlb", code: "ZZ" }, { league: null, code: "C" }];
  assert.deepEqual(keyGroups(uses, full, "fr"), [{ league: "mlb", items: [{ code: "P", name: "Lanceur" }] }]);
  assert.deepEqual(keyGroups(uses, full, "ja"), [{ league: "mlb", items: [{ code: "P", name: "投手" }] }]);
  assert.deepEqual(keyGroups([], full, "en"), []);
  assert.deepEqual(keyGroups([{ league: "nhl", code: "C" }], [], "en"), [], "no list read: no key, the codes stay bare");
});

test("every soccer code has a name in each language", () => {
  const codes = new Set<string>();
  for (const r of SOCCER_POSITIONS) {
    assert.equal(r.league, "soccer");
    assert.ok(r.name_en && r.name_fr && r.name_ja, r.code);
    assert.ok(!codes.has(r.code), `${r.code} twice`);
    codes.add(r.code);
  }
  for (const c of ["GK", "DF", "MF", "FW", "CB", "LB", "RB", "CM", "CF", "RW", "LW", "LF", "RF", "AM", "RM", "LM", "DM", "SS"]) assert.ok(codes.has(c), c);
});

// the source scan: nothing draws a position by hand

const SRC = join(import.meta.dirname, "..", "src");
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    return e.isDirectory() ? sources(p) : /\.(ts|tsx)$/.test(e.name) ? [p] : [];
  });
}
const files = sources(SRC).map((p) => ({ path: p.slice(SRC.length + 1), text: readFileSync(p, "utf8") }));
const lines = files.flatMap((f) => f.text.split("\n").map((text, i) => ({ path: f.path, n: i + 1, text })));
const show = (ls: { path: string; n: number; text: string }[]) => ls.map((l) => `${l.path}:${l.n} ${l.text.trim()}`);

test("scan: no position list is joined by hand, only with the one separator", () => {
  // lib/positions.ts owns the separator; every other file takes a list from positionsShort/positionsText or draws a PositionList
  const handJoin = /(positions?|allPos|\bpos\b)[^;\n]*\.join\((" \/ "|"\/"|" \/"|"\/ "|' \/ '|'\/')\)/i;
  const bad = lines.filter((l) => l.path !== "lib/positions.ts" && handJoin.test(l.text) && !/leagues|\blg\b/.test(l.text));
  assert.deepEqual(show(bad), []);
});

test("scan: a position column draws PositionCode (through the page's position book), not a bare string", () => {
  // europe.col.pos is a club's place in a league table, not a player's position
  const cols = lines.filter((l) => /\bkey:\s*"(pos|position)"/.test(l.text) && /get:/.test(l.text) && !/europe\.col\.pos/.test(l.text));
  assert.ok(cols.length >= 3, "the players list, the roster and the World Cup player page have one each");
  // The players list draws its cells in the browser (components/PlayersTable.tsx) from names the page took from the book, which notes the codes for the key.
  assert.deepEqual(show(cols.filter((l) => !/cell:[^\n]*(book\.(list|code)\(|<PositionList )/.test(l.text))), []);
});

test("scan: a soccer position code is drawn through the book, in every file that renders one", () => {
  const bare = lines.filter((l) => l.path.endsWith(".tsx") && /position_code/.test(l.text) && !/book\.code\(/.test(l.text));
  assert.deepEqual(show(bare), []);
});

test("scan: the code links to the key, upper case, and the key carries the id it links to", () => {
  const code = files.find((f) => f.path === "components/PositionCode.tsx")?.text ?? "";
  assert.match(code, /toUpperCase\(\)/);
  assert.match(code, /href=\{`#\$\{POSITIONS_KEY_ID\}`\}/);
  assert.match(code, /title=\{name\}/);
  assert.match(code, /aria-label=/);
  assert.match(code, /POSITION_SEP/);
  const key = files.find((f) => f.path === "components/PositionKey.tsx")?.text ?? "";
  assert.match(key, /id=\{POSITIONS_KEY_ID\}/);
  assert.equal(POSITIONS_KEY_ID, "positions-key");
});

test("scan: every page that draws a position list also draws the key", () => {
  const users = files.filter((f) => /\bbook\.(list|code|name)\(/i.test(f.text) && f.path.endsWith("page.tsx"));
  assert.ok(users.length >= 4, "players, player, World Cup year, match and player pages");
  const lacking = users.filter((f) => !/\b(book|pickBook)\.key\(\)/.test(f.text));
  assert.deepEqual(lacking.map((f) => f.path), []);
  const team = files.find((f) => f.path === "app/[locale]/q/[league]/[year]/team/[franchise]/page.tsx")?.text ?? "";
  assert.match(team, /<TeamPositionsKey /);
});
