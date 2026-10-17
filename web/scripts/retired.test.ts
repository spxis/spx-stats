import assert from "node:assert/strict";
import { test } from "node:test";
import { jerseyCut } from "../src/lib/jerseyCut.ts";
import { retiredBannerSvg } from "../src/lib/jerseyBanner.ts";

/** Run in web/: pnpm test:retired (needs the react-server condition; jerseyBanner.ts is server-only). */

test("each league gets the cut of its sport", () => {
  assert.equal(jerseyCut("nhl"), "hockey");
  assert.equal(jerseyCut("pwhl"), "hockey");
  assert.equal(jerseyCut("nba"), "basketball");
  assert.equal(jerseyCut("mlb"), "baseball");
  assert.equal(jerseyCut("nfl"), "football");
  assert.equal(jerseyCut("cfl"), "football");
  assert.equal(jerseyCut("unknown"), "hockey");
});

test("retired banners draw Gretzky 99, Lemieux 66 and Bure 10 from the package", () => {
  const gretzky = retiredBannerSvg({ league: "nhl", number: 99, name: "Gretzky", years: "1999", primaryHex: "FF4C00", secondaryHex: "041E42" });
  const lemieux = retiredBannerSvg({ league: "nhl", number: 66, name: "Lemieux", years: "1997", primaryHex: "000000", secondaryHex: "CFC493" });
  const bure = retiredBannerSvg({ league: "nhl", number: 10, name: "Bure", years: "2013", primaryHex: "00205B", secondaryHex: "00843D" });
  assert.match(gretzky, /^<svg /);
  assert.match(lemieux, /^<svg /);
  assert.match(bure, /^<svg /);
  assert.match(gretzky, /99/);
  assert.match(lemieux, /66/);
  assert.match(bure, /10/);
  assert.match(gretzky, /GRETZKY/);
  assert.match(lemieux, /LEMIEUX/);
  assert.match(bure, /BURE/);
});
