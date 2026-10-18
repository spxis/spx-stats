import { execFileSync } from "node:child_process";
import { boardCreate, boardEdit, boardGet, boardGrade, boardHistory, boardHost, boardList, boardMove, boardResolveId, boardShip, type MoveOutcome } from "../src/lib/board/client.ts";
import {
  BOARD_EFFORTS,
  BOARD_PRIORITIES,
  CAPS,
  appendedDetail,
  byQuickWin,
  draftProblems,
  editProblems,
  isHeldNow,
  leaseExpired,
  ticketLine,
  type BoardEffort,
  type BoardKind,
  type BoardPriority,
} from "../src/lib/board/rules.ts";

/**
 * The shared ticket board, from a terminal (run in web/).
 *
 *   pnpm task                                     what is open and who holds it
 *   pnpm task add "<title>" [--detail "…"] [--bug|--chore] [--by "<who>"]
 *   pnpm task claim <id> "<who>"                  check one out (six-hour lease)
 *   pnpm task release <id> --by "<who>"           put it back
 *   pnpm task done <id> --by "<who>" --version "<v>" [--entry "<commit or note>"]
 *   pnpm task drop <id> --by "<who>"              answered no, kept on the record
 *   pnpm task reopen <id> --by "<who>"            a no reconsidered
 *   pnpm task grade <id> [--priority high|normal|low|none] [--effort small|medium|large|none]
 *   pnpm task edit <id> [--title "…"] [--detail "…" | --append "…"] --by "<who>"
 *   pnpm task history <id>                        every edit of a ticket's title or detail
 *
 * <id> is the whole cuid the board prints, never a prefix, or the short id
 * (SPX-142) once Sumilabu has them. The board is on
 * Sumilabu; SUMILABU_BOARD_URL and SUMILABU_BOARD_TOKEN come from the
 * environment (never a file in this repository), or on a Mac from the
 * keychain item "sumilabu board spx-stats".
 */

