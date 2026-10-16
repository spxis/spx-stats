import Link from "@/components/Link";
import type { ReactNode } from "react";
import { currentSpeaker } from "@/lib/i18n/currentLocale";
import { leadersPath } from "@/lib/leaderStats";
import { seasonLabel } from "@/lib/leagues";
import { seasonPath } from "@/lib/slug";
import { SeasonSelect, type SeasonPage } from "./SeasonSelect";

interface Step { href: string; label: string }

/**
 * The buttons in the corner of a season page's header: the season before, the season picker, the season after, then any extras.
 * Every page of a season builds its header from this, so the row reads the same everywhere: ← 2019 [2020 ▾] 2021 →.
 */
export function SeasonNav({ aria, prev, next, picker, extra, prefetch }: {
  aria: string; prev?: Step | null; next?: Step | null; picker?: ReactNode; extra?: ReactNode;
  /** Set to false where the neighbouring pages are costly to draw (a team's season). */
  prefetch?: boolean;
}) {
  return (
    <nav className="seasonnav" aria-label={aria}>
      {prev ? <Link href={prev.href} rel="prev" prefetch={prefetch}>{"← " + prev.label}</Link> : null}
      {picker}
      {next ? <Link href={next.href} rel="next" prefetch={prefetch}>{next.label + " →"}</Link> : null}
      {extra}
    </nav>
  );
}

const PATH = { season: seasonPath, leaders: leadersPath } as const;

/**
 * The season row of the league-wide pages (the season, its leaders), with the picker listing every season in `seasons`,
 * newest first. `lo` and `hi` are the league's first and last season.
 */
export async function LeagueSeasonNav({ lg, page, year, lo, hi, seasons, extra }: {
  lg: string; page: SeasonPage; year: number; lo: number; hi: number; seasons: { year: number; label: string }[]; extra?: ReactNode;
}) {
  const { say } = await currentSpeaker();
  const to = PATH[page];
  return (
    <SeasonNav aria={say("season.otherSeasons")}
      prev={year > lo ? { href: to(lg, year - 1), label: seasonLabel(lg, year - 1) } : null}
      next={year < hi ? { href: to(lg, year + 1), label: seasonLabel(lg, year + 1) } : null}
      picker={<SeasonSelect lg={lg} page={page} seasons={seasons} value={year} />}
      extra={extra} />
  );
}
