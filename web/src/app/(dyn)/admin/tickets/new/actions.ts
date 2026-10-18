"use server";

import { headers } from "next/headers";
import { boardCreate, boardGrade } from "@/lib/board/client";
import { BOARD_KINDS, BOARD_PRIORITIES, draftProblems, type BoardKind, type BoardPriority } from "@/lib/board/rules";
import { sameOrigin } from "@/lib/auth/origin";
import { NOT_CONFIRMED, isConfirmed } from "@/lib/confirm";
import { requireAdminWrite } from "@/lib/auth/user";

export type FileState = { ok: boolean; message: string } | null;

/**
 * Files a ticket on the board. Re-checks admin on the server (anyone else gets a 404), refuses a request
 * whose Origin is not this site, and validates every field again. The board token stays on the server.
 */
export async function fileTicket(_previous: FileState, form: FormData): Promise<FileState> {
  const user = await requireAdminWrite();
  if (!sameOrigin(await headers())) return { ok: false, message: "Request refused: it did not come from this site." };
  if (!isConfirmed(form)) return { ok: false, message: NOT_CONFIRMED };

  const text = (name: string) => {
    const value = form.get(name);
    return typeof value === "string" ? value : "";
  };
  const title = text("title").trim();
  const detail = text("detail").trim();
  const kind = BOARD_KINDS.find((k) => k === text("kind"));
  const priority: BoardPriority | undefined = BOARD_PRIORITIES.find((p) => p === text("priority"));
  const askedBy = (user.name ?? "admin").replace(/[^\x20-\x7e]/g, "").trim().slice(0, 60) || "admin";

  const problems = draftProblems({ title, detail, askedBy });
  if (!kind) problems.push("Pick a kind.");
  if (problems.length > 0 || !kind) return { ok: false, message: problems.join(" ") };

  try {
    const made = await boardCreate({ title, detail: detail || null, kind: kind as BoardKind, askedBy }, askedBy);
    if (!made.ok) return { ok: false, message: made.problems.join(" ") };
    if (priority) await boardGrade(made.ticket.id, { priority });
    return { ok: true, message: `Filed: ${made.ticket.title}` };
  } catch {
    return { ok: false, message: "The board did not accept the ticket. Try again in a moment." };
  }
}
