"use client";

import { useActionState, type ReactNode } from "react";
import { decide, type DecideState } from "./actions";

export function DecisionCard({ id, number, approveLabel, blocked, children }: { id: number; number: string; approveLabel: string; blocked: boolean; children: ReactNode }) {
  const [state, action, pending] = useActionState<DecideState, FormData>(decide, null);
  if (state?.ok) {
    return (
      <article className="dr-card" aria-label={`Release ${number}`}>
        <p role="status"><strong>{state.message}</strong></p>
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
      {state ? <p className="dr-alert" role="alert">{state.message}</p> : null}
    </article>
  );
}
