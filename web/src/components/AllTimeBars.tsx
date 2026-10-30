"use client";

import Link from "@/components/Link";
import { useMemo } from "react";
import type { AllTimePhase } from "@/lib/allTime";
import { barItems, type BarItem, type BarKind } from "@/lib/allTimeBars";
import { allTimeRestPath } from "@/lib/allTimeLines";
import { useSpeaker } from "./i18n/LocaleProvider";
import { RankRow } from "./RankBars";
import { usePaths } from "./SlugProvider";
import { useAllTime } from "./useAllTime";
import "./alltime.css";

/**
 * Franchises ranked by one number, a bar each in the team's colour. The page sends the first `limit` bars; the others come from the league's `rows/all-time`
 * address when the reader opens "Show all" (they are the same bars, worked out from the same lines). Without script the opened disclosure holds a link to
 * the table, which lists every franchise with the same figures. `span` is the longest bar of the whole list, so a bar is the same length with or without the rest.
 */
export function AllTimeBars({ kind, lg, phase, active, items, limit, centre, span, label, more, fullHref }: {
  kind: BarKind; lg: string; phase: AllTimePhase; active: boolean; items: BarItem[]; limit: number; centre?: number; span: number; label: string; more: string; fullHref: string;
}) {
  const { say, fmt, plural } = useSpeaker();
  const paths = usePaths();
  const all = useAllTime(allTimeRestPath(lg), null);
  const rest = useMemo(
    () => (all.state === "done" ? barItems(kind, all.rows, { lg, phase, active, paths, fmt, plural }).slice(limit) : []),
    [all.state, all.rows, kind, lg, phase, active, paths, fmt, plural, limit],
  );
  const row = (i: BarItem) => <RankRow key={i.key} item={i} centre={centre} span={span} />;
  return (
    <>
      <ol className="rank" aria-label={label}>{items.map(row)}</ol>
      <details className="rank-more" onToggle={(e) => { if (e.currentTarget.open) all.load(); }}>
        <summary>{more}</summary>
        {all.state === "done" ? <ol className="rank" aria-label={label}>{rest.map(row)}</ol> : (
          <p className="note">{all.state === "loading" ? say("load.loading") : <Link href={fullHref} prefetch={false}>{say("allTime.table")}</Link>}</p>
        )}
      </details>
    </>
  );
}
