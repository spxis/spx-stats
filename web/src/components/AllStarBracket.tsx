import { KnockoutFile } from "@/components/KnockoutFile";
import { allStarKnockout, drawAllStarFiles } from "@/lib/allStarBracket";
import type { AllStarGame } from "@/lib/allStarView";
import { shapeOf } from "@/lib/bracketDraw";
import { currentSpeaker } from "@/lib/i18n/currentLocale";

/**
 * A tournament's knockout as a bracket drawn by Taisen Brackets (lib/allStarBracket.ts builds it, lib/bracketDraw.ts draws it): the semifinals feeding the final, the
 * champion over the final's middle, each box with both sides' marks and goals. The drawings are files (/bracket-svg/allstar-<league>-<year>.<wide or phone>.<language>.svg)
 * that the page loads when they come into view (components/KnockoutFile.tsx), so the page holds two empty boxes of their shape and not the SVG twice.
 */
export async function AllStarBracket({ lg, year, games }: { lg: string; year: number; games: readonly AllStarGame[] }) {
  const sp = await currentSpeaker();
  const drawing = allStarKnockout(games, sp);
  if (!drawing) return null;
  const art = drawAllStarFiles(drawing.layout, drawing.options);
  const file = (part: "wide" | "phone") => ({ src: `/bracket-svg/allstar-${lg}-${year}.${part}.${sp.locale}.svg`, ratio: shapeOf(art[part]) });
  return <KnockoutFile wide={file("wide")} phone={file("phone")} />;
}
