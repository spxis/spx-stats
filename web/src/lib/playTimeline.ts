/**
 * The replay of a game on its field (components/FieldPlayer.tsx): the clock of it, worked out from the same rows the still drawing is made of. Pure and free of
 * every server import, so the browser, the file route and the checks share it (scripts/playTimeline.test.ts). Times are milliseconds at normal speed.
 *
 * What is moved is what the still drawing holds, nothing more: an MLB game's batted balls fly from home plate to the zone Retrosheet gave them, in the order they were
 * hit; an NFL game's drives are drawn play by play along the lines of scrimmage, in the order played. The positions in the wire are in the drawing's own units
 * (feet, as the file draws them), so the browser needs no map and no park data.
 */

export interface PlayTeam { name: string; /** A hex without #. */ color: string }

/** [inning, half (0 the visitors bat), result code, trajectory code, x, y] with x and y where the still drawing puts the mark (home plate is 0, 0; up the field is negative y). */
export type BallWire = [inning: number, half: 0 | 1, result: string, traj: string, x: number, y: number];

export interface MlbWire { sport: "mlb"; teams: [PlayTeam, PlayTeam]; /** The final score, when the game row has it. */ score: [number | null, number | null]; balls: BallWire[] }

/** One drive: its lane (y) and the places along it (x0 where it began, xs the line of scrimmage of each play, x1 where it ended, xr where a returned turnover ended). */
export interface DriveWire {
  side: 0 | 1;
  qtr: number | null;
  clock: string;
  /** The drive's result code (T F M P X D H S O ?). */
  result: string;
  plays: number | null;
  y: number;
  x0: number;
  x1: number;
  xs: number[];
  xr: number | null;
}

export interface NflWire { sport: "nfl"; teams: [PlayTeam, PlayTeam]; score: [number | null, number | null]; drives: DriveWire[] }

export type PlayWire = MlbWire | NflWire;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/* ---------- baseball ---------------------------------------------------------------------- */

export interface Tally { hits: number; hr: number; outs: number }

const GAP_FIRST = 250, GAP_HALF = 450, GAP_BALL = 220;

/** How long a ball takes from the bat to its zone: a grounder is quick, a fly ball hangs, a home run takes longest. */
export function flightMs(b: BallWire): number {
  const d = Math.hypot(b[4], b[5]), traj = b[3];
  if (b[2] === "h") return clamp(800 + d * 1.5, 900, 1500);
  if (traj === "G" || traj === "BG") return clamp(280 + d * 1.6, 350, 850);
  if (traj === "L" || traj === "BL") return clamp(380 + d * 1.3, 450, 900);
  return clamp(520 + d * 1.7, 700, 1300);
}

/** How high the ball rises at the middle of its flight, in feet drawn on the field: none for a grounder, a lot for a pop-up or a home run. */
export function ballLift(b: BallWire): number {
  const d = Math.hypot(b[4], b[5]), traj = b[3];
  if (b[2] === "h") return clamp(0.42 * d, 60, 190);
  if (traj === "G" || traj === "BG") return 0;
  if (traj === "L" || traj === "BL") return clamp(0.1 * d, 6, 40);
  if (traj === "P" || traj === "BP") return clamp(60 + 0.5 * d, 70, 130);
  return clamp(0.32 * d, 20, 130);
}

/** Where the ball is a share `u` (0 to 1) of the way along its flight: the ground track from home plate to the mark, lifted by the arc. */
export function ballAt(b: BallWire, u: number): { x: number; y: number } {
  const g = b[3] === "G" || b[3] === "BG" ? 1 - Math.pow(1 - u, 1.7) : u;
  return { x: b[4] * g, y: b[5] * g - ballLift(b) * 4 * u * (1 - u) };
}

export interface HalfBlock { start: number; inning: number; half: 0 | 1; first: number; last: number }

