import assert from "node:assert/strict";
import { test } from "node:test";
import { positionCode, positionCodes, positionNames, positionsShort, type PositionRow } from "../src/lib/positions.ts";

/** Run in web/: pnpm test:positions */
const row = (league: string, code: string, name_en: string, name_fr: string, name_ja: string): PositionRow => ({ league, code, sort: 1, group: "x", name_en, name_fr, name_ja });
const list = [
  row("nhl", "C", "Centre", "Centre", "センター"),
  row("mlb", "C", "Catcher", "Receveur", "捕手"),
  row("mlb", "P", "Pitcher", "Lanceur", "投手"),
  row("mlb", "DH", "Designated hitter", "Frappeur désigné", "指名打者"),
  row("nhl", "LW", "Left wing", "Ailier gauche", "左ウイング"),
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
  assert.equal(positionsShort(["P", "DH", "OF"], "P"), "P / DH / OF");
  assert.equal(positionsShort(null, null), "");
});

test("names come from the league's own list, in the reader's language", () => {
  assert.equal(positionNames(["C"], "nhl", list, "en"), "Centre");
  assert.equal(positionNames(["C"], "mlb", list, "en"), "Catcher");
  assert.equal(positionNames(["P", "DH"], "mlb", list, "fr"), "Lanceur / Frappeur désigné");
  assert.equal(positionNames(["LW"], "nhl", list, "ja"), "左ウイング");
});

test("a code the league lacks is looked up elsewhere, and one nobody holds is shown as it is", () => {
  assert.equal(positionNames(["DH"], "nhl", list, "en"), "Designated hitter");
  assert.equal(positionNames(["ZZ"], "nhl", list, "en"), "ZZ");
  assert.equal(positionNames(["C"], null, list, "en"), "Centre");
});
