"use client";

import Link from "@/components/Link";
import { useMemo, useSyncExternalStore } from "react";
import type { AllTimePhase } from "@/lib/allTime";
import { allTimeRestPath, atPoints, atSort, shownAt, UNIT, lineAt, shareAt, type AtList, type AtRow } from "@/lib/allTimeLines";
import { fmt3 } from "@/lib/format";
import { seasonLabel } from "@/lib/leagues";
import { tableOf, type SortKey } from "@/lib/sort";
import { useSpeaker } from "./i18n/LocaleProvider";
import { teamVars } from "./RankBars";
import { usePaths } from "./SlugProvider";
import { SortTable } from "./SortTable";
import { Spark } from "./Spark";
import { TeamLabel } from "./TeamLabel";
import { useAllTime } from "./useAllTime";
import "./alltime.css";

const noSubscribe = () => () => {};

/**
 * The small win-share chart of a row, drawn once the page is live: a drawing with no words a search needs, and with a row for every franchise it was
 * hundreds of KB of markup in the full table. The box keeps its size meanwhile, so the row does not change height.
 */
function RowSpark({ points, label }: { points: [number, number][]; label: string }) {
  const live = useSyncExternalStore(noSubscribe, () => true, () => false);
  return live ? <Spark points={points} label={label} /> : <span className="spark"><svg width={92} height={22} aria-hidden="true" /></span>;
}

/** What the table needs besides the rows: which optional columns exist and the longest win share (for the bars), worked out over every franchise. */
export interface AtFlags { showT: boolean; showO: boolean; maxShare: number }

/**
 * Every franchise of a league, with its record. The overview sends the few franchises the table shows first as plain data (so they are in the page for
 * readers and search once, not twice as markup and payload) and the others come from the league's `rows/all-time` address when "Show all" is pressed or
 * the table is sorted another way (the same arrangement as the standings, components/StandingsTable.tsx). Without script "Show all" is a link to the table
 * view, which has every franchise in the page (`full`).
 */
export function AllTimeTable({ lg, head, total, phase, active, initial, flags, full, hrefAll, label }: {
  lg: string; head: AtList; total: number; phase: AllTimePhase; active: boolean; initial?: SortKey[]; flags: AtFlags; full: boolean; hrefAll: string; label: string;
}) {
  const { say, fmt } = useSpeaker();
  const paths = usePaths();
  const more = useAllTime(allTimeRestPath(lg), head);
  const { showT, showO, maxShare } = flags;
  const unit = say(UNIT[lg as keyof typeof UNIT]);
  const rows = useMemo(() => shownAt(more.rows, phase, active), [more.rows, phase, active]);
  const table = useMemo(() => {
    const diff = (t: AtRow) => { const l = lineAt(t, phase); return l.pf - l.pa; };
    const num = (key: string, label: string, title?: string) => ({
      key, label, num: true as const, title, get: (t: AtRow) => atSort(t, key, phase), cell: (t: AtRow) => fmt(Number(atSort(t, key, phase))),
    });
    const seasonCell = (t: AtRow, m: AtRow["b"]) => m ? (
      <><Link href={paths.teamSeason(lg, t.f, m[0])} prefetch={false}>{seasonLabel(lg, m[0])}</Link><span className="sub">{fmt3(m[1])}</span></>
    ) : "";
    return tableOf(rows, [
      {
        key: "team", label: say("col.team"), cls: "team", get: (t) => t.name,
        cell: (t) => (
          <span className="at-c" style={teamVars({ tl: t.tl ?? null, td: t.td ?? null })}>
            <span className="nm">
              <TeamLabel lg={lg} f={t.f} name={t.name} abbr={t.ab} logo={t.logo} />
              {t.fm?.length ? <small className="former">{say("allTime.former", { names: t.fm.join(", ") })}</small> : null}
            </span>
          </span>
        ),
      },
      { key: "years", label: say("col.years"), cls: "years", title: say("allTime.tip.years"), get: (t) => t.a, cell: (t) => (t.on ? `${t.a}–${say("allTime.present")}` : t.a === t.z ? String(t.a) : `${t.a}–${t.z}`) },
      { key: "seasons", label: say("col.seasons"), num: true, get: (t) => t.s },
      num("gp", say("col.gp")), num("w", say("col.w")), num("l", say("col.l")),
      ...(showT ? [{ key: "t", label: say("col.t"), num: true, get: (t: AtRow) => atSort(t, "t", phase) }] : []),
      ...(showO ? [{ key: "otl", label: say("col.otl"), num: true, get: (t: AtRow) => atSort(t, "otl", phase) }] : []),
      {
        key: "share", label: say("col.share"), num: true, title: say("allTime.tip.share"), get: (t) => shareAt(t, phase),
        cell: (t) => {
          const s = shareAt(t, phase);
          return s == null ? "" : <>{fmt3(s)}<span className="pctbar at-c" style={{ width: `${Math.round((56 * s) / maxShare)}px`, ...teamVars({ tl: t.tl ?? null, td: t.td ?? null }), background: "var(--c)" }} /></>;
        },
      },
      num("pf", say("col.pf"), say("allTime.tip.pf", { unit })), num("pa", say("col.pa"), say("allTime.tip.pa", { unit })),
      {
        key: "diff", label: say("col.diff"), num: true, title: say("allTime.tip.diff", { unit }), get: diff,
        cell: (t) => <span className={diff(t) > 0 ? "up" : diff(t) < 0 ? "down" : undefined}>{diff(t) > 0 ? "+" : diff(t) < 0 ? "−" : ""}{fmt(Math.abs(diff(t)))}</span>,
      },
      { key: "titles", label: say("col.titles"), num: true, get: (t) => t.ti?.length ?? 0 },
      { key: "playoffs", label: say("col.playoffs"), num: true, title: say("allTime.tip.playoffs"), get: (t) => t.po },
      { key: "best", label: say("col.best"), title: say("allTime.tip.best"), get: (t) => t.b?.[1], cell: (t) => seasonCell(t, t.b) },
      { key: "worst", label: say("col.worst"), title: say("allTime.tip.worst"), get: (t) => t.w?.[1], cell: (t) => seasonCell(t, t.w) },
      {
        key: "trend", label: say("col.trend"), title: say("allTime.tip.trend"), get: (t) => t.rc ?? null,
        cell: (t) => (
          <span className="at-c" style={teamVars({ tl: t.tl ?? null, td: t.td ?? null })}>
            <RowSpark points={atPoints(t)} label={say("allTime.spark.aria", { team: t.name })} />
          </span>
        ),
      },
    ], (t) => t.f, (t) => (t.on ? undefined : "gone"));
  }, [rows, say, fmt, paths, lg, phase, showT, showO, maxShare, unit]);
  return (
    <SortTable {...table} def="w.desc" initial={initial} label={label}
      partial={full ? undefined : { total, loaded: more.state === "done" || rows.length >= total, state: more.state, load: more.load, href: hrefAll }} />
  );
}
