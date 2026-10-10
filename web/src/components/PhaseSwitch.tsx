"use client";

const PHASES: [string, string][] = [["r", "Regular season"], ["p", "Playoffs"], ["", "All"]];

/** The Regular season / Playoffs / All switch of the season page and a team's season. "" is every part. */
export function PhaseSwitch({ phase, onChange }: { phase: string; onChange: (phase: string) => void }) {
  return (
    <div className="seg" role="group" aria-label="Part of season">
      {PHASES.map(([k, label]) => (
        <button key={k} type="button" aria-pressed={k === phase} onClick={() => onChange(k)}>{label}</button>
      ))}
    </div>
  );
}
