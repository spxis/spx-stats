import { drawKyogijo, parkById } from "@johnmorrisdotca/kyogijo-stadiums";
import { fenceAt } from "@johnmorrisdotca/kyogijo-stadiums/geometry";
import { fenceFor } from "@johnmorrisdotca/kyogijo-stadiums/parks";
import { RETROSHEET_ZONES } from "@johnmorrisdotca/kyogijo-stadiums/frames";
import type { Layer, LineDatum, PointDatum } from "@johnmorrisdotca/kyogijo-stadiums/layers";

/**
 * What a game page draws on the game's own field: each MLB batted ball where Retrosheet's hit-location zone puts it, and each NFL drive from where it
 * started to where it ended. Pure (no server-only imports) so the page, the file route and the checks share it. The text formats of core.game_field are
 * written at the top of db/build/235_game_field_mlb.sql and 236_game_field_nfl.sql; this reads them. The drawings are kyogijo's, with data layers: the
 * field, the park's fence and the marks share kyogijo's own coordinate system (feet from home plate for baseball, yards counting the end zones for football).
 */

/* ---------- baseball ---------------------------------------------------------------------- */

export type BallResult = "o" | "s" | "d" | "t" | "h" | "e" | "f";

export interface Ball {
  inning: number;
  /** 0 the visitors bat, 1 the home team. */
  half: 0 | 1;
  /** One of Retrosheet's 68 hit-location zones (8D, 56S, 7LS). */
  zone: string;
  /** G ground ball, L line drive, F fly ball, P pop-up, BG BP BL a bunted ball. */
  traj: string;
  result: BallResult;
  /** The batter's person id, or null when the archive cannot name him. */
  person: number | null;
}

const RESULTS = new Set<string>(["o", "s", "d", "t", "h", "e", "f"]);
const TRAJ = new Set<string>(["G", "L", "F", "P", "BG", "BP", "BL"]);

/** The balls of a `mlb_balls` row, in the order they were hit. A malformed or unknown piece is left out, never guessed. */
export function parseBalls(data: string): Ball[] {
  const out: Ball[] = [];
  for (const piece of data.split(";")) {
    const [inning, half, zone, traj, result, person] = piece.split(",");
    if (!zone || !(zone in RETROSHEET_ZONES) || !TRAJ.has(traj ?? "") || !RESULTS.has(result ?? "") || (half !== "0" && half !== "1")) continue;
    const n = Number(inning);
    if (!Number.isInteger(n) || n < 1) continue;
    out.push({ inning: n, half: half === "1" ? 1 : 0, zone, traj, result: result as BallResult, person: person ? Number(person) : null });
  }
  return out;
}

/** The six marks of the key: the outcome word a mark is drawn with, the result codes it stands for. */
export const BALL_KINDS = [
  { outcome: "single", codes: ["s"], phrase: "fp.single", color: "#f28c28" },
  { outcome: "double", codes: ["d"], phrase: "fp.double", color: "#8e44ad" },
  { outcome: "triple", codes: ["t"], phrase: "fp.triple", color: "#f2cf1d" },
  { outcome: "home run", codes: ["h"], phrase: "fp.homeRun", color: "#e0289c" },
  { outcome: "reached", codes: ["e", "f"], phrase: "fp.reached", color: "#4fa3c7" },
  { outcome: "out", codes: ["o"], phrase: "fp.out", color: "#9aa4ae" },
] as const;

const OUTCOME_OF: Record<BallResult, string> = { o: "out", s: "single", d: "double", t: "triple", h: "home run", e: "reached", f: "reached" };
const ZONE_ANGLE = (x: number, y: number) => (Math.atan2(x, y) * 180) / Math.PI;

/**
 * Where each ball is drawn: its zone's centre, and a ball that shares a zone with an earlier one is set a little way round it on a fixed spiral (the golden angle), so
 * that no two marks lie on one another and the same game is always drawn the same way. A zone is a sector of the field, not a spot: the page says so. A home run
 * is set just beyond the fence of the park in that season along the zone's direction, since it cleared it.
 */
