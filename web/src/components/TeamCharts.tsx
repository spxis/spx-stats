"use client";

import { seasonLabel } from "@/lib/leagues";
import { addRec, EMPTY, recordAt, type Loc } from "@/lib/loc";
import { recordParts } from "@/lib/record";
import type { StandingRow } from "@/lib/api/types";
import { Donut } from "./Donut";
import { HomeRoadBars } from "./HomeRoadBars";
import { LocSwitch, useLocParam } from "./LocSwitch";
import { MarginBars } from "./MarginBars";
import { WinLine, type WinSeason } from "./WinLine";
import "./team.css";

const LOC_WORD: Record<Loc, string> = { all: "", home: "at home", road: "on the road" };

/**
 * The charts of a team's page that follow the Home / Road / All switch: the record donuts, the scoring margin (all games
 * only, because points are not split by home and road) and the winning share by season. Then the home-versus-road chart.
 */
export function TeamCharts({ lg, f, rows, titles, seasons }: { lg: string; f: number; rows: StandingRow[]; titles: number[]; seasons: WinSeason[] }) {
  const [loc, setLoc] = useLocParam();
  const word = LOC_WORD[loc];
  const total = rows.reduce((a, r) => addRec(a, recordAt(r, loc)), EMPTY);
  const latest = [...rows].filter((r) => r.w != null).sort((a, b) => b.year - a.year)[0];
  const lastRec = latest ? recordAt(latest, loc) : null;
  const winSeasons: WinSeason[] = loc === "all" ? seasons : rows.flatMap((r) => {
    const rec = recordAt(r, loc);
    return rec ? [[r.year, rec.w, rec.l, rec.t, rec.otl] as WinSeason] : [];
  }).sort((a, b) => a[0] - b[0]);
  return (
    <>
      <section className="section">
        <h2>Record at a glance</h2>
        <div className="controls"><LocSwitch value={loc} onChange={setLoc} /></div>
        <div className="chartrow">
          <Donut title={`All-time record${word ? ` ${word}` : ""}`} sub={`${rows.length} regular seasons`} parts={recordParts(total)} />
          {latest ? <Donut title={`${seasonLabel(lg, latest.year)} record${word ? ` ${word}` : ""}`} sub="Most recent season with results" parts={recordParts(lastRec ?? EMPTY)} /> : null}
        </div>
        <h3>Scoring margin per game, by season</h3>
        <p className="note">
          {loc === "all"
            ? "Points for minus points against, divided by games played. Click a season to open every game of it."
            : "Points for and against are only kept for the whole season, not split by home and road, so this shows every game."}
        </p>
        <MarginBars lg={lg} f={f} rows={rows.flatMap((r) => (r.pf != null && r.pa != null && r.gp ? [{ year: r.year, gp: r.gp, pf: r.pf, pa: r.pa }] : []))} />
      </section>
      <section className="section">
        <h2>{`Winning share by season${word ? `, ${word}` : ""}`}</h2>
        <p className="note">Filled dots are championship seasons. Click a season to open it.{loc !== "all" ? ` Counting only games ${word}.` : ""}</p>
        <WinLine seasons={winSeasons} titles={titles} lg={lg} />
      </section>
      <section className="section">
        <h2>Home or road?</h2>
        <p className="note">Win share in each season at home and on the road, side by side. Press a pair to open that season.</p>
        <HomeRoadBars rows={rows} lg={lg} f={f} />
      </section>
    </>
  );
}

