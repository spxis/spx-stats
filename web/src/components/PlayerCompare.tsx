"use client";

import dynamic from "next/dynamic";
import { useState, useSyncExternalStore } from "react";
import { vsFromSearch } from "@/lib/playerCompare";
import { useSpeaker } from "./i18n/LocaleProvider";

/** The window is its own chunk, fetched when it is first opened: a player page that is never compared carries only the button. */
const Dialog = dynamic(() => import("./PlayerCompareDialog"), { ssr: false });

const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  window.addEventListener("popstate", cb);
  return () => { listeners.delete(cb); window.removeEventListener("popstate", cb); };
};
/** The player the address names in `?vs=`; read in the browser only, so the page itself stays the one static copy. */
const readVs = (): number | null => { try { return vsFromSearch(window.location.search); } catch { return null; } };

/** Puts the chosen player in the address (other keys stay) without adding history; null takes it out. */
function writeVs(id: number | null) {
  try {
    const url = new URL(window.location.href);
    if (id == null) url.searchParams.delete("vs"); else url.searchParams.set("vs", String(id));
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  } catch { /* the address stays as it is */ }
  listeners.forEach((cb) => cb());
}

/**
 * The Compare button of a player page. It opens a window with this player on the left and a picker on the right; the player chosen is kept in the
 * address as `?vs=<id>`, so the comparison can be shared, and an address that carries one opens the window at once.
 */
export function PlayerCompare({ id }: { id: number }) {
  const { say } = useSpeaker();
  const vs = useSyncExternalStore(subscribe, readVs, () => null);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="pcmpbtn" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        {say("compare.button")}
      </button>
      {open || vs != null ? <Dialog selfId={id} vs={vs} onPick={writeVs} onClose={() => { setOpen(false); writeVs(null); }} /> : null}
    </>
  );
}
