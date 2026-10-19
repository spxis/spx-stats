import assert from "node:assert/strict";
import { test } from "node:test";
import { LOGO_TIERS, localLogo, logoHash, parseManifest, tierFor, type LogoManifest } from "../src/lib/logoFiles.ts";

/** Run in web/: pnpm test:logofiles. The site's own logo copies (docs/logos-serving.md): the pure naming code. scripts/logos/test_render_site.py checks the same vectors. */

// Shared with scripts/logos/test_render_site.py: the two hashes must agree or a file is never found.
const VECTORS: [string, string][] = [
  ["commons:Example_Logo.svg", "5765c0f5"],
  ["en:Toronto_Raptors_logo.svg", "083756ab"],
  ["sl:5044.gif", "fa9942bd"],
  ["commons:Montréal_Canadiens.svg", "ce96a89b"],
];

const COMMONS = (name: string, w = 250) => `https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/${name}/${w}px-${name}.png`;

test("logoHash matches the Python renderer", () => {
  for (const [key, hash] of VECTORS) assert.equal(logoHash(key), hash, key);
});

test("tierFor picks the smallest box that is not blurry, capped by what was rendered", () => {
  assert.deepEqual(LOGO_TIERS, [24, 48, 96]);
  assert.equal(tierFor(20, 96), 24);
  assert.equal(tierFor(27, 96), 24);
  assert.equal(tierFor(28, 96), 48);
  assert.equal(tierFor(40, 96), 48);
  assert.equal(tierFor(200, 96), 96);
  assert.equal(tierFor(200, 48), 48);
});

test("parseManifest never throws and falls back to empty", () => {
  for (const bad of [undefined, "", "not json", "null", '{"v":2,"files":{}}', '{"v":1}', '{"v":1,"files":3}']) assert.deepEqual(parseManifest(bad), { v: 1, files: {} }, String(bad));
  assert.deepEqual(parseManifest('{"v":1,"files":{"a":["b","svg",0]}}').files.a, ["b", "svg", 0]);
});

const M: LogoManifest = {
  v: 1,
  files: {
    [logoHash("commons:Example_Logo.svg")]: ["aaaaaa", "webp", 96],
    [logoHash("commons:Small.svg")]: ["bbbbbb", "webp", 24],
    [logoHash("commons:Plain.svg")]: ["cccccc", "svg", 0],
  },
};

test("localLogo gives a 1x and 2x file for a listed raster logo", () => {
  const h = logoHash("commons:Example_Logo.svg");
  // the thumbnail size in the address does not matter: the key is the file
  for (const url of [COMMONS("Example_Logo.svg", 120), COMMONS("Example_Logo.svg", 250)]) {
    assert.deepEqual(localLogo(url, 20, M), { src: `/team-logos/${h}-aaaaaa-24.webp`, srcSet: `/team-logos/${h}-aaaaaa-24.webp 1x, /team-logos/${h}-aaaaaa-48.webp 2x` });
  }
  assert.deepEqual(localLogo(COMMONS("Example_Logo.svg"), 96, M), { src: `/team-logos/${h}-aaaaaa-96.webp` });
});

test("localLogo never asks for a tier that was not rendered", () => {
  const h = logoHash("commons:Small.svg");
  assert.deepEqual(localLogo(COMMONS("Small.svg"), 96, M), { src: `/team-logos/${h}-bbbbbb-24.webp` });
});

test("a plain SVG has one file", () => {
  const h = logoHash("commons:Plain.svg");
  assert.deepEqual(localLogo(COMMONS("Plain.svg"), 40, M), { src: `/team-logos/${h}-cccccc.svg` });
});

test("an unlisted, empty or foreign address gets no copy", () => {
  assert.equal(localLogo(COMMONS("Unlisted.svg"), 20, M), null);
  assert.equal(localLogo(null, 20, M), null);
  assert.equal(localLogo(undefined, 20, M), null);
  assert.equal(localLogo("https://example.test/a.png", 20, M), null);
  assert.equal(localLogo(COMMONS("Example_Logo.svg"), 20, { v: 1, files: {} }), null);
});
