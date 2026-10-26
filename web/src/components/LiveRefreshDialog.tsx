"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { type LiveScope, type MainLeague, estimate, estimateText, leaguesOf } from "@/lib/liveRequest";
import { SourcePicker, defaultSources } from "./SourcePicker";

/** What an admin pressed: the scope, where it points and the words for the title. */
export interface RefreshTarget {
  scope: LiveScope;
  league: MainLeague | null;
  day: string | null;
  game: number | null;
  title: string;
  /** Games on the page, for the estimate of a day's list. */
  games?: number;
}

/**
 * The dialog behind every "Refresh" button: the sources to read (one checkbox each, defaults ticked, forbidden ones greyed out with their terms), what
 * the request is expected to cost each source before the click, and the button. It sends one POST to /api/admin/live, which only records the request;
 * the runner next to DS1 does the fetching. Loaded when first opened, so visitors never download it.
 */
export default function LiveRefreshDialog({ target, onQueued, onClose }: { target: RefreshTarget; onQueued: (id: number) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const leagues = useMemo(() => (target.scope === "game" ? (target.league ? [target.league] : null) : leaguesOf(target.league, target.scope)), [target]);
  const [ticked, setTicked] = useState<string[]>(() => defaultSources(leagues));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const costs = useMemo(() => estimate({ scope: target.scope, league: target.league, sources: ticked }, target.games), [target, ticked]);

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);

  async function send(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/live", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ scope: target.scope, league: target.league, day: target.day, game: target.game, sources: ticked, settle: false }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; id?: number; error?: string };
      if (res.ok && body.ok && typeof body.id === "number") {
        onQueued(body.id);
        dialog.current?.close();
        return;
      }
      setError(body.error ?? "The request was refused.");
    } catch {
      setError("The request did not go through. Try again.");
    }
    setBusy(false);
  }

  return (
    <dialog ref={dialog} className="cf" aria-labelledby="live-refresh-title" onClose={onClose} onClick={(e) => { if (e.target === e.currentTarget) dialog.current?.close(); }}>
      <form className="cf-body" onSubmit={send}>
        <h2 id="live-refresh-title" className="cf-title">{target.title}</h2>
        <p>
          Asks the runner next to DS1 to read the sources you tick and update the unofficial scores (it looks for requests once a minute). The permanent
          record is not changed; the daily job settles it later.
        </p>
        <SourcePicker leagues={leagues} checked={ticked} onChange={setTicked} />
        <p className="note">{estimateText(costs)}</p>
        <p className="note">The NHL and CFL can only be as fresh as the Wikipedia edits. Confirm-only sources are never read here.</p>
        {error ? <p className="dr-alert" role="alert">{error}</p> : null}
        <div className="cf-actions">
          <button type="button" className="signin-btn cf-cancel" onClick={() => dialog.current?.close()}>Cancel</button>
          <button type="submit" className="signin-btn cf-go" disabled={busy || ticked.length === 0}>{busy ? "Working…" : "Refresh"}</button>
        </div>
      </form>
    </dialog>
  );
}
