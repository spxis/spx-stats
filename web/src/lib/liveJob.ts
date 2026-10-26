import { PROGRESS_GIVE_UP_MS, PROGRESS_POLL_MS, type Progress, type ProgressStatus, isFinished } from "./liveScope.ts";

/**
 * The admin's current refresh, kept in the browser: which request it is and how it is going. One at a time (the database allows one open live
 * refresh). The scoreboard's bar and the per-game buttons both read it, so the progress stays when the admin moves to another day.
 *
 * It asks /api/admin/live/<id> (one Turso read of one row) every PROGRESS_POLL_MS (15 s), never while the tab is hidden, and stops when the request
 * has ended or after PROGRESS_GIVE_UP_MS. Nothing here starts a fetch from a score source.
 */

export interface Job {
  id: number;
  label: string;
  status: ProgressStatus;
  summary: string | null;
  items: Progress["items"];
  startedAt: number;
  gaveUp: boolean;
}

let job: Job | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let last = 0;
let watching = false;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());
export const getJob = (): Job | null => job;
export function subscribeJob(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const visible = (): boolean => typeof document === "undefined" || document.visibilityState === "visible";

function schedule(): void {
  clearTimeout(timer);
  if (!job || isFinished(job.status) || job.gaveUp || !visible()) return;
  const wait = Math.max(0, last + PROGRESS_POLL_MS - Date.now());
  timer = setTimeout(() => void poll(), Math.max(wait, 0));
}

async function poll(): Promise<void> {
  const current = job;
  if (!current || isFinished(current.status) || !visible()) return;
  if (Date.now() - current.startedAt > PROGRESS_GIVE_UP_MS) {
    job = { ...current, gaveUp: true };
    emit();
    return;
  }
  last = Date.now();
  try {
    const res = await fetch(`/api/admin/live/${current.id}`, { cache: "no-store", credentials: "same-origin" });
    if (res.ok && job?.id === current.id) {
      const got = (await res.json()) as Progress;
      job = { ...job, status: got.status, summary: got.summary, items: got.items };
      emit();
    }
  } catch {
    // a missed answer is asked again in 15 seconds
  }
  schedule();
}

/** A request was just queued: show it and start asking how it goes. */
export function beginJob(id: number, label: string): void {
  clearTimeout(timer);
  job = { id, label, status: "waiting", summary: null, items: [], startedAt: Date.now(), gaveUp: false };
  last = Date.now();
  if (!watching && typeof document !== "undefined") {
    watching = true;
    document.addEventListener("visibilitychange", () => {
      if (!visible()) clearTimeout(timer);
      else schedule();
    });
  }
  emit();
  schedule();
}

export function clearJob(): void {
  clearTimeout(timer);
  job = null;
  emit();
}

/** What the admin reads about a game's last result in the current refresh, or null. */
export function itemFor(j: Job | null, gameId: number): [number, string, string] | null {
  return j?.items.find((x) => x[0] === gameId) ?? null;
}
