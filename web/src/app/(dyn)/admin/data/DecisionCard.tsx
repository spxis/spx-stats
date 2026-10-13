"use client";

import { useActionState, type ReactNode } from "react";
import { decide, hold, type DecideState } from "./actions";

export function DecisionCard({ id, number, approveLabel, blocked, holdable = false, children }: { id: number; number: string; approveLabel: string; blocked: boolean; holdable?: boolean; children: ReactNode }) {
  const [state, action, pending] = useActionState<DecideState, FormData>(decide, null);
  const [holdState, holdAction, holding] = useActionState<DecideState, FormData>(hold, null);
  const done = state?.ok ? state : holdState?.ok ? holdState : null;
  if (done) {
    return (
      <article className="dr-card" aria-label={`Release ${number}`}>
        <p role="status"><strong>{done.message}</strong></p>
      </article>
    );
  }
  return (
    <article className="dr-card" aria-label={`Release ${number}`}>
      {children}
      <form action={action} className="dr-actions">
        <input type="hidden" name="id" value={id} />
        <button type="submit" name="decision" value="approve" className="signin-btn" disabled={blocked || pending}>
          {pending ? "Working…" : approveLabel}
        </button>
        <button type="submit" name="decision" value="reject" className="signin-btn dr-reject" disabled={pending}>Reject</button>
      </form>
      {holdable ? (
        <form action={holdAction} className="dr-actions">
          <input type="hidden" name="id" value={id} />
          <button type="submit" className="signin-btn dr-reject" disabled={holding}>{holding ? "Working…" : "Hold: do not approve automatically"}</button>
        </form>
      ) : null}
      {state ? <p className="dr-alert" role="alert">{state.message}</p> : null}
      {holdState ? <p className="dr-alert" role="alert">{holdState.message}</p> : null}
    </article>
  );
}
