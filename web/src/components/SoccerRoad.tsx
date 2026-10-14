import { currentSpeaker } from "@/lib/i18n/currentLocale";
import type { Match } from "@/lib/soccer";
import { roadChartFor } from "@/lib/soccerRoadChart";
import { Credits } from "./Credits";
import { RoadArt } from "./RoadArt";
import "./kyogijo-road.css";
import "./soccer.css";

/**
 * The road to a tournament's final (kyogijo's `roadToFinal`, the phone size at every width): both finalists as large round flags, down the middle the rounds
 * on a dotted road, on each side its matches with both teams' round flags, the score and a.e.t. or the shoot-out, and its group stage as a row of small flags at
 * the foot. The drawing is a file (/soccer-road/<year>.<language>.svg, app/soccer-road) that RoadArt writes into the page when it comes into view, so the page's
 * HTML holds the table and not the 17 KB drawing (twice, as markup and as data); the flags are files too (/soccer-flag/<CODE>.svg). The drawing is decorative: the
 * figure's label says what it is and the table under it holds every match as text, in the reader's language. The model is lib/soccerRoad.ts and the drawing
 * lib/soccerRoadChart.ts. A tournament with no road draws nothing; 1950, which had no final, is drawn to its deciding match and says so.
 */
export async function SoccerRoad({ matches, year, league }: { matches: Match[]; year: number; league: string }) {
  const sp = await currentSpeaker();
  const { say, locale } = sp;
  const chart = roadChartFor(matches, year, league, sp);
  if (!chart) return null;
  const { road, labels, groups, title } = chart;
  const [a, b] = road.finalists;
  const stageOf = (key: string) => (key === "group" ? groups : labels[key] ?? key);
  return (
    <section className="section" id="road">
      <h2>{say("wc.t.road")}</h2>
      <figure className="sc-road" aria-label={say("wc.road.aria", { title, a: a.name, b: b.name })}>
        <RoadArt className="sc-road-art" src={`/soccer-road/${year}.${locale}.svg`} ratio={chart.width / chart.height} />
        <figcaption className="note">
          {road.finalRound ? <>{say("wc.road.noFinal", { year })} </> : null}
          <Credits say={say} use={["surfaces"]} />
        </figcaption>
        <details className="sc-road-table">
          <summary>{say("wc.road.table")}</summary>
          <div className="tablebox">
            <table>
              <thead><tr><th>{say("col.team")}</th><th>{say("wc.col.stage")}</th><th>{say("wc.road.opponent")}</th><th>{say("col.score")}</th></tr></thead>
              <tbody>
                {road.entries.map((e, i) => (
                  <tr key={i}><td>{e.team}</td><td>{stageOf(e.stage)}</td><td>{e.opponent}</td><td>{e.goals}–{e.against}{e.note ? ` (${e.note})` : ""}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </figure>
    </section>
  );
}