export function ballPoints(balls: readonly Ball[], park: string | null, year: number): { x: number; y: number }[] {
  const p = park ? parkById(park) : undefined;
  const fence = fenceFor(p, undefined, year);
  const seen = new Map<string, number>();
  return balls.map((b) => {
    const [cx, cy] = RETROSHEET_ZONES[b.zone] as [number, number];
    const k = seen.get(b.zone) ?? 0;
    seen.set(b.zone, k + 1);
    let x = cx, y = cy;
    if (b.result === "h") {
      const d = Math.hypot(cx, cy), over = fenceAt(fence, ZONE_ANGLE(cx, cy)) + 9;
      if (d < over) { x = (cx / d) * over; y = (cy / d) * over; }
    }
    if (k) {
      const reach = y < 150 ? 4.2 : 6.5;
      const a = k * 2.399963, r = reach * Math.sqrt(k);
      x += Math.cos(a) * r;
      y += Math.sin(a) * r;
    }
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  });
}

/** Where a zone is, as the keys of two phrases: how far out (infield, outfield, foul ground) and which lane of the field (left to right). */
export function zoneWhere(zone: string): { lane: "fp.laneLeft" | "fp.laneLeftCentre" | "fp.laneCentre" | "fp.laneRightCentre" | "fp.laneRight"; depth: "fp.depthInfield" | "fp.depthOutfield" | "fp.depthFoul" } {
  const [x, y] = (RETROSHEET_ZONES[zone] as [number, number] | undefined) ?? [0, 100];
  const a = ZONE_ANGLE(x, Math.max(y, 1));
  const lane = a < -27 ? "fp.laneLeft" : a < -9 ? "fp.laneLeftCentre" : a <= 9 ? "fp.laneCentre" : a <= 27 ? "fp.laneRightCentre" : "fp.laneRight";
  return { lane, depth: /F$/.test(zone) ? "fp.depthFoul" : /^[789]/.test(zone) ? "fp.depthOutfield" : "fp.depthInfield" };
}

export interface Team { name: string; abbr?: string | null; /** A hex without #. */ color: string }

export interface BallsDrawing {
  svg: string;
  width: number;
  height: number;
}

const hex = (h: string, fallback: string) => (/^[0-9a-fA-F]{6}$/.test(h) ? `#${h}` : fallback);

/** The shape of a drawing (width, height of its viewBox) and its text with the title and `aria-hidden` handled by the caller. */
export function sizeOf(svg: string): { width: number; height: number } {
  const box = /viewBox="[-\d.]+ [-\d.]+ ([\d.]+) ([\d.]+)"/.exec(svg);
  return { width: Math.round(Number(box?.[1] ?? 400)), height: Math.round(Number(box?.[2] ?? 200)) };
}

/**
 * The balls of one game on its park: one layer for each side's batters, each ball a mark coloured by its result (a single orange, a double purple, a triple
 * yellow, a home run magenta, an out grey, a ball that reached on an error or a fielder's choice blue) and ringed in the batting club's own colour. The park
 * and the season give the fence the park had then; a park kyogijo does not know is the standard field.
 */