export interface MlbTimeline {
  total: number;
  launch: number[];
  land: number[];
  blocks: HalfBlock[];
  /** The time each inning begins (its first half), for the buttons that jump. */
  chips: { inning: number; t: number }[];
  /** For a reader who prefers reduced motion: the moment each inning's last ball is hit, so a step shows the inning whole. */
  steps: number[];
  /** Hits, home runs and outs of each side after the first k balls landed. */
  tally: [Tally[], Tally[]];
}

export function mlbTimeline(balls: readonly BallWire[]): MlbTimeline {
  const launch: number[] = [], land: number[] = [], blocks: HalfBlock[] = [];
  const tally: [Tally[], Tally[]] = [[{ hits: 0, hr: 0, outs: 0 }], [{ hits: 0, hr: 0, outs: 0 }]];
  let cursor = 0;
  balls.forEach((b, i) => {
    const prev = blocks[blocks.length - 1];
    if (!prev || prev.inning !== b[0] || prev.half !== b[1]) {
      const start = cursor;
      cursor += blocks.length ? GAP_HALF : GAP_FIRST;
      blocks.push({ start, inning: b[0], half: b[1], first: i, last: i });
    } else prev.last = i;
    launch.push(cursor);
    cursor += flightMs(b);
    land.push(cursor);
    cursor += GAP_BALL;
    for (const s of [0, 1] as const) {
      const t = { ...tally[s][tally[s].length - 1]! };
      if (b[1] === s) {
        if (b[2] === "s" || b[2] === "d" || b[2] === "t" || b[2] === "h") t.hits++;
        if (b[2] === "h") t.hr++;
        if (b[2] === "o") t.outs++;
      }
      tally[s].push(t);
    }
  });
  const chips: { inning: number; t: number }[] = [];
  for (const k of blocks) if (!chips.some((c) => c.inning === k.inning)) chips.push({ inning: k.inning, t: k.start });
  const steps = chips.map((c) => {
    let last = 0;
    balls.forEach((b, i) => { if (b[0] === c.inning) last = launch[i]!; });
    return last;
  });
  const total = balls.length ? cursor - GAP_BALL + 400 : 0;
  if (steps.length) steps[steps.length - 1] = total;
  return { total, launch, land, blocks, chips, steps, tally };
}

export interface MlbFrame {
  /** How many balls have come down. */
  landed: number;
  /** The ball in the air, with how far along it is (0 to 1). */
  fly: { i: number; u: number } | null;
  /** The half inning (an index into the timeline's blocks) the clock is in. */
  block: number;
  tally: [Tally, Tally];
  done: boolean;
}

/** The game at time `t`. With `snap` (reduced motion) a ball is on the field from the moment it is hit and none is in the air. */
export function mlbFrame(tl: MlbTimeline, t: number, snap = false): MlbFrame {
  let landed = 0;
  let fly: MlbFrame["fly"] = null;
  const n = tl.launch.length;
  if (snap) {
    while (landed < n && tl.launch[landed]! <= t) landed++;
  } else {
    while (landed < n && tl.land[landed]! <= t) landed++;
    if (landed < n && tl.launch[landed]! <= t) fly = { i: landed, u: clamp((t - tl.launch[landed]!) / (tl.land[landed]! - tl.launch[landed]!), 0, 1) };
  }
  let block = 0;
  while (block + 1 < tl.blocks.length && tl.blocks[block + 1]!.start <= t) block++;
  return { landed, fly, block, tally: [tl.tally[0][landed]!, tl.tally[1][landed]!], done: t >= tl.total && n > 0 };
}

/* ---------- football ---------------------------------------------------------------------- */

const POP = 380, RETURN_MS = 650, GAP_DRIVE = 220, GAP_QUARTER = 500;
const segMs = (dx: number) => 90 + Math.min(420, Math.abs(dx) * 3);

export interface DriveClock {
  t0: number;
  /** The places the ball goes through in order (the start, the line of each play, the end). */
  pos: number[];
  /** The time it arrives at each. */
  arrive: number[];
  /** Index into `pos` of the first play's line (1 when the start is a place of its own). */
  firstPlay: number;
  endAt: number;
  /** When a turnover returned for a score is home, else null. */
  returnAt: number | null;
  /** When the next drive may begin. */
  doneAt: number;
}

