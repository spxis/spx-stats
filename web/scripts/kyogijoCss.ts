import { writeFileSync } from "node:fs";
import { drawKyogijo } from "@johnmorrisdotca/kyogijo-stadiums";
import { roadToFinal } from "@johnmorrisdotca/kyogijo-stadiums/charts";

/**
 * The stylesheet every kyogijo drawing carries when it is drawn with `style: "embed"`, taken from a drawing so it is exactly what the installed
 * version writes. The game drawings leave it out and the page loads it once (src/components/kyogijo.css); the road-to-the-final chart's rules
 * (with the round mark's) are in src/components/kyogijo-road.css, loaded by the tournament page only. Run in web/ after changing the package's
 * version: `node scripts/kyogijoCss.ts` rewrites both files; `pnpm test:surface` fails while a file and the package disagree.
 */
export const HEADER = "/* The stylesheet of the @johnmorrisdotca/kyogijo-stadiums drawings, written by scripts/kyogijoCss.ts: do not edit by hand. The game drawings are made with style: \"none\". */\n";
export const ROAD_HEADER = "/* The stylesheet of the @johnmorrisdotca/kyogijo-stadiums road-to-the-final chart, written by scripts/kyogijoCss.ts: do not edit by hand. The chart is made with style: \"none\". */\n";

const styleOf = (svg: string, what: string): string => {
  const css = /<style>([\s\S]*?)<\/style>/.exec(svg)?.[1];
  if (!css) throw new Error(`kyogijo's ${what} carries no stylesheet`);
  return css;
};

export function kyogijoCss(): string {
  const svg = drawKyogijo({ sport: "nhl", away: { name: "A", score: 1 }, home: { name: "B", score: 2 }, status: "final", markShape: "round" });
  return `${HEADER}${styleOf(svg, "drawing")}\n`;
}

export function kyogijoRoadCss(): string {
  const finalist = (name: string) => ({ name, path: [] as never[] });
  return `${ROAD_HEADER}${styleOf(roadToFinal([finalist("A"), finalist("B")]).draw({ style: "embed" }), "road chart")}\n`;
}

if (process.argv[1]?.endsWith("kyogijoCss.ts")) {
  for (const [file, css] of [["kyogijo.css", kyogijoCss()], ["kyogijo-road.css", kyogijoRoadCss()]] as const) {
    const out = new URL(`../src/components/${file}`, import.meta.url);
    writeFileSync(out, css);
    console.log(`wrote ${out.pathname}`);
  }
}