export function drawBalls(balls: readonly Ball[], o: { park: string | null; year: number; away: Team; home: Team; title: string; language?: "en" | "ja"; label?: (b: Ball, i: number) => string }): BallsDrawing {
  const pts = ballPoints(balls, o.park, o.year);
  const colors = Object.fromEntries(BALL_KINDS.map((k) => [k.outcome, k.color]));
  const layer = (half: 0 | 1, team: Team): Layer => ({
    kind: "points",
    id: half ? "balls-home" : "balls-away",
    name: team.name,
    from: "retrosheet",
    clip: "none",
    data: balls.flatMap((b, i): PointDatum[] => (b.half === half ? [{ x: pts[i]!.x, y: pts[i]!.y, outcome: OUTCOME_OF[b.result], team: half ? "home" : "away", ...(o.label ? { title: o.label(b, i) } : {}) }] : [])),
    style: {
      fill: { by: "outcome", colors, other: "#9aa4ae" },
      stroke: hex(team.color, "#1f2320"),
      scale: 1.7,
      opacity: 1,
      outcomes: {
        single: { scale: 1 }, double: { shape: "diamond", scale: 1.2 }, triple: { shape: "triangle", scale: 1.3 }, "home run": { shape: "star", scale: 1.7 },
        reached: { shape: "square", scale: 0.95 }, out: { hollow: false, scale: 0.85 },
      },
    },
  });
  const raw = drawKyogijo({
    sport: "mlb", language: o.language ?? "en", title: o.title, margin: 40, ...(o.park ? { park: o.park } : {}), year: o.year,
    layers: [layer(0, o.away), layer(1, o.home)], style: "embed",
  } as Parameters<typeof drawKyogijo>[0]);
  return cropBelowPlate(raw);
}

/** kyogijo leaves about a tenth of a ballpark's height empty below home plate; the drawing for a game page keeps only a little of it. */
function cropBelowPlate(svg: string): BallsDrawing {
  const box = /viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg);
  if (!box) return { svg, ...sizeOf(svg) };
  const [x, y, w, h] = [Number(box[1]), Number(box[2]), Number(box[3]), Number(box[4])];
  const kept = Math.round(h * 0.9 * 10) / 10;
  const cropped = svg.replace(box[0], `viewBox="${x} ${y} ${w} ${kept}"`);
  return { svg: cropped, width: Math.round(w), height: Math.round(kept) };
}

/** The balls of each side, by outcome: what the page says under the field. */
export function tallyBalls(balls: readonly Ball[]): Record<"0" | "1", Record<string, number>> {
  const t: Record<"0" | "1", Record<string, number>> = { 0: {}, 1: {} };
  for (const b of balls) {
    const o = OUTCOME_OF[b.result];
    t[b.half === 1 ? "1" : "0"][o] = (t[b.half === 1 ? "1" : "0"][o] ?? 0) + 1;
  }
  return t;
}

/* ---------- football ---------------------------------------------------------------------- */

export type DriveResult = "T" | "F" | "M" | "P" | "X" | "D" | "H" | "S" | "O" | "?";

export interface Drive {
  drive: number;
  /** 0 the visitors have the ball, 1 the home team. */
  side: 0 | 1;
  /** The quarter it began in; 5 is overtime. */
  qtr: number | null;
  clock: string;
  result: DriveResult;
  /** Yards from the opponent's end line where it began and where it ended. */
  start: number;
  end: number;
  plays: number | null;
  firstDowns: number | null;
  seconds: number | null;
  scored: boolean | null;
  /** The line of scrimmage of each play, in the same yards. */
  los: number[];
}

const DRIVE_RESULTS = new Set<string>(["T", "F", "M", "P", "X", "D", "H", "S", "O", "?"]);
const num = (v: string | undefined): number | null => (v ? (Number.isFinite(Number(v)) ? Number(v) : null) : null);

/** The drives of an `nfl_drives` row, in the order played. */
export function parseDrives(data: string): Drive[] {
  const out: Drive[] = [];
  for (const piece of data.split(";")) {
    const f = piece.split(",");
    const [drive, side, qtr, clock, result, start, end, plays, first, secs, scored, los] = f;
    const s = num(start), e = num(end), d = num(drive);
    if (f.length !== 12 || d == null || s == null || e == null || (side !== "0" && side !== "1") || !DRIVE_RESULTS.has(result ?? "")) continue;
    out.push({
      drive: d, side: side === "1" ? 1 : 0, qtr: num(qtr), clock: clock ?? "", result: result as DriveResult, start: s, end: e, plays: num(plays), firstDowns: num(first),
      seconds: num(secs), scored: scored === "" ? null : scored === "1", los: (los ?? "").split(" ").map(Number).filter((n) => Number.isFinite(n)),
    });
  }
  return out;
}

