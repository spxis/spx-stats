"use client";

import { useId } from "react";
import { useSpeaker } from "./i18n/LocaleProvider";
import "./teamchips.css";

/**
 * The team choice of the players list: a league's clubs (the ones still playing first, then the former ones) in a select. It is an ordinary form
 * (it works without script, with its own button), and with script a choice is sent at once. `hidden` carries the other choices (league, years, letter, ...)
 * so the new list keeps them; the page number is left out so the list starts at its first page. A team address belongs to its league, so this is only
 * offered once a league is chosen.
 */
export function TeamPicker({ action, value, clubs, hidden }: {
  action: string;
  /** The address segment of the chosen club, or "" for every team. */
  value: string;
  clubs: { slug: string; name: string; active: boolean }[];
  hidden: Record<string, string>;
}) {
  const { say } = useSpeaker();
  const id = useId();
  const now = clubs.filter((c) => c.active), former = clubs.filter((c) => !c.active);
  const option = (c: { slug: string; name: string }) => <option key={c.slug} value={c.slug}>{c.name}</option>;
  return (
    <form className="teampick" action={action} method="get">
      <label htmlFor={id}>{say("players.teamPick")}</label>
      <select id={id} name="team" defaultValue={value} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
        <option value="">{say("players.teamAll")}</option>
        {now.length ? <optgroup label={say("players.teamCurrent")}>{now.map(option)}</optgroup> : null}
        {former.length ? <optgroup label={say("players.teamFormer")}>{former.map(option)}</optgroup> : null}
      </select>
      {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      <noscript><button type="submit">{say("players.searchGo")}</button></noscript>
    </form>
  );
}
