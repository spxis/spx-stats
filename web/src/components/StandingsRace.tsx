"use client";

import { curveBumpX, line, scaleLinear } from "d3";
import { useMemo, useRef, useState } from "react";
import type { PhraseKey } from "@/lib/i18n/phrases.constants";
import { LOCALE_TAG } from "@/lib/locale";
import type { Race, RaceRecord, RaceTeam } from "@/lib/standingsRace";
import type { SortColumn, SortRow } from "@/lib/sort";
import { atUtc } from "@/lib/format";
import { useSpeaker } from "./i18n/LocaleProvider";
import { SortTable } from "./SortTable";
import { TipLines, useTooltip } from "./Tooltip";
import { useChartWidth } from "./useChartWidth";
import "./race.css";

/** What the chart needs to draw one club: its name, the short form for tight places, and its colour (null: the page's grey). */
export interface RaceClub { name: string; abbr: string; tone: string | null }

interface Props {
  race: Race;
  clubs: Record<number, RaceClub>;
  /** True where the record is wins, losses and overtime losses (otherwise wins and losses, with ties where the league has them). */
  countsOtl: boolean;
  hasTies: boolean;
}

/**
 * The standings race: one line per club through every week of the regular season, each point the club's place in the league that week (a bump
 * chart). Point at a line to see the club's place and record for the week; press a line or its label to keep it lit (press it again, or Escape,
 * to let go), so a club can be followed through the crowd. The labels at the right are buttons (up and down move between them), and the same
 * ranks are in a table below for a screen reader or a reader who wants the numbers.
 */
