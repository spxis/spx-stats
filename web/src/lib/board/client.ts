import { looksLikeShortId, type BoardEffort, type BoardKind, type BoardPriority, type BoardStatus, type Ticket } from "./rules.ts";

/**
 * spx-stats' thin client for the shared ticket board on Sumilabu, the same
 * board UmaKuma and Itsutsu use, under its own project key.
 *
 *   SUMILABU_BOARD_URL    https://api.sumilabu.com
 *   SUMILABU_BOARD_TOKEN  this project's key from Sumilabu's BOARD_TOKENS_JSON
 *
 * Both come from the environment and nowhere else; the token is never
 * written to a file, a log or a message. Plain fetch with no server-only
 * import, so `pnpm task` (a terminal) and the tickets page (the server) read
 * the same two settings. Every write names its actor in `X-Board-Actor`; the
 * board refuses an anonymous move.
 */

export const BOARD_PROJECT_KEY = "spx-stats";

/** `pnpm task --board <key>` (or SUMILABU_BOARD_PROJECT) reads another project's board; the site always uses spx-stats. */
function projectKey(): string {
  return (process.env.SUMILABU_BOARD_PROJECT ?? "").trim() || BOARD_PROJECT_KEY;
}

export class BoardError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type Json = Record<string, unknown>;

/**
 * A client's last answer to one read, kept so the next read can send
 * `If-None-Match` and an unchanged board answers 304 with no body (and, on
 * Sumilabu, no database query). Keyed by board and address; the key never
 * goes in. `pnpm task` keeps these on disk (scripts/boardReadCache.ts); the
 * site installs none, so its server reads exactly as before.
 */
export type ReadCacheEntry = { etag: string; body: unknown };
export type ReadCache = {
  get(board: string, url: string): ReadCacheEntry | null;
  put(board: string, url: string, entry: ReadCacheEntry): void;
};

let readCache: ReadCache | null = null;

export function installBoardReadCache(cache: ReadCache | null): void {
  readCache = cache;
}

/**
 * One GET through a read cache: the saved ETag goes out as `If-None-Match`,
 * a 304 answers with the saved body, and a 200 with an ETag is saved. Any
 * other answer is passed through and nothing is saved.
 */
export async function readThrough(
  board: string,
  url: string,
  headers: Record<string, string>,
  cache: ReadCache | null,
): Promise<{ status: number; text: string; fromCache: boolean }> {
  const saved = cache?.get(board, url) ?? null;
  const response = await fetch(url, { method: "GET", headers: saved ? { ...headers, "if-none-match": saved.etag } : headers, cache: "no-store" });
  if (response.status === 304 && saved) return { status: 200, text: JSON.stringify(saved.body), fromCache: true };
  const text = await response.text();
  const etag = response.headers.get("etag");
  if (cache && response.status === 200 && etag) {
    try {
      cache.put(board, url, { etag, body: JSON.parse(text) });
    } catch {
      /* not JSON: not kept */
    }
  }
  return { status: response.status, text, fromCache: false };
}

function settings(): { url: string; token: string } {
  const url = (process.env.SUMILABU_BOARD_URL ?? "").trim().replace(/\/+$/, "");
  const token = (process.env.SUMILABU_BOARD_TOKEN ?? "").trim();
  if (!url || !token) throw new Error("The board is on Sumilabu: set SUMILABU_BOARD_URL and SUMILABU_BOARD_TOKEN in the environment.");
  return { url, token };
}

export function boardHost(): string {
  try {
    return new URL(settings().url).host;
  } catch {
    return "Sumilabu";
  }
}

async function call(path: string, init: { method?: string; body?: unknown; actor?: string | null } = {}): Promise<{ status: number; body: Json }> {
  const { url, token } = settings();
  const headers: Record<string, string> = { authorization: `Bearer ${token}`, accept: "application/json" };
  if (init.actor) headers["x-board-actor"] = init.actor;
  if (init.body !== undefined) headers["content-type"] = "application/json";
  const address = `${url}/api/v1/projects/${projectKey()}${path}`;
  const method = init.method ?? "GET";
  let status: number;
  let text: string;
  if (method === "GET" && init.body === undefined) {
    ({ status, text } = await readThrough(projectKey(), address, headers, readCache));
  } else {
    const response = await fetch(address, { method, headers, body: init.body === undefined ? undefined : JSON.stringify(init.body), cache: "no-store" });
    status = response.status;
    text = await response.text();
  }
  let body: Json = {};
  try {
    body = text ? (JSON.parse(text) as Json) : {};
  } catch {
    body = { error: text.slice(0, 200) };
  }
  if (status === 401) throw new BoardError("Sumilabu refused the board key: check SUMILABU_BOARD_TOKEN.", 401);
  if (status >= 500) throw new BoardError(`Sumilabu's board answered ${status}.`, status);
  return { status, body };
}

const asTicket = (body: Json): Ticket => body.ticket as Ticket;

/** Everything not yet done or dropped, stale holds included, or every row. */
export async function boardList(filter: { unfinished?: boolean } = {}): Promise<Ticket[]> {
  const { body } = await call(filter.unfinished ? "/tickets?unfinished=1" : "/tickets");
  return (body.tickets as Ticket[]) ?? [];
}

