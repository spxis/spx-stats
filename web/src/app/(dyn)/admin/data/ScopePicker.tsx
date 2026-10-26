"use client";

import { useState } from "react";
import { SourcePicker } from "@/components/SourcePicker";
import { MAIN_FIVE } from "@/lib/liveRequest";

const CHOICES = [
  { value: "all", text: "All sports" },
  { value: "main5", text: "Main five (NHL, NBA, MLB, NFL, CFL)" },
  { value: "league", text: "One sport" },
  { value: "day", text: "Today's games of one sport" },
  { value: "game", text: "One game" },
] as const;

/**
 * What the scores update dialog adds to its sentence: how much to update (a sport, the main five, today's games, one game) and which sources to read.
 * Plain form fields inside the dialog's form, so they go with the confirmed request. Today's games and one game update only the unofficial live scores;
 * the other choices also run the scores update that settles the permanent record, as the request always did.
 */
export function ScopePicker() {
  const [pick, setPick] = useState<string>("all");
  const live = pick === "day" || pick === "game";
  return (
    <>
      <fieldset className="src-pick">
        <legend>What to update</legend>
        {CHOICES.map((c) => (
          <label key={c.value}><input type="radio" name="granularity" value={c.value} checked={pick === c.value} onChange={() => setPick(c.value)} /> <span>{c.text}</span></label>
        ))}
        {pick === "league" || pick === "day" ? (
          <label>Sport <select name="league" defaultValue="nhl">{MAIN_FIVE.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}</select></label>
        ) : null}
        {pick === "game" ? <label>Game number <input name="game" inputMode="numeric" pattern="[0-9]{1,10}" required placeholder="the number in the game's address" /></label> : null}
      </fieldset>
      <p className="note">
        {live
          ? "This updates only the unofficial live scores. The permanent record follows the daily job."
          : "The unofficial live scores are updated first, then the scores update for the permanent record, as below."}
      </p>
      <SourcePicker leagues={null} />
    </>
  );
}