export function StandingsRace({ race, clubs, countsOtl, hasTies }: Props) {
  const { say, fmt, dt, locale } = useSpeaker();
  const [ref, W] = useChartWidth(1180, 300);
  const tip = useTooltip(ref);
  const svg = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const active = pinned ?? hover;
  const ordinal = new Intl.PluralRules(LOCALE_TAG[locale], { type: "ordinal" });
  const place = (n: number) => say(`rank.${ordinal.select(n)}` as PhraseKey, { n: fmt(n) });

  const { weeks, teams } = race;
  const N = teams.length, K = weeks.length;
  const narrow = W < 520;
  const rowH = narrow ? 17 : 21;
  const m = { t: 14, r: narrow ? 40 : 52, b: 26, l: narrow ? 28 : 36 };
  const H = m.t + (N - 1) * rowH + m.b;
  const x = scaleLinear([0, K - 1], [m.l, W - m.r]);
  const y = scaleLinear([1, N], [m.t, H - m.b]);
  const path = line<number | null>().defined((d) => d != null).x((_, i) => x(i)).y((d) => y(d as number)).curve(curveBumpX);
  const club = (id: number): RaceClub => clubs[id] ?? { name: say("team.fallback", { id }), abbr: String(id), tone: null };
  const day = (i: number) => dt.monthDayShort(atUtc(weeks[i]));
  const record = (r: RaceRecord | null): string => {
    if (!r) return "";
    const [w, l, t, o] = r;
    return countsOtl ? `${fmt(w)}-${fmt(l)}-${fmt(o)}` : hasTies ? `${fmt(w)}-${fmt(l)}-${fmt(t)}` : `${fmt(w)}-${fmt(l)}`;
  };

  const every = Math.max(1, Math.ceil(K / Math.max(2, Math.floor((W - m.l - m.r) / (narrow ? 64 : 84)))));
  const xTicks = Array.from({ length: K }, (_, i) => i).filter((i) => i % every === 0);
  const yTicks = Array.from({ length: N }, (_, i) => i + 1).filter((r) => r === 1 || r % 5 === 0);

  const weekAt = (ev: React.PointerEvent<SVGElement>): number => {
    const r = svg.current?.getBoundingClientRect();
    if (!r || !r.width) return K - 1;
    const px = ((ev.clientX - r.left) / r.width) * W;
    return Math.max(0, Math.min(K - 1, Math.round(x.invert(px))));
  };
  const tipFor = (t: RaceTeam, wk: number) => {
    const rank = t.ranks[wk];
    const c = club(t.id);
    return (
      <TipLines title={c.name} lines={[
        rank == null ? say("race.notYet", { date: day(wk) }) : say("race.tip", { place: place(rank), date: day(wk), record: record(t.recs[wk]) }),
      ]} />
    );
  };
  const toggle = (id: number) => setPinned((p) => (p === id ? null : id));
  const focusLabel = (id: number) => svg.current?.querySelector<SVGGElement>(`[data-club="${id}"]`)?.focus();
  const onKey = (ev: React.KeyboardEvent, i: number) => {
    const id = teams[i].id;
    if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); toggle(id); }
    else if (ev.key === "Escape") { setPinned(null); }
    else if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault();
      const j = Math.max(0, Math.min(N - 1, i + (ev.key === "ArrowDown" ? 1 : -1)));
      focusLabel(teams[j].id);
    }
  };

  // Lines drawn dimmed first, the lit one last so it sits on top.
  const order = active == null ? teams : [...teams.filter((t) => t.id !== active), ...teams.filter((t) => t.id === active)];
  const rovingId = active ?? teams[0].id;
  const lit = active != null ? teams.find((t) => t.id === active) : undefined;

  return (
    <div className="chart race" ref={ref}>
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} role="group" aria-label={say("race.aria")}>
        <g>{yTicks.map((r) => <line key={r} x1={m.l} x2={W - m.r} y1={y(r)} y2={y(r)} stroke="var(--rule)" />)}</g>
        <g>{yTicks.map((r) => <text key={r} x={m.l - 8} y={y(r)} dy="0.32em" textAnchor="end">{fmt(r)}</text>)}</g>
        <g>{xTicks.map((i) => <text key={i} x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : i === K - 1 ? "end" : "middle"}>{day(i)}</text>)}</g>
        <g onPointerLeave={() => { setHover(null); tip.hide(); }}>
          {order.map((t) => {
            const c = club(t.id);
            const on = active === t.id;
            const d = path(t.ranks) ?? undefined;
            const first = t.ranks.findIndex((r) => r != null);
            return (
              <g key={t.id} className={`rline${on ? " on" : active != null ? " dim" : ""}`} style={{ color: c.tone ?? "var(--muted)" }}>
                <path className="rpath" d={d} />
                {on && first >= 0 ? <g>{t.ranks.map((r, i) => (r == null ? null : <circle key={i} className="rdot" cx={x(i)} cy={y(r)} r={3.4} />))}</g> : null}
                <path className="rhit" d={d}
                  onPointerMove={(ev) => { setHover(t.id); tip.show(ev, tipFor(t, weekAt(ev))); }}
                  onClick={() => toggle(t.id)} />
              </g>
            );
          })}
        </g>
        <g role="list" aria-label={say("race.labels")}>
          {teams.map((t, i) => {
            const c = club(t.id);
            const end = t.ranks[K - 1];
            if (end == null) return null;
            const on = active === t.id;
            return (
              <g key={t.id} role="listitem">
                <g className={`rlabel${on ? " on" : active != null ? " dim" : ""}`} data-club={t.id} role="button" tabIndex={t.id === rovingId ? 0 : -1} aria-pressed={pinned === t.id}
                  aria-label={`${c.name}, ${say("race.final", { place: place(end) })}`}
                  transform={`translate(${W - m.r + 6} ${y(end)})`}
                  onClick={() => toggle(t.id)} onKeyDown={(ev) => onKey(ev, i)}
                  onFocus={() => setHover(t.id)} onBlur={() => setHover((h) => (h === t.id ? null : h))}
                  onPointerEnter={() => setHover(t.id)} onPointerLeave={() => setHover((h) => (h === t.id ? null : h))}>
                  <rect x={-3} y={-rowH / 2} width={m.r - 4} height={rowH} />
                  <circle className="rkey" cx={3} cy={0} r={3.2} style={{ color: c.tone ?? "var(--muted)" }} />
                  <text x={11} dy="0.32em">{c.abbr}</text>
                </g>
              </g>
            );
          })}
        </g>
      </svg>
      {tip.element}
      <p className="racebar">
        {lit ? (
          <>
            <b>{club(lit.id).name}</b>
            {pinned != null ? <button type="button" className="raceclear" onClick={() => setPinned(null)}>{say("race.clear")}</button> : null}
          </>
        ) : <span className="hint">{say("race.hint")}</span>}
      </p>
      <RaceTable race={race} clubs={clubs} club={club} day={day} />
    </div>
  );
}

/** The ranks in a table (a row for each club, in final order, a column for each week), the same data as the lines, for a screen reader and for reading the numbers off. Its columns do not sort: the order is the point, and a sort would need a query key of its own (kept pages read none). */
function RaceTable({ race, club, day }: { race: Race; clubs: Record<number, RaceClub>; club: (id: number) => RaceClub; day: (i: number) => string }) {
  const { say, fmt } = useSpeaker();
  const { columns, rows } = useMemo(() => {
    const columns: SortColumn[] = [
      { key: "team", label: say("col.team"), nosort: true },
      { key: "end", label: say("race.finish"), num: true, nosort: true },
      ...race.weeks.map((_, i): SortColumn => ({ key: `w${i}`, label: day(i), num: true, nosort: true })),
    ];
    const rows: SortRow[] = race.teams.map((t) => {
      const cells: SortRow["cells"] = { team: club(t.id).name, end: t.ranks.at(-1) != null ? fmt(t.ranks.at(-1)!) : "–" };
      const sort: SortRow["sort"] = { team: club(t.id).name, end: t.ranks.at(-1) ?? null };
      t.ranks.forEach((r, i) => { cells[`w${i}`] = r == null ? "–" : fmt(r); });
      return { id: t.id, cells, sort };
    });
    return { columns, rows };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [race, say, fmt]);
  return (
    <details className="racetable">
      <summary>{say("race.table")}</summary>
      <div className="scroll"><SortTable columns={columns} rows={rows} label={say("race.table")} /></div>
    </details>
  );
}
