"use client";

import type { ChangeEvent } from "react";
import { sourceChoices, whyGreyed, covers } from "@/lib/liveRequest";

/**
 * The sources an admin can read scores from, one checkbox each: the ones with a score parser and a green or grey registry tier are ticked or not as
 * the registry's defaults say; every other source of the registry is listed greyed out with the reason (a confirm-only or forbidden source shows its
 * terms note and can never be ticked). `leagues` are the leagues the request covers: a source that does not read any of them is disabled.
 * Controlled with `checked` and `onChange`, or left to the form (`name`, plain checkboxes) when used inside a server action's form.
 */
export function SourcePicker({ leagues = null, checked, onChange, name = "sources" }: {
  leagues?: readonly string[] | null;
  checked?: readonly string[];
  onChange?: (ids: string[]) => void;
  name?: string;
}) {
  const { tickable, greyed } = sourceChoices();
  const reads = (id: string) => {
    const s = tickable.find((x) => x.id === id);
    return !!s && (leagues === null || leagues.some((l) => covers(s, l)));
  };
  const toggle = (id: string, on: boolean) => {
    if (!onChange || !checked) return;
    onChange(on ? [...new Set([...checked, id])] : checked.filter((x) => x !== id));
  };
  return (
    <fieldset className="src-pick">
      <legend>Sources to read</legend>
      {tickable.map((s) => {
        const ok = reads(s.id);
        return (
          <label key={s.id} className={ok ? "src-on" : "src-off"}>
            <input
              type="checkbox" name={name} value={s.id} disabled={!ok}
              {...(checked ? { checked: ok && checked.includes(s.id), onChange: (e: ChangeEvent<HTMLInputElement>) => toggle(s.id, e.target.checked) } : { defaultChecked: ok && s.default })}
            />{" "}
            <span>{s.name}</span>
            <small className="note"> {s.spacing ? `${s.spacing} s between requests` : null}{s.leagues.length ? `${s.spacing ? ", " : ""}reads ${s.leagues.map((l) => l.toUpperCase()).join(", ")}` : null}{ok ? "" : ", not for this request"}</small>
          </label>
        );
      })}
      <details className="src-greyed">
        <summary>Not available ({greyed.length})</summary>
        <ul>
          {greyed.map((s) => (
            <li key={s.id} className="src-off">
              <label><input type="checkbox" disabled /> <span>{s.name}</span></label>
              <small className="note"> {s.tier === "red-confirm" ? "confirm-only" : s.tier === "red" ? "not allowed" : s.tier}. {whyGreyed(s)}</small>
            </li>
          ))}
        </ul>
      </details>
    </fieldset>
  );
}

/** The ids ticked by default for a request covering these leagues. */
export function defaultSources(leagues: readonly string[] | null): string[] {
  return sourceChoices().tickable.filter((s) => s.default && (leagues === null || leagues.some((l) => covers(s, l)))).map((s) => s.id);
}