export const DRIVE_KINDS = [
  { result: "T", outcome: "touchdown", phrase: "fp.driveT", shape: "star" },
  { result: "O", outcome: "return touchdown", phrase: "fp.driveO", shape: "star" },
  { result: "F", outcome: "field goal", phrase: "fp.driveF", shape: "diamond" },
  { result: "S", outcome: "safety", phrase: "fp.driveS", shape: "square" },
  { result: "P", outcome: "punt", phrase: "fp.driveP", shape: "circle" },
  { result: "X", outcome: "turnover", phrase: "fp.driveX", shape: "x" },
  { result: "D", outcome: "turnover on downs", phrase: "fp.driveD", shape: "cross" },
  { result: "M", outcome: "missed field goal", phrase: "fp.driveM", shape: "diamond" },
  { result: "H", outcome: "end of half", phrase: "fp.driveH", shape: "circle" },
] as const;

const RESULT_OUTCOME = (r: DriveResult): string => (r === "O" ? "turnover" : DRIVE_KINDS.find((k) => k.result === r)?.outcome ?? "other");

/** The results the marks of a game's drives stand for, so the key can name only the ones that occur: a turnover returned for a score is a turnover (X) and the return's touchdown (O). */
export function driveKindsIn(drives: readonly Drive[]): typeof DRIVE_KINDS[number][] {
  const seen = new Set<string>();
  for (const d of drives) { seen.add(d.result); if (d.result === "O") seen.add("X"); }
  return DRIVE_KINDS.filter((k) => seen.has(k.result));
}

/** The drives each side scored on: a touchdown or a field goal on its own drive, and a touchdown on the other side's turnover that it returned. */
export function driveScores(drives: readonly Drive[], side: 0 | 1): number {
  return drives.filter((d) => (d.side === side && (d.result === "T" || d.result === "F")) || (d.side !== side && d.result === "O")).length;
}

/** Where a yard line is on the field: yards from the left back line, the end zones counted (so the goal lines are at 10 and 110). The visitors attack the right end zone, the home team the left. */
export const xOf = (side: 0 | 1, yd: number): number => (side === 0 ? 10 + (100 - yd) : 10 + yd);

/** The drawing's own units are feet: a yard is 3 of them, and the field is 160 high. The lane of a drive (its place from the bottom, in yards) as the file draws it, for n drives. */
export const FT_PER_YD = 3;
export const FIELD_FT_HIGH = 160;
const LANE_WIDTH = 160 / 3;
export const driveLane = (i: number, n: number): number => Math.round((LANE_WIDTH * (1 - (i + 0.8) / (n + 0.6))) * 100) / 100;

export interface DrivesDrawing { svg: string; width: number; height: number }

/**
 * The drives of a game on the field, one lane for each in the order played from the top, each a bar from the line it started on to the line it ended on in the
 * colour of the club that had the ball (the visitors going right, the home team going left, as the field is drawn), a dot on every play's line of scrimmage, and at the
 * end a mark for how it ended: a star for a touchdown, a diamond for a field goal (open when missed), a cross for a turnover. A touchdown or a field goal is a score.
 */
