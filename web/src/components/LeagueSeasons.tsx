"use client";

import { max, min, range } from "d3";
import Link from "next/link";
import { useCallback, useLayoutEffect, useMemo, useSyncExternalStore } from "react";
import { addressRange, chooseAddressRange, parseRange, releaseRangeHold, serverRange, subscribeAddress } from "@/lib/yearRange";
import { HeatRows, type HeatSeason } from "./Heatmap";
import { NoSeason } from "./ui";
import { YearRange } from "./YearRange";

export interface SeasonChip { year: number; label: string; href: string; title: string; full: boolean; none: boolean }

/**
 * A league page's seasons: the year slider with its shortcuts, the bar of squares and the season chips. The range comes from the address
 * (?from=&to=) alone. The bar shows only those years; a chip outside them is dimmed but still a link. The server draws the full range and
 * the client switches to the address's range in the same pass; the block sits under `.yr-hold`, which the head script keeps hidden
 * meanwhile when the address names a range, so the full range is never painted first.
 */
export function LeagueSeasons({ seasons, league, chips }: { seasons: HeatSeason[]; league: string; chips: SeasonChip[] }) {
  const rows = useMemo(() => seasons.filter((s) => s.league === league), [seasons, league]);
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
      <HeatRows seasons={rows} leagues={leagues} years={years} />
      <div className="seasonlist">
        {chips.map((c) => c.none
          ? <NoSeason key={c.year} compact season={c.year} className={out(c.year) ? "out" : undefined}>{c.label}</NoSeason>
          : (
            <Link key={c.year} prefetch={false} href={c.href} data-season={c.year} title={c.title}
              className={[c.full ? "full" : "", out(c.year) ? "out" : ""].filter(Boolean).join(" ") || undefined}>
              {c.label}
            </Link>
          ))}
      </div>
    </div>
  );
}
