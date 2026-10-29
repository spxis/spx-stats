import { RESULTS, TRAJS, ZONE_XY, sideOf, unpackCells, unpackTraj, type Side, type ZoneCounts } from "./battedBall.ts";

/**
 * The player page's spray charts, home run chart, direction shares and ball types, from the rows of core.batted_ball_player_hand (migration 165) that
 * /api/players/<id>/spray sends. Pure: the browser draws from it as the season slider moves, and scripts/playerSpray.test.ts checks it.
 * The data are Retrosheet's hit-location zones, not landing spots: a mark is somewhere in its zone, and the page says so once.
 */

/** One row on the wire: [season, role (0 batting, 1 pitching), batter's side (0 left, 1 right), balls, traj as hex, cells as hex]. */
export type WireRow = [number, 0 | 1, 0 | 1, number, string, string];
export interface SprayWire { rows: WireRow[] }

export type Role = "bat" | "pit";
export interface SprayRow { year: number; role: Role; hand: "L" | "R"; n: number; traj: number[]; zones: ZoneCounts }

/** The rows of a wire answer, unpacked once. */
export function decodeRows(wire: SprayWire): SprayRow[] {
  return wire.rows.map(([year, role, hand, n, traj, cells]) => ({ year, role: role === 1 ? "pit" : "bat", hand: hand === 1 ? "R" : "L", n, traj: unpackTraj(traj), zones: unpackCells(cells) }));
}

/** The first season with hit locations, and the one from which nearly every ball has one (db/migrations/071). */
export const SPRAY_FROM = 1986;
export const SPRAY_DENSE_FROM = 1989;

export type Kind = "out" | "reached" | "single" | "double" | "triple" | "home run";

/** The marks of the chart, bottom to top: the colour and shape of the game page's plays (lib/fieldPlays.ts BALL_KINDS), the results each stands for (indexes of RESULTS), the size of a mark. */
export const KINDS: readonly { kind: Kind; results: readonly number[]; color: string; shape: "circle" | "square" | "diamond" | "triangle" | "star"; size: number; phrase: string }[] = [
  { kind: "out", results: [0], color: "#9aa4ae", shape: "circle", size: 0.85, phrase: "fp.out" },
  { kind: "reached", results: [5, 6], color: "#4fa3c7", shape: "square", size: 0.95, phrase: "fp.reached" },
  { kind: "single", results: [1], color: "#f28c28", shape: "circle", size: 1, phrase: "fp.single" },
  { kind: "double", results: [2], color: "#8e44ad", shape: "diamond", size: 1.2, phrase: "fp.double" },
  { kind: "triple", results: [3], color: "#f2cf1d", shape: "triangle", size: 1.3, phrase: "fp.triple" },
  { kind: "home run", results: [4], color: "#e0289c", shape: "star", size: 1.4, phrase: "fp.homeRun" },
];

/** What the chosen seasons hold for one role. */
export interface Summary {
  /** Located balls. */
  n: number;
  /** The seasons with balls, ascending. */
  years: number[];
  /** Counts by result for each zone, both sides together. */
  zones: ZoneCounts;
  /** Balls by ball type (TRAJS order). */
  traj: number[];
  /** Pulled, up the middle, opposite way, for the batter's side in each at-bat. */
  sides: Record<Side, number>;
  /** Balls by result (RESULTS order). */
  results: number[];
}

export function summarize(rows: readonly SprayRow[], role: Role, from: number, to: number): Summary {
  const out: Summary = { n: 0, years: [], zones: new Map(), traj: [0, 0, 0, 0, 0, 0, 0], sides: { pull: 0, centre: 0, oppo: 0 }, results: [0, 0, 0, 0, 0, 0, 0] };
  const years = new Set<number>();
  for (const r of rows) {
    if (r.role !== role || r.year < from || r.year > to) continue;
    years.add(r.year);
    out.n += r.n;
    r.traj.forEach((v, i) => { out.traj[i] = (out.traj[i] ?? 0) + v; });
    for (const [zone, counts] of r.zones) {
      const sum = out.zones.get(zone) ?? [0, 0, 0, 0, 0, 0, 0];
      const side = sideOf(zone, r.hand);
      counts.forEach((v, i) => { sum[i] = (sum[i] ?? 0) + v; out.results[i] = (out.results[i] ?? 0) + v; out.sides[side] += v; });
      out.zones.set(zone, sum);
    }
  }
  out.years = [...years].sort((a, b) => a - b);
  return out;
}

/** Whether a role has any ball in the seasons, for the choice between batting and pitching. */
export const hasBalls = (rows: readonly SprayRow[], role: Role, from: number, to: number): boolean => rows.some((r) => r.role === role && r.year >= from && r.year <= to && r.n > 0);

