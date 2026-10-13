"use client";

import { useSyncExternalStore } from "react";
import { parseVisits, serializeVisits, VISITS_KEY, type Visits } from "@/lib/venueVisits";

/**
 * The reader's list of visited venues, kept in this browser's localStorage under one key and nowhere else. Every page here is a kept
 * copy drawn once for everyone, so the server never knows the list: `useVisits` answers an empty list while the page is drawn on the
 * server and while it hydrates, then the real one. Storage can be missing, full or refused (a private window, blocked site data): every
 * read and write is guarded, and the list then lasts until the page is closed (`saved` is false so the page can say so). Other open
 * tabs are kept in step through the storage event.
 */
export interface VisitsState {
  visits: Visits;
  /** False when the last write was refused: the list is only in this page. */
  saved: boolean;
  /** The stored list was written by a newer version of the site: it is left untouched and changes are not saved. */
  locked: boolean;
}

const EMPTY: VisitsState = { visits: {}, saved: true, locked: false };
let state = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

function readStored(): string | null {
  try { return window.localStorage.getItem(VISITS_KEY); } catch { return null; }
}

function load(): void {
  const text = readStored();
  const parsed = parseVisits(text);
  if (parsed.status === "bad") {
    // Not our JSON: keep a copy before the first save replaces it.
    try { window.localStorage.setItem(`${VISITS_KEY}-unreadable`, text ?? ""); } catch { /* nowhere to keep it */ }
  }
  state = { visits: parsed.visits, saved: true, locked: parsed.status === "newer" };
}

function current(): VisitsState {
  if (!loaded && typeof window !== "undefined") { loaded = true; load(); }
  return state;
}

function onStorage(e: StorageEvent): void {
  if (e.key !== null && e.key !== VISITS_KEY) return;
  load();
  emit();
}

function subscribe(f: () => void): () => void {
  if (!listeners.size) window.addEventListener("storage", onStorage);
  listeners.add(f);
  return () => {
    listeners.delete(f);
    if (!listeners.size) window.removeEventListener("storage", onStorage);
  };
}

/** Changes the list: `change` gets the list as it is now (read again from storage first, so a change made in another tab is not lost) and returns the new one. */
export function updateVisits(change: (visits: Visits) => Visits): void {
  if (typeof window === "undefined") return;
  current();
  if (state.saved) load();
  if (state.locked) { emit(); return; }
  const next = change(state.visits);
  if (next === state.visits) return;
  let saved = true;
  try { window.localStorage.setItem(VISITS_KEY, serializeVisits(next)); } catch { saved = false; }
  state = { visits: next, saved, locked: false };
  emit();
}

/** Removes the stored list altogether. */
export function clearVisits(): void {
  if (typeof window === "undefined") return;
  current();
  if (state.locked) return;
  try { window.localStorage.removeItem(VISITS_KEY); } catch { /* nothing to remove */ }
  state = { visits: {}, saved: true, locked: false };
  emit();
}

export function useVisits(): VisitsState {
  return useSyncExternalStore(subscribe, current, () => EMPTY);
}
