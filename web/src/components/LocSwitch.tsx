"use client";

import { useSyncExternalStore } from "react";
import { LOCS, parseLoc, type Loc } from "@/lib/loc";
import { replaceQuery } from "@/lib/urlQuery";
import { useSpeaker } from "./i18n/LocaleProvider";
import "./team.css";

const listeners = new Set<() => void>();
const subscribe = (notify: () => void) => {
  listeners.add(notify);
  window.addEventListener("popstate", notify);
  return () => { listeners.delete(notify); window.removeEventListener("popstate", notify); };
};

/**
 * ?loc= for a page the server draws once and the CDN keeps (the team page): read from the address after hydration,
 * written back without a navigation. Every switch on the page follows the same value.
 */
export function useLocParam(): [Loc, (loc: Loc) => void] {
  const text = useSyncExternalStore(subscribe, () => new URLSearchParams(location.search).get("loc") ?? "", () => "");
  const loc = parseLoc(text);
  const set = (next: Loc) => { replaceQuery({ loc: next === "all" ? null : next }); listeners.forEach((l) => l()); };
  return [loc, set];
}

/** The Home / Road / All switch: a segmented control, one button pressed. */
export function LocSwitch({ value, onChange }: { value: Loc; onChange: (loc: Loc) => void }) {
  const { say } = useSpeaker();
  return (
    <div className="seg" role="group" aria-label={say("loc.aria")}>
      {LOCS.map(([k, label]) => <button key={k} type="button" aria-pressed={k === value} onClick={() => onChange(k)}>{say(label)}</button>)}
    </div>
  );
}
