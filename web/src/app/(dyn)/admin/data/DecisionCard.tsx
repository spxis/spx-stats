"use client";

import { useActionState, type ReactNode } from "react";
import { ConfirmAction } from "@/components/ConfirmAction";
import { approveKind } from "@/lib/confirm";
import { decide, hold, type DecideState } from "./actions";

/**
 * One waiting release with its buttons. Approve, Reject and Hold each sit in their own form and ask for confirmation first
 * (the dialog names the release and, for an approval, lists the tables it changes). Approve and Reject share one action state.
 */
export function DecisionCard({ id, number, title, kind, approveLabel, blocked, holdable = false, summary, children }: {
  id: number; number: string; title: string; kind: string; approveLabel: string; blocked: boolean; holdable?: boolean; summary?: ReactNode; children: ReactNode;
}) {
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
      <div className="dr-actions">
        <form action={action} className="cf-form">
          <input type="hidden" name="id" value={id} />
          <ConfirmAction kind={approveKind(kind)} number={number} title={title} details={summary} name="decision" value="approve" className="signin-btn" disabled={blocked || pending}>
            {pending ? "Working…" : approveLabel}
          </ConfirmAction>
        </form>
        <form action={action} className="cf-form">
          <input type="hidden" name="id" value={id} />
          <ConfirmAction kind="reject" number={number} title={title} name="decision" value="reject" className="signin-btn dr-reject" disabled={pending}>Reject</ConfirmAction>
        </form>
      </div>
      {holdable ? (
        <form action={holdAction} className="cf-form">
          <input type="hidden" name="id" value={id} />
          <ConfirmAction kind="hold" number={number} title={title} className="signin-btn dr-reject" disabled={holding}>{holding ? "Working…" : "Hold: do not approve automatically"}</ConfirmAction>
        </form>
      ) : null}
      {state ? <p className="dr-alert" role="alert">{state.message}</p> : null}
      {holdState ? <p className="dr-alert" role="alert">{holdState.message}</p> : null}
    </article>
  );
}
