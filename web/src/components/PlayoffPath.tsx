"use client";

import { useMemo, useSyncExternalStore } from "react";
import { addressSearch, readParam, serverSearch, subscribeSearch, writeParams } from "@/lib/addressQuery";
import { useSpeaker } from "./i18n/LocaleProvider";
import type { SankeyLinkIn, SankeyNodeIn, SankeyRoute } from "./Sankey";
import { SankeyLazy } from "./SankeyLazy";

interface Props {
  nodes: SankeyNodeIn[];
  links: SankeyLinkIn[];
  routes: SankeyRoute[];
  columnTitles: string[];
  /** The blocks and bands of clubs that missed the playoffs, left out when the reader asks for the clubs that made them only. */
  hiddenNodes: string[];
  hiddenLinks: string[];
  aria: string;
  notes: string[];
}

/**
 * The playoff path diagram of a season. The one choice, "only clubs that made the playoffs" (?po=1), lives in the address and is read by
 * the browser, so the season page itself stays as it is.
 */
export function PlayoffPath({ nodes, links, routes, columnTitles, hiddenNodes, hiddenLinks, aria, notes }: Props) {
  const { say } = useSpeaker();
  const search = useSyncExternalStore(subscribeSearch, addressSearch, serverSearch);
  const only = readParam(search, "po") === "1";
  const shown = useMemo(() => {
    if (!only) return { nodes, links, routes };
    const dropN = new Set(hiddenNodes), dropL = new Set(hiddenLinks);
    return {
      nodes: nodes.filter((n) => !dropN.has(n.id)),
      links: links.filter((l) => !dropL.has(l.id)),
      routes: routes.filter((r) => !r.nodes.some((id) => dropN.has(id))),
    };
  }, [only, nodes, links, routes, hiddenNodes, hiddenLinks]);

  return (
    <div>
      {hiddenNodes.length ? (
        <div className="sk-controls">
          <label className="sk-check">
            <input type="checkbox" checked={only} onChange={(e) => writeParams({ po: e.target.checked ? "1" : "" })} />
            {say("path.onlyIn")}
          </label>
        </div>
      ) : null}
      <SankeyLazy
        nodes={shown.nodes} links={shown.links} routes={shown.routes} columnTitles={columnTitles} unitPx={15} minPitch={124}
        labels={{ hint: say("path.hint"), open: (title) => say("sankey.open", { title }), aria }}
      />
      {notes.map((n) => <p key={n} className="sk-note">{n}</p>)}
    </div>
  );
}
