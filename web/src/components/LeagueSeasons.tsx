"use client";

import { max, min, range } from "d3";
import dynamic from "next/dynamic";
import Link from "@/components/Link";
import { useCallback, useLayoutEffect, useMemo, useSyncExternalStore } from "react";
import { FULL_SHARE, rowLabel } from "@/lib/leagueSeasonRows";
import { seasonPath } from "@/lib/slug";
import { addressRange, chooseAddressRange, parseRange, releaseRangeHold, serverRange, subscribeAddress } from "@/lib/yearRange";
import type { HeatSeason } from "./Heatmap";
import { useSpeaker } from "./i18n/LocaleProvider";
import { useLeagueSeasonRows } from "./LeagueSeasonRows";
import { NoSeason } from "./ui";
import { useSeen } from "./useSeen";
import { YearRange } from "./YearRange";

const HeatRows = dynamic(() => import("./Heatmap").then((m) => m.HeatRows), { ssr: false });

/** The heat strip's height (its row and the year labels above it): the box keeps it before the strip is drawn, so the page below does not jump. */
const STRIP_HEIGHT = 48;

/**
 * A league page's seasons: the year slider with its shortcuts, the strip of squares and the season chips, all drawn from the league's season rows
 * (components/LeagueSeasonRows.tsx, which the page sends once). The strip is a drawing with no words a search needs (a square is 400 bytes of markup, a
 * hundred of them twice), so it is drawn in the browser when it is near the screen; the chips stay in the page, each a link to its season. The range
 * comes from the address (?from=&to=) alone. The strip and the bar chart show only those years; a chip outside them is dimmed but still a link. The server
 * draws the full range and the client switches to the address's range in the same pass; the block sits under `.yr-hold`, which the head script keeps
 * hidden meanwhile when the address names a range, so the full range is never painted first.
 */
export function LeagueSeasons() {
  const { league, rows: data } = useLeagueSeasonRows();
  const { say, fmt } = useSpeaker();
  const rows = useMemo((): HeatSeason[] => data.map((r) => ({ league, year: r.y, label: rowLabel(league, r), games: r.g, finals: r.f, share: r.s, champion: r.c ?? null })), [data, league]);
  const [strip, drawn] = useSeen<HTMLDivElement>();
  const y0 = min(rows, (s) => s.year) ?? 0, y1 = max(rows, (s) => s.year) ?? 0;
  const leagues = useMemo(() => [league], [league]);
  const raw = useSyncExternalStore(subscribeAddress, addressRange, serverRange);
  const span = useMemo(() => parseRange(raw, y0, y1) ?? { from: y0, to: y1 }, [raw, y0, y1]);
  useLayoutEffect(() => { if (raw === addressRange()) releaseRangeHold(); }, [raw]);
  const onRange = useCallback((from: number, to: number) => chooseAddressRange({ from, to }, y0, y1), [y0, y1]);
  const years = useMemo(() => range(span.from, span.to + 1), [span]);
  const out = (year: number) => year < span.from || year > span.to;
  return (
    <div className="yr-hold leagueseasons">
      <YearRange min={y0} max={y1} from={span.from} to={span.to} onChange={onRange} />
      <div ref={strip} style={drawn ? undefined : { minHeight: STRIP_HEIGHT }}>{drawn ? <HeatRows seasons={rows} leagues={leagues} years={years} /> : null}</div>
      <div className="seasonlist">
        {data.map((r) => {
          const label = rowLabel(league, r);
          return r.n
            ? <NoSeason key={r.y} compact season={r.y} className={out(r.y) ? "out" : undefined}>{label}</NoSeason>
            : (
              <Link key={r.y} prefetch={false} href={seasonPath(league, r.y)} data-season={r.y}
                title={r.g ? say("league.seasonTip", { finals: fmt(r.f), games: fmt(r.g) }) : r.t ? say("season.noSchedule") : say("league.awardsOnly")}
                className={[r.s >= FULL_SHARE ? "full" : "", out(r.y) ? "out" : ""].filter(Boolean).join(" ") || undefined}>
                {label}
              </Link>
            );
        })}
      </div>
    </div>
  );
}