if (process.platform === "darwin" && !process.env.SUMILABU_BOARD_TOKEN) {
  try {
    process.env.SUMILABU_BOARD_TOKEN = execFileSync("security", ["find-generic-password", "-s", "sumilabu board spx-stats", "-w"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    process.env.SUMILABU_BOARD_URL ||= "https://api.sumilabu.com";
  } catch {
    delete process.env.SUMILABU_BOARD_TOKEN;
  }
}

const ID_COMMANDS = ["claim", "release", "done", "drop", "reopen", "grade", "edit", "history"];

function flag(name: string, rest: string[]): string | undefined {
  const at = rest.indexOf(`--${name}`);
  return at > -1 ? rest[at + 1] : undefined;
}

function usage(): never {
  console.error(
    [
      "usage:",
      "  pnpm task",
      '  pnpm task add "<title>" [--detail "…"] [--bug|--chore] [--by "<who>"]',
      '  pnpm task claim <id> "<who>"',
      '  pnpm task release <id> --by "<who>"',
      '  pnpm task done <id> --by "<who>" --version "<v>" [--entry "<commit or note>"]',
      '  pnpm task drop <id> --by "<who>"',
      '  pnpm task reopen <id> --by "<who>"',
      "  pnpm task grade <id> [--priority high|normal|low|none] [--effort small|medium|large|none]",
      '  pnpm task edit <id> [--title "…"] [--detail "…" | --append "…"] --by "<who>"',
      "  pnpm task history <id>",
      "",
      "Use the whole cuid the board prints, not a prefix, or the short id (SPX-142).",
    ].join("\n"),
  );
  process.exit(2);
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function actorFrom(rest: string[]): string {
  const who = flag("by", rest)?.trim();
  if (!who) usage();
  return who.slice(0, CAPS.claimedBy);
}

function refused(id: string, o: MoveOutcome & { ok: false }): never {
  if (o.reason === "missing") fail(`No task ${id}.`);
  if (o.reason === "illegal") fail(`${id} is ${o.from}; the board does not allow that move from there.`);
  fail(`${id} is held by ${o.heldBy}. Ask them to release it.`);
}

async function move(id: string, to: "open" | "inProgress" | "dropped", who: string): Promise<void> {
  const o = await boardMove(id, to, who);
  if (!o.ok) refused(id, o);
}

function grade<T extends string>(name: string, rest: string[], allowed: readonly T[]): T | null | undefined {
  const raw = flag(name, rest);
  if (raw === undefined) return undefined;
  if (raw === "none") return null;
  if (!(allowed as readonly string[]).includes(raw)) usage();
  return raw as T;
}

async function main(): Promise<void> {
  const [command = "list", ...rest] = process.argv.slice(2);
  if (rest[0] && ID_COMMANDS.includes(command)) rest[0] = await boardResolveId(rest[0]);
  switch (command) {
    case "list": {
      const tasks = await boardList({ unfinished: true });
      const held = tasks.filter((t) => isHeldNow(t));
      const stale = tasks.filter((t) => t.claimedBy && !isHeldNow(t));
      const waiting = tasks.filter((t) => !t.claimedBy).sort(byQuickWin);
      console.log(`${waiting.length + stale.length} waiting · ${held.length} in progress · on ${boardHost()}\n`);
      for (const t of [...held, ...waiting, ...stale]) {
        console.log(ticketLine(t));
        if (t.detail) console.log(`        ${t.detail.replace(/\n/g, "\n        ")}`);
      }
      if (tasks.length === 0) console.log("Nothing on the board.");
      break;
    }
    case "add": {
      const [title] = rest;
      if (!title) usage();
      if (rest.includes("--bug") && rest.includes("--chore")) usage();
      const kind: BoardKind = rest.includes("--bug") ? "fix" : rest.includes("--chore") ? "chore" : "feature";
      const detail = flag("detail", rest) ?? null;
      const askedBy = flag("by", rest) ?? null;
      const problems = draftProblems({ title, detail: detail ?? "", askedBy: askedBy ?? "" });
      if (problems.length > 0) fail(problems.join("\n"));
      const created = await boardCreate({ title: title.trim(), detail, kind, askedBy }, askedBy);
      if (!created.ok) fail(created.problems.join("\n"));
      console.log(`added ${created.ticket.shortId ? `${created.ticket.shortId} (${created.ticket.id})` : created.ticket.id} on ${boardHost()}`);
      break;
    }
    case "claim": {
      const [id, owner] = rest;
      if (!id || !owner) usage();
      const who = owner.slice(0, CAPS.claimedBy);
      const task = await boardGet(id);
      if (!task) fail(`No task ${id}.`);
      if (task.status === "done" || task.status === "dropped") fail(`${id} is ${task.status}; there is nothing to pick up.`);
      if (isHeldNow(task) && task.claimedBy !== who) fail(`${id} is held by ${task.claimedBy}. Ask them to release it.`);
      if (task.status === "inProgress" && task.claimedBy === who && !leaseExpired(task.claimedAt)) {
        console.log(`${id} already held by ${who}.`);
        break;
      }
      /* The board has no inProgress -> inProgress move, so a lapsed hold is put back first. */
      if (task.status === "inProgress") {
        const freed = await boardMove(id, "open", who);
        if (!freed.ok) {
          if (freed.reason === "held") fail(`${id} was taken by ${freed.heldBy} a moment ago.`);
          refused(id, freed);
        }
      }
      const taken = await boardMove(id, "inProgress", who);
      if (!taken.ok) {
        if (taken.reason === "held") fail(`${id} was taken by ${taken.heldBy} a moment ago.`);
        refused(id, taken);
      }
      console.log(`${id} in progress, held by ${who} on ${boardHost()}`);
      break;
    }
    case "release": {
      const [id] = rest;
      if (!id) usage();
      await move(id, "open", actorFrom(rest));
      console.log(`${id} released on ${boardHost()}`);
      break;
    }
    case "done": {
      const [id] = rest;
      if (!id) usage();
      const who = actorFrom(rest);
      const version = flag("version", rest)?.trim();
      if (!version) usage();
      const o = await boardShip(id, { version, entryId: flag("entry", rest)?.trim() || version, releasedAt: new Date() }, who);
      if (!o.ok) refused(id, o);
      console.log(`${id} done in ${version} on ${boardHost()}`);
      break;
    }
    case "drop": {
      const [id] = rest;
      if (!id) usage();
      await move(id, "dropped", actorFrom(rest));
      console.log(`${id} dropped on ${boardHost()}`);
      break;
    }
    case "reopen": {
      const [id] = rest;
      if (!id) usage();
      await move(id, "open", actorFrom(rest));
      console.log(`${id} reopened on ${boardHost()}`);
      break;
    }
    case "grade": {
      const [id] = rest;
      if (!id) usage();
      const priority = grade<BoardPriority>("priority", rest, BOARD_PRIORITIES);
      const effort = grade<BoardEffort>("effort", rest, BOARD_EFFORTS);
      if (priority === undefined && effort === undefined) usage();
      const graded = await boardGrade(id, { ...(priority !== undefined ? { priority } : {}), ...(effort !== undefined ? { effort } : {}) });
      if (!graded) fail(`No task ${id}.`);
      console.log(`${id} graded on ${boardHost()}`);
      break;
    }
    case "edit": {
      const [id] = rest;
      if (!id) usage();
      const who = actorFrom(rest);
      const title = flag("title", rest);
      const detail = flag("detail", rest);
      const append = flag("append", rest);
      if (title === undefined && detail === undefined && append === undefined) usage();
      if (detail !== undefined && append !== undefined) fail("Use --detail to replace the detail or --append to add to it, not both.");
      let newDetail = detail;
      if (append !== undefined) {
        const task = await boardGet(id);
        if (!task) fail(`No task ${id}.`);
        newDetail = appendedDetail(task.detail, append);
      }
      const problems = editProblems({ title, detail: newDetail });
      if (problems.length > 0) fail(problems.join("\n"));
      const edited = await boardEdit(id, { ...(title !== undefined ? { title } : {}), ...(newDetail !== undefined ? { detail: newDetail } : {}) }, who);
      if (!edited.ok) fail(edited.reason === "invalid" ? edited.problems.join("\n") : edited.message);
      const fields = [title !== undefined && "title", newDetail !== undefined && "detail"].filter(Boolean).join(" and ");
      console.log(`${id} ${fields} edited by ${who} on ${boardHost()}`);
      const kept = await boardHistory(id);
      if (kept === null) console.log("note: this Sumilabu does not keep an edit history yet, so the old text was not saved.");
      break;
    }
    case "history": {
      const [id] = rest;
      if (!id) usage();
      const edits = await boardHistory(id);
      if (edits === "missing") fail(`No task ${id}.`);
      if (edits === null) fail("This Sumilabu does not keep an edit history yet.");
      if (edits.length === 0) console.log(`${id} has not been edited.`);
      for (const e of edits) {
        console.log(`${e.editedAt}  ${e.editedBy ?? "?"}  ${e.field}`);
        console.log(`    was: ${(e.oldValue ?? "(empty)").replace(/\n/g, "\n         ")}`);
        console.log(`    now: ${(e.newValue ?? "(empty)").replace(/\n/g, "\n         ")}`);
      }
      break;
    }
    default:
      usage();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
