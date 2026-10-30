import {
  ballAt, driveSlots, type DriveWire, type MlbFrame, type MlbWire, type NflFrame, type NflWire, type DriveSlots,
} from "./playTimeline";

/**
 * Moves the marks of a game's still drawing (the file components/FieldPlays.tsx loads) as the replay plays, so the replay is the drawing the reader already sees:
 * the same park, marks, colours and key, with the marks shown one after another. A mark is shown or hidden by a class on it (fieldplays.css); the ball in the air is
 * the mark of that ball itself, moved along its flight, and a drive's bar is shortened to where the ball is. Nothing is added to the page but a ball and a trail.
 * A stage is made for one drawing and returns null when the drawing is not the one the data describes (the number of marks does not fit), so the replay never moves
 * the wrong marks. `reset` puts the drawing back exactly as it was drawn.
 */
export interface Stage {
  /** Show the game as `frame` says. Cheap to call on every animation frame. */
  apply(frame: MlbFrame | NflFrame): void;
  /** The words of a mark in the drawing (its title): the caption of the ball or drive in play. */
  titleOf(frame: MlbFrame | NflFrame): string;
  reset(): void;
}

const NS = "http://www.w3.org/2000/svg";
const ON = "fp-on";

type Mark = Element & { _fp?: boolean };

/** The marks of a layer, in the order drawn: its direct children but for the title and the description. */
function marksOf(layer: Element | null): Mark[] {
  if (!layer) return [];
  return Array.from(layer.children).filter((c) => c.localName !== "title" && c.localName !== "desc" && !c.classList.contains("fp-ball") && !c.classList.contains("fp-trail"));
}

function show(el: Mark | undefined, on: boolean) {
  if (!el || el._fp === on) return;
  el._fp = on;
  el.classList.toggle(ON, on);
}

const layerBy = (svg: Element, suffix: string) => svg.querySelector(`g.ky-layer[id$="-${suffix}"]`);
const titleText = (el: Element | undefined) => el?.querySelector(":scope > title")?.textContent ?? "";

export function mlbStage(svg: SVGSVGElement, wire: MlbWire): Stage | null {
  const layers = [layerBy(svg, "balls-away"), layerBy(svg, "balls-home")];
  const marks = layers.map(marksOf);
  const owner: { side: 0 | 1; at: number }[] = [];
  const seen = [0, 0];
  for (const b of wire.balls) { owner.push({ side: b[1], at: seen[b[1]]!++ }); }
  if (marks[0]!.length !== seen[0] || marks[1]!.length !== seen[1]) return null;
  const root = svg.querySelector("g.ky-layers");
  if (!root) return null;
  const mark = (i: number) => marks[owner[i]!.side]![owner[i]!.at];
  const trail = document.createElementNS(NS, "path");
  trail.setAttribute("class", "fp-trail");
  trail.setAttribute("fill", "none");
  root.appendChild(trail);
  layers.forEach((l) => l?.classList.add("fp-anim"));
  svg.classList.add("fp-live");
  let landed = -1, flying = -1;

  const place = (i: number, x: number, y: number) => {
    const m = mark(i);
    const b = wire.balls[i]!;
    m?.setAttribute("transform", `translate(${(x - b[4]).toFixed(2)} ${(y - b[5]).toFixed(2)})`);
  };
  const clearFlight = () => {
    if (flying >= 0) mark(flying)?.removeAttribute("transform");
    flying = -1;
    trail.setAttribute("d", "");
  };

  return {
    apply(f) {
      const m = f as MlbFrame;
      if (m.landed !== landed) {
        const lo = Math.max(0, Math.min(landed, m.landed) - 1), hi = Math.min(wire.balls.length - 1, Math.max(landed, m.landed) + 1);
        for (let i = lo; i <= hi; i++) show(mark(i), i < m.landed);
        landed = m.landed;
      }
      if (flying >= 0 && flying !== m.fly?.i) clearFlight();
      if (m.fly) {
        const b = wire.balls[m.fly.i]!;
        const p = ballAt(b, m.fly.u);
        flying = m.fly.i;
        show(mark(flying), true);
        place(flying, p.x, p.y);
        const steps = Math.max(2, Math.ceil(m.fly.u * 14));
        let path = "M0 0";
        for (let k = 1; k <= steps; k++) { const q = ballAt(b, (m.fly.u * k) / steps); path += `L${q.x.toFixed(1)} ${q.y.toFixed(1)}`; }
        trail.setAttribute("d", path);
        const edge = getComputedStyle(layers[b[1]] ?? svg).getPropertyValue("--ky-layer-edge").trim();
        trail.style.stroke = edge || "currentColor";
      } else if (flying < 0) trail.setAttribute("d", "");
    },
    titleOf(f) {
      const m = f as MlbFrame;
      const i = m.fly ? m.fly.i : m.landed - 1;
      return i >= 0 ? titleText(mark(i)) : "";
    },
    reset() {
      clearFlight();
      marks.forEach((list) => list.forEach((el) => { el.classList.remove(ON); el._fp = undefined; el.removeAttribute("transform"); }));
      layers.forEach((l) => l?.classList.remove("fp-anim"));
      svg.classList.remove("fp-live");
      trail.remove();
    },
  };
}

