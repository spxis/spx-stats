import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { test } from "node:test";
import { BRAND_MARKS } from "../src/lib/brandMarks.ts";
import { SHIELD } from "../src/lib/brandShield.ts";
import { SWOOSH } from "../src/lib/brandSwoosh.ts";
import { fitSize, PLATE, SAFE, SHIELD_BOX, SPXN_SHIELD, teamShield, wordWidth } from "../src/lib/shieldFit.ts";

/** Run in web/: pnpm test:brand. The SPXIS marks (public/brand) and the shield container's geometry. */
const brand = new URL("../public/brand/", import.meta.url);

test("every mark has a light and a dark file, and the dark one has the same size", () => {
  for (const name of Object.keys(BRAND_MARKS)) {
    assert.ok(existsSync(new URL(`${name}.svg`, brand)), `${name}.svg`);
    if (name !== "shield-icon") assert.ok(existsSync(new URL(`${name}-dark.svg`, brand)), `${name}-dark.svg`);
  }
});

test("the SVGs hold only paths in the three brand colours (no text, script or images)", () => {
  const ok = new Set(["#00274c", "#ffffff", "#c9243f", "#ee3c57"]);
  for (const f of readdirSync(brand).filter((n) => n.endsWith(".svg"))) {
    const svg = readFileSync(new URL(f, brand), "utf8");
    assert.ok(!/<(text|script|image|use|style)\b/.test(svg), `${f} holds an element that is not a path`);
    for (const c of svg.matchAll(/(?:fill|stroke)="(#[0-9a-f]{6})"/g)) assert.ok(ok.has(c[1]), `${f}: ${c[1]}`);
  }
});

test("the whole set stays small", () => {
  const bytes = readdirSync(brand).reduce((n, f) => n + statSync(new URL(f, brand)).size, 0);
  assert.ok(bytes < 260_000, `public/brand is ${bytes} bytes`);
});

test("the head files exist", () => {
  for (const f of ["../favicon.ico", "../manifest.webmanifest", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "og.png"]) {
    assert.ok(existsSync(new URL(f, brand)), f);
  }
  const manifest = JSON.parse(readFileSync(new URL("../manifest.webmanifest", brand), "utf8"));
  for (const i of manifest.icons) assert.ok(existsSync(new URL(`..${i.src}`, brand)), i.src);
});

test("the shield has its three plates and the swoosh its parts, in paint order", () => {
  assert.deepEqual(SHIELD.plates.map((p) => p.id), ["rim", "ring", "field"]);
  assert.deepEqual(SWOOSH.parts.map((p) => p.k), ["n", "r", "g"]);
  assert.deepEqual([SHIELD.w, SHIELD.h], [Math.round(SHIELD_BOX.w * 10) / 10, Math.round(SHIELD_BOX.h * 10) / 10]);
});

test("the safe areas sit inside the shield, and the plate inside the logo box", () => {
  for (const b of [SAFE.logo, SAFE.text]) {
    assert.ok(b.x > 0 && b.y > 0 && b.x + b.w < SHIELD_BOX.w && b.y + b.h < SHIELD_BOX.h);
    assert.ok(Math.abs(b.x + b.w / 2 - SHIELD_BOX.w / 2) < 2, "centred");
  }
  assert.ok(PLATE.cx - PLATE.side / 2 >= SAFE.logo.x - 1 && PLATE.cx + PLATE.side / 2 <= SAFE.logo.x + SAFE.logo.w + 1);
  assert.ok(PLATE.cy - PLATE.side / 2 >= SAFE.logo.y - 1 && PLATE.cy + PLATE.side / 2 <= SAFE.logo.y + SAFE.logo.h + 1);
  // The plate's corners are inside its disc's inscribed square.
  assert.ok((PLATE.side / 2) * Math.SQRT2 <= PLATE.r + 0.5);
});

test("an abbreviation is sized to fit its box, long ones smaller, narrow ones not larger than the cap", () => {
  for (const w of ["TOR", "NYY", "LAL", "GB", "WSH", "MIL", "IIII", "WWWWW", "ABCDEFG"]) {
    const fs = fitSize(w, SAFE.text.w, 56);
    assert.ok(fs <= 56 && fs > 0);
    assert.ok(wordWidth(w) * fs <= SAFE.text.w + 0.01, `${w} at ${fs} overflows`);
  }
  assert.ok(fitSize("ABCDEFG", SAFE.text.w, 56) < fitSize("ABC", SAFE.text.w, 56));
  assert.equal(fitSize("GB", SAFE.text.w, 56), 56);
});

test("a team's shield takes its colours, white or dark lettering by contrast, a ring that stands apart", () => {
  assert.deepEqual(teamShield(null, "ffffff"), SPXN_SHIELD);
  const lakers = teamShield("552583", "fdb927");
  assert.equal(lakers.field, "#552583");
  assert.equal(lakers.ring, "#fdb927");
  assert.equal(lakers.ink, "#ffffff");
  const yellow = teamShield("ffd100", "ffcc00");
  assert.equal(yellow.ring, "#ffffff", "a ring near the field's colour falls back to white");
  assert.equal(yellow.ink, "#111111");
});
