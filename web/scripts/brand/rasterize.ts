/**
 * Draws the PNGs the site's head needs from the SVGs in public/brand (run extractBrand.ts first):
 *   public/favicon.ico (16, 32 and 48 px PNGs in one ICO), brand/apple-touch-icon.png (180),
 *   brand/icon-192.png, icon-512.png, icon-maskable-512.png (the shield on white, inside the maskable safe circle),
 *   brand/og.png (1200 x 630, the spxn.com lockup).
 *
 *   node scripts/brand/rasterize.ts
 *
 * Needs Chromium or Chrome for playwright-core (no new dependency). The marks are SPXIS's, © SportsInteractive.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, type Browser } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, "../../public");
const brand = join(pub, "brand");
mkdirSync(brand, { recursive: true });
const uri = (name: string) => `data:image/svg+xml;base64,${readFileSync(join(brand, name)).toString("base64")}`;

const SHIELD = 234.5 / 254.4; // width over height of shield-icon.svg
const NAVY = "#00274c";

let browser: Browser;
try {
  browser = await chromium.launch({ channel: "chrome" });
} catch {
  browser = await chromium.launch();
}

/** A square or wide page of `w` x `h` px: `html` drawn on `bg` (null: transparent), shot as PNG. */
async function shot(w: number, h: number, bg: string | null, html: string): Promise<Buffer> {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await page.setContent(`<body style="margin:0;width:${w}px;height:${h}px;background:${bg ?? "transparent"};display:flex;align-items:center;justify-content:center;overflow:hidden">${html}</body>`);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
  const png = await page.screenshot({ omitBackground: bg === null, type: "png" });
  await page.close();
  return png;
}

const shield = (hPx: number) => `<img src="${uri("shield-icon.svg")}" style="height:${hPx}px;width:${Math.round(hPx * SHIELD)}px">`;

const files: Record<string, Buffer> = {};
files["brand/apple-touch-icon.png"] = await shot(180, 180, "#ffffff", shield(150));
files["brand/icon-192.png"] = await shot(192, 192, null, shield(184));
files["brand/icon-512.png"] = await shot(512, 512, null, shield(494));
files["brand/icon-maskable-512.png"] = await shot(512, 512, "#ffffff", shield(318));
files["brand/og.png"] = await shot(
  1200, 630, "#ffffff",
  `<img src="${uri("spxn-lockup.svg")}" style="width:960px"><div style="position:absolute;left:0;right:0;bottom:0;height:22px;background:${NAVY}"></div>`,
);
const ico = [16, 32, 48];
const icoPngs = await Promise.all(ico.map((s) => shot(s, s, null, shield(s))));

// ICO container: a header, one 16-byte entry per image, then the PNGs themselves (every browser reads PNG-in-ICO).
const head = Buffer.alloc(6 + 16 * ico.length);
head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(ico.length, 4);
let offset = head.length;
ico.forEach((s, n) => {
  const at = 6 + 16 * n;
  head.writeUInt8(s, at); head.writeUInt8(s, at + 1); head.writeUInt8(0, at + 2); head.writeUInt8(0, at + 3);
  head.writeUInt16LE(1, at + 4); head.writeUInt16LE(32, at + 6);
  head.writeUInt32LE(icoPngs[n].length, at + 8); head.writeUInt32LE(offset, at + 12);
  offset += icoPngs[n].length;
});
writeFileSync(join(pub, "favicon.ico"), Buffer.concat([head, ...icoPngs]));
console.log(`favicon.ico  ${offset} bytes`);
for (const [name, buf] of Object.entries(files)) {
  writeFileSync(join(pub, name), buf);
  console.log(`${name}  ${buf.length} bytes`);
}
await browser.close();
