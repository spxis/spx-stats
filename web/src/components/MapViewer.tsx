"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { MapBox } from "@johnmorrisdotca/chizu";
import { regionPoint, type RegionCountry } from "@/lib/regionProject";
import { abbreviationLabels, chizu, NS, pinText, regionsOf, selectionOf, type Pin } from "./mapDraw";
import { COUNTRY_KEY } from "./countryKey";
import { useSpeaker } from "./i18n/LocaleProvider";
import "./mapviewer.css";

/**
 * The large map of teams or venues, drawn with Chizu. Two views: the country outlines (the world map framed round the dots) or
 * the states and provinces; zoom from 1x to 5x with the buttons, Ctrl or ⌘ and the wheel, or a pinch; drag to move once zoomed.
 * The plain wheel and a one-finger drag at 1x still scroll the page, so the map never traps it. Dots can be filtered by
 * conference and division when the pins carry them.
 */

const ZOOM_MAX = 5;
const clamp = (n: number, lo: number, hi: number) => Math.min(Math.max(n, lo), hi);

type Placed = Pin & { p: [number, number] };
interface Scene {
  svg: SVGSVGElement;
  host: HTMLElement;
  g: SVGGElement;
  labels: SVGGElement;
  tip: HTMLDivElement;
  /** Which dot the label is showing for, or -1. */
  tipFor: number;
  placed: Placed[];
  base: MapBox;
  bounds: MapBox;
  dots: { t: Placed; tone?: string; c: SVGCircleElement; hit: SVGCircleElement; img?: SVGImageElement }[];
  /** A ring drawn over the dots at the chosen one, so a dot hidden under its neighbours still shows. */
  halo: SVGCircleElement;
}
/** A window that holds the points with room to spare, never past the map's edge; short enough to see on a phone and on a laptop. */
function fitBox(pts: [number, number][], bounds: MapBox, hostWidth: number, hostHeight: number, minShare: number): MapBox {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const minW = bounds.width * minShare;
  let w = Math.min(Math.max(x1 - x0, minW) * 1.25, bounds.width), h = Math.min(Math.max(y1 - y0, minW / 1.7) * 1.25, bounds.height);
  const natural = w / h;
  const target = Math.max(natural, Math.min(hostWidth / Math.max(hostHeight, 1), bounds.width / h));
  if (w / h < target) w = Math.min(h * target, bounds.width); else h = Math.min(w / target, bounds.height);
  // leave the strip under the zoom buttons clear of dots
  const pad = Math.min((52 * w) / Math.max(hostWidth, 1), bounds.width - w);
  return { x: clamp((x0 + x1) / 2 - w / 2, 0, bounds.width - w - pad), y: clamp((y0 + y1) / 2 - h / 2, 0, bounds.height - h), width: w + pad, height: h };
}

const toneKey = (t: Pin) => `${t.conf ?? ""}|${t.div ?? ""}`;
const HUES = [215, 25, 140, 300];
const LIGHTS = [36, 54, 70];
/** One colour per conference (hue) and, within it, per division (shade); empty when the pins carry no conference. */
function toneMap(pins: Pin[]): Map<string, string> {
  const out = new Map<string, string>();
  const confs = [...new Set(pins.map((p) => p.conf).filter((c): c is string => !!c))].sort();
  if (confs.length < 2) return out;
  confs.forEach((c, ci) => {
    const divs = [...new Set(pins.filter((p) => p.conf === c).map((p) => p.div ?? ""))].sort();
    divs.forEach((d, di) => out.set(`${c}|${d}`, `hsl(${HUES[ci % HUES.length]} 75% ${LIGHTS[di % LIGHTS.length]}%)`));
  });
  return out;
}

interface View { z: number; x: number; y: number }

