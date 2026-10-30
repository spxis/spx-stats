"use client";

import { useMemo } from "react";
import Link from "@/components/Link";
import { MLS_MATCHES_HEAD, readMlsMatches, type MlsMatchesWire } from "@/lib/mlsLines";
import { mlsClubPath, mlsMatchPath } from "@/lib/mlsPath";
import { mlsStageName } from "@/lib/mlsView";
import { tableOf } from "@/lib/sort";
import { useSpeaker } from "./i18n/LocaleProvider";
import { SortTable } from "./SortTable";
import { StadiumName } from "./StadiumName";
import { useReveal } from "./useReveal";
import "./soccer.css";

/**
 * A season's matches, built here from one short line a match (lib/mlsLines.ts). The first rows are drawn at once; the others when "Show all" is pressed or
 * the table is sorted another way, and on the season's matches page (`full`) where script is off. The cells are the ones the server used to draw; a club is a
 * plain link (no wrapper per name: with every row on the matches page that was 24 KB).
 */
export function MlsMatchesTable({ year, wire, full = false, hrefAll, label }: { year: number; wire: MlsMatchesWire; full?: boolean; hrefAll: string; label: string }) {
  const { say, fmt, dt } = useSpeaker();
  const rows = useMemo(() => readMlsMatches(wire), [wire]);
  const more = useReveal(rows, MLS_MATCHES_HEAD, full);
  const table = useMemo(() => tableOf(more.shown, [
    { key: "date", label: say("col.date"), get: (m) => m.date, cell: (m) => dt.ymd(new Date(m.date)) },
    { key: "stage", label: say("wc.col.stage"), get: (m) => m.stageOrder, cell: (m) => mlsStageName(say, m.stageKey) },
    { key: "home", label: say("col.home"), cls: "team sctc", get: (m) => m.home, cell: (m) => <Link href={mlsClubPath(m.homeSlug)} prefetch={false}>{m.home}</Link> },
    {
      key: "score", label: say("col.score"), get: (m) => m.hg + m.ag,
      cell: (m) => {
        const note = m.note === 1 ? say("wc.score.aet") : m.note === 2 ? say("wc.score.pens", { home: m.hp, away: m.ap })
          : m.note === 3 || m.note === 4 ? say("mls.score.so", { team: m.note === 3 ? m.home : m.away }) : null;
        return <Link className="sc-score" href={mlsMatchPath(year, m.id, m.home, m.away)} prefetch={false}>{m.hg}–{m.ag}{note ? <small>{note}</small> : null}</Link>;
      },
    },
    { key: "away", label: say("wc.col.away"), cls: "team sctc", get: (m) => m.away, cell: (m) => <Link href={mlsClubPath(m.awaySlug)} prefetch={false}>{m.away}</Link> },
    { key: "venue", label: say("col.venue"), cls: "team", get: (m) => m.venue, cell: (m) => <StadiumName name={m.venue} qid={m.venueQid} linked={m.venueLinked} rest={m.venueCity ?? undefined} /> },
    { key: "crowd", label: say("mls.col.crowd"), num: true, get: (m) => m.crowd || null, cell: (m) => (m.crowd ? fmt(m.crowd) : "") },
  ], (m) => m.id), [more.shown, say, fmt, dt, year]);
  return (
    <div className="tablebox">
      <SortTable {...table} def="date.asc" param="sort_games" label={label} partial={full ? undefined : { total: rows.length, loaded: more.loaded, state: more.state, load: more.load, href: hrefAll }} />
    </div>
  );
}
