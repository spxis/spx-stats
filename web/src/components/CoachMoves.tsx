"use client";

import { useMemo, useSyncExternalStore } from "react";
import { addressSearch, readParam, serverSearch, subscribeSearch, writeParams } from "@/lib/addressQuery";
import { chainsFor, coachGraph, decadesOf, defaultDecade, type Stint } from "@/lib/coachMoves";
import { coachRowsPath, unpackCoach, type CoachWire } from "@/lib/coachWire";
import { isLeague, LEAGUES, LG, seasonLabel } from "@/lib/leagues";
import { recordText } from "@/lib/record";
import { nickname } from "@/lib/series";
import { useSpeaker } from "./i18n/LocaleProvider";
import type { SankeyLinkIn, SankeyNodeIn } from "./Sankey";
import { SankeyLazy } from "./SankeyLazy";
import { useFetchedJson } from "./useFetchedJson";

const DEFAULT_LEAGUE = "nhl";

/**
 * How head coaches moved between franchises, league by league: each block is a franchise at a coach's nth job, each band one coach going
 * on to the next. The league and the decade the moves were made in live in the address (?lg= ?dec=, "all" for every decade) and are read
 * by the browser, so the page itself stays static. The moves of the league chosen are fetched from a kept JSON route (/teams/coaches/rows/nhl), not carried by the page.
 */
export function CoachMoves() {
  const { say, plural } = useSpeaker();
  const search = useSyncExternalStore(subscribeSearch, addressSearch, serverSearch);
  const lgParam = readParam(search, "lg");
  const lg = isLeague(lgParam) ? lgParam : DEFAULT_LEAGUE;
  const { state, data: wire } = useFetchedJson<CoachWire>(coachRowsPath(lg), "data", true);
  const data = useMemo(() => (wire ? unpackCoach(lg, wire) : null), [wire, lg]);
  const careers = data?.careers;
  const decades = useMemo(() => (careers ? decadesOf(careers) : []), [careers]);
  const decParam = readParam(search, "dec");
  const decade = decParam === "all" ? null : decades.includes(Number(decParam)) ? Number(decParam) : careers ? defaultDecade(careers) : null;

  const built = useMemo(() => {
    if (!data) return null;
    const chains = chainsFor(data.careers, decade);
    const g = coachGraph(chains, (_f, s) => data.names[s] ?? "");
    const years = (s: Stint) => (s.a === s.b ? say("coaches.oneSeason", { season: seasonLabel(lg, s.a) }) : say("lineage.seasonsRange", { from: seasonLabel(lg, s.a), to: seasonLabel(lg, s.b) }));
    const stintLines = (s: Stint): string[] => [
      say("coaches.stint", { team: data.names[s.s] ?? "", years: years(s) }),
      ...(s.sole ? [plural("coaches.record", s.sole, { record: recordText(s.rec) })] : []),
    ];
    const club = (f: number) => data.clubs[f];
    const nodes: SankeyNodeIn[] = g.nodes.map((n) => {
      const latest = n.held.at(-1)!.stint;
      const name = data.names[latest.s] ?? "";
      return {
        id: n.id, column: n.column, order: n.order, label: nickname(name), sub: plural("coaches.count", n.held.length), href: club(n.f)?.href, tone: club(n.f)?.tone ?? "var(--muted)",
        title: name,
        lines: [plural("coaches.count", n.held.length)],
        items: n.held.map((h) => ({ label: `${h.chain.career.name} (${years(h.stint)})`, href: h.chain.career.href ?? club(n.f)?.href })),
      };
    });
    const links: SankeyLinkIn[] = g.links.map((l) => {
      const from = l.chain.stints[l.k], to = l.chain.stints[l.k + 1];
      return {
        id: l.id, source: l.source, target: l.target, value: 1, tone: club(from.f)?.tone, href: l.chain.career.href ?? club(to.f)?.href,
        title: l.chain.career.name,
        lines: [...stintLines(from), "→", ...stintLines(to)],
      };
    });
    const titles = Array.from({ length: g.columns }, (_, c) => say(c === 0 ? (decade == null ? "coaches.colFirst" : "coaches.colFrom") : c === 1 ? "coaches.colTo" : "coaches.colThen"));
    return { nodes, links, routes: g.routes, titles, coaches: new Set(chains.map((c) => c.career.id)).size, moves: g.links.length };
  }, [data, decade, lg, say, plural]);

  return (
    <div>
      <div className="sk-controls">
        <div className="seg" role="group" aria-label={say("lineage.leagueAria")}>
          {LEAGUES.map((l) => (
            <button key={l.code} type="button" aria-pressed={l.code === lg} onClick={() => writeParams({ lg: l.code === DEFAULT_LEAGUE ? "" : l.code, dec: "" })}>{l.short}</button>
          ))}
        </div>
        <label>
          {say("coaches.decade")}
          <select value={decade == null ? "all" : decade} onChange={(e) => writeParams({ dec: e.target.value })}>
            <option value="all">{say("lineage.decadeAll")}</option>
            {[...decades].reverse().map((d) => <option key={d} value={d}>{say("lineage.decadeOption", { decade: String(d) })}</option>)}
          </select>
        </label>
      </div>
      {built && built.links.length ? (
        <>
          <p className="note">{say("coaches.summary", { coaches: plural("coaches.count", built.coaches), moves: plural("coaches.moves", built.moves) })}</p>
          <SankeyLazy
            nodes={built.nodes} links={built.links} routes={built.routes} columnTitles={built.titles} unitPx={decade == null ? 6 : 14} minPitch={150} panel
            labels={{ hint: say("coaches.hint"), open: (title) => say("sankey.open", { title }), aria: say("coaches.aria", { league: LG[lg] }) }}
          />
        </>
      ) : !data ? (
        state === "failed" || state === "empty" ? <p className="note">{say("load.failed")}</p> : <div className="sk-skeleton" role="status">{say("sankey.loading")}</div>
      ) : <p className="note">{say("coaches.none")}</p>}
      <p className="sk-note">{say("coaches.note")}</p>
    </div>
  );
}
