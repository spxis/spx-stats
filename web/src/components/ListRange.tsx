"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { hrefWith, replaceQuery } from "@/lib/urlQuery";
import { holdRange, parseRange, RANGE_PAGES, releaseRangeHold, saveRange, savedRange } from "@/lib/yearRange";
import { YearRange } from "./YearRange";

/** Milliseconds a settled change waits before the list is asked for, so a few quick presses or taps make one request. */
const WAIT = 200;

const never = () => () => {};

/** The saved range, when it still narrows this list; null when there is none to apply. */
function narrowing(raw: string, min: number, max: number) {
  const r = parseRange(raw, min, max);
  return r && (r.from > min || r.to < max) ? r : null;
}

interface Props {
  /** Which list this is; its range is remembered under its own key. */
  page: "/players" | "/teams";
  /** The first and last season in the data for the league on show: the ends of the slider. */
  min: number;
  max: number;
  /** The range the list on the page was drawn for (min..max when it is not narrowed). */
  from: number;
  to: number;
  /** Whether the address names a range. When it does not, a range this viewer saved is applied. */
  inAddress: boolean;
}

/**
 * The year slider of the players and teams lists. It narrows the list to those active in any season of from..to. Dragging only moves the
 * handles and the address (no request); letting go, pressing a key or a shortcut asks the server for the new list once. The range is kept
 * in the address (?from=&to=) and, for the next visit, in this browser under a key per page; a saved range is applied before the list is
 * painted (the list sits under `.yr-hold`, which RANGE_HOLD_SCRIPT keeps hidden until then).
 */
export function ListRange({ page, min, max, from, to, inAddress }: Props) {
  const router = useRouter();
  const key = RANGE_PAGES[page].key;
  const [pending, startTransition] = useTransition();
  const [live, setLive] = useState({ from, to });
  const [touched, setTouched] = useState(false);
  const dragging = useRef(false);
  const timer = useRef(0);

  // A range saved for this page that the address does not carry yet: the server cannot know it, so the slider shows it from the first
  // client render and the address gets it now; the server then answers with the narrowed list.
  const saved = useSyncExternalStore(never, () => (inAddress ? "" : savedRange(key)), () => "");
  const restore = narrowing(saved, min, max);
  const shown = touched ? live : (restore ?? { from, to });

  useLayoutEffect(() => {
    // read now, not from `restore`: the first pass draws as the server did and has not seen the saved range yet
    const r = inAddress ? null : narrowing(savedRange(key), min, max);
    if (!r) { releaseRangeHold(); return; }
    holdRange();
    startTransition(() => router.replace(hrefWith({ from: String(r.from), to: String(r.to), page: null }), { scroll: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only on arrival: later changes are the reader's own
  }, []);

  // The list is drawn at the address's range now: let it show.
  useEffect(() => { if (inAddress) releaseRangeHold(); }, [inAddress]);

  // Follow the server's range (another league, back and forward) unless the reader is in the middle of changing it.
  useEffect(() => {
    if (dragging.current || timer.current || pending) return;
    setLive({ from, to });
  }, [from, to, min, max, pending]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function change(f: number, t: number, final: boolean) {
    setTouched(true);
    setLive({ from: f, to: t });
    const full = f <= min && t >= max;
    const changes = { from: full ? null : String(f), to: full ? null : String(t), page: null };
    replaceQuery(changes);
    if (!final) { dragging.current = true; return; }
    dragging.current = false;
    saveRange({ from: f, to: t }, min, max, key);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = 0;
      startTransition(() => router.replace(hrefWith(changes), { scroll: false }));
    }, WAIT);
  }

  return (
    <div className="listrange" aria-busy={pending || undefined}>
      <YearRange min={min} max={max} from={shown.from} to={shown.to} onChange={change} />
    </div>
  );
}