export function nflStage(svg: SVGSVGElement, wire: NflWire): Stage | null {
  const lay = driveSlots(wire.drives);
  const casing = marksOf(layerBy(svg, "casing")), bars = marksOf(layerBy(svg, "drives")), returns = marksOf(layerBy(svg, "returns"));
  const dots = marksOf(layerBy(svg, "plays")), ends = marksOf(layerBy(svg, "ends"));
  if (casing.length !== lay.bars || bars.length !== lay.bars || returns.length !== lay.returns || dots.length !== lay.dots || ends.length !== lay.ends) return null;
  const root = svg.querySelector("g.ky-layers");
  if (!root) return null;
  const names = ["casing", "drives", "returns", "plays", "ends"];
  const layers = names.map((n) => layerBy(svg, n));
  const full = new Map<Element, string>();
  for (const el of [...casing, ...bars, ...returns]) full.set(el, el.getAttribute("d") ?? "");
  layers.forEach((l) => l?.classList.add("fp-anim"));
  svg.classList.add("fp-live");
  const ball = document.createElementNS(NS, "ellipse");
  ball.setAttribute("class", "fp-ball");
  const spacing = wire.drives.length > 1 ? Math.abs(wire.drives[1]!.y - wire.drives[0]!.y) : 12;
  const r = Math.min(2.6, Math.max(1.2, spacing * 0.3));
  ball.setAttribute("rx", (r * 1.45).toFixed(2));
  ball.setAttribute("ry", r.toFixed(2));
  ball.setAttribute("visibility", "hidden");
  root.appendChild(ball);
  ball.style.fill = "#8a5a2c";
  let lastK = -2;
  const cut = (el: Element | undefined, d: DriveWire, to: number | null) => {
    if (el) el.setAttribute("d", to == null ? full.get(el) ?? "" : `M${d.x0} ${d.y}L${to} ${d.y}`);
  };
  const drive = (d: DriveWire, s: DriveSlots, st: { bar: number | null; dots: number; ended: boolean; returned: boolean; retX: number | null }) => {
    const on = st.bar != null || st.ended;
    if (s.bar >= 0) {
      show(casing[s.bar], on); show(bars[s.bar], on);
      const to = on && !st.ended ? st.bar : null;
      cut(casing[s.bar], d, to); cut(bars[s.bar], d, to);
    }
    for (let i = 0; i < s.dots; i++) show(dots[s.dot0 + i], i < st.dots);
    show(ends[s.end], st.ended);
    if (s.ret >= 0) {
      const el = returns[s.ret];
      show(el, st.retX != null);
      if (el && st.retX != null) el.setAttribute("d", st.returned ? full.get(el) ?? "" : `M${d.x1} ${d.y}L${st.retX} ${d.y}`);
      show(ends[s.retEnd], st.returned);
    }
  };
  const colourOf = (side: 0 | 1) => `#${wire.teams[side].color}`;

  return {
    apply(f) {
      const n = f as NflFrame;
      const lo = Math.max(0, Math.min(lastK, n.k) - 1), hi = Math.min(wire.drives.length - 1, Math.max(lastK, n.k) + 1);
      for (let j = lo; j <= hi; j++) {
        const d = wire.drives[j]!, s = lay.slots[j]!;
        if (j < n.k) drive(d, s, { bar: d.x1, dots: d.xs.length, ended: true, returned: d.xr != null, retX: d.xr });
        else if (j === n.k) drive(d, s, { bar: n.barX, dots: n.dots, ended: n.ended, returned: n.returned, retX: n.returnX });
        else drive(d, s, { bar: null, dots: 0, ended: false, returned: false, retX: null });
      }
      lastK = n.k;
      if (n.ballX != null && n.k >= 0) {
        const d = wire.drives[n.k]!;
        ball.setAttribute("cx", n.ballX.toFixed(2));
        ball.setAttribute("cy", d.y.toFixed(2));
        ball.style.stroke = colourOf(d.xr != null && n.returnX != null && n.ended ? (d.side === 0 ? 1 : 0) : d.side);
        ball.removeAttribute("visibility");
      } else ball.setAttribute("visibility", "hidden");
    },
    titleOf(f) {
      const n = f as NflFrame;
      if (n.k < 0) return "";
      const s = lay.slots[n.k]!;
      return titleText(s.bar >= 0 ? bars[s.bar] : ends[s.end]);
    },
    reset() {
      for (const [el, d] of full) el.setAttribute("d", d);
      [...casing, ...bars, ...returns, ...dots, ...ends].forEach((el) => { el.classList.remove(ON); el._fp = undefined; });
      layers.forEach((l) => l?.classList.remove("fp-anim"));
      svg.classList.remove("fp-live");
      ball.remove();
    },
  };
}
