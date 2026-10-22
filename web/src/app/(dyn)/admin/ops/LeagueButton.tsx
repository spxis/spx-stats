"use client";

import { useActionState } from "react";
import { ConfirmAction } from "@/components/ConfirmAction";
import { useSpeaker } from "@/components/i18n/LocaleProvider";
import { scoresLeagueRequest, type OpsState } from "./actions";

/**
 * "Update now" on one league's row of the scores table: queues a scores request that names the league, for the runner, after a confirmation.
 * Disabled, with the reason, while a scores request is open (the database allows one at a time) or the last one for this league just ended.
 */
export function LeagueButton({ league, blocked }: { league: string; blocked: "open" | "recent" | null }) {
  const { say } = useSpeaker();
  const [state, action, pending] = useActionState<OpsState, FormData>(scoresLeagueRequest, null);
  const name = league.toUpperCase();
  return (
    <form action={action} className="dr-actions">
      <input type="hidden" name="league" value={league} />
      <ConfirmAction kind="opsLeague" title={name} className="signin-btn" disabled={pending || blocked !== null || state?.ok === true}>
        {say("ops.scores.update", { league: name })}
      </ConfirmAction>
      {blocked && !state ? <p className="note">{say(blocked === "open" ? "ops.msg.league.open" : "ops.msg.league.recent")}</p> : null}
      {state ? <p className={state.ok ? "note" : "dr-alert"} role={state.ok ? "status" : "alert"}>{state.message}</p> : null}
    </form>
  );
}
