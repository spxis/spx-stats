"use client";

import { useMemo, useSyncExternalStore } from "react";
import { addressSearch, readParam, serverSearch, subscribeSearch, writeParams } from "@/lib/addressQuery";
import { isLeague, LEAGUES, SRC } from "@/lib/leagues";
import { KINDS, OUTCOMES, provenanceTriples, sourcesByCount, sum, weight, type Kind, type Outcome, type ProvRow } from "@/lib/provenance";
import { scoresPath } from "@/lib/scores";
import { useSpeaker } from "./i18n/LocaleProvider";
import type { SankeyLinkIn, SankeyNodeIn } from "./Sankey";
import { SankeyLazy } from "./SankeyLazy";

interface Props {
  rows: ProvRow[];
  sources: Record<string, { name: string; url: string | null }>;
}

const OUTCOME_TONE: Record<Outcome, string> = { confirmed: "var(--ok)", disputed: "var(--bad)", not_found: "var(--warn)", single: "var(--muted)" };
const OUTCOME_LABEL = { confirmed: "prov.confirmed", disputed: "prov.disputed", not_found: "prov.notFound", single: "prov.single" } as const;
const OUTCOME_LINE = { confirmed: "prov.confirmedLine", disputed: "prov.disputedLine", not_found: "prov.notFoundLine", single: "prov.singleLine" } as const;

/** Where a kind of record is shown, in one league or in all of them. */
function kindHref(kind: Kind, league: string | null): string {
  if (kind === "person") return "/players";
  if (kind === "team_season") return "/teams";
  return league ? (kind === "game" ? scoresPath(league) : `/${league}`) : "/";
}

/**
 * How the published records got here: each source, then whether a second source confirmed, disputed or never looked at them, then what
 * they became (games, team seasons, seasons, people). The league is ?lg= in the address, read by the browser (the page stays static).
 */
