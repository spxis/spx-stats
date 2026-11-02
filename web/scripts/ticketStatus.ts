import { execFileSync } from "node:child_process";
import { isHeldNow } from "../src/lib/board/rules.ts";

/**
 * `pnpm task status`: one summary of every ticket board, for John's phone.
 *
 *   pnpm task status          short text
 *   pnpm task status --json   the same numbers for a tool
 *
 * Keys: SUMILABU_BOARD_TOKEN for spx-stats (as pnpm task), and
 * SUMILABU_BOARD_TOKEN_<KEY> (upper case, - as _) for the others, else on a Mac
 * the keychain item "sumilabu board <key>". A key is never printed. A board
 * with no key or no answer says so and the rest still print.
 */

export const BOARDS = ["spx-stats", "modules", "wazadb", "hako-devices", "hotaru", "kyogijo-stadiums", "senshu-jerseys", "kazoku-ui"] as const;

/** Package repos checked for a version on main that npm does not have. */
export const PACKAGES: { name: string; dir: string }[] = [
  { name: "meigen-sports", dir: "meigen-sports" },
  { name: "senshu-jerseys", dir: "senshu-jerseys" },
  { name: "dougu-sports", dir: "dougu-sports" },
  { name: "kyogijo-stadiums", dir: "kyogijo" },
  { name: "kazoku-ui", dir: "kazoku-ui" },
  { name: "hako-devices", dir: "hako-devices" },
  { name: "uchusen-rockets", dir: "uchusen-rockets" },
  { name: "fuda-cards", dir: "fuda-cards-npm-release" },
  { name: "chikyu-earth", dir: "chikyu-earth" },
  { name: "taisen-brackets", dir: "taisen-brackets" },
  { name: "chizu", dir: "chizu" },
  { name: "hata", dir: "hata" },
  { name: "kuni", dir: "kuni" },
  { name: "address-plus", dir: "address-plus" },
];

const KNOWN = new Set([...PACKAGES.map((p) => p.name), "wazadb", "meet-prompter", "family", "hotaru"]);
const DAY = 24 * 60 * 60 * 1000;

type Row = {
  seq?: number;
  shortId?: string | null;
  title: string;
  status: string;
  area?: string | null;
  claimedBy: string | null;
  claimedAt?: string | null;
  movedAt?: string | null;
  releasedAt?: string | null;
};

export type Group = { project: string; open: number; inProgress: number; done7d: number };
export type Hold = { id: string; who: string; stale: boolean; days: number };
export type BoardSummary =
  | { board: string; ok: true; open: number; inProgress: number; done7d: number; groups: Group[]; holds: Hold[] }
  | { board: string; ok: false; problem: string };
export type Waiting = { name: string; main: string; npm: string };
export type Status = { boards: BoardSummary[]; waiting: Waiting[]; totals: { open: number; inProgress: number; done7d: number; stale: number; waiting: number } };

export type Deps = {
  boards?: readonly string[];
  token: (board: string) => string | null;
  url?: string;
  fetchTickets: (board: string, token: string) => Promise<{ status: number; tickets: Row[] }>;
  versions: () => Waiting[];
  now?: number;
};

/** The project a ticket belongs to: its title prefix when it is one we know, else its area on a shared board, else the board. */
export function projectOf(board: string, t: Row): string {
  const prefix = /^([a-z0-9][a-z0-9-]*):/i.exec(t.title)?.[1]?.toLowerCase();
  if (prefix && (KNOWN.has(prefix) || board === "modules" || board === "kazoku-ui")) return prefix;
  if ((board === "modules" || board === "kazoku-ui") && t.area) return t.area.toLowerCase();
  return board === "spx-stats" ? "site+data" : board;
}

export function summarise(board: string, rows: Row[], now: number): BoardSummary {
  const groups = new Map<string, Group>();
  const holds: Hold[] = [];
  let done7d = 0;
  const bump = (p: string): Group => {
    let g = groups.get(p);
    if (!g) groups.set(p, (g = { project: p, open: 0, inProgress: 0, done7d: 0 }));
    return g;
  };
  for (const t of rows) {
    const g = bump(projectOf(board, t));
    if (t.status === "open") g.open += 1;
    else if (t.status === "inProgress") g.inProgress += 1;
    else if (t.status === "done") {
      const at = Date.parse(t.releasedAt ?? t.movedAt ?? "");
      if (Number.isFinite(at) && now - at <= 7 * DAY) {
        g.done7d += 1;
        done7d += 1;
      }
    }
    if (t.status === "inProgress" && t.claimedBy) {
      const held = isHeldNow({ claimedBy: t.claimedBy, claimedAt: t.claimedAt }, now);
      const since = Date.parse(t.claimedAt ?? "");
      holds.push({ id: t.shortId ?? `#${t.seq ?? "?"}`, who: t.claimedBy, stale: !held, days: Number.isFinite(since) ? Math.floor((now - since) / DAY) : 0 });
    }
  }
  const list = [...groups.values()].filter((g) => g.open + g.inProgress + g.done7d > 0).sort((a, b) => b.open + b.inProgress - (a.open + a.inProgress) || a.project.localeCompare(b.project));
  return {
    board,
    ok: true,
    open: list.reduce((n, g) => n + g.open, 0),
    inProgress: list.reduce((n, g) => n + g.inProgress, 0),
    done7d,
    groups: list,
    holds: holds.sort((a, b) => Number(b.stale) - Number(a.stale) || a.id.localeCompare(b.id, "en", { numeric: true })),
  };
}