/** Ball types as shares: ground balls, line drives, fly balls, pop-ups and the three kinds of bunt together. */
export function ballTypes(traj: readonly number[]): { key: "G" | "L" | "F" | "P" | "B"; n: number }[] {
  const t = (i: number) => traj[i] ?? 0;
  return [{ key: "G", n: t(0) }, { key: "L", n: t(1) }, { key: "F", n: t(2) }, { key: "P", n: t(3) }, { key: "B", n: t(4) + t(5) + t(6) }];
}

// ---- the field -------------------------------------------------------------------------------------------------------------------------------------

/** The viewBox of the standard field's file (`/field-plays/std.<language>.svg`) and of the marks laid over it: kyogijo's, cropped as the game page crops it (scripts/playerSpray.test.ts compares). */
export const FIELD_BOX = { x: -273.35, y: -440, w: 546.69, h: 486 } as const;

/** How far the standard field's fence is from home plate at 0, 5 ... 45 degrees off the line to centre field (either side). */
const FENCE = [400, 398.1, 393.1, 386.2, 378.7, 371.1, 361.9, 351.4, 340.5, 330] as const;
export function fenceAt(angle: number): number {
  const a = Math.min(45, Math.abs(angle)) / 5, i = Math.min(8, Math.floor(a));
  return FENCE[i]! + (FENCE[i + 1]! - FENCE[i]!) * (a - i);
}

const GOLDEN = 2.399963;
const FIELD_ZONES = Object.keys(ZONE_XY);

/** How wide the cloud of marks of one zone may be: a fraction of the way to its nearest neighbour, so a busy zone does not bury the next one. */
const ZONE_REACH: Record<string, number> = Object.fromEntries(FIELD_ZONES.map((z) => {
  const [x, y] = ZONE_XY[z]!;
  const nearest = Math.min(...FIELD_ZONES.filter((o) => o !== z).map((o) => Math.hypot(ZONE_XY[o]![0] - x, ZONE_XY[o]![1] - y)));
  return [z, Math.min(36, Math.max(7, nearest * 0.42))];
}));

/**
 * Where a home run is shown: just past the fence along its zone's direction (as on a game page), never short of the zone's own centre. A home run scored in foul
 * ground (a mistake of the source, which the page does not hide) is set on the foul line instead of off the field.
 */
export function homeRunSpot(zone: string, beyond = 9): { x: number; y: number } {
  const [x, y] = ZONE_XY[zone] ?? [0, 100];
  const d = Math.hypot(x, y) || 1, angle = y < 1 ? 180 * (Math.sign(x) || 1) : (Math.atan2(x, y) * 180) / Math.PI;
  if (Math.abs(angle) <= 45) {
    const over = Math.max(d, fenceAt(angle) + beyond);
    return { x: (x / d) * over, y: (y / d) * over };
  }
  const a = (Math.sign(angle) * Math.PI) / 4, over = fenceAt(45) + beyond;
  return { x: Math.sin(a) * over, y: Math.cos(a) * over };
}

const round = (v: number) => Math.round(v * 10) / 10;

function shapePath(shape: (typeof KINDS)[number]["shape"], x: number, y: number, r: number): string {
  const f = (v: number) => String(round(v));
  switch (shape) {
    case "circle": return `M${f(x - r)} ${f(y)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0z`;
    case "square": { const h = r * 0.9; return `M${f(x - h)} ${f(y - h)}h${f(2 * h)}v${f(2 * h)}h${f(-2 * h)}z`; }
    case "diamond": { const h = r * 1.25; return `M${f(x)} ${f(y - h)}L${f(x + h)} ${f(y)}L${f(x)} ${f(y + h)}L${f(x - h)} ${f(y)}z`; }
    case "triangle": { const h = r * 1.3; return `M${f(x)} ${f(y - h)}L${f(x + h * 0.9)} ${f(y + h * 0.7)}L${f(x - h * 0.9)} ${f(y + h * 0.7)}z`; }
    case "star": {
      let d = "";
      for (let i = 0; i < 10; i++) {
        const rr = (i % 2 ? 0.55 : 1.3) * r, a = (Math.PI * i) / 5;
        d += `${i ? "L" : "M"}${f(x + Math.sin(a) * rr)} ${f(y - Math.cos(a) * rr)}`;
      }
      return `${d}z`;
    }
  }
}

export interface Layer { kind: Kind; color: string; d: string; n: number }

