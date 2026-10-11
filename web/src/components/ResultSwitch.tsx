"use client";

import { RESULTS, type ResultFilter } from "@/lib/resultFilter";
import { useSpeaker } from "./i18n/LocaleProvider";

/** The All / Wins / Losses / Ties / OT losses switch of a team's games: only the choices in `options` are drawn. */
export function ResultSwitch({ value, options, onChange }: { value: ResultFilter; options: ResultFilter[]; onChange: (r: ResultFilter) => void }) {
  const { say } = useSpeaker();
  return (
    <div className="seg" role="group" aria-label={say("result.aria")}>
      {RESULTS.filter(([k]) => options.includes(k)).map(([k, , label]) => (
        <button key={k} type="button" aria-pressed={k === value} onClick={() => onChange(k)}>{say(label)}</button>
      ))}
    </div>
  );
}
