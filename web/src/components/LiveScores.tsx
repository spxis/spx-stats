"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { LIVE_POLL_MS, type LiveAnswer, type LiveRow, type LiveView, byGame, inLiveWindow, liveView, shouldPoll } from "@/lib/liveScores";
import { useSpeaker } from "./i18n/LocaleProvider";
import { LocalTime } from "./LocalTime";

const Rows = createContext<ReadonlyMap<number, LiveRow>>(new Map());
const today = () => new Date().toISOString().slice(0, 10);

/**
 * The overlay of a scoreboard: it asks /api/live/<league>/<day> for the unofficial results of the games the archive does not hold as final.
 * Nothing is asked for a day outside the live window or when every game is final. One request when the page opens, then (only while the tab is
 * visible, no faster than a minute apart, only for today's scoreboard and its neighbours, only while a game has no final live row) again. The route answers
 * from one Turso read shared by every visitor; this component never reaches a score source and has no control for anyone to press.
 */
export function LiveProvider({ lg, day, ids, children }: { lg: string; day: string; ids: readonly number[]; children: ReactNode }) {
  const [rows, setRows] = useState<ReadonlyMap<number, LiveRow>>(new Map());
  const key = ids.join(",");
  useEffect(() => {
    if (!key || !inLiveWindow(day, today())) return;
    const want = key.split(",").map(Number);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let ctrl: AbortController | undefined;
    let last = 0;
    let have: ReadonlyMap<number, LiveRow> = new Map();
    const visible = () => document.visibilityState === "visible";
    const schedule = () => {
      clearTimeout(timer);
      if (visible() && shouldPoll(want, have, day, today())) timer = setTimeout(load, LIVE_POLL_MS);
    };
    async function load() {
      clearTimeout(timer);
      ctrl?.abort();
      ctrl = new AbortController();
      last = Date.now();
      try {
        const res = await fetch(`/api/live/${lg}/${day}`, { signal: ctrl.signal });
        if (res.ok) {
          have = byGame(((await res.json()) as LiveAnswer).rows ?? [], want);
          setRows(have);
        }
      } catch {
        // the overlay is optional: the page stands without it
      }
      schedule();
    }
    const onVisible = () => {
      if (!visible()) clearTimeout(timer);
      else if (Date.now() - last >= LIVE_POLL_MS / 2) void load();
      else schedule();
    };
    document.addEventListener("visibilitychange", onVisible);
    if (visible()) void load();
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      clearTimeout(timer);
      ctrl?.abort();
    };
  }, [lg, day, key]);
  return <Rows.Provider value={rows}>{children}</Rows.Provider>;
}

const useLive = (id: number): LiveView | null => {
  const row = useContext(Rows).get(id);
  return row ? liveView(row) : null;
};

/** A side's score: the live score while there is one, else nothing (the archive has none yet). */
export function LiveScore({ id, side }: { id: number; side: "home" | "away" }) {
  const v = useLive(id);
  const n = v?.[side];
  return <>{n == null ? "" : n}</>;
}

/** The state of a game: the live state with the "unofficial" badge and how far the sources agree, else `children` (what the page drew from the archive). */
export function LiveState({ id, extra, children }: { id: number; extra: string; children: ReactNode }) {
  const { say } = useSpeaker();
  const v = useLive(id);
  if (!v) return <>{children}</>;
  const state = v.confidence === "disputed" ? say("live.disputed") : v.state === "final" ? (v.overtime ? say("scores.finalExtra", { extra }) : say("scores.final")) : say("live.inProgress");
  const agreement =
    v.confidence === "single" ? say("live.single")
    : v.confidence === "all" ? say("live.all", { n: v.agree, m: v.of })
    : v.confidence === "partial" ? say("live.partial", { n: v.agree, m: v.of, d: v.differ })
    : say("live.disputed");
  return (
    <>
      <span className="sstate live">{state}</span>
      <span className="badge unofficial" title={say("live.unofficialTitle")}>{say("live.unofficial")}</span>
      <details className="live-src">
        <summary>{agreement}</summary>
        <ul aria-label={say("live.sourcesAria")}>
          {v.sources.map((s) => (
            <li key={s.s}>{s.s} {s.a}–{s.h} · {say("live.fetched")} <LocalTime iso={s.at} /></li>
          ))}
          {v.outsideAgree ? <li>{say("live.outsideAgree", { n: v.outsideAgree })}</li> : null}
          {v.outsideDiffer ? <li>{say("live.outsideDiffer", { n: v.outsideDiffer })}</li> : null}
        </ul>
      </details>
    </>
  );
}
