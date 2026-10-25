import type { Speaker } from "@/lib/i18n/i18n";

/** The "grey area" marker of the admin tools: shown beside a grey source (no terms found) or anything that came from one. The tooltip says why. */
export function GreyMarker({ s }: { s: Speaker }) {
  return (
    <span className="tk-badge grey-area" title={s.say("asrc.greyAreaHint")}>
      {s.say("asrc.greyArea")}
    </span>
  );
}