export function FlowProvenance({ rows, sources }: Props) {
  const { say, plural, fmt } = useSpeaker();
  const search = useSyncExternalStore(subscribeSearch, addressSearch, serverSearch);
  const lgParam = readParam(search, "lg");
  const league = isLeague(lgParam) ? lgParam : null;

  const built = useMemo(() => {
    const triples = provenanceTriples(rows, league);
    const order = sourcesByCount(triples);
    const name = (code: string) => SRC[code] ?? sources[code]?.name ?? code;
    const kindName = (k: Kind) => say(`prov.kind.${k}`);
    const outcomes = OUTCOMES.filter((o) => triples.some((t) => t.outcome === o));
    const kinds = KINDS.filter((k) => triples.some((t) => t.kind === k));
    const sid = (s: string) => `s:${s}`, oid = (o: Outcome) => `o:${o}`, kid = (k: Kind) => `k:${k}`;

    const sourceNodes: SankeyNodeIn[] = order.map((s, i) => {
      const mine = triples.filter((t) => t.source === s);
      const url = sources[s]?.url ?? null;
      return {
        id: sid(s), column: 0, order: i, label: name(s), sub: plural("prov.records", sum(mine)), href: url ?? "/sources", tone: "var(--ink)",
        title: name(s),
        lines: [plural("prov.records", sum(mine)), ...OUTCOMES.filter((o) => mine.some((t) => t.outcome === o)).map((o) => say("prov.line", { label: say(OUTCOME_LABEL[o]), count: fmt(sum(mine.filter((t) => t.outcome === o))) }))],
      };
    });
    const outcomeNodes: SankeyNodeIn[] = outcomes.map((o, i) => {
      const mine = triples.filter((t) => t.outcome === o);
      return {
        id: oid(o), column: 1, order: i, label: say(OUTCOME_LABEL[o]), sub: plural("prov.records", sum(mine)), href: "/quality", tone: OUTCOME_TONE[o],
        title: say(OUTCOME_LABEL[o]),
        lines: [say(OUTCOME_LINE[o]), plural("prov.records", sum(mine)), ...KINDS.filter((k) => mine.some((t) => t.kind === k)).map((k) => say("prov.line", { label: kindName(k), count: fmt(sum(mine.filter((t) => t.kind === k))) }))],
      };
    });
    const kindNodes: SankeyNodeIn[] = kinds.map((k, i) => {
      const mine = triples.filter((t) => t.kind === k);
      return {
        id: kid(k), column: 2, order: i, label: kindName(k), sub: plural("prov.records", sum(mine)), href: kindHref(k, league), tone: "var(--ink)",
        title: kindName(k),
        lines: [plural("prov.records", sum(mine)), ...OUTCOMES.filter((o) => mine.some((t) => t.outcome === o)).map((o) => say("prov.line", { label: say(OUTCOME_LABEL[o]), count: fmt(sum(mine.filter((t) => t.outcome === o))) }))],
      };
    });

    // Every link carries the weights of the exact (source, outcome, kind) groups behind it, so each block keeps what flows in equal to what flows out.
    const so = new Map<string, number>(), ok = new Map<string, number>();
    for (const t of triples) {
      so.set(`${t.source}|${t.outcome}`, (so.get(`${t.source}|${t.outcome}`) ?? 0) + weight(t.n));
      ok.set(`${t.outcome}|${t.kind}`, (ok.get(`${t.outcome}|${t.kind}`) ?? 0) + weight(t.n));
    }
    const links: SankeyLinkIn[] = [];
    for (const s of order) for (const o of outcomes) {
      const mine = triples.filter((t) => t.source === s && t.outcome === o);
      if (!mine.length) continue;
      const checkers = new Map<string, number>();
      for (const t of mine) for (const [c, n] of t.checkers) checkers.set(c, (checkers.get(c) ?? 0) + n);
      const names = [...checkers.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${name(c)} ${fmt(n)}`).join(", ");
      links.push({
        id: `${sid(s)}>${oid(o)}`, source: sid(s), target: oid(o), value: so.get(`${s}|${o}`)!, href: "/quality", tone: OUTCOME_TONE[o],
        title: say("prov.band", { from: name(s), to: say(OUTCOME_LABEL[o]) }),
        lines: [plural("prov.records", sum(mine)), ...KINDS.filter((k) => mine.some((t) => t.kind === k)).map((k) => say("prov.line", { label: kindName(k), count: fmt(sum(mine.filter((t) => t.kind === k))) })), ...(names ? [say("prov.checkedBy", { names })] : [])],
      });
    }
    for (const o of outcomes) for (const k of kinds) {
      const mine = triples.filter((t) => t.outcome === o && t.kind === k);
      if (!mine.length) continue;
      links.push({
        id: `${oid(o)}>${kid(k)}`, source: oid(o), target: kid(k), value: ok.get(`${o}|${k}`)!, href: kindHref(k, league), tone: OUTCOME_TONE[o],
        title: say("prov.band", { from: say(OUTCOME_LABEL[o]), to: kindName(k) }),
        lines: [plural("prov.records", sum(mine)), ...[...mine].sort((a, b) => b.n - a.n).map((t) => say("prov.line", { label: name(t.source), count: fmt(t.n) }))],
      });
    }
    const traces = triples.map((t) => [sid(t.source), oid(t.outcome), kid(t.kind)]);
    return { nodes: [...sourceNodes, ...outcomeNodes, ...kindNodes], links, traces, hasSelf: triples.some((t) => t.checkers.has(t.source)), people: kinds.includes("person") && triples.filter((t) => t.kind === "person").every((t) => t.outcome === "single") };
  }, [rows, sources, league, say, plural, fmt]);

  return (
    <div>
      <div className="sk-controls">
        <div className="seg" role="group" aria-label={say("lineage.leagueAria")}>
          <button type="button" aria-pressed={league == null} onClick={() => writeParams({ lg: "" })}>{say("phase.all")}</button>
          {LEAGUES.map((l) => (
            <button key={l.code} type="button" aria-pressed={l.code === league} onClick={() => writeParams({ lg: l.code })}>{l.short}</button>
          ))}
        </div>
      </div>
      {built.nodes.length ? (
        <SankeyLazy
          nodes={built.nodes} links={built.links} traces={built.traces} height={420} minPitch={110}
          columnTitles={[say("prov.colSource"), say("prov.colCheck"), say("prov.colKind")]}
          labels={{ hint: say("prov.hint"), open: (title) => say("sankey.open", { title }), aria: say("prov.aria") }}
        />
      ) : <p className="note">{say("lineage.none")}</p>}
      <p className="sk-note">{say("prov.noteWeights")}{built.hasSelf ? ` ${say("prov.noteSelf")}` : ""}{built.people ? ` ${say("prov.notePeople")}` : ""}</p>
    </div>
  );
}
