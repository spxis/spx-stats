import { writeFileSync } from "node:fs";
import { drawKyogijo } from "@johnmorrisdotca/kyogijo";

/**
 * The stylesheet every kyogijo drawing carries when it is drawn with `style: "embed"`, taken from a drawing so it is exactly what the installed
 * version writes. The game drawings leave it out and the page loads it once (src/components/kyogijo.css). Run in web/ after changing the package's
 * version: `node scripts/kyogijoCss.ts` rewrites the file; `pnpm test:surface` fails while the file and the package disagree.
 */
export const HEADER = "/* The stylesheet of @johnmorrisdotca/kyogijo's drawings, written by scripts/kyogijoCss.ts: do not edit by hand. The game drawings are made with style: \"none\". */\n";

export function kyogijoCss(): string {
  const svg = drawKyogijo({ sport: "nhl", away: { name: "A", score: 1 }, home: { name: "B", score: 2 }, status: "final" });
  const css = /<style>([\s\S]*?)<\/style>/.exec(svg)?.[1];
  if (!css) throw new Error("kyogijo's drawing carries no stylesheet");
  return `${HEADER}${css}\n`;
}

if (process.argv[1]?.endsWith("kyogijoCss.ts")) {
  const out = new URL("../src/components/kyogijo.css", import.meta.url);
  writeFileSync(out, kyogijoCss());
  console.log(`wrote ${out.pathname}`);
}
