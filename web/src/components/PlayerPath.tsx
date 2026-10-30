"use client";

import Link from "@/components/Link";
import { useMemo, useSyncExternalStore } from "react";
import { awardBadge, type SeasonInfo } from "@/lib/playerBoard";
import { isLeague, LG, seasonLabel } from "@/lib/leagues";
import { useSpeaker } from "./i18n/LocaleProvider";
import { usePaths } from "./SlugProvider";
import { TeamLogo } from "./TeamLogo";
import { usePointCard } from "./usePointCard";
import type { BoardView } from "./playerView";

const never = () => () => {};
/** The height of one league's strip (the stay's names, the badges, the cells and the years), so the box does not jump when the strip is drawn. */
const ROW_HEIGHT = 110;
const short = (y: number) => `’${String(y % 100).padStart(2, "0")}`;

/**
 * The career path: a strip of the clubs by season, in the seasons chosen, in the style of the league heat rows. Each season is a cell in its club's
 * colour (two stacked when the player was on two clubs), the first cell of a stay carries the club's logo of that era and its name runs across the
 * stay, a ★ marks a title and a round badge an award, and an arrow marks a move to another club. A cell opens that club's season.
 */
export function PlayerPath({ view }: { view: BoardView }) {
  const { say } = useSpeaker();
  const paths = usePaths();
  const { data, state } = view;
  const { span } = state;
  const leagues = useMemo(() => [...new Set(data.seasons.map((s) => s.league))], [data.seasons]);
  const years = useMemo(() => Array.from({ length: span.to - span.from + 1 }, (_, i) => span.from + i), [span.from, span.to]);
  const keys = useMemo(() => leagues.flatMap((lg) => years.filter((y) => data.seasons.some((s) => s.league === lg && s.year === y)).map((y) => `${lg}:${y}`)), [leagues, years, data.seasons]);
  const card = usePointCard(keys);
  // The strip is a drawing whose words are all in the tables below, so the page does not carry it: it is drawn in the browser, in a box held at its height.
  const drawn = useSyncExternalStore(never, () => true, () => false);
  if (!data.seasons.length) return null;

  return (
    <div className="pchart ppathbox">
      <h3>{say("ppath.title")}</h3>
      <p className="note">{say("ppath.note")}</p>
      <div className="chart scroll" data-marks style={drawn ? undefined : { minHeight: leagues.length * ROW_HEIGHT + (leagues.length - 1) * 2 }}>
        {drawn ? leagues.map((lg) => <Row key={lg} lg={lg} many={leagues.length > 1} view={view} years={years} card={card} paths={paths} />) : null}
        {card.element}
      </div>
    </div>
  );
}

type Card = ReturnType<typeof usePointCard>;

