import { Credits } from "@/components/Credits";
import { KnockoutFile } from "@/components/KnockoutFile";
import { drawKnockoutFiles, shapeOf } from "@/lib/bracketDraw";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import type { Match } from "@/lib/soccer";
import { soccerKnockoutDrawing } from "@/lib/soccerKnockoutDraw";
import "./soccer.css";

/**
 * The knockout rounds as a bracket drawn by Taisen Brackets (lib/soccerKnockoutDraw.ts builds it; lib/bracketDraw.ts draws it; layout in lib/bracketLayout.ts, ties from
 * lib/soccerBracket.ts): one half down each side or, on a phone, the rounds as rows, the final in the middle with the champion and the cup above it, a line
 * from each match to the one its winner plays next, the third-place match below. Each box shows both teams' round flags (the site's flag files, named by `flagHref`, so a page
 * does not carry Spain's 80 KB coat of arms twice), names and goals, with the penalties in brackets and a note for extra time or a replay, and opens the match
 * (a replayed tie opens the replay). Any match the tree has no place for the package draws apart, with a heading.
 *
 * The drawings are files (/bracket-svg/soccer-<year>.<wide or phone>.<language>.svg, app/bracket-svg) that the page loads when they come into view
 * (components/KnockoutFile.tsx), so the page's HTML holds two empty boxes of their shape and not 70 KB of SVG, twice.
 *
 * Under it the tournament page draws the two finalists' roads, with the package's `roadToFinal` (components/SoccerRoad.tsx, from the same matches).
 */
export async function SoccerKnockout({ matches, year }: { matches: Match[]; year: number }) {
  const sp = await currentSpeaker();
  const drawing = soccerKnockoutDrawing(matches, sp);
  if (!drawing || !drawing.ties) return null;
  const art = drawKnockoutFiles(drawing.layout, drawing.options);
  const file = (part: "wide" | "phone") => ({ src: `/bracket-svg/soccer-${year}.${part}.${sp.locale}.svg`, ratio: shapeOf(art[part]) });
  return (
    <>
      <KnockoutFile wide={file("wide")} phone={file("phone")} />
      <p className="note"><Credits say={sp.say} use={["brackets"]} /></p>
    </>
  );
}