/**
 * The marks of a spray chart, one path for each kind (bottom to top). Each ball is set in its zone: the first at the zone's centre, the others on a sunflower spiral
 * about it, so no two lie on one another and the same balls are always drawn the same way. A busy zone is not spread wider than its share of the field: its marks
 * shrink instead, down to a floor. A home run is set past the fence. `outs` false leaves the outs (and the errors and fielder's choices) out: the hits chart.
 * The y of the field is up, the y of the drawing is down, so the marks are set at -y.
 */
export function sprayLayers(zones: ZoneCounts, outs: boolean): Layer[] {
  const per = new Map<Kind, string[]>(), counts = new Map<Kind, number>();
  for (const k of KINDS) { per.set(k.kind, []); counts.set(k.kind, 0); }
  const shown = KINDS.filter((k) => outs || (k.kind !== "out" && k.kind !== "reached"));
  for (const [zone, byResult] of [...zones].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (!ZONE_XY[zone]) continue;
    const have = shown.map((k) => ({ k, left: k.results.reduce((s, i) => s + (byResult[i] ?? 0), 0) })).filter((x) => x.left > 0);
    const total = have.reduce((s, x) => s + x.left, 0);
    if (!total) continue;
    const reach = ZONE_REACH[zone] ?? 20;
    const [cx, cy] = ZONE_XY[zone]!;
    const infield = cy < 150;
    const step = Math.min(infield ? 4.2 : 6.5, reach / Math.sqrt(total));
    // kinds take turns, so the colours mix in the cloud instead of lying in rings
    let i = 0;
    while (have.some((x) => x.left > 0)) {
      for (const x of have) {
        if (x.left <= 0) continue;
        x.left--;
        const hr = x.k.kind === "home run";
        const base = hr ? homeRunSpot(zone) : { x: cx, y: cy };
        const rad = step * Math.sqrt(i), a = i * GOLDEN;
        const r = Math.max(1.1, Math.min(4 * x.k.size, step * 0.95 * x.k.size));
        per.get(x.k.kind)!.push(shapePath(x.k.shape, base.x + Math.cos(a) * rad, -(base.y + Math.sin(a) * rad), r));
        counts.set(x.k.kind, (counts.get(x.k.kind) ?? 0) + 1);
        i++;
      }
    }
  }
  return shown.flatMap((k) => (counts.get(k.kind) ? [{ kind: k.kind, color: k.color, d: per.get(k.kind)!.join(""), n: counts.get(k.kind)! }] : []));
}

export interface Bubble { zone: string; n: number; x: number; y: number; r: number }

/**
 * The home runs by zone: a disc at each zone that has any, past the fence along the zone's direction, its area in step with the count; discs in one direction
 * are moved outward until they clear one another, so a deeper zone lies further out. Returned with the drawing's y (down).
 */
export function homeRunBubbles(zones: ZoneCounts): Bubble[] {
  const have = [...zones].map(([zone, c]) => ({ zone, n: c[4] ?? 0 })).filter((z) => z.n > 0 && ZONE_XY[z.zone]);
  const top = Math.max(1, ...have.map((z) => z.n));
  const out: Bubble[] = [];
  for (const z of have.sort((a, b) => Math.hypot(...ZONE_XY[a.zone]!) - Math.hypot(...ZONE_XY[b.zone]!))) {
    const r = round(6 + 11 * Math.sqrt(z.n / top));
    let { x, y } = homeRunSpot(z.zone, 10);
    const d = Math.hypot(x, y) || 1, ux = x / d, uy = y / d;
    for (let guard = 0; guard < 60 && out.some((o) => Math.hypot(o.x - x, -o.y - y) < o.r + r + 1.5); guard++) { x += ux * 2; y += uy * 2; }
    out.push({ zone: z.zone, n: z.n, x: round(x), y: round(-y), r });
  }
  return out;
}

/** The home runs by lane of the field, left to right as the batter looks out, for the line of figures under the chart. */
export function homeRunLanes(zones: ZoneCounts): { left: number; leftCentre: number; centre: number; rightCentre: number; right: number; total: number } {
  const out = { left: 0, leftCentre: 0, centre: 0, rightCentre: 0, right: 0, total: 0 };
  for (const [zone, c] of zones) {
    const n = c[4] ?? 0;
    if (!n) continue;
    const [x, y] = ZONE_XY[zone] ?? [0, 100];
    const a = (Math.atan2(x, Math.max(y, 1)) * 180) / Math.PI;
    out[a < -27 ? "left" : a < -9 ? "leftCentre" : a <= 9 ? "centre" : a <= 27 ? "rightCentre" : "right"] += n;
    out.total += n;
  }
  return out;
}

export { RESULTS, TRAJS };