function Row({ lg, many, view, years, card, paths }: { lg: string; many: boolean; view: BoardView; years: number[]; card: Card; paths: ReturnType<typeof usePaths> }) {
  const { say } = useSpeaker();
  const { data } = view;
  const mine = data.seasons.filter((s) => s.league === lg);
  const first = Math.min(...mine.map((s) => s.year)), last = Math.max(...mine.map((s) => s.year));
  const byYear = new Map<number, SeasonInfo[]>();
  for (const s of mine) byYear.set(s.year, [...(byYear.get(s.year) ?? []), s]);
  const titleYears = new Set(data.titles.filter((t) => t.league === lg).map((t) => t.year));
  for (const s of mine) if (s.champ) titleYears.add(s.year);
  const awardsBy = new Map<number, string[]>();
  for (const a of data.awards) if (a.league === lg) awardsBy.set(a.year, [...(awardsBy.get(a.year) ?? []), a.award]);
  const info = (s: SeasonInfo) => data.clubs[`${s.league}|${s.f}|${s.year}`];

  // The stays: runs of seasons in a row with the same first club.
  const stays: { from: number; len: number; s: SeasonInfo }[] = [];
  years.forEach((y, i) => {
    const s = byYear.get(y)?.[0];
    if (!s) return;
    const prev = stays.at(-1);
    if (prev && prev.s.f === s.f && prev.from + prev.len === i) prev.len++;
    else stays.push({ from: i, len: 1, s });
  });
  const startOf = new Map(stays.map((t) => [t.from, t]));

  return (
    <div className="prow">
      {many ? <span className="plg">{isLeague(lg) ? LG[lg] : lg}</span> : null}
      <div className="pgrid" style={{ gridTemplateColumns: `repeat(${years.length}, minmax(34px, 64px))` }}>
        {stays.map((t) => (
          <div key={t.from} className="pstay" style={{ gridColumn: `${t.from + 1} / span ${t.len}`, gridRow: 1 }} title={t.s.team ?? undefined}>
            <TeamLogo url={info(t.s)?.logo} size={16} /><span>{t.s.team ?? say("team.fallback", { id: t.s.f })}</span>
          </div>
        ))}
        {years.map((y, i) => {
          const title = titleYears.has(y), awards = awardsBy.get(y) ?? [];
          return (
            <div key={y} className="pev" style={{ gridColumn: i + 1, gridRow: 2 }} aria-hidden="true">
              {title ? <b className="glyph star">★</b> : null}
              {awards.slice(0, 2).map((a) => <span key={a} className="pbadge" title={a}>{awardBadge(a)}</span>)}
              {awards.length > 2 ? <span className="pbadge more">+{awards.length - 2}</span> : null}
            </div>
          );
        })}
        {years.map((y, i) => {
          const list = byYear.get(y);
          const col = { gridColumn: i + 1, gridRow: 3 };
          if (!list) {
            const gap = y > first && y < last;
            return <div key={y} className={`pcell ${gap ? "gap" : "none"}`} style={col} title={gap ? say("noseason.team") : undefined} />;
          }
          const prevPrimary = byYear.get(y - 1)?.[0];
          const moved = prevPrimary != null && prevPrimary.f !== list[0].f;
          const title = titleYears.has(y), awards = awardsBy.get(y) ?? [];
          const key = `${lg}:${y}`;
          const body = () => (
            <>
              <b>{seasonLabel(lg, y)}</b>
              {list.map((s) => <div key={s.f} className="tipclub"><TeamLogo url={info(s)?.logo} size={14} />{s.team ?? say("team.fallback", { id: s.f })}</div>)}
              {moved ? <div>{say("ppath.joined", { team: list[0].team ?? "" })}</div> : null}
              {title ? <div>{say("bars.title")}</div> : null}
              {awards.map((a) => <div key={a}>{a}</div>)}
              {list.some((s) => s.po) ? <div>{say("bars.playoffs")}</div> : list.some((s) => s.teamPo) ? <div>{say("player.teamPlayoffsTip")}</div> : null}
              <div className="tiphint">{say("bars.open")}</div>
            </>
          );
          const lead = startOf.has(i);
          return (
            <div key={y} className={`pcell${moved ? " moved" : ""}`} style={col}>
              {list.map((s, k) => {
                const props = k === 0 ? card.bind(key, body) : {};
                return (
                  <Link key={s.f} href={paths.teamSeason(s.league, s.f, s.year)} prefetch={false} className="pseg" style={{ background: info(s)?.tone ?? "var(--muted)" }}
                    aria-label={`${seasonLabel(lg, y)}: ${s.team ?? ""}${title ? `, ${say("trophy.champion")}` : ""}`} {...props}>
                    {(lead && k === 0) || k > 0 ? <TeamLogo url={info(s)?.logo} size={14} shape="circle" /> : null}
                    <span className="visually-hidden">{seasonLabel(lg, y)} {s.team}</span>
                  </Link>
                );
              })}
            </div>
          );
        })}
        {years.map((y, i) => <span key={y} className="pyr" style={{ gridColumn: i + 1, gridRow: 4 }}>{short(y)}</span>)}
      </div>
    </div>
  );
}
