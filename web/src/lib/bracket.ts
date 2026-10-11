/**
 * The shape of a season's playoff bracket, worked out from its series: which series feeds which (a winner goes on to the
 * next series its club plays), and so which half of the bracket each sits in. Where the clubs' conferences (the alignment
 * data) split the halves cleanly the halves carry the conference names; otherwise they are plain halves. Pure.
 */
import type { Series } from "./series";

export interface Conf { name: string; short: string | null }

export interface Box {
  /** Index into the series list. */
  i: number;
  round: number;
  /** Row position in the column (0 = top; may be fractional). */
  y: number;
  /** Row position of the series this one feeds, or null when it feeds none. */
  to: number | null;
  /** Whether a series feeds into this one. */
  fed: boolean;
}

export interface BracketSide {
  key: "l" | "r";
  /** The conference name, when the half is one conference. */
  label: string | null;
  boxes: Box[];
  rows: number;
}

export interface Bracket {
  sides: BracketSide[];
  /** The last series, when the last round holds just one. */
  final: { i: number; y: number; /** Which of the final's two sides (indexes into its sides) is drawn on top. */ order: [number, number] } | null;
  /** Rounds that have a box on a side, in order. */
  columns: number[];
  rows: number;
  /** Series that lead nowhere near the final (a third-place game, say), and round-robin games (round 0). */
  other: number[];
  robin: number[];
  /** Where each series sits: the half, the final, or elsewhere. */
  place: Map<number, "l" | "r" | "f" | "o">;
}

/** Western sides read first (left), Eastern last; any other pair by name (American before National, AFC before NFC). */
const rank = (c: Conf) => (/west/i.test(`${c.short} ${c.name}`) ? 0 : /east/i.test(`${c.short} ${c.name}`) ? 2 : 1);

export function buildBracket(list: readonly Series[], round: readonly number[], confOf: (f: number) => Conf | null): Bracket {
  const idx = list.map((_, i) => i).filter((i) => round[i] > 0);
  const robin = list.map((_, i) => i).filter((i) => round[i] === 0);
  const last = Math.max(0, ...round);
  const parent = new Map<number, number>();
  for (const i of idx) {
    if (list[i].winner == null) continue;
    const w = list[i].sides[0].f;
    let best = -1;
    for (const j of idx) if (round[j] > round[i] && list[j].sides.some((t) => t.f === w) && (best < 0 || round[j] < round[best])) best = j;
    if (best >= 0) parent.set(i, best);
  }
  const children = new Map<number, number[]>();
  for (const [c, p] of parent) children.set(p, [...(children.get(p) ?? []), c]);
  const first = (a: number, b: number) => (list[a].start < list[b].start ? -1 : list[a].start > list[b].start ? 1 : list[a].sides[0].f - list[b].sides[0].f);
  for (const l of children.values()) l.sort(first);

  const finals = idx.filter((i) => round[i] === last);
  const fin = finals.length === 1 ? finals[0] : null;
  const place = new Map<number, "l" | "r" | "f" | "o">();
  const inTree = (i: number): number[] => [i, ...(children.get(i) ?? []).flatMap(inTree)];

  /** Lays one tree out: leaves take the next rows, a series sits at the middle of the ones that feed it. */
  const lay = (root: number, key: "l" | "r"): { boxes: Box[]; rows: number } => {
    const boxes: Box[] = [];
    let next = 0;
    const go = (i: number): number => {
      const ch = children.get(i) ?? [];
      const ys = ch.map(go);
      const y = ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : next++;
      boxes.push({ i, round: round[i], y, to: null, fed: ch.length > 0 });
      place.set(i, key);
      return y;
    };
    go(root);
    return { boxes, rows: Math.max(next, 1) };
  };

  let sides: BracketSide[] = [];
  let finalInfo: Bracket["final"] = null;
  if (fin != null) {
    place.set(fin, "f");
    const f = list[fin];
    const feeders = f.sides.map((t) => (children.get(fin) ?? []).find((c) => list[c].sides[0].f === t.f) ?? null);
    const confs = feeders.map((c, k) => (c == null ? null : confOf(f.sides[k].f)));
    // A half is a conference when at most one club in it (a crossover) and fewer than half come from elsewhere.
    const teamsIn = (c: number) => [...new Set(inTree(c).flatMap((i) => list[i].sides.map((t) => t.f)))];
    const clean =
      feeders.every((c) => c != null) && confs[0] && confs[1] && confs[0].name !== confs[1].name &&
      feeders.every((c, k) => { const ts = teamsIn(c!); const out = ts.filter((f) => confOf(f)?.name !== confs[k]!.name).length; return out <= 1 && out * 2 < ts.length; });
    let order = [0, 1];
    const [ca, cb] = f.sides.map((t) => confOf(t.f));
    if (ca && cb && ca.name !== cb.name && (rank(ca) > rank(cb) || (rank(ca) === rank(cb) && ca.name > cb.name))) order = [1, 0];
    const built = order.map((k, n) => (feeders[k] == null ? null : { ...lay(feeders[k]!, "l"), root: feeders[k]!, label: clean ? confs[k]!.name : null, n }));
    const present = built.filter((x): x is NonNullable<typeof x> => x != null);
    // A lone feeder takes the left; two take left and right in order.
    sides = present.map((x, n) => ({ key: n === 0 ? "l" : "r", label: x.label, boxes: x.boxes, rows: x.rows }));
    present.forEach((x, n) => { if (n === 1) for (const bx of x.boxes) place.set(bx.i, "r"); });
    const rows = Math.max(1, ...sides.map((s) => s.rows));
    const y = (rows - 1) / 2;
    finalInfo = { i: fin, y, order: order as [number, number] };
    present.forEach((x, n) => { const bx = sides[n].boxes.find((q) => q.i === x.root); if (bx) bx.to = y; });
  } else {
    const roots = idx.filter((i) => !parent.has(i)).sort((a, b) => round[b] - round[a] || first(a, b));
    const boxes: Box[] = [];
    let rows = 0;
    for (const r of roots) { const l = lay(r, "l"); boxes.push(...l.boxes.map((b) => ({ ...b, y: b.y + rows }))); rows += l.rows; }
    if (boxes.length) sides = [{ key: "l", label: null, boxes, rows }];
  }
  for (const s of sides) {
    const y = new Map(s.boxes.map((b) => [b.i, b.y]));
    for (const b of s.boxes) { const p = parent.get(b.i); if (p != null && y.has(p)) b.to = y.get(p)!; }
  }
  const other = idx.filter((i) => !place.has(i));
  other.forEach((i) => place.set(i, "o"));
  robin.forEach((i) => place.set(i, "o"));
  const columns = [...new Set(sides.flatMap((s) => s.boxes.map((b) => b.round)))].filter((r) => fin == null || r !== round[fin]).sort((a, b) => a - b);
  return { sides, final: finalInfo, columns, rows: Math.max(1, ...sides.map((s) => s.rows)), other, robin, place };
}
