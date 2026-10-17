import assert from "node:assert/strict";
import { test } from "node:test";
import { jerseyCut } from "../src/lib/jerseyCut.ts";
import { retiredBannerSvg } from "../src/lib/jerseyBanner.ts";
import { logoPayload } from "../src/lib/embedLogo.ts";
import { lastNameOf } from "../src/lib/lastName.ts";
import { championshipYear } from "../src/lib/leagues.ts";
import { clubWord, honourOf, titleBannerSvg } from "../src/lib/titleBanner.ts";

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

test("a caption takes the last name only, and does not invent one from a league-wide label", () => {
  assert.equal(lastNameOf("Wayne Gretzky"), "Gretzky");
  assert.equal(lastNameOf("Pierre Pilote"), "Pilote");
  assert.equal(lastNameOf("Ken Griffey Jr."), "Griffey");
  assert.equal(lastNameOf("Gretzky"), "Gretzky");
  assert.equal(lastNameOf("League-wide"), "League-wide");
});

test("retired banners draw Gretzky 99, Lemieux 66 and Bure 10 from the package", () => {
  const gretzky = retiredBannerSvg({ league: "nhl", number: 99, name: "Wayne Gretzky", years: "1999", primaryHex: "FF4C00", secondaryHex: "041E42" });
  const lemieux = retiredBannerSvg({ league: "nhl", number: 66, name: "Mario Lemieux", years: "1997", primaryHex: "000000", secondaryHex: "CFC493" });
  const bure = retiredBannerSvg({ league: "nhl", number: 10, name: "Pavel Bure", years: "2013", primaryHex: "00205B", secondaryHex: "00843D" });
  assert.match(gretzky, /^<svg /);
  assert.match(lemieux, /^<svg /);
  assert.match(bure, /^<svg /);
  assert.match(gretzky, /99/);
  assert.match(lemieux, /66/);
  assert.match(bure, /10/);
  assert.match(gretzky, /GRETZKY/);
  assert.doesNotMatch(gretzky, /WAYNE/);
  assert.match(lemieux, /LEMIEUX/);
  assert.match(bure, /BURE/);
});

test("a hanging banner is last name and number with no years, and takes a caller logo", () => {
  const mark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3" fill="#fff"/></svg>`;
  const hanging = retiredBannerSvg({
    league: "nhl",
    number: 99,
    name: "Wayne Gretzky",
    years: "1999",
    primaryHex: "041E42",
    secondaryHex: "FF4C00",
    kind: "hanging",
    logo: mark,
  });
  assert.match(hanging, /^<svg /);
  assert.match(hanging, /99/);
  assert.match(hanging, /GRETZKY/);
  assert.doesNotMatch(hanging, /1999/);
  assert.match(hanging, /<image href="data:image\/svg\+xml/);
});

test("a Wikimedia svg.png thumb is a PNG data URI, not parsed as SVG", () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...Array(40).fill(1)]);
  const out = logoPayload(png, "image/png");
  assert.ok(out?.startsWith("data:image/png;base64,"));
  const svg = logoPayload(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"></svg>`), "image/svg+xml");
  assert.match(svg ?? "", /^<svg /);
});

test("a split-year season prints the year the title was won", () => {
  assert.equal(championshipYear("nhl", 1983), 1984);
  assert.equal(championshipYear("nba", 1995), 1996);
  assert.equal(championshipYear("nfl", 1963), 1963);
  assert.equal(championshipYear("mlb", 1993), 1993);
});

test("clubWord strips the city from the team name", () => {
  assert.deepEqual(clubWord("Edmonton Oilers", "Edmonton"), { city: "Edmonton", club: "Oilers" });
  assert.deepEqual(clubWord("Toronto Maple Leafs", "Toronto"), { city: "Toronto", club: "Maple Leafs" });
  assert.deepEqual(clubWord("Chicago Blackhawks", null), { city: undefined, club: "Blackhawks" });
});

test("a title pennant and garden flag draw honour and years, no jersey number", () => {
  const pennant = titleBannerSvg({ league: "nhl", years: [1984, 1985, 1987, 1988, 1990], team: "Edmonton Oilers", city: "Edmonton", kind: "pennant", primaryHex: "041E42", secondaryHex: "FF4C00" });
  const garden = titleBannerSvg({ league: "nhl", years: [1984, 1985, 1987, 1988, 1990], team: "Edmonton Oilers", city: "Edmonton", kind: "garden", primaryHex: "041E42", secondaryHex: "FF4C00" });
  assert.match(pennant, /^<svg /);
  assert.match(garden, /^<svg /);
  assert.match(pennant, /STANLEY CUP/);
  assert.match(garden, /EDMONTON, OILERS/);
  assert.doesNotMatch(pennant, /\bNHL\b/);
  assert.deepEqual(honourOf("nhl", [1984]), ["STANLEY CUP", "CHAMPIONS"]);
  assert.deepEqual(honourOf("nfl", [1963]), ["NFL", "CHAMPIONS"]);
});
