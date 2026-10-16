"use client";

import Link from "@/components/Link";
import { isSpx, srcName } from "@/lib/leagues";
import { usePaths } from "./SlugProvider";
import { useSpeaker } from "./i18n/LocaleProvider";
import "./team.css";

/** A source's short name in a bordered tag; SPX's own is drawn in the page colour. */
export function Badge({ src }: { src: string | null | undefined }) {
  const { say } = useSpeaker();
  if (!src) return null;
  return (
    <span className={"badge" + (isSpx(src) ? " spx" : "")} title={src}>
      {srcName(say, src)}
    </span>
  );
}

/**
 * A link to a team's page, or plain text where the franchise is unknown. Inside a season (`year`) it opens that team's
 * season, not the franchise; `href` opens another page about the team instead. With `abbr` the name shortens to the abbreviation on a phone (the full name stays on its title).
 */
export function TeamLink({ lg, f, name, className, year, abbr, title, href }: {
  lg: string; f: number | null | undefined; name: string | null | undefined; className?: string; year?: number; abbr?: string; title?: string; href?: string;
}) {
  const paths = usePaths();
  const text = abbr ? <><span className="tn-long">{name}</span><abbr className="tn-short" title={name ?? undefined}>{abbr}</abbr></> : name;
  return f != null ? (
    <Link className={className} href={href ?? (year != null ? paths.teamSeason(lg, f, year) : paths.team(lg, f))} prefetch={false} title={title}>{text}</Link>
  ) : (
    <span className={className} title={title}>{text}</span>
  );
}

export type NoSeasonKind = "league" | "team";
export const NO_SEASON_KEY = { league: "noseason.league", team: "noseason.team" } as const;

/**
 * The quiet grey box for a season, or a team's season, with no games. Full size shows the short label (table rows, headings);
 * `compact` is for chips, pickers and cells with no room: just the box (a dash, or the chip's own text as children), with the
 * wording only in the tooltip and the accessible name.
 */
export function NoSeason({ kind = "league", compact = false, className, season, children }: { kind?: NoSeasonKind; compact?: boolean; className?: string; season?: number; children?: React.ReactNode }) {
  const { say } = useSpeaker();
  const label = say(NO_SEASON_KEY[kind]);
  return (
    <span className={"noseason" + (compact ? " compact" : "") + (className ? ` ${className}` : "")} data-season={season} title={label} role="img" aria-label={compact && children != null ? `${children}: ${label}` : label}>
      {compact ? (children ?? "–") : label}
    </span>
  );
}

export function Figures({ items }: { items: [string, number | string][] }) {
  const { fmt } = useSpeaker();
  return (
    <section className="figures">
      {items.map(([k, v]) => (
        <div className="figure" key={k}>
          <b>{typeof v === "number" ? fmt(v) : v}</b>
          <span>{k}</span>
        </div>
      ))}
    </section>
  );
}
