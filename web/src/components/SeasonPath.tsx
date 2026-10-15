import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { guard } from "@/lib/loadGuard";
import { seasonPathView } from "@/lib/seasonPathData";
import { seasonPathDataPath } from "@/lib/seasonRows";
import { PlayoffPathLazy } from "./PlayoffPathLazy";

/**
 * Every club's path through a season's playoffs as a Sankey diagram, under the bracket: all the clubs on the left, then who made the
 * playoffs, each round (one block per series) and the champion. The heading and the lede are in the page; the diagram's data (the words and links,
 * made on the server in lib/seasonPathData.ts) is fetched from the season's `rows/path` address when the reader gets near, and the diagram is drawn
 * in the browser (PlayoffPath). Draws nothing for a season with no playoff series.
 */
export const SeasonPath = guard(async function SeasonPath({ lg, year, seasonPath }: { lg: string; year: number; seasonPath: string }) {
  const speaker = await currentSpeaker();
  const { say } = speaker;
  if (!(await seasonPathView(lg, year, speaker))) return null;
  return (
    <section className="section" id="path">
      <h2>{say("path.title")}</h2>
      <p className="note">{say("path.lede")}</p>
      <PlayoffPathLazy href={seasonPathDataPath(seasonPath)} />
    </section>
  );
});