export interface NflTimeline {
  total: number;
  drives: DriveClock[];
  chips: { qtr: number; t: number }[];
  /** For reduced motion: the start of the last drive of each quarter, so a step shows the quarter whole. */
  steps: number[];
  /** The points each drive adds, to which side, and when. */
  credit: { side: 0 | 1; points: number; at: number }[][];
  /** Whether a touchdown of that side is counted with its extra point (the final score shows every try was good). */
  extra: [number, number];
}

const isTd = (r: string) => r === "T" || r === "O";

/** The score a drive's result adds: a touchdown 6, a field goal 3, a safety 2 to the other side, a returned turnover's touchdown 6 to the other side. */
function basePoints(d: DriveWire): { side: 0 | 1; points: number } | null {
  const other = d.side === 0 ? 1 : 0;
  if (d.result === "T") return { side: d.side, points: 6 };
  if (d.result === "F") return { side: d.side, points: 3 };
  if (d.result === "S") return { side: other, points: 2 };
  if (d.result === "O") return { side: other, points: 6 };
  return null;
}

export function nflTimeline(drives: readonly DriveWire[], score: readonly [number | null, number | null] = [null, null]): NflTimeline {
  const clocks: DriveClock[] = [];
  let cursor = 0;
  drives.forEach((d, i) => {
    const prev = drives[i - 1];
    if (prev) cursor += GAP_DRIVE + (prev.qtr !== d.qtr && d.qtr != null ? GAP_QUARTER : 0);
    const t0 = cursor;
    const startOwn = d.xs.length === 0 || Math.abs((d.xs[0] ?? d.x0) - d.x0) > 0.01;
    const pos = [...(startOwn ? [d.x0] : []), ...d.xs, d.x1];
    const arrive = [t0];
    for (let j = 1; j < pos.length; j++) arrive.push(arrive[j - 1]! + segMs(pos[j]! - pos[j - 1]!));
    const endAt = arrive[arrive.length - 1]!;
    const returnAt = d.xr != null ? endAt + RETURN_MS : null;
    const doneAt = (returnAt ?? endAt) + POP;
    clocks.push({ t0, pos, arrive, firstPlay: startOwn ? 1 : 0, endAt, returnAt, doneAt });
    cursor = doneAt;
  });
  const chips: { qtr: number; t: number }[] = [];
  drives.forEach((d, i) => { if (d.qtr != null && !chips.some((c) => c.qtr === d.qtr)) chips.push({ qtr: d.qtr, t: clocks[i]!.t0 }); });
  const steps = chips.map((c) => {
    let last = 0;
    drives.forEach((d, i) => { if (d.qtr === c.qtr) last = clocks[i]!.t0; });
    return last;
  });
  if (steps.length) steps[steps.length - 1] = cursor;
  const credit = drives.map((d, i) => {
    const p = basePoints(d);
    return p ? [{ ...p, at: clocks[i]!.returnAt ?? clocks[i]!.endAt }] : [];
  });
  const base: [number, number] = [0, 0], tds: [number, number] = [0, 0];
  drives.forEach((d) => {
    const p = basePoints(d);
    if (!p) return;
    base[p.side] += p.points;
    if (isTd(d.result)) tds[p.side]++;
  });
  const extra: [number, number] = [0, 1].map((s) => (score[s] != null && tds[s]! > 0 && score[s]! - base[s]! === tds[s] ? 1 : 0)) as [number, number];
  return { total: cursor, drives: clocks, chips, steps, credit, extra };
}

