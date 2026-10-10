"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/* Team maps, drawn with Chizu (MIT, https://github.com/johnmorrisdotca/chizu) from Natural Earth
   outlines (public domain). A small map on a team page marks its home; pressing it opens a large
   map of every team in the league that season. Chizu and its 170 kB of outlines load only here. */

export interface Pin {
  f: number;
  name: string;
  /** The official abbreviation in use that season. */
  abbr?: string;
  lat: number;
  lon: number;
  venue?: string | null;
  href?: string;
  me?: boolean;
}

type Chizu = {
  WORLD: typeof import("@johnmorrisdotca/chizu/world").default;
  drawChizu: typeof import("@johnmorrisdotca/chizu/draw").drawChizu;
  projectPoint: typeof import("@johnmorrisdotca/chizu").projectPoint;
};
let lib: Promise<Chizu> | null = null;
function chizu(): Promise<Chizu> {
  lib ??= Promise.all([import("@johnmorrisdotca/chizu/world"), import("@johnmorrisdotca/chizu/draw"), import("@johnmorrisdotca/chizu")]).then(
    ([world, draw, eng]) => ({ WORLD: world.default, drawChizu: draw.drawChizu, projectPoint: eng.projectPoint }),
  );
  return lib;
}

// A window round the points, wider than tall, with room to spare; never smaller than a region.
function frame(pts: [number, number][], aspect: number, minW: number) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  let w = Math.max(x1 - x0, minW) * 1.25, h = Math.max(y1 - y0, minW / aspect) * 1.25;
  if (w / h < aspect) w = h * aspect; else h = w / aspect;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return { x: cx - w / 2, y: cy - h / 2, width: w, height: h };
}

const NS = "http://www.w3.org/2000/svg";

/** Draws a map of the pins into `host`; returns false when nothing could be placed. */
async function drawTeamMap(host: HTMLElement, teams: Pin[], opts: { big?: boolean; title?: string }): Promise<boolean> {
  const big = !!opts.big;
  const { WORLD, drawChizu, projectPoint } = await chizu();
  const placed = teams
    .map((t) => ({ ...t, p: projectPoint(WORLD, Number(t.lon), Number(t.lat)) }))
    .filter((t): t is Pin & { p: [number, number] } => !!t.p);
  if (!placed.length) return false;
  const focus = big ? placed : placed.filter((t) => t.me);
  const box = frame((focus.length ? focus : placed).map((t) => t.p), big ? 1.7 : 1.4, big ? 60 : 90);
  host.className = "teammap" + (big ? " big" : "");
  host.innerHTML = drawChizu(WORLD, { box, tones: { US: "faint", CA: "faint", MX: "faint" }, language: "en", style: true });
  const svg = host.querySelector("svg");
  if (!svg) return false;
  svg.setAttribute("aria-label", opts.title || "Map of team locations");
  const r = box.width / (big ? 140 : 40);
  const g = document.createElementNS(NS, "g");
  g.setAttribute("class", "pins");
  const sorted = placed.sort((a, b) => (a.me ? 1 : 0) - (b.me ? 1 : 0));
  const tip = big ? document.createElement("div") : null;
  if (tip) { tip.className = "pinlabel"; tip.hidden = true; tip.setAttribute("aria-hidden", "true"); host.append(tip); }
  const label = (t: Pin) => `${t.abbr ? `${t.abbr} · ` : ""}${t.name}${t.venue ? ` · ${t.venue}` : ""}`;
  const showTip = (t: Pin & { p: [number, number] }) => {
    if (!tip) return;
    const sr = svg.getBoundingClientRect(), hr = host.getBoundingClientRect();
    tip.innerHTML = "";
    if (t.abbr) { const b = document.createElement("b"); b.textContent = t.abbr; tip.append(b); }
    tip.append(document.createTextNode(t.name + (t.venue ? ` · ${t.venue}` : "")));
    tip.hidden = false;
    const px = sr.left - hr.left + ((t.p[0] - box.x) / box.width) * sr.width, py = sr.top - hr.top + ((t.p[1] - box.y) / box.height) * sr.height;
    const half = tip.offsetWidth / 2;
    tip.style.left = `${Math.min(Math.max(px, half + 4), hr.width - half - 4)}px`;
    tip.style.top = `${py}px`;
  };
  for (const t of sorted) {
    const a = document.createElementNS(NS, "a");
    if (big && t.href) a.setAttribute("href", t.href);
    a.setAttribute("aria-label", label(t));
    const c = document.createElementNS(NS, "circle");
    c.setAttribute("cx", String(t.p[0])); c.setAttribute("cy", String(t.p[1])); c.setAttribute("r", String(t.me ? r * 1.6 : r));
    c.setAttribute("class", t.me ? "pin me" : "pin");
    if (!big) { const ti = document.createElementNS(NS, "title"); ti.textContent = label(t); c.append(ti); }
    if (tip) {
      a.addEventListener("pointerenter", () => showTip(t));
      a.addEventListener("focus", () => showTip(t));
      a.addEventListener("pointerleave", () => { tip.hidden = true; });
      a.addEventListener("blur", () => { tip.hidden = true; });
    }
    a.append(c); g.append(a);
  }
  svg.append(g);
  if (big) abbreviationLabels(g, sorted, r, box);
  return true;
}

