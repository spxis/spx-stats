"use client";

import { useActionState } from "react";
import { ConfirmAction } from "@/components/ConfirmAction";
import { fileTicket, type FileState } from "@/app/(dyn)/admin/tickets/new/actions";

export function TicketForm() {
  const [state, action, pending] = useActionState<FileState, FormData>(fileTicket, null);
  return (
    <form action={action} className="ticketform">
      <label>Title<input name="title" required minLength={8} maxLength={120} /></label>
      <label>Detail<textarea name="detail" rows={6} maxLength={4000} /></label>
      <label>Kind
        <select name="kind" defaultValue="feature">
          <option value="feature">Feature</option>
          <option value="fix">Fix</option>
          <option value="chore">Chore</option>
        </select>
      </label>
      <label>Priority
        <select name="priority" defaultValue="">
          <option value="">None</option>
          <option value="high">High</option>
          <option value="normal">Normal</option>
          <option value="low">Low</option>
        </select>
      </label>
      <ConfirmAction kind="ticket" className="signin-btn" disabled={pending}>{pending ? "Filing…" : "File ticket"}</ConfirmAction>
      {state ? <p className="note" role="status">{state.message}</p> : null}
    </form>
  );
}
