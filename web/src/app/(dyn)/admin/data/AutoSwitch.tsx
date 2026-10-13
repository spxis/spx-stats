"use client";

import { useActionState } from "react";
import { ConfirmAction } from "@/components/ConfirmAction";
import { setAutoPause, type DecideState } from "./actions";

/** The global switch for every automatic approval: "Hold all auto-approvals" with a reason, and Resume. Each asks for confirmation. */
export function AutoSwitch({ paused }: { paused: boolean }) {
  const [state, action, pending] = useActionState<DecideState, FormData>(setAutoPause, null);
  return (
    <form action={action} className="dr-actions">
      {paused ? (
        <ConfirmAction kind="resume" name="decision" value="resume" className="signin-btn" disabled={pending}>{pending ? "Working…" : "Resume auto-approvals"}</ConfirmAction>
      ) : (
        <>
          <input type="text" name="reason" required maxLength={300} placeholder="Reason, for example checking the feed" aria-label="Reason for holding all auto-approvals" />
          <ConfirmAction kind="pause" name="decision" value="pause" className="signin-btn dr-reject" disabled={pending}>{pending ? "Working…" : "Hold all auto-approvals"}</ConfirmAction>
        </>
      )}
      {state ? <p className={state.ok ? "note" : "dr-alert"} role={state.ok ? "status" : "alert"}>{state.message}</p> : null}
    </form>
  );
}