/* A ticket this process has just read while resolving its short id, so `claim` does not ask for it twice. */
const justRead = new Map<string, Ticket>();

export async function boardGet(id: string): Promise<Ticket | null> {
  const fresh = justRead.get(id);
  if (fresh) {
    justRead.delete(id);
    return fresh;
  }
  const { status, body } = await call(`/tickets/${encodeURIComponent(id)}`);
  return status === 200 ? asTicket(body) : null;
}

export type Draft = { title: string; detail: string | null; kind: BoardKind; askedBy: string | null };

export async function boardCreate(draft: Draft & { area?: string | null }, actor: string | null): Promise<{ ok: true; ticket: Ticket } | { ok: false; problems: string[] }> {
  const { status, body } = await call("/tickets", { method: "POST", actor, body: { title: draft.title, detail: draft.detail, area: draft.area ?? null, kind: draft.kind, askedBy: draft.askedBy } });
  if (status === 201) return { ok: true, ticket: asTicket(body) };
  return { ok: false, problems: (body.problems as string[]) ?? [String(body.error ?? "refused")] };
}

export type MoveOutcome =
  | { ok: true; ticket: Ticket }
  | { ok: false; reason: "missing" }
  | { ok: false; reason: "illegal"; from: BoardStatus }
  | { ok: false; reason: "held"; heldBy: string };

function outcome(status: number, body: Json): MoveOutcome {
  if (status === 200) return { ok: true, ticket: asTicket(body) };
  if (status === 404 || body.error === "missing") return { ok: false, reason: "missing" };
  const view = (body.ticket as Ticket | null) ?? null;
  if (body.error === "held") return { ok: false, reason: "held", heldBy: (body.heldBy as string | null) ?? view?.claimedBy ?? "somebody" };
  return { ok: false, reason: "illegal", from: view?.status ?? "open" };
}

/** A move along the board's table, under its claim condition: the board decides who won. `done` is never offered. */
export async function boardMove(id: string, to: Exclude<BoardStatus, "done">, actor: string): Promise<MoveOutcome> {
  const { status, body } = await call(`/tickets/${encodeURIComponent(id)}`, { method: "PATCH", actor, body: { status: to } });
  return outcome(status, body);
}

/** Marks the ticket done with the release that carried it. The only way to `done`. */
export async function boardShip(id: string, ship: { version: string; entryId: string; releasedAt: Date }, actor: string): Promise<MoveOutcome> {
  const { status, body } = await call(`/tickets/${encodeURIComponent(id)}/ship`, {
    method: "POST",
    actor,
    body: { version: ship.version, entryId: ship.entryId, releasedAt: ship.releasedAt.toISOString() },
  });
  return outcome(status, body);
}

/** An opinion, not a move: no actor, no claim condition. */
export async function boardGrade(id: string, grade: { priority?: BoardPriority | null; effort?: BoardEffort | null }): Promise<Ticket | null> {
  const { status, body } = await call(`/tickets/${encodeURIComponent(id)}`, { method: "PATCH", body: grade });
  return status === 200 ? asTicket(body) : null;
}

/**
 * A short id (SPX-142) or a cuid, as the whole cuid. Sumilabu answers
 * `GET tickets/<short id>` itself, so that is one small read; listing the
 * whole board to find one ticket was most of the board's traffic in
 * November 2026 (spx-stats' list is over a megabyte). Only a Sumilabu that
 * does not know the short id falls back to the list, which says plainly when
 * that Sumilabu has no short ids yet. A cuid is returned as typed.
 */
export async function boardResolveId(id: string): Promise<string> {
  if (!looksLikeShortId(id)) return id;
  const direct = await call(`/tickets/${encodeURIComponent(id.trim().toUpperCase())}`);
  if (direct.status === 200) {
    const found = asTicket(direct.body);
    if (found?.id && found.shortId?.toUpperCase() === id.trim().toUpperCase()) {
      justRead.set(found.id, found);
      return found.id;
    }
  }
  const tickets = await boardList();
  const wanted = id.trim().toUpperCase();
  const found = tickets.find((t) => t.shortId?.toUpperCase() === wanted);
  if (found) return found.id;
  if (tickets.length > 0 && tickets.every((t) => !t.shortId)) {
    throw new Error(`${id}: this Sumilabu has no short ids yet; use the whole id the board prints.`);
  }
  return id;
}

export type EditOutcome =
  | { ok: true; ticket: Ticket }
  | { ok: false; reason: "missing" | "done" | "refused" | "unsupported" | "actor"; message: string }
  | { ok: false; reason: "invalid"; problems: string[] };

/**
 * A change to the title and/or detail, nothing else. The board keeps the old
 * and new text in the ticket's history. An older Sumilabu answers this in
 * ways that look like success or like a bad request, so the ticket it hands
 * back is checked against what was sent: anything short of the edit having
 * landed is reported as unsupported, never as done.
 */
