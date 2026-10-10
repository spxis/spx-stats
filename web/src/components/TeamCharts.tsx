"use client";

import { seasonLabel } from "@/lib/leagues";
import { addRec, EMPTY, recordAt, type Loc } from "@/lib/loc";
import { recordParts } from "@/lib/record";
import type { StandingRow } from "@/lib/api/types";
import { Donut } from "./Donut";
import { HomeRoadBars } from "./HomeRoadBars";
import { useSpeaker } from "./i18n/LocaleProvider";
import { LocSwitch, useLocParam } from "./LocSwitch";
import { MarginBars } from "./MarginBars";
import { WinLine, type WinSeason } from "./WinLine";
import "./team.css";

const ALL_TIME = { all: "team.allTime", home: "team.allTimeHome", road: "team.allTimeRoad" } as const satisfies Record<Loc, string>;
const SEASON_RECORD = { all: "glance.record", home: "glance.recordHome", road: "glance.recordRoad" } as const satisfies Record<Loc, string>;
const WIN_TITLE = { all: "team.winTitle", home: "team.winTitleHome", road: "team.winTitleRoad" } as const satisfies Record<Loc, string>;
const WIN_NOTE = { all: "team.winNote", home: "team.winNoteHome", road: "team.winNoteRoad" } as const satisfies Record<Loc, string>;

/**
 * The charts of a team's page that follow the Home / Road / All switch: the record donuts, the scoring margin (all games
 * only, because points are not split by home and road) and the winning share by season. Then the home-versus-road chart.
 */
export function TeamCharts({ lg, f, rows, titles, seasons }: { lg: string; f: number; rows: StandingRow[]; titles: number[]; seasons: WinSeason[] }) {
  const { say, plural } = useSpeaker();
  const [loc, setLoc] = useLocParam();
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
        <h2>{say("team.glance")}</h2>
        <div className="controls"><LocSwitch value={loc} onChange={setLoc} /></div>
        <div className="chartrow">
          <Donut title={say(ALL_TIME[loc])} sub={plural("count.regularSeasons", rows.length)} parts={recordParts(total)} />
          {latest ? <Donut title={say(SEASON_RECORD[loc], { season: seasonLabel(lg, latest.year) })} sub={say("team.latestSub")} parts={recordParts(lastRec ?? EMPTY)} /> : null}
        </div>
        <h3>{say("team.marginTitle")}</h3>
        <p className="note">
          {say(loc === "all" ? "team.marginNote" : "team.marginNoteLoc")}
        </p>
        <MarginBars lg={lg} f={f} rows={rows.flatMap((r) => (r.pf != null && r.pa != null && r.gp ? [{ year: r.year, gp: r.gp, pf: r.pf, pa: r.pa }] : []))} />
      </section>
      <section className="section">
        <h2>{say(WIN_TITLE[loc])}</h2>
        <p className="note">{say(WIN_NOTE[loc])}</p>
        <WinLine seasons={winSeasons} titles={titles} lg={lg} />
      </section>
      <section className="section">
        <h2>{say("hr.title")}</h2>
        <p className="note">{say("hr.note")}</p>
        <HomeRoadBars rows={rows} lg={lg} f={f} />
      </section>
    </>
  );
}

