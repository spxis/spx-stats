"use client";

import { useSyncExternalStore } from "react";
import { addressSearch, readParam, serverSearch, subscribeSearch, writeParams } from "@/lib/addressQuery";

/** The address key that picks the postseason picture (not in QUERY_KEYS: the browser reads it, the page stays the one kept copy). */
export const BRACKET_KEY = "bracket";

/**
 * A season's whole bracket in two styles, the tree and the postseason picture, one shown at a time. The page sends both as empty boxes (each loads its file when it comes
 * into view, and a hidden box never does, so only the style a reader looks at is fetched). The choice is `?bracket=picture` in the address, read here in the browser, so the
 * page is the same kept copy for everyone and a shared link, a reload and the back button keep the choice.
 */
export function BracketViews({ labels, note, tree, picture }: { labels: { aria: string; tree: string; picture: string }; note: string; tree: React.ReactNode; picture: React.ReactNode }) {
  const search = useSyncExternalStore(subscribeSearch, addressSearch, serverSearch);
  const view = readParam(search, BRACKET_KEY) === "picture" ? "picture" : "tree";
  const choose = (v: "tree" | "picture") => writeParams({ [BRACKET_KEY]: v === "picture" ? "picture" : "" });
  return (
    <>
      <div className="seg bkviews" role="group" aria-label={labels.aria}>
        {(["tree", "picture"] as const).map((v) => (
          <button key={v} type="button" aria-pressed={view === v} onClick={() => choose(v)}>{labels[v]}</button>
        ))}
      </div>
      {view === "picture" ? <p className="note">{note}</p> : null}
      <div hidden={view !== "tree"}>{tree}</div>
      <div hidden={view !== "picture"}>{picture}</div>
    </>
  );
}
