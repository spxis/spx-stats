"use client";

import { useSpeaker } from "./i18n/LocaleProvider";

const PHASES = [["", "phase.all"], ["r", "phase.regular"], ["p", "phase.playoffs"]] as const;

/** The Regular season / Playoffs / All switch of the season page and a team's season. "" is every part. */
export function PhaseSwitch({ phase, onChange }: { phase: string; onChange: (phase: string) => void }) {
  const { say } = useSpeaker();
  return (
    <div className="seg" role="group" aria-label={say("phase.aria")}>
      {PHASES.map(([k, label]) => (
        <button key={k} type="button" aria-pressed={k === phase} onClick={() => onChange(k)}>{say(label)}</button>
      ))}
    </div>
  );
}
