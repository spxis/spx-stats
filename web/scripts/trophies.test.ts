import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { GENERATED, GENERATED_MEDALS, medalMarkup, trophyMarkup } from "./trophyMarkup.ts";
import { medalSvg } from "../src/lib/medals.ts";
import { trophySvg } from "../src/lib/trophies.ts";

/** Run in web/: pnpm test:trophies. If it fails, run: pnpm trophies */
test("trophies.generated.ts and medals.generated.ts match the pinned @johnmorrisdotca/dougu-sports (rerun pnpm trophies after a bump)", () => {
  assert.equal(readFileSync(GENERATED, "utf8"), trophyMarkup());
  assert.equal(readFileSync(GENERATED_MEDALS, "utf8"), medalMarkup());
});

test("every league has a titled trophy and places 1 to 3 a medal", () => {
  for (const [lg, name] of [["nhl", "Stanley Cup"], ["cfl", "Grey Cup"], ["worldcup", "World Cup"], ["mls", "MLS Cup"]]) {
    assert.match(trophySvg(lg), new RegExp(`<title>${name}</title>`));
  }
  assert.equal(trophySvg("unknown"), trophySvg("nhl"));
  for (const p of [1, 2, 3]) assert.match(medalSvg(p), /^<svg /);
  assert.equal(medalSvg(4), "");
});
