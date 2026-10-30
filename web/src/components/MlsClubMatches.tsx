"use client";

import { useMemo } from "react";
import Link from "@/components/Link";
import { MLS_CLUB_HEAD, readMlsClubMatches, type MlsClubWire } from "@/lib/mlsClubLines";
import { mlsMatchPath } from "@/lib/mlsPath";
import { mlsStageName } from "@/lib/mlsView";
import { tableOf } from "@/lib/sort";
import { useSpeaker } from "./i18n/LocaleProvider";
import { MlsClubName } from "./MlsClubName";
import { SortTable } from "./SortTable";
import "./soccer.css";

/** A club's matches, built here from one short line a match (lib/mlsClubLines.ts). The newest rows are drawn at once and the others when "Show all" is pressed; every line is in the page already. */
export function MlsClubMatches({ clubName, wire }: { clubName: string; wire: MlsClubWire }) {
  const { say, dt } = useSpeaker();
  const rows = useMemo(() => readMlsClubMatches(wire), [wire]);
  const table = useMemo(() => tableOf(rows, [
    { key: "date", label: say("col.date"), get: (m) => m.date, cell: (m) => dt.ymd(new Date(m.date)) },
    { key: "stage", label: say("wc.col.stage"), get: (m) => m.stageOrder, cell: (m) => mlsStageName(say, m.stageKey) },
    { key: "opp", label: say("col.opponent"), cls: "team", get: (m) => m.opponent, cell: (m) => <MlsClubName slug={m.opponentSlug} name={m.opponent} /> },
    {
      key: "score", label: say("col.score"), get: (m) => m.gf - m.ga,
      cell: (m) => {
        const tail = m.pens ? ` (${m.pens[0]}–${m.pens[1]})` : m.extraTime ? ` ${say("wc.aetShort")}` : "";
        return <Link href={mlsMatchPath(m.year, m.id, m.home ? clubName : m.opponent, m.home ? m.opponent : clubName)} prefetch={false}>{`${m.gf}–${m.ga}${tail}`}</Link>;
      },
    },
    { key: "result", label: say("col.result"), get: (m) => (m.result === "w" ? 3 : m.result === "d" ? 1 : 0), cell: (m) => say(m.result === "w" ? "wc.col.w" : m.result === "d" ? "wc.col.d" : "wc.col.l") },
    { key: "loc", label: say("mls.col.homeAway"), get: (m) => (m.home ? 1 : 0), cell: (m) => say(m.home ? "mls.home" : "mls.away") },
    { key: "venue", label: say("col.venue"), cls: "team", get: (m) => m.venue, cell: (m) => m.venue ?? "" },
  ], (m) => m.id), [rows, say, dt, clubName]);
  return <div className="tablebox"><SortTable {...table} def="date.desc" param="sort_games" limit={MLS_CLUB_HEAD} /></div>;
}
