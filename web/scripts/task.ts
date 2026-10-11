import { boardCreate, boardGet, boardGrade, boardHost, boardList, boardMove, boardShip, type MoveOutcome } from "../src/lib/board/client.ts";
import {
  BOARD_EFFORTS,
  BOARD_PRIORITIES,
  CAPS,
  byQuickWin,
  draftProblems,
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
 *
 * <id> is the whole cuid the board prints, never a prefix. The board is on
 * Sumilabu; SUMILABU_BOARD_URL and SUMILABU_BOARD_TOKEN come from the
 * environment (never a file in this repository).
 */

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
      "",
      "Use the whole id the board prints, not a prefix.",
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
      console.log(`added ${created.ticket.id} on ${boardHost()}`);
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
    default:
      usage();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
