"use client";

import { useActionState } from "react";
import { ConfirmAction } from "@/components/ConfirmAction";
import { useSpeaker } from "@/components/i18n/LocaleProvider";
import type { ConfirmKind } from "@/lib/confirm";
import type { RequestKind } from "@/lib/ops/schema";
import { opsRequest, type OpsState } from "./actions";

const DIALOG: Record<RequestKind, { confirm: ConfirmKind; label: "ops.snapshotNow" | "ops.pause" | "ops.resume" }> = {
  snapshot: { confirm: "opsSnapshot", label: "ops.snapshotNow" },
  harvest_pause: { confirm: "opsPause", label: "ops.pause" },
  harvest_resume: { confirm: "opsResume", label: "ops.resume" },
};

/**
 * One control of /admin/ops: queues a request for the runner after a confirmation. Disabled, with the reason, while a request of the same
 * kind is already waiting for the runner.
 */
export function OpsButton({ kind, waiting }: { kind: RequestKind; waiting: boolean }) {
  const { say } = useSpeaker();
  const [state, action, pending] = useActionState<OpsState, FormData>(opsRequest, null);
  const d = DIALOG[kind];
  return (
    <form action={action} className="dr-actions">
      <input type="hidden" name="kind" value={kind} />
      <ConfirmAction kind={d.confirm} className="signin-btn" disabled={pending || waiting || state?.ok === true}>
        {say(d.label)}
      </ConfirmAction>
      {waiting && !state ? <p className="note">{say("ops.pauseWaiting")}</p> : null}
      {state ? <p className={state.ok ? "note" : "dr-alert"} role={state.ok ? "status" : "alert"}>{state.message}</p> : null}
    </form>
  );
}
