import type { BoardEffort, BoardKind, BoardPriority, BoardStatus, Ticket } from "./rules.ts";

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

export class BoardError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type Json = Record<string, unknown>;

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
  const response = await fetch(`${url}/api/v1/projects/${BOARD_PROJECT_KEY}${path}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
  });
  const text = await response.text();
  let body: Json = {};
  try {
    body = text ? (JSON.parse(text) as Json) : {};
  } catch {
    body = { error: text.slice(0, 200) };
  }
  if (response.status === 401) throw new BoardError("Sumilabu refused the board key: check SUMILABU_BOARD_TOKEN.", 401);
  if (response.status >= 500) throw new BoardError(`Sumilabu's board answered ${response.status}.`, response.status);
  return { status: response.status, body };
}

const asTicket = (body: Json): Ticket => body.ticket as Ticket;

/** Everything not yet done or dropped, stale holds included, or every row. */
export async function boardList(filter: { unfinished?: boolean } = {}): Promise<Ticket[]> {
  const { body } = await call(filter.unfinished ? "/tickets?unfinished=1" : "/tickets");
  return (body.tickets as Ticket[]) ?? [];
}

export async function boardGet(id: string): Promise<Ticket | null> {
  const { status, body } = await call(`/tickets/${encodeURIComponent(id)}`);
  return status === 200 ? asTicket(body) : null;
}

export type Draft = { title: string; detail: string | null; kind: BoardKind; askedBy: string | null };

export async function boardCreate(draft: Draft, actor: string | null): Promise<{ ok: true; ticket: Ticket } | { ok: false; problems: string[] }> {
  const { status, body } = await call("/tickets", { method: "POST", actor, body: { title: draft.title, detail: draft.detail, area: null, kind: draft.kind, askedBy: draft.askedBy } });
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
