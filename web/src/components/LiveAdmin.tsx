"use client";

import { useState, useSyncExternalStore, type ComponentType } from "react";
import { useAccount } from "@/components/auth/Account";
import { describe, isMainLeague, showLiveControls } from "@/lib/liveScope";
import { inLiveWindow } from "@/lib/liveScores";
import { type Job, beginJob, clearJob, getJob, itemFor, subscribeJob } from "@/lib/liveJob";
import type { RefreshTarget } from "./LiveRefreshDialog";

/**
 * The admin-only "Refresh" controls of a scoreboard: the bar (this day's games, the main five, all sports) and one button per game. A scoreboard is
 * a kept page drawn once for everyone, so nothing is drawn for a visitor: each piece asks the account (learned in the browser from /api/me) and
 * returns nothing unless it is an admin's. The dialog behind the buttons is loaded only when one is pressed. A press records one request through
 * /api/admin/live; the runner next to DS1 fetches (the cost is written down in liveAdmin.ts).
 */
type DialogProps = { target: RefreshTarget; onQueued: (id: number) => void; onClose: () => void };

const today = () => new Date().toISOString().slice(0, 10);
const useJob = (): Job | null => useSyncExternalStore(subscribeJob, getJob, () => null);

function useRefresh() {
  const [target, setTarget] = useState<RefreshTarget | null>(null);
  const [Dialog, setDialog] = useState<ComponentType<DialogProps> | null>(null);
  const open = (t: RefreshTarget) => {
    setTarget(t);
    void import("./LiveRefreshDialog").then((m) => setDialog(() => m.default));   // fetched on the first press, never for a visitor
  };
  const dialog = target && Dialog ? <Dialog target={target} onClose={() => setTarget(null)} onQueued={(id) => beginJob(id, describe(target))} /> : null;
  return { open, dialog };
}

const OUTCOME_TEXT: Record<string, string> = { updated: "updated", unchanged: "unchanged", held: "held", failed: "failed", skipped: "left out" };

function JobPanel({ job }: { job: Job }) {
  const done = job.status === "done" || job.status === "nothing" || job.status === "failed";
  const headline =
    job.gaveUp ? "No news from the runner after 20 minutes. The request may still run: see Settings on the data page."
    : job.status === "waiting" ? "Waiting for the runner (it looks for requests once a minute)."
    : job.status === "running" ? "Running now."
    : job.summary ?? "Finished.";
  return (
    <div className="live-job" role="status">
      <p>
        <b>Refresh {job.label}</b>{" "}
        <span className={`tk-badge ${job.status === "failed" ? "stale" : done ? "ok" : ""}`}>{job.gaveUp ? "no news" : job.status === "nothing" ? "nothing new" : job.status}</span>
      </p>
      <p className="note">{headline}</p>
      {job.items.length ? (
        <details>
          <summary>{job.items.length} game{job.items.length === 1 ? "" : "s"}</summary>
          <ul className="live-items">
            {job.items.map(([id, outcome, why]) => <li key={id}><code>{id}</code> {OUTCOME_TEXT[outcome] ?? outcome}: {why}</li>)}
          </ul>
        </details>
      ) : null}
      {done || job.gaveUp ? <button type="button" className="signin-btn live-close" onClick={clearJob}>Close</button> : null}
    </div>
  );
}

/** Under the heading of a scoreboard: refresh this day's games, the main five, all sports. Nothing for anyone but an admin. */
export function LiveAdminBar({ lg, day, games }: { lg: string; day: string; games: number }) {
  const account = useAccount();
  const job = useJob();
  const { open, dialog } = useRefresh();
  if (!showLiveControls(account)) return null;
  const inWindow = inLiveWindow(day, today());
  const main = isMainLeague(lg) ? lg : null;
  return (
    <section className="live-admin" aria-label="Admin: refresh the unofficial scores">
      <p className="note"><b>Admin.</b> Refresh the unofficial scores now. The NHL and CFL can only be as fresh as the Wikipedia edits.</p>
      <div className="dr-actions">
        {main ? (
          <button
            type="button" className="signin-btn" disabled={!inWindow || games === 0}
            title={inWindow ? undefined : "Only the last week and tomorrow can be refreshed."}
            onClick={() => open({ scope: "day", league: main, day, game: null, games, title: `Refresh the ${main.toUpperCase()} games on ${day}?` })}
          >Refresh this day&apos;s games</button>
        ) : null}
        <button type="button" className="signin-btn" onClick={() => open({ scope: "main5", league: null, day: null, game: null, title: "Refresh the main five?" })}>Refresh main five</button>
        <button type="button" className="signin-btn" onClick={() => open({ scope: "all", league: null, day: null, game: null, title: "Refresh all sports?" })}>Refresh all sports</button>
      </div>
      {job ? <JobPanel job={job} /> : null}
      {dialog}
    </section>
  );
}

/** In a game's row: refresh this game, and what the current refresh did to it. Nothing for anyone but an admin. */
export function LiveGameRefresh({ id, lg, day }: { id: number; lg: string; day: string }) {
  const account = useAccount();
  const job = useJob();
  const { open, dialog } = useRefresh();
  if (!showLiveControls(account) || !isMainLeague(lg)) return null;
  const item = itemFor(job, id);
  return (
    <>
      <button
        type="button" className="live-refresh" title="Admin: read the chosen sources for this game now"
        disabled={!inLiveWindow(day, today())}
        onClick={() => open({ scope: "game", league: lg, day: null, game: id, title: `Refresh this ${lg.toUpperCase()} game?` })}
      >Refresh</button>
      {item ? <span className="live-chip" title={item[2]}>{OUTCOME_TEXT[item[1]] ?? item[1]}</span> : null}
      {dialog}
    </>
  );
}