export function MapViewer({ pins, title, total, note, onNavigate, bar, selected, onPick, zoomToSelected }: {
  pins: Pin[]; title: string; total?: number; note?: string; onNavigate?: () => void; bar?: ReactNode;
  /** The chosen dot (Pin.f), marked on the map and described in the panel above it (team and venue as links); when given it replaces each pin's own `me`. A dot press then calls onPick instead of following its link. */
  selected?: number; onPick?: (f: number) => void;
  /** Start zoomed in on the chosen dot, and move there when the choice changes. */
  zoomToSelected?: boolean;
}) {
  const { say, locale } = useSpeaker();
  const router = useRouter();
  const pathname = usePathname();
  const hostRef = useRef<HTMLDivElement>(null);
  const scene = useRef<Scene | null>(null);
  const view = useRef<View>({ z: 1, x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [conf, setConf] = useState("");
  const [div, setDiv] = useState("");
  const [mode, setMode] = useState<"country" | "state">("country");
  const [cc, setCc] = useState<RegionCountry>("US");
  const [logos, setLogos] = useState(false);
  const logosOn = useRef(false);
  const [placedCount, setPlacedCount] = useState<number | null>(null);
  const pick = useRef({ selected, onPick, zoomToSelected });
  useEffect(() => { pick.current = { selected, onPick, zoomToSelected }; });

  const confs = useMemo(() => [...new Set(pins.map((p) => p.conf).filter((s): s is string => !!s))].sort(), [pins]);
  const divs = useMemo(() => [...new Set(pins.filter((p) => !conf || p.conf === conf).map((p) => p.div).filter((s): s is string => !!s))].sort(), [pins, conf]);
  const ccs = useMemo(() => {
    const n = (c: RegionCountry) => pins.filter((p) => p.cc === c).length;
    return (["US", "CA"] as const).filter((c) => n(c) > 0).sort((a, b) => n(b) - n(a));
  }, [pins]);
  const canState = ccs.length > 0;
  const tones = useMemo(() => toneMap(pins), [pins]);
  const shown = useMemo(() => pins.filter((p) => (!conf || p.conf === conf) && (!div || p.div === div)), [pins, conf, div]);
  const chosen = selected != null ? pins.find((p) => p.f === selected) : undefined;
  const country: RegionCountry | null = ccs.includes(cc) ? cc : ccs[0] ?? null;
  const stateView = mode === "state" && country != null;

  // Draw: a new map whenever the view kind, country, filter or pins change. Pan and zoom after that only move the window.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let live = true;
    (async () => {
      const { WORLD, drawChizu, projectPoint } = await chizu();
      const map = stateView ? await regionsOf(country!) : WORLD;
      if (!live) return;
      // The lower 48 fill the top 600 of the United States canvas; Alaska and Hawaii sit in boxes below, which no team needs.
      const bounds: MapBox = { x: 0, y: 0, width: map.width, height: stateView && country === "US" ? 606 : map.height };
      const place = (t: Pin): [number, number] | null => {
        if (!stateView) return projectPoint(WORLD, Number(t.lon), Number(t.lat));
        const p = t.cc === country ? regionPoint(country!, Number(t.lon), Number(t.lat)) : null;
        return p && p[0] >= 0 && p[0] <= bounds.width && p[1] >= 0 && p[1] <= bounds.height ? p : null;
      };
      const sel = pick.current.selected;
      const placed = shown.flatMap((t) => { const p = place(t); return p ? [{ ...t, p, me: sel != null ? t.f === sel : t.me }] : []; }).sort((a, b) => (a.me ? 1 : 0) - (b.me ? 1 : 0));
      const base = placed.length ? fitBox(placed.map((t) => t.p), bounds, host.clientWidth, host.clientHeight, stateView ? 0.18 : 0.06) : { x: 0, y: 0, width: bounds.width, height: bounds.width / 1.7 };
      host.innerHTML = drawChizu(map, { tones: stateView ? {} : { US: "faint", CA: "faint", MX: "faint" }, language: locale === "ja" ? "ja" : "en", style: true });
      const svg = host.querySelector("svg");
      if (!svg) return;
      svg.setAttribute("aria-label", title);
      svg.removeAttribute("width"); svg.removeAttribute("height");
      const g = document.createElementNS(NS, "g"); g.setAttribute("class", "pins");
      const labels = document.createElementNS(NS, "g"); labels.setAttribute("class", "pinlabels");
      const tip = document.createElement("div"); tip.className = "pinlabel"; tip.hidden = true; tip.setAttribute("aria-hidden", "true");
      host.append(tip);
      const dots = placed.map((t, i) => {
        const a = document.createElementNS(NS, "a");
        if (t.href) a.setAttribute("href", t.href);
        a.setAttribute("data-i", String(i));
        a.setAttribute("aria-label", pinText(t));
        const hit = document.createElementNS(NS, "circle"); hit.setAttribute("class", "hit");
        hit.setAttribute("cx", String(t.p[0])); hit.setAttribute("cy", String(t.p[1]));
        const c = document.createElementNS(NS, "circle"); c.setAttribute("class", t.me ? "pin me" : "pin");
        c.setAttribute("cx", String(t.p[0])); c.setAttribute("cy", String(t.p[1]));
        const tone = tones.get(toneKey(t));
        if (tone && !t.me) c.style.fill = tone;
        a.append(hit, c);
        let img: SVGImageElement | undefined;
        if (t.logo) {
          img = document.createElementNS(NS, "image");
          img.setAttribute("href", t.logo); img.setAttribute("class", "pinlogo");
          img.setAttribute("preserveAspectRatio", "xMidYMid meet"); img.setAttribute("referrerpolicy", "no-referrer");
          img.addEventListener("error", () => { img!.dataset.failed = "1"; apply(); });
          a.append(img);
        }
        g.append(a);
        return { t, tone, c, hit, img };
      });
      const halo = document.createElementNS(NS, "circle"); halo.setAttribute("class", "pin me selhalo");
      if (sel != null) svg.append(g, halo, labels); else svg.append(g, labels);
      const s: Scene = { svg, host, g, labels, tip, tipFor: -1, placed, base, bounds, dots, halo };
      scene.current = s;
      const at = pick.current.zoomToSelected ? placed.find((t) => t.me) : undefined;
      view.current = at ? { z: 3, x: at.p[0], y: at.p[1] } : { z: 1, x: base.x + base.width / 2, y: base.y + base.height / 2 };
      setZoom(at ? 3 : 1);
      setPlacedCount(placed.length);
      apply();
    })().catch(() => { /* the map stays blank */ });
    return () => { live = false; scene.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- redrawn only when what is shown changes
  }, [shown, stateView, country, locale, tones]);

  /** The window for the current zoom and centre, kept on the map. */
  function windowOf(): MapBox | null {
    const s = scene.current;
    if (!s) return null;
    const v = view.current;
    const w = s.base.width / v.z, h = s.base.height / v.z;
    const x = clamp(v.x - w / 2, s.bounds.x, s.bounds.x + s.bounds.width - w), y = clamp(v.y - h / 2, s.bounds.y, s.bounds.y + s.bounds.height - h);
    v.x = x + w / 2; v.y = y + h / 2;
    return { x, y, width: w, height: h };
  }

  function apply() {
    const s = scene.current, box = windowOf();
    if (!s || !box) return;
    s.svg.setAttribute("viewBox", `${box.x} ${box.y} ${box.width} ${box.height}`);
    s.tip.hidden = true; s.tipFor = -1;
    const px = s.host.clientWidth || 600;
    const r = (box.width * Math.max(4.5, px / 140)) / px;
    const hitPx = window.matchMedia("(pointer: coarse)").matches ? 20 : 13;
    const asLogo = (d: Scene["dots"][number]) => logosOn.current && !!d.img && !d.img.dataset.failed;
    for (const d of s.dots) {
      d.c.setAttribute("r", String(d.t.me ? r * 1.5 : r)); d.hit.setAttribute("r", String((box.width * hitPx) / px));
      if (d.img) {
        const size = r * (d.t.me ? 6 : 4.5);
        d.img.setAttribute("x", String(d.t.p[0] - size / 2)); d.img.setAttribute("y", String(d.t.p[1] - size / 2));
        d.img.setAttribute("width", String(size)); d.img.setAttribute("height", String(size));
      }
      const logo = asLogo(d);
      d.c.style.display = logo ? "none" : ""; if (d.img) d.img.style.display = logo ? "" : "none";
    }
    const me = s.dots.find((d) => d.t.me);
    const lr = me && asLogo(me) ? r * 3.3 : r * 1.5;
    if (me && pick.current.selected != null) { s.halo.setAttribute("cx", String(me.t.p[0])); s.halo.setAttribute("cy", String(me.t.p[1])); s.halo.setAttribute("r", String(lr)); }
    s.labels.replaceChildren();
    abbreviationLabels(s.labels, s.placed, r, box, logosOn.current && s.dots.some(asLogo) ? r * 2.6 : r);
    s.host.style.touchAction = view.current.z > 1 ? "none" : "pan-y pinch-zoom";
    s.host.dataset.zoomed = view.current.z > 1 ? "1" : "0";
  }

  /** Zoom to `z` keeping the canvas point (ax, ay) where it is on the screen. */
  function zoomAt(z: number, ax?: number, ay?: number) {
    const s = scene.current, box = windowOf();
    if (!s || !box) return;
    const nz = clamp(z, 1, ZOOM_MAX);
    const fx = ax == null ? 0.5 : (ax - box.x) / box.width, fy = ay == null ? 0.5 : (ay - box.y) / box.height;
    const px = ax ?? box.x + box.width / 2, py = ay ?? box.y + box.height / 2;
    const w = s.base.width / nz, h = s.base.height / nz;
    view.current = { z: nz, x: px - fx * w + w / 2, y: py - fy * h + h / 2 };
    setZoom(Math.round(nz * 10) / 10);
    apply();
  }

  // A new choice: move the marked dot and the ring without drawing the map again, so the zoom stays.
  useEffect(() => {
    const s = scene.current;
    if (!s || selected == null) return;
    for (const d of s.dots) { d.t.me = d.t.f === selected; d.c.setAttribute("class", d.t.me ? "pin me" : "pin"); d.c.style.fill = d.t.me ? "" : d.tone ?? ""; }
    const me = s.dots.find((d) => d.t.me);
    if (me && zoomToSelected) { view.current.x = me.t.p[0]; view.current.y = me.t.p[1]; }
    apply();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply reads the refs
  }, [selected]);

  // Pointer, wheel and click handling on the map itself.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const pts = new Map<number, { x: number; y: number }>();
    let start: { x: number; y: number; cx: number; cy: number } | null = null;
    let pinch: { d: number; z: number } | null = null;
    let moved = false;
    let lastType = "mouse";
    const canvasAt = (clientX: number, clientY: number): [number, number] | null => {
      const box = windowOf(), r = scene.current?.svg.getBoundingClientRect();
      return box && r ? [box.x + ((clientX - r.left) / r.width) * box.width, box.y + ((clientY - r.top) / r.height) * box.height] : null;
    };
    const down = (e: PointerEvent) => {
      lastType = e.pointerType;
      if ((e.target as Element).closest(".mapzoom")) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) { start = { x: e.clientX, y: e.clientY, cx: view.current.x, cy: view.current.y }; moved = false; }
      if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: view.current.z }; moved = true; }
      const s = scene.current;
      if (s && !(e.target as Element).closest("a, .pinab")) { s.tip.hidden = true; s.tipFor = -1; }
    };
    const move = (e: PointerEvent) => {
      const p = pts.get(e.pointerId);
      if (!p) return;
      p.x = e.clientX; p.y = e.clientY;
      const s = scene.current, r = s?.svg.getBoundingClientRect();
      if (!s || !r) return;
      if (pts.size === 2 && pinch) {
        const [a, b] = [...pts.values()];
        const at = canvasAt((a.x + b.x) / 2, (a.y + b.y) / 2);
        zoomAt((pinch.z * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.d, at?.[0], at?.[1]);
        return;
      }
      if (pts.size === 1 && start && view.current.z > 1) {
        const dx = e.clientX - start.x, dy = e.clientY - start.y;
        if (!moved && Math.hypot(dx, dy) < 5) return;
        if (!moved) { moved = true; try { host.setPointerCapture(e.pointerId); } catch { /* the pointer is gone */ } }
        const box = windowOf()!;
        view.current.x = start.cx - (dx / r.width) * box.width;
        view.current.y = start.cy - (dy / r.height) * box.height;
        apply();
      }
    };
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      if (pts.size < 2) pinch = null;
      if (pts.size === 0) start = null;
    };
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const at = canvasAt(e.clientX, e.clientY);
      zoomAt(view.current.z * Math.exp(-e.deltaY * (e.ctrlKey && !e.metaKey ? 0.01 : 0.004)), at?.[0], at?.[1]);
    };
    const click = (e: MouseEvent) => {
      const a = (e.target as Element).closest("a, .pinab");
      if (moved) { moved = false; e.preventDefault(); e.stopPropagation(); return; }
      if (!a) return;
      const s = scene.current, i = Number(a.getAttribute("data-i"));
      const d = s?.dots[i];
      if (d && pick.current.onPick && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); pick.current.onPick(d.t.f); return; }
      if (s && d && lastType === "touch" && s.tipFor !== i) { e.preventDefault(); e.stopPropagation(); showTip(d.t); return; }
      const href = a.getAttribute("href") ?? d?.t.href;
      if (href?.startsWith("/") && e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey) { e.preventDefault(); onNavigate?.(); router.push(href); }
    };
    const dbl = (e: MouseEvent) => {
      if ((e.target as Element).closest("a, .pinab, .mapzoom") || view.current.z >= ZOOM_MAX) return;
      const at = canvasAt(e.clientX, e.clientY);
      if (!at) return;
      const z = Math.min(Math.floor(view.current.z + 0.001) + 1, ZOOM_MAX);
      view.current = { z, x: at[0], y: at[1] };
      setZoom(z);
      apply();
    };
    const enter = (e: Event) => {
      const a = (e.target as Element).closest?.("a[data-i], .pinab");
      const d = a && scene.current?.dots[Number(a.getAttribute("data-i"))];
      const keyboard = e.type === "focusin" && (e.target as Element).matches(":focus-visible");
      if (d && (keyboard || (e.type === "pointerover" && (e as PointerEvent).pointerType !== "touch"))) showTip(d.t);
    };
    const leave = (e: Event) => { const a = (e.target as Element).closest?.("a[data-i], .pinab"); if (a && scene.current && (e as PointerEvent).pointerType !== "touch") { scene.current.tip.hidden = true; scene.current.tipFor = -1; } };
    host.addEventListener("pointerdown", down);
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerup", up);
    host.addEventListener("pointercancel", up);
    host.addEventListener("wheel", wheel, { passive: false });
    host.addEventListener("click", click, true);
    host.addEventListener("dblclick", dbl);
    host.addEventListener("pointerover", enter);
    host.addEventListener("pointerout", leave);
    host.addEventListener("focusin", enter);
    host.addEventListener("focusout", leave);
    return () => {
      host.removeEventListener("pointerdown", down);
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerup", up);
      host.removeEventListener("pointercancel", up);
      host.removeEventListener("wheel", wheel);
      host.removeEventListener("click", click, true);
      host.removeEventListener("dblclick", dbl);
      host.removeEventListener("pointerover", enter);
      host.removeEventListener("pointerout", leave);
      host.removeEventListener("focusin", enter);
      host.removeEventListener("focusout", leave);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers read the refs
  }, []);

  function showTip(t: Placed) {
    const s = scene.current, box = windowOf();
    if (!s || !box) return;
    const { tip, svg, host } = s;
    const sr = svg.getBoundingClientRect(), hr = host.getBoundingClientRect();
    tip.replaceChildren();
    if (t.abbr) { const b = document.createElement("b"); b.textContent = t.abbr; tip.append(b); }
    tip.append(document.createTextNode([t.name, t.venue, t.place].filter(Boolean).join(" · ")));
    tip.hidden = false; s.tipFor = s.placed.indexOf(t);
    const px = sr.left - hr.left + ((t.p[0] - box.x) / box.width) * sr.width, py = sr.top - hr.top + ((t.p[1] - box.y) / box.height) * sr.height;
    const half = tip.offsetWidth / 2;
    tip.style.left = `${clamp(px, half + 4, Math.max(half + 4, hr.width - half - 4))}px`;
    tip.style.top = `${py}px`;
  }

  useEffect(() => {
    logosOn.current = logos;
    apply();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- apply reads the refs
  }, [logos]);
  const canLogo = useMemo(() => pins.some((p) => p.logo), [pins]);
  const confChange = (c: string) => { setConf(c); setDiv(""); };
  const countryName = (c: RegionCountry) => say(COUNTRY_KEY[c]);
  const filtered = !!(conf || div);

  return (
    <div className="mapviewer">
      <div className="mapbar">
        {bar}
        {canState ? (
          <div className="seg" role="group" aria-label={say("map.view")}>
            <button type="button" aria-pressed={!stateView} onClick={() => setMode("country")}>{say("map.viewCountry")}</button>
            <button type="button" aria-pressed={stateView} onClick={() => setMode("state")}>{say("map.viewState")}</button>
          </div>
        ) : null}
        {stateView && ccs.length > 1 ? (
          <div className="seg" role="group" aria-label={say("map.pickCountry")}>
            {ccs.map((c) => <button key={c} type="button" aria-pressed={c === country} onClick={() => setCc(c)}>{countryName(c)}</button>)}
          </div>
        ) : null}
        {canLogo ? (
          <div className="seg" role="group" aria-label={say("map.logos")}>
            <button type="button" aria-pressed={logos} onClick={() => setLogos(!logos)}>{say("map.logos")}</button>
          </div>
        ) : null}
        {confs.length > 1 ? (
          <select aria-label={say("map.conference")} value={conf} onChange={(e) => confChange(e.target.value)}>
            <option value="">{say("map.allConf")}</option>
            {confs.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        ) : null}
        {divs.length > 1 ? (
          <select aria-label={say("map.division")} value={divs.includes(div) ? div : ""} onChange={(e) => setDiv(e.target.value)}>
            <option value="">{say("map.allDiv")}</option>
            {divs.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        ) : null}
      </div>
      {chosen ? <Selection pin={chosen} here={pathname} /> : null}
      <div className="mapstage">
        <div ref={hostRef} className="teammap big viewer" />
        <div className="mapzoom" role="group" aria-label={say("map.zoom")}>
          <button type="button" aria-label={say("map.zoomIn")} disabled={zoom >= ZOOM_MAX} onClick={() => zoomAt(Math.floor(view.current.z + 0.001) + 1)}>+</button>
          <span aria-live="polite">{zoom}×</span>
          <button type="button" aria-label={say("map.zoomOut")} disabled={zoom <= 1} onClick={() => zoomAt(Math.ceil(view.current.z - 0.001) - 1)}>−</button>
          <button type="button" aria-label={say("map.zoomReset")} disabled={zoom <= 1} onClick={() => zoomAt(1)}>⌂</button>
        </div>
      </div>
      {tones.size ? (
        <ul className="maplegend" aria-label={say("map.legend")}>
          {[...tones].map(([k, color]) => <li key={k}><i style={{ background: color }} />{k.split("|").filter(Boolean).join(" · ")}</li>)}
        </ul>
      ) : null}
      {placedCount === 0 && filtered ? <p className="note">{say("map.noneMatch")}</p> : null}
      <p className="note">{note ?? say("map.note", { placed: placedCount ?? shown.length, total: total ?? pins.length })} {say("map.hint")}</p>
    </div>
  );
}

/** The chosen dot in words: the team (a link to its page, unless that is this page) and the venue (a link to its English Wikipedia article, in a new tab). */
function Selection({ pin, here }: { pin: Pin; here: string }) {
  const { say } = useSpeaker();
  const s = selectionOf(pin);
  return (
    <p className="mapcaption" aria-live="polite">
      {s.teamHref && s.teamHref !== here ? <Link href={s.teamHref} prefetch={false}><b>{s.team}</b></Link> : <b>{s.team}</b>}
      {s.venue ? (
        s.wiki
          ? <a className="ext" href={s.wiki} target="_blank" rel="noopener noreferrer" aria-label={say("map.wikiOpens", { venue: s.venue })}>{s.venue}</a>
          : <span>{s.venue}</span>
      ) : null}
      {s.rest.map((t) => <span key={t}>{t}</span>)}
    </p>
  );
}
