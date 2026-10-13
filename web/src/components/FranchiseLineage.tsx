"use client";

import { useMemo, useSyncExternalStore } from "react";
import { addressSearch, readParam, serverSearch, subscribeSearch, writeParams } from "@/lib/addressQuery";
import { isLeague, LEAGUES, LG, seasonLabel } from "@/lib/leagues";
import { decadesOf, lineageGraph, MERGERS, pickFranchises, type Franchise } from "@/lib/lineage";
import { recordText } from "@/lib/record";
import { seasonPath } from "@/lib/slug";
import { useSpeaker } from "./i18n/LocaleProvider";
import type { SankeyLinkIn, SankeyNodeIn } from "./Sankey";
import { SankeyLazy } from "./SankeyLazy";

interface Props {
  franchises: Franchise[];
  omitted: Record<string, number>;
}

const DEFAULT_LEAGUE = "nhl";
const NAMES_SHOWN = 8;

/**
 * Where every franchise of a league came from: the season it first appears in, then each name it played under. The league, the
 * decade and "changed name" live in the address (?lg= ?dec= ?chg=1) and are read by the browser, so the page itself stays static.
 */
export function FranchiseLineage({ franchises, omitted }: Props) {
  const { say, plural, fmt } = useSpeaker();
  const search = useSyncExternalStore(subscribeSearch, addressSearch, serverSearch);
  const lgParam = readParam(search, "lg");
  const lg = isLeague(lgParam) ? lgParam : DEFAULT_LEAGUE;
  const mine = useMemo(() => franchises.filter((f) => f.league === lg), [franchises, lg]);
  const decades = useMemo(() => decadesOf(mine), [mine]);
  const decParam = Number(readParam(search, "dec"));
  const decade = decades.includes(decParam) ? decParam : null;
  const changed = readParam(search, "chg") === "1";
  const picked = useMemo(() => pickFranchises(mine, { decade, changed }), [mine, decade, changed]);

  const built = useMemo(() => {
    const g = lineageGraph(picked);
    const tone = `var(--${lg})`;
    const nodes: SankeyNodeIn[] = g.nodes.map((n) => {
      if (n.kind === "entry") {
        const season = seasonLabel(lg, n.year!);
        const names = n.members.map((m) => m.stretches[0]!.name);
        const shown = names.slice(0, NAMES_SHOWN).join(", ");
        const merger = MERGERS[lg]?.year === n.year ? MERGERS[lg] : null;
        return {
          id: n.id, column: 0, order: n.order, label: season, sub: plural("count.teams", n.members.length), href: seasonPath(lg, n.year!), tone: "var(--ink)",
          title: say("lineage.entryTitle", { league: LG[lg], season }),
          lines: [
            say("lineage.entryLine", { names: names.length > NAMES_SHOWN ? say("lineage.entryMore", { names: shown, count: fmt(names.length - NAMES_SHOWN) }) : shown }),
            ...(merger ? [say("lineage.merger", { other: merger.other, league: LG[lg] })] : []),
          ],
        };
      }
      const f = n.franchise!, s = n.stretch!, i = n.index!;
      const prev = f.stretches[i - 1], next = f.stretches[i + 1];
      const last = i === f.stretches.length - 1;
      return {
        id: n.id, column: n.column, order: n.order, label: s.name, sub: `${s.from}–${s.to}`, href: f.href, tone, muted: last && !f.active,
        title: s.name,
        lines: [
          say("lineage.seasonsRange", { from: seasonLabel(lg, s.from), to: seasonLabel(lg, s.to) }),
          plural("count.seasons", s.seasons),
          say("lineage.record", { record: recordText(s) }),
          ...(s.titles ? [plural("lineage.titles", s.titles)] : []),
          ...(f.stretches.length > 1 ? [say("lineage.nameOf", { n: fmt(i + 1), total: fmt(f.stretches.length) })] : []),
          ...(prev ? [say("lineage.before", { name: prev.name })] : []),
          ...(next ? [say("lineage.after", { name: next.name })] : []),
          ...(last ? [f.active ? say("lineage.playing") : say("lineage.ended", { season: seasonLabel(lg, f.last) })] : []),
        ],
      };
    });
    const nodeById = new Map(g.nodes.map((n) => [n.id, n]));
    const links: SankeyLinkIn[] = g.links.map((l) => {
      const to = nodeById.get(l.target)!;
      const from = nodeById.get(l.source)!;
      const s = to.stretch!;
      return {
        id: l.id, source: l.source, target: l.target, value: l.value, href: l.franchise.href, tone,
        title: from.kind === "entry" ? s.name : `${from.stretch!.name} → ${s.name}`,
        lines: [from.kind === "entry" ? say("lineage.joined", { season: seasonLabel(lg, s.from) }) : say("lineage.became", { name: s.name, season: seasonLabel(lg, s.from) })],
      };
    });
    const columnTitles = [say("lineage.colEntry"), ...Array.from({ length: g.columns - 1 }, (_, i) => say("lineage.colName", { n: fmt(i + 1) }))];
    return { nodes, links, columnTitles };
  }, [picked, lg, say, plural, fmt]);

  const set = (changes: Record<string, string>) => writeParams(changes);
  const omittedHere = omitted[lg] ?? 0;

  return (
    <div>
      <div className="sk-controls">
        <div className="seg" role="group" aria-label={say("lineage.leagueAria")}>
          {LEAGUES.map((l) => (
            <button key={l.code} type="button" aria-pressed={l.code === lg} onClick={() => set({ lg: l.code === DEFAULT_LEAGUE ? "" : l.code, dec: "" })}>{l.short}</button>
          ))}
        </div>
        <label>
          {say("lineage.decade")}
          <select value={decade ?? ""} onChange={(e) => set({ dec: e.target.value })}>
            <option value="">{say("lineage.decadeAll")}</option>
            {decades.map((d) => <option key={d} value={d}>{say("lineage.decadeOption", { decade: String(d) })}</option>)}
          </select>
        </label>
        <label className="sk-check">
          <input type="checkbox" checked={changed} onChange={(e) => set({ chg: e.target.checked ? "1" : "" })} />
          {say("lineage.changed")}
        </label>
      </div>
      {picked.length ? (
        <SankeyLazy
          nodes={built.nodes} links={built.links} columnTitles={built.columnTitles} unitPx={22}
          labels={{ hint: say("lineage.hint"), open: (title) => say("sankey.open", { title }), aria: say("lineage.aria", { league: LG[lg] }) }}
        />
      ) : <p className="note">{say("lineage.none")}</p>}
      <p className="sk-note">{say("lineage.noteChanged")}{MERGERS[lg] ? ` ${say("lineage.noteMergers")}` : ""}{omittedHere ? ` ${plural("lineage.noteOmitted", omittedHere)}` : ""}</p>
    </div>
  );
}