export function drawDrives(drives: readonly Drive[], o: { year: number; away: Team; home: Team; title: string; language?: "en" | "ja"; orientation?: "wide" | "tall"; label?: (d: Drive, kind?: "return") => string }): DrivesDrawing {
  const n = Math.max(drives.length, 1);
  const width = LANE_WIDTH;
  const lane = (i: number) => driveLane(i, n);
  const bars: LineDatum[] = [], returns: LineDatum[] = [], ticks: PointDatum[] = [], ends: PointDatum[] = [];
  drives.forEach((d, i) => {
    const y = lane(i);
    const title = o.label ? o.label(d) : `${d.side ? o.home.name : o.away.name}: ${RESULT_OUTCOME(d.result)}`;
    const tm = d.side === 0 ? "away" : "home";
    bars.push({ x: xOf(d.side, d.start), y, x2: xOf(d.side, d.end), y2: y, team: tm, title, width: Math.min(2, width / (n + 1) * 0.6) });
    d.los.forEach((yd) => ticks.push({ x: xOf(d.side, yd), y, team: tm, title }));
    ends.push({ x: xOf(d.side, d.end), y, team: tm, outcome: RESULT_OUTCOME(d.result), title });
    if (d.result === "O") {
      // A turnover returned for a score is not a drive of the other side: its path back to the goal line is dashed, in that side's colour, and ends in its own touchdown mark.
      const other = d.side === 0 ? 1 : 0, otm = other === 0 ? "away" : "home";
      const rtitle = o.label ? o.label({ ...d, side: other, plays: null }, "return") : `${other ? o.home.name : o.away.name}: return touchdown`;
      returns.push({ x: xOf(d.side, d.end), y, x2: xOf(other, 0), y2: y, team: otm, outcome: "return", title: rtitle, width: Math.min(1.4, width / (n + 1) * 0.45) });
      ends.push({ x: xOf(other, 0), y, team: otm, outcome: "return touchdown", title: rtitle });
    }
  });
  const dot = Math.min(2.4, (width / (n + 1)) * 0.75);
  // A light casing under every bar, so a club in black or navy still reads on the dark green of the dark theme.
  const casing: LineDatum[] = bars.map((b) => ({ x: b.x, y: b.y, x2: b.x2, y2: b.y2, width: (b.width ?? 1) + 0.9 }));
  const layers: Layer[] = [
    { kind: "lines", id: "casing", name: "casing", from: "nfl-tracking", data: casing, style: { color: "#ffffff", opacity: 0.55 } },
    { kind: "lines", id: "drives", name: "drives", from: "nfl-tracking", data: bars, style: { color: { by: "team", home: hex(o.home.color, "#b5452c"), away: hex(o.away.color, "#2f6db0") }, opacity: 0.85 } },
    { kind: "lines", id: "returns", name: "returns", from: "nfl-tracking", data: returns, style: { color: { by: "team", home: hex(o.home.color, "#b5452c"), away: hex(o.away.color, "#2f6db0") }, opacity: 0.9, dash: "dashed", outcomes: { return: { hollow: true } } } },
    { kind: "points", id: "plays", name: "plays", from: "nfl-tracking", data: ticks, style: { shape: "circle", size: dot * 0.8, fill: "#ffffff", stroke: "none", opacity: 1 } },
    {
      kind: "points", id: "ends", name: "how the drives ended", from: "nfl-tracking", data: ends,
      style: {
        size: dot * 1.8,
        fill: { by: "team", home: hex(o.home.color, "#b5452c"), away: hex(o.away.color, "#2f6db0") },
        stroke: "#ffffff",
        outcomes: {
          touchdown: { shape: "star", scale: 1.8 }, "return touchdown": { shape: "star", scale: 1.8 }, "field goal": { shape: "diamond", scale: 1.3 }, "missed field goal": { shape: "diamond", hollow: true, scale: 1.2 },
          safety: { shape: "square", scale: 1.2 }, punt: { shape: "circle", hollow: true, scale: 0.8 }, turnover: { shape: "x", scale: 1.3 }, "turnover on downs": { shape: "cross", scale: 1.2 },
          "end of half": { shape: "circle", hollow: true, scale: 0.7 },
        },
      },
    },
  ];
  const raw = drawKyogijo({
    sport: "nfl", language: o.language ?? "en", title: o.title, year: o.year, detail: "simple", style: "embed", ...(o.orientation === "tall" ? { orientation: "portrait" } : {}), layers,
  } as Parameters<typeof drawKyogijo>[0]);
  return { svg: raw, ...sizeOf(raw) };
}