export async function gatherStatus(deps: Deps): Promise<Status> {
  const now = deps.now ?? Date.now();
  const boards: BoardSummary[] = [];
  for (const board of deps.boards ?? BOARDS) {
    const token = deps.token(board);
    if (!token) {
      boards.push({ board, ok: false, problem: "no key on this machine" });
      continue;
    }
    try {
      const r = await deps.fetchTickets(board, token);
      if (r.status === 401 || r.status === 403) boards.push({ board, ok: false, problem: "key refused" });
      else if (r.status === 404) boards.push({ board, ok: false, problem: "no such board yet" });
      else if (r.status !== 200) boards.push({ board, ok: false, problem: `answered ${r.status}` });
      else boards.push(summarise(board, r.tickets, now));
    } catch (e) {
      boards.push({ board, ok: false, problem: `unreachable (${(e as Error).message.slice(0, 40)})` });
    }
  }
  const waiting = deps.versions();
  const good = boards.filter((b): b is Extract<BoardSummary, { ok: true }> => b.ok);
  return {
    boards,
    waiting,
    totals: {
      open: good.reduce((n, b) => n + b.open, 0),
      inProgress: good.reduce((n, b) => n + b.inProgress, 0),
      done7d: good.reduce((n, b) => n + b.done7d, 0),
      stale: good.reduce((n, b) => n + b.holds.filter((h) => h.stale).length, 0),
      waiting: waiting.length,
    },
  };
}

/** Short lines, nothing wider than a phone. */
export function render(s: Status): string {
  const out: string[] = [];
  for (const b of s.boards) {
    if (!b.ok) {
      out.push(`${b.board}: ${b.problem}`, "");
      continue;
    }
    out.push(`== ${b.board}`, `${b.open} open, ${b.inProgress} in progress, ${b.done7d} done in 7d`);
    if (b.groups.length > 1 || b.groups[0]?.project !== b.board) for (const g of b.groups) out.push(`  ${g.project}: ${g.open} open, ${g.inProgress} prog, ${g.done7d} done`);
    for (const h of b.holds) out.push(`  ${h.stale ? "STALE " : "held "}${h.id} ${h.who}${h.stale ? ` (${h.days}d)` : ""}`);
    out.push("");
  }
  out.push("== Waiting for John's release");
  if (s.waiting.length === 0) out.push("  nothing (main matches npm)");
  for (const w of s.waiting) out.push(`  ${w.name}: main ${w.main}, npm ${w.npm}`);
  out.push("", "== Totals", `${s.totals.open} open, ${s.totals.inProgress} in progress`, `${s.totals.done7d} done in 7d`, `${s.totals.stale} stale holds, ${s.totals.waiting} releases waiting`);
  return out.join("\n");
}

function cmp(a: string, b: string): number {
  const pa = a.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  const pb = b.split(/[.-]/).map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

/** Packages whose version on origin/main (as last fetched) is above the one on npm. */
export function realVersions(): Waiting[] {
  const home = process.env.HOME ?? "";
  const out: Waiting[] = [];
  for (const p of PACKAGES) {
    try {
      const main = (JSON.parse(execFileSync("git", ["-C", `${home}/Projects/${p.dir}`, "show", "origin/main:package.json"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })) as { version?: string }).version;
      if (!main) continue;
      const npm = execFileSync("npm", ["view", `@johnmorrisdotca/${p.name}`, "version"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 15000 }).trim();
      if (npm && cmp(main, npm) > 0) out.push({ name: p.name, main, npm });
    } catch {
      /* no checkout here, or offline: this package is not reported */
    }
  }
  return out;
}

export function realToken(board: string): string | null {
  const env = board === "spx-stats" ? process.env.SUMILABU_BOARD_TOKEN : process.env[`SUMILABU_BOARD_TOKEN_${board.toUpperCase().replace(/-/g, "_")}`];
  if (env?.trim()) return env.trim();
  if (process.platform !== "darwin") return null;
  try {
    return execFileSync("security", ["find-generic-password", "-s", `sumilabu board ${board}`, "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
  } catch {
    return null;
  }
}

export async function runStatus(args: string[]): Promise<void> {
  const url = (process.env.SUMILABU_BOARD_URL ?? "https://api.sumilabu.com").replace(/\/+$/, "");
  const s = await gatherStatus({
    token: realToken,
    versions: realVersions,
    fetchTickets: async (board, token) => {
      const r = await fetch(`${url}/api/v1/projects/${board}/tickets`, { headers: { authorization: `Bearer ${token}`, accept: "application/json" }, cache: "no-store" });
      const body = (await r.json().catch(() => ({}))) as { tickets?: Row[] };
      return { status: r.status, tickets: body.tickets ?? [] };
    },
  });
  console.log(args.includes("--json") ? JSON.stringify(s, null, 2) : render(s));
}
