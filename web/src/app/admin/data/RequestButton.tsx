"use client";

import { useActionState } from "react";
import { requestDrift, requestUpdate, type DecideState } from "./actions";

/**
 * "Request scores update" (Settings) or "Check now" (Drift): queues one request for the runner. Disabled, with the reason,
 * while one is open or just ended.
 */
export function RequestButton({ kind = "scores", blocked }: { kind?: "scores" | "drift"; blocked: string | null }) {
  const [state, action, pending] = useActionState<DecideState, FormData>(kind === "drift" ? requestDrift : requestUpdate, null);
  return (
    <form action={action} className="dr-actions">
      <button type="submit" className="signin-btn" disabled={pending || blocked !== null || state?.ok === true}>
        {pending ? "Working…" : kind === "drift" ? "Check now" : "Request scores update"}
      </button>
      {blocked ? <p className="note">{blocked}</p> : null}
      {state ? <p className={state.ok ? "note" : "dr-alert"} role={state.ok ? "status" : "alert"}>{state.message}</p> : null}
    </form>
  );
}