export interface NflFrame {
  /** The drive being played (an index), or -1 before the first. */
  k: number;
  /** Where the ball is on the lane of drive k, or null when it is not on the field. */
  ballX: number | null;
  /** How far the bar of drive k reaches. */
  barX: number | null;
  /** How many of drive k's plays have a dot on the field. */
  dots: number;
  /** Whether drive k's end mark is on the field, and a returned turnover's. */
  ended: boolean;
  returned: boolean;
  /** How far a turnover's return has gone, the dashed line of drive k. */
  returnX: number | null;
  score: [number, number];
  qtr: number | null;
  done: boolean;
}

/** The game at time `t`. With `snap` (reduced motion) the drive begun is drawn whole. */
export function nflFrame(tl: NflTimeline, wire: readonly DriveWire[], t: number, finalScore: readonly [number | null, number | null] = [null, null], snap = false): NflFrame {
  let k = -1;
  while (k + 1 < tl.drives.length && tl.drives[k + 1]!.t0 <= t) k++;
  const sc: [number, number] = [0, 0];
  tl.credit.forEach((cs, j) => {
    for (const c of cs) {
      const credited = snap ? j <= k : c.at <= t;
      if (credited) sc[c.side] += c.points + (isTd(wire[j]!.result) ? tl.extra[c.side] : 0);
    }
  });
  let qtr: number | null = null;
  for (let j = 0; j <= k; j++) if (wire[j]!.qtr != null) qtr = wire[j]!.qtr;
  const done = tl.drives.length > 0 && t >= tl.total;
  const frame: NflFrame = { k, ballX: null, barX: null, dots: 0, ended: false, returned: false, returnX: null, score: sc, qtr, done };
  if (done && finalScore[0] != null && finalScore[1] != null) frame.score = [finalScore[0], finalScore[1]];
  if (k < 0) return frame;
  const c = tl.drives[k]!, d = wire[k]!;
  if (snap || t >= c.doneAt) {
    frame.barX = d.x1;
    frame.dots = d.xs.length;
    frame.ended = true;
    frame.returned = d.xr != null;
    frame.returnX = d.xr;
    return frame;
  }
  let s = 0;
  while (s + 1 < c.arrive.length && c.arrive[s + 1]! <= t) s++;
  const last = c.pos.length - 1;
  if (s >= last) {
    frame.ended = true;
    frame.barX = d.x1;
    frame.ballX = d.x1;
    frame.dots = d.xs.length;
    if (c.returnAt != null) {
      const u = clamp((t - c.endAt) / (c.returnAt - c.endAt), 0, 1);
      frame.returnX = d.x1 + (d.xr! - d.x1) * u;
      frame.ballX = frame.returnX;
      frame.returned = t >= c.returnAt;
    } else if (t >= c.endAt + POP * 0.6) frame.ballX = null;
  } else {
    const u = clamp((t - c.arrive[s]!) / (c.arrive[s + 1]! - c.arrive[s]!), 0, 1);
    const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    frame.ballX = c.pos[s]! + (c.pos[s + 1]! - c.pos[s]!) * e;
    frame.barX = frame.ballX;
    let dots = 0;
    for (let j = c.firstPlay; j <= s; j++) dots++;
    frame.dots = Math.min(dots, d.xs.length);
  }
  return frame;
}

/** Which element of each layer of the still drawing belongs to which drive. Bars and their casings are drawn only for a drive that moved; a returned turnover adds a dashed line and a second end mark. */
export interface DriveSlots { bar: number; ret: number; dot0: number; dots: number; end: number; retEnd: number }

export function driveSlots(drives: readonly DriveWire[]): { slots: DriveSlots[]; bars: number; returns: number; dots: number; ends: number } {
  let bars = 0, returns = 0, dots = 0, ends = 0;
  const slots = drives.map((d): DriveSlots => {
    const s: DriveSlots = { bar: -1, ret: -1, dot0: dots, dots: d.xs.length, end: ends++, retEnd: -1 };
    if (Math.abs(d.x1 - d.x0) > 0.001) s.bar = bars++;
    if (d.xr != null) { s.ret = returns++; s.retEnd = ends++; }
    dots += d.xs.length;
    return s;
  });
  return { slots, bars, returns, dots, ends };
}
