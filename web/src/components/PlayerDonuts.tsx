"use client";

import { arc, pie, type PieArcDatum } from "d3";
import Link from "next/link";
import { useMemo, useState } from "react";
import { clubKey, shares, sumStats, type GroupView, type Metric, type StatRow } from "@/lib/playerBoard";
import type { PhraseKey } from "@/lib/i18n/phrases.constants";
import { seasonLabel } from "@/lib/leagues";
import { showStat } from "@/lib/playerStats";
import { useSpeaker } from "./i18n/LocaleProvider";
import { DonutCentre } from "./DonutCentre";
import { usePaths } from "./SlugProvider";
import { TeamLogo } from "./TeamLogo";
import { useDonutLive } from "./useDonutLive";
import { usePointCard } from "./usePointCard";
import type { BoardView } from "./playerView";

interface Part { key: string; label: string; value: number; color: string; logo?: string | null; href?: string; note?: string }

const R = { inner: 58, outer: 92 };

/** One donut: slices that share a whole, a legend with each one's value and share, the whole in the middle. Hover, tap or the arrow keys show a slice's card. */
function Donut({ title, sub, parts, centre, fmtValue, aria }: { title: string; sub?: string; parts: Part[]; centre: { big: string; small: string }; fmtValue: (v: number) => string; aria: string }) {
  const { say, fmt } = useSpeaker();
  const total = parts.reduce((a, p) => a + p.value, 0);
  const keys = parts.map((p) => p.key);
  const card = usePointCard(keys);
  const live = useDonutLive();
  const under = parts.find((p) => p.key === live.key);
  const slice = arc<PieArcDatum<Part>>().innerRadius(R.inner).outerRadius(R.outer).padAngle(parts.length > 1 ? 0.014 : 0).cornerRadius(2);
  const slices = pie<Part>().sort(null).value((p) => p.value)(parts);
  const pct = (v: number) => `${(v / total * 100).toFixed(v / total < 0.1 ? 1 : 0)}%`;
  return (
    <div className="donutbox pdonut">
      <h3>{title}</h3>
      {sub ? <p className="note">{sub}</p> : null}
      <div className="chart donut" data-marks>
        <svg viewBox="0 0 200 200" role="group" aria-label={`${aria}: ${parts.map((p) => `${p.label} ${fmtValue(p.value)}`).join(", ")}`}>
          <g transform="translate(100,100)">
            {slices.map((d) => {
              const b = card.bind(d.data.key, () => (
                <>
                  <b>{d.data.label}</b>
                  <div>{say("charts.sliceTip", { n: fmt(d.data.value), total: fmt(total), pct: pct(d.data.value) })}</div>
                  {d.data.note ? <div>{d.data.note}</div> : null}
                </>
              ));
              const l = live.bind(d.data.key);
              return (
                <path key={d.data.key} className="slice" d={slice(d) ?? undefined} style={{ fill: d.data.color }} role="img" aria-label={`${d.data.label}: ${fmtValue(d.data.value)} (${pct(d.data.value)})`}
                  {...b}
                  onPointerEnter={(ev) => { b.onPointerEnter(ev); l.onPointerEnter(); }}
                  onPointerLeave={(ev) => { b.onPointerLeave(ev); l.onPointerLeave(); }}
                  onFocus={(ev) => { b.onFocus(ev); l.onFocus(); }}
                  onBlur={(ev) => { b.onBlur(ev); l.onBlur(); }} />
              );
            })}
          </g>
          <DonutCentre rest={{ big: centre.big, sub: centre.small }} item={under ? { label: under.label, n: under.value } : null} total={total} fmtValue={fmtValue}
            pct={(v) => `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%`} y={102} />
        </svg>
        {card.element}
      </div>
      <ul className="legend plegend pdlegend">
        {parts.map((p) => (
          <li key={p.key}>
            <i style={{ background: p.color }} />
            {p.logo ? <TeamLogo url={p.logo} size={14} /> : null}
            {p.href ? <Link href={p.href} prefetch={false}>{p.label}</Link> : p.label}
            <span className="pv">{fmtValue(p.value)} · {pct(p.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const PALETTE = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)"];

/** Shares of the seasons chosen: by club, regular season against playoffs, and the stat's own split (goals and assists, the kinds of hit, wins and losses). */
export function PlayerDonuts({ view, g, metric: picked }: { view: BoardView; g: GroupView; metric: Metric }) {
  const { say, fmt } = useSpeaker();
  const paths = usePaths();
  const [byGames, setByGames] = useState(false);
  const metric = picked.sum && picked.id !== "gp" ? picked : g.def.metrics.find((m) => m.id === g.def.main)!;
  const { clubs } = view.data;
  const measure = (rows: readonly StatRow[]) => (byGames ? (g.def.games(sumStats(rows)) ?? 0) : (metric.get(sumStats(rows)) ?? 0));
  const val = (v: number) => (!byGames && metric.kind === "ip" ? showStat("ip", v, fmt) : fmt(v));

  const teamParts = useMemo<Part[]>(() => {
    const by = new Map<string, StatRow[]>();
    for (const r of g.rows) by.set(clubKey(r), [...(by.get(clubKey(r)) ?? []), r]);
    const raw = [...by].map(([key, rows]) => {
      const last = rows.reduce((a, b) => (b.year > a.year ? b : a));
      const c = clubs[`${last.league}|${last.f}|${last.year}`];
      const years = rows.map((r) => r.year);
      return { key, rows, last, c, v: measure(rows), span: `${seasonLabel(last.league, Math.min(...years))}${Math.max(...years) > Math.min(...years) ? `–${seasonLabel(last.league, Math.max(...years))}` : ""}` };
    });
    return shares(raw.map((r) => ({ key: r.key, value: r.v }))).map((s) => {
      const r = raw.find((x) => x.key === s.key)!;
      return { key: s.key, label: r.last.team ?? say("team.fallback", { id: r.last.f }), value: s.value, color: r.c?.tone ?? "var(--muted)", logo: r.c?.logo, href: paths.team(r.last.league, r.last.f), note: r.span };
    }).sort((a, b) => b.value - a.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- measure is rebuilt each render from byGames, metric and rows
  }, [g.rows, clubs, byGames, metric, say, paths]);

  const phaseParts = useMemo<Part[]>(() => {
    const regular = g.both.filter((r) => r.phase === "regular"), playoffs = g.both.filter((r) => r.phase === "playoffs");
    return shares([{ key: "regular", value: measure(regular) }, { key: "playoffs", value: measure(playoffs) }]).map((s) => ({
      key: s.key, label: say(s.key === "regular" ? "phase.regular" : "phase.playoffs"), value: s.value, color: s.key === "regular" ? PALETTE[0] : PALETTE[1] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g.both, byGames, metric, say]);

  const split = g.def.split;
  const splitParts = useMemo<Part[]>(() => {
    const total = sumStats(g.rows);
    return shares(split.parts.map((p) => ({ key: p.key, value: p.get(total) ?? 0 }))).map((s, i) => ({
      key: s.key, label: say(split.parts.find((p) => p.key === s.key)!.label as PhraseKey), value: s.value, color: PALETTE[i % PALETTE.length] }));
  }, [g.rows, split, say]);

  const name = say(byGames ? "stat.gp.name" : (metric.title as PhraseKey));
  const sum = (ps: Part[]) => ps.reduce((a, p) => a + p.value, 0);
  return (
    <div className="pchart pdonuts">
      <h3>{say("charts.shares")}</h3>
      <div className="seg" role="group" aria-label={say("charts.sharesAria")}>
        <button type="button" aria-pressed={!byGames} onClick={() => setByGames(false)}>{say(metric.label as PhraseKey)}</button>
        <button type="button" aria-pressed={byGames} onClick={() => setByGames(true)}>{say("stat.gp")}</button>
      </div>
      <div className="chartrow">
        {teamParts.length > 0 ? (
          <Donut title={say("charts.byTeam", { stat: name })} parts={teamParts} fmtValue={val} aria={say("charts.byTeam", { stat: name })}
            centre={{ big: val(sum(teamParts)), small: say(byGames ? "stat.gp" : (metric.label as PhraseKey)) }} />
        ) : null}
        {phaseParts.length > 1 ? (
          <Donut title={say("charts.byPhase", { stat: name })} parts={phaseParts} fmtValue={val} aria={say("charts.byPhase", { stat: name })}
            centre={{ big: val(sum(phaseParts)), small: say(byGames ? "stat.gp" : (metric.label as PhraseKey)) }} />
        ) : null}
        {splitParts.length > 1 ? (
          <Donut title={say(split.label as PhraseKey)} parts={splitParts} fmtValue={fmt} aria={say(split.label as PhraseKey)}
            centre={{ big: fmt(sum(splitParts)), small: say("charts.total") }} />
        ) : null}
      </div>
    </div>
  );
}
