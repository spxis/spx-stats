import { writeFileSync } from "node:fs";
import { drawKyogijo } from "@johnmorrisdotca/kyogijo-stadiums";

/**
 * The stylesheet every kyogijo drawing carries when it is drawn with `style: "embed"`, taken from a drawing so it is exactly what the installed
 * version writes. The game drawings leave it out and the page loads it once (src/components/kyogijo.css). The road to the final is Taisen Brackets' now and
 * carries its own stylesheet. Run in web/ after changing the package's version: `node scripts/kyogijoCss.ts` rewrites the file; `pnpm test:surface` fails
 * while the file and the package disagree.
 */
export const HEADER = "/* The stylesheet of the @johnmorrisdotca/kyogijo-stadiums drawings, written by scripts/kyogijoCss.ts: do not edit by hand. The game drawings are made with style: \"none\". */\n";

const styleOf = (svg: string, what: string): string => {
  const css = /<style>([\s\S]*?)<\/style>/.exec(svg)?.[1];
  if (!css) throw new Error(`kyogijo's ${what} carries no stylesheet`);
  return css;
};

/**
 * The rules of every look the site draws, each rule once: a drawing writes only the rules its own features use, so the surfaces' round marks and the soccer
 * pageant's carpets (each with its flag, and a club's with only its colours) are drawn too, and their lines joined to the first drawing's.
 */
export function kyogijoCss(): string {
  const game = { away: { name: "A", score: 1 }, home: { name: "B", score: 2 }, status: "final", markShape: "round" as const };
  const drawings = [
    drawKyogijo({ sport: "nhl", ...game }),
    drawKyogijo({ sport: "nhl", ...game, size: "full", score: "centre" }),
    drawKyogijo({ sport: "soccer", ...game, size: "full", pageant: "carpet" }),
    drawKyogijo({ sport: "soccer", ...game, size: "full", pageant: "carpet", status: "final-pens", away: { name: "A", score: 1, penalties: 3, logo: "/a.svg" }, home: { name: "B", score: 1, penalties: 4, logo: "/b.svg" } }),
  ];
  const lines = new Set<string>();
  for (const [i, svg] of drawings.entries()) for (const line of styleOf(svg, `drawing ${i}`).split("\n")) if (line) lines.add(line);
  return `${HEADER}${[...lines].join("\n")}\n`;
}

if (process.argv[1]?.endsWith("kyogijoCss.ts")) {
  const out = new URL("../src/components/kyogijo.css", import.meta.url);
  writeFileSync(out, kyogijoCss());
  console.log(`wrote ${out.pathname}`);
}