type Rect = [number, number, number, number];
const meets = (a: Rect, b: Rect) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

/** Small abbreviation labels beside the dots, where they fit: beside, then above or below; one that would cover a dot or another label is left off. */
function abbreviationLabels(g: SVGGElement, pins: (Pin & { p: [number, number] })[], r: number, box: { x: number; y: number; width: number; height: number }) {
  const fs = r * 1.7;
  const dots: Rect[] = pins.map((t) => { const rr = t.me ? r * 1.6 : r; return [t.p[0] - rr, t.p[1] - rr, t.p[0] + rr, t.p[1] + rr]; });
  const taken: Rect[] = [];
  const order = [...pins].sort((a, b) => (b.me ? 1 : 0) - (a.me ? 1 : 0));
  for (const t of order) {
    if (!t.abbr) continue;
    const w = t.abbr.length * fs * 0.66, h = fs * 0.85, rr = (t.me ? r * 1.6 : r) + fs * 0.2;
    const [x, y] = t.p;
    const spots: { rect: Rect; anchor: "start" | "end" | "middle"; tx: number; ty: number }[] = [
      { rect: [x + rr, y - h / 2, x + rr + w, y + h / 2], anchor: "start", tx: x + rr, ty: y + h * 0.36 },
      { rect: [x - rr - w, y - h / 2, x - rr, y + h / 2], anchor: "end", tx: x - rr, ty: y + h * 0.36 },
      { rect: [x - w / 2, y - rr - h, x + w / 2, y - rr], anchor: "middle", tx: x, ty: y - rr - h * 0.12 },
      { rect: [x - w / 2, y + rr, x + w / 2, y + rr + h], anchor: "middle", tx: x, ty: y + rr + h * 0.88 },
    ];
    const ok = spots.find((s) => s.rect[0] >= box.x && s.rect[2] <= box.x + box.width && s.rect[1] >= box.y && s.rect[3] <= box.y + box.height
      && !dots.some((d) => meets(d, s.rect)) && !taken.some((d) => meets(d, s.rect)));
    if (!ok) continue;
    taken.push(ok.rect);
    const text = document.createElementNS(NS, "text");
    text.setAttribute("x", String(ok.tx)); text.setAttribute("y", String(ok.ty)); text.setAttribute("text-anchor", ok.anchor);
    text.setAttribute("class", "pinab"); text.setAttribute("style", `--fs:${fs}px`); text.setAttribute("font-size", String(fs));
    text.textContent = t.abbr;
    g.append(text);
  }
}

export function MapHost({ pins, big, title, onEmpty }: { pins: Pin[]; big?: boolean; title: string; onEmpty?: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let live = true;
    drawTeamMap(el, pins, { big, title }).then((ok) => { if (live && !ok) onEmpty?.(); }).catch(() => { if (live) onEmpty?.(); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- drawn once per mount
  }, []);
  return <div ref={ref} className={"teammap" + (big ? " big" : "")} style={big ? { minHeight: 200 } : { aspectRatio: "1.4" }} />;
}

/**
 * A small map of the team's home in the corner of its page. Pressing it opens a dialog with a large map
 * of every team in the league that season; a dot opens that team.
 */
export function TeamMapCorner({ me, others, clubCount, seasonLabel, leagueShort, name }: {
  me: Pin; others: Pin[]; clubCount: number; seasonLabel: string; leagueShort: string; name: string;
}) {
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);
  const dlg = useRef<HTMLDialogElement>(null);
  const label = `${leagueShort} teams, ${seasonLabel}`;
  useEffect(() => { if (open) dlg.current?.showModal(); }, [open]);
  if (hidden) return null;
  const all = others.length ? others : [me];
  return (
    <>
      <button type="button" className="mapbtn" aria-label={`Map of every ${leagueShort} team in ${seasonLabel}`} onClick={() => setOpen(true)}>
        <MapHost pins={[me]} title={`Where the ${name} play`} onEmpty={() => setHidden(true)} />
      </button>
      {open ? (
        <dialog ref={dlg} className="mapdlg" aria-label={label} onClose={() => setOpen(false)}
          onClick={(e) => {
            if (e.target === dlg.current) { dlg.current?.close(); return; }
            const a = (e.target as Element).closest("a[href^='/']");
            if (a && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey) { e.preventDefault(); dlg.current?.close(); router.push(a.getAttribute("href")!); }
          }}>
          <div className="dlghead">
            <h2>{label}</h2>
            <button type="button" className="theme" onClick={() => dlg.current?.close()}>Close</button>
          </div>
          <MapHost pins={all} big title={label} />
          <p className="note">{others.length} of {clubCount} teams placed. Press a dot to open that team. Map: Chizu, from Natural Earth.</p>
        </dialog>
      ) : null}
    </>
  );
}