export async function boardEdit(id: string, edit: { title?: string; detail?: string }, actor: string): Promise<EditOutcome> {
  const { status, body } = await call(`/tickets/${encodeURIComponent(id)}`, { method: "PATCH", actor, body: edit });
  const unsupported: EditOutcome = {
    ok: false,
    reason: "unsupported",
    message: "This Sumilabu does not support editing yet (it has not been deployed with the edit change). Nothing was changed.",
  };
  if (status === 200) {
    const ticket = asTicket(body);
    const landed = (edit.title === undefined || ticket.title === edit.title.trim()) && (edit.detail === undefined || (ticket.detail ?? "") === edit.detail.trim());
    return landed ? { ok: true, ticket } : unsupported;
  }
  if (status === 404) return { ok: false, reason: "missing", message: `No task ${id}.` };
  if (status === 409) {
    return body.error === "done"
      ? { ok: false, reason: "done", message: `${id} is done: its words are part of the release record. File a new ticket that cites it.` }
      : { ok: false, reason: "refused", message: `${id} cannot be edited right now (${String(body.error)}).` };
  }
  if (status === 422) return { ok: false, reason: "invalid", problems: (body.problems as string[]) ?? [String(body.error ?? "refused")] };
  if (body.error === "actor_required") return { ok: false, reason: "actor", message: "The board needs your name: pass --by \"<who>\"." };
  return unsupported;
}

export type HistoryEntry = { field: string; oldValue: string | null; newValue: string | null; editedBy: string | null; editedAt: string };

/** Null when this Sumilabu does not keep a history yet; an empty list for a ticket never edited. */
export async function boardHistory(id: string): Promise<HistoryEntry[] | null | "missing"> {
  const { status, body } = await call(`/tickets/${encodeURIComponent(id)}/history`);
  if (status === 200) return (body.edits as HistoryEntry[]) ?? [];
  return status === 404 && body.error === "missing" ? "missing" : null;
}

export type Note = { id: string; ticketId: string; body: string; by: string | null; createdAt: string };

/** Oldest first, read through the ETag cache. Null when this Sumilabu has no notes yet. */
export async function boardNotes(id: string): Promise<Note[] | null | "missing"> {
  const { status, body } = await call(`/tickets/${encodeURIComponent(id)}/notes`);
  if (status === 200) return (body.notes as Note[]) ?? [];
  return status === 404 && body.error === "missing" ? "missing" : null;
}

export type WriteOutcome<T = Record<string, never>> =
  | ({ ok: true } & T)
  | { ok: false; reason: "missing" | "done" | "unsupported" | "actor"; message: string }
  | { ok: false; reason: "invalid"; problems: string[] };

function refusal(id: string, status: number, body: Json): WriteOutcome<never> {
  if (status === 404 && body.error === "missing") return { ok: false, reason: "missing", message: `No task ${id}.` };
  if (status === 409 && body.error === "done") return { ok: false, reason: "done", message: `${id} is done: the board does not allow that on a done ticket.` };
  if (status === 422) return { ok: false, reason: "invalid", problems: (body.problems as string[]) ?? [String(body.error ?? "refused")] };
  if (body.error === "actor_required") return { ok: false, reason: "actor", message: 'The board needs your name: pass --by "<who>".' };
  return { ok: false, reason: "unsupported", message: "This Sumilabu does not support that yet. Nothing was changed." };
}

/** Appends a note, on a ticket in any status. A note is never edited or removed. */
export async function boardAddNote(id: string, body: string, actor: string): Promise<WriteOutcome<{ note: Note }>> {
  const r = await call(`/tickets/${encodeURIComponent(id)}/notes`, { method: "POST", actor, body: { body } });
  return r.status === 201 ? { ok: true, note: r.body.note as Note } : refusal(id, r.status, r.body);
}

/** Puts the ticket under a parent (short id or cuid), or takes it out from under one with null. */
export async function boardSetParent(id: string, parentId: string | null, actor: string): Promise<WriteOutcome<{ ticket: Ticket }>> {
  const r = await call(`/tickets/${encodeURIComponent(id)}`, { method: "PATCH", actor, body: { parentId } });
  if (r.status !== 200) return refusal(id, r.status, r.body);
  const ticket = asTicket(r.body);
  /* An older Sumilabu ignores the field and answers 200: no parentId on the ticket means it was not kept. */
  return ticket.parentId === undefined ? refusal(id, 0, {}) : { ok: true, ticket };
}

/** Links two tickets, or removes the link; either end names the pair. `changed` is false when it already was so. */
export async function boardRelate(id: string, otherId: string, actor: string, remove = false): Promise<WriteOutcome<{ changed: boolean; related: string[] }>> {
  const r = remove
    ? await call(`/tickets/${encodeURIComponent(id)}/links/${encodeURIComponent(otherId)}`, { method: "DELETE", actor })
    : await call(`/tickets/${encodeURIComponent(id)}/links`, { method: "POST", actor, body: { otherId } });
  if (r.status !== 200 && r.status !== 201) return refusal(id, r.status, r.body);
  return { ok: true, changed: remove ? r.body.removed === true : r.status === 201, related: (r.body.related as string[]) ?? [] };
}
