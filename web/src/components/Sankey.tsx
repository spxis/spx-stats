"use client";

import { sankey, type SankeyLink, type SankeyNode } from "d3-sankey";
import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { TipLines, useTooltip } from "./Tooltip";
import { useChartWidth } from "./useChartWidth";
import "./sankey.css";

/** A block of the diagram, with everything its hover, tap and focus show. */
export interface SankeyNodeIn {
  id: string;
  /** The column it sits in, counted from 0 on the left. */
  column: number;
  /** Position in its column, small first. */
  order: number;
  label: string;
  /** A second, muted line under the label (years, a count). */
  sub?: string;
  /** Where pressing it goes. */
  href?: string;
  /** A CSS colour (a variable is fine). */
  tone: string;
  /** Drawn faded: a club that no longer plays, a source that confirms nothing. */
  muted?: boolean;
  title: string;
  lines: string[];
  /** A list under the lines (the players of a band), each with its page; shown in the details panel (see `panel`). */
  items?: SankeyItem[];
}

/** One entry of a list in the details: a player, a coach. */
export interface SankeyItem {
  label: string;
  href?: string;
}

/** One real route through the diagram: the blocks and the bands it passes, by id (bands may run parallel between two blocks). */
export interface SankeyRoute {
  nodes: string[];
  links: string[];
}

export interface SankeyLinkIn {
  id: string;
  source: string;
  target: string;
  value: number;
  href?: string;
  tone?: string;
  title: string;
  lines: string[];
  items?: SankeyItem[];
}

export interface SankeyLabels {
  /** Text under the diagram before anything is chosen. */
  hint: string;
  /** The link in the details: "Open {title}". */
  open: (title: string) => string;
  /** The diagram's name for a screen reader. */
  aria: string;
}

interface Props {
  nodes: SankeyNodeIn[];
  links: SankeyLinkIn[];
  /** One heading per column, left to right. */
  columnTitles: string[];
  labels: SankeyLabels;
  /** Pixels one unit of value is drawn at in the fullest column; sets the height. */
  unitPx?: number;
  /** Used instead of unitPx when the height should not depend on the values. */
  height?: number;
  /** The narrowest a column may be drawn before the diagram scrolls inside its box (default 150). */
  minPitch?: number;
  /**
   * The real routes through the diagram, each a list of block ids left to right. When the bands mix flows (a block that many routes pass
   * through), these say which blocks and bands belong together, so choosing a block lights only routes that exist. Without them the
   * whole path (everything upstream and downstream) is lit.
   */
  traces?: string[][];
  /**
   * The same, by block and band ids, for diagrams where two blocks have several bands between them (one per coach, one per group of
   * players): choosing a block or a band lights the routes that pass it. Wins over `traces`.
   */
  routes?: SankeyRoute[];
  /**
   * Show the details of the chosen block or band in a panel under the diagram (and keep them after the pointer leaves), instead of
   * beside it. For details with lists of links, which a tooltip that follows the pointer cannot offer.
   */
  panel?: boolean;
  /** Extra content under the details (a note about holes in the data). */
  children?: ReactNode;
}

type N = SankeyNodeIn;
type L = { id: string; href?: string; tone?: string; title: string; lines: string[]; items?: SankeyItem[] };
type Active = { kind: "node" | "link"; id: string; via: "mouse" | "touch" | "key" };

const NODE_W = 12, PAD = 6, TOP = 28, BOTTOM = 8, MIN_PITCH = 150, CHAR_W = 6.3;

/** The details of a block chosen by touch or key, placed beside it and kept inside the diagram's box (below it, or above near the bottom). */
function Pop({ x, y, boxW, boxH, children }: { x: number; y: number; boxW: number; boxH: number; children: ReactNode }) {
  const el = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const t = el.current;
    if (!t) return;
    const w = t.offsetWidth, h = t.offsetHeight;
    const left = Math.min(Math.max(x + 10, 0), Math.max(boxW - w, 0));
    const top = y + 14 + h > boxH ? Math.max(y - h - 10, 0) : y + 14;
    t.style.left = `${left}px`;
    t.style.top = `${top}px`;
    // On a phone the block can sit near the bottom of the screen: bring the details into view.
    t.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [x, y, boxW, boxH, children]);
  return <div className="tip sk-pop" ref={el}>{children}</div>;
}

const fit = (s: string, room: number): string => {
  const max = Math.max(4, Math.floor(room / CHAR_W));
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
};

/**
 * A Sankey diagram: blocks in columns, bands between them. One component for every flow on the site, drawn with d3-sankey in the
 * browser (the pages that use it load it on demand). Every block links to its page; the mouse shows a tooltip, a touch selects a block
 * first (a second touch, or the link in the details, goes there), the keyboard moves between blocks, and in every case the details sit
 * under the diagram. The whole path through a block (everything upstream and downstream) is lit while it is chosen. The diagram is as
 * wide as the page allows and scrolls inside its own box when its columns do not fit.
 */
export default function Sankey({ nodes, links, columnTitles, labels, unitPx, height, minPitch = MIN_PITCH, traces, routes, panel, children }: Props) {
  const [ref, W] = useChartWidth(900, 280);
  const tip = useTooltip(ref);
  const [active, setActive] = useState<Active | null>(null);
  // In panel mode the last block or band chosen stays in the panel after the pointer has left it.
  const [kept, setKept] = useState<Active | null>(null);
  const panelEl = useRef<HTMLDivElement | null>(null);
  const [scroll, setScroll] = useState(0);
  const pointer = useRef<string>("mouse");
  const cols = Math.max(columnTitles.length, 1);
  const innerW = Math.max(W - 2, cols * minPitch);
  const room = Math.round(innerW / cols) - 12;

  const layout = useMemo(() => {
    const colTotals = new Map<number, { sum: number; n: number }>();
    const outOf = new Map<string, number>(), inTo = new Map<string, number>();
    for (const l of links) { outOf.set(l.source, (outOf.get(l.source) ?? 0) + l.value); inTo.set(l.target, (inTo.get(l.target) ?? 0) + l.value); }
    for (const n of nodes) {
      const v = Math.max(outOf.get(n.id) ?? 0, inTo.get(n.id) ?? 0);
      const t = colTotals.get(n.column) ?? { sum: 0, n: 0 };
      colTotals.set(n.column, { sum: t.sum + v, n: t.n + 1 });
    }
    const need = Math.max(0, ...[...colTotals.values()].map((t) => t.sum * (unitPx ?? 0) + Math.max(t.n - 1, 0) * PAD));
    const H = Math.round(TOP + BOTTOM + (height ?? Math.max(need, 120)));
    const gen = sankey<N, L>()
      .nodeId((d) => d.id)
      .nodeAlign((d) => d.column)
      .nodeSort((a, b) => a.order - b.order)
      .nodeWidth(NODE_W)
      .nodePadding(PAD)
      .iterations(12)
      .extent([[4, TOP], [innerW - room, H - BOTTOM]]);
    const g = gen({
      nodes: nodes.map((n) => ({ ...n })),
      links: links.map((l) => ({ source: l.source, target: l.target, value: l.value, id: l.id, href: l.href, tone: l.tone, title: l.title, lines: l.lines })),
    });
    return { H, nodes: g.nodes as SankeyNode<N, L>[], links: g.links as SankeyLink<N, L>[] };
  }, [nodes, links, innerW, room, unitPx, height]);

  // The path through the chosen block: the routes that pass through it, or else everything it comes from and everything it leads to.
  const lit = useMemo(() => {
    if (!active) return null;
    const nodeSet = new Set<string>(), linkSet = new Set<string>();
    if (routes) {
      for (const route of routes) {
        if (!(active.kind === "node" ? route.nodes.includes(active.id) : route.links.includes(active.id))) continue;
        route.nodes.forEach((id) => nodeSet.add(id));
        route.links.forEach((id) => linkSet.add(id));
      }
      return nodeSet.size ? { nodes: nodeSet, links: linkSet } : null;
    }
    if (traces) {
      const link = new Map(links.map((l) => [`${l.source}>${l.target}`, l.id]));
      const chosen = active.kind === "node" ? null : links.find((l) => l.id === active.id);
      for (const route of traces) {
        const hit = active.kind === "node" ? route.includes(active.id) : chosen ? route.some((id, i) => id === chosen.source && route[i + 1] === chosen.target) : false;
        if (!hit) continue;
        route.forEach((id, i) => { nodeSet.add(id); const l = i ? link.get(`${route[i - 1]}>${id}`) : undefined; if (l) linkSet.add(l); });
      }
      return nodeSet.size ? { nodes: nodeSet, links: linkSet } : null;
    }
    const up = (n: SankeyNode<N, L>) => { for (const l of n.targetLinks ?? []) { linkSet.add(l.id); const s = l.source as SankeyNode<N, L>; if (!nodeSet.has(s.id)) { nodeSet.add(s.id); up(s); } } };
    const down = (n: SankeyNode<N, L>) => { for (const l of n.sourceLinks ?? []) { linkSet.add(l.id); const t = l.target as SankeyNode<N, L>; if (!nodeSet.has(t.id)) { nodeSet.add(t.id); down(t); } } };
    if (active.kind === "node") {
      const n = layout.nodes.find((x) => x.id === active.id);
      if (!n) return null;
      nodeSet.add(n.id); up(n); down(n);
    } else {
      const l = layout.links.find((x) => x.id === active.id);
      if (!l) return null;
      const s = l.source as SankeyNode<N, L>, t = l.target as SankeyNode<N, L>;
      linkSet.add(l.id); nodeSet.add(s.id); nodeSet.add(t.id); up(s); down(t);
    }
    return { nodes: nodeSet, links: linkSet };
  }, [active, layout, links, traces, routes]);

  const shown = panel ? active ?? kept : active;
  const detail = useMemo(() => {
    if (!shown) return null;
    if (shown.kind === "node") { const n = nodes.find((x) => x.id === shown.id); return n ? { title: n.title, lines: n.lines, href: n.href, items: n.items } : null; }
    const l = links.find((x) => x.id === shown.id);
    return l ? { title: l.title, lines: l.lines, href: l.href, items: l.items } : null;
  }, [shown, nodes, links]);

  // Where a chosen block or band is, in the diagram's own coordinates: the details of a touch or a key press open beside it.
  const anchor = useMemo(() => {
    if (!active) return null;
    if (active.kind === "node") { const n = layout.nodes.find((x) => x.id === active.id); return n ? { x: n.x1!, y: (n.y0! + n.y1!) / 2 } : null; }
    const l = layout.links.find((x) => x.id === active.id);
    if (!l) return null;
    const s = l.source as SankeyNode<N, L>, t = l.target as SankeyNode<N, L>;
    return { x: (s.x1! + t.x0!) / 2, y: ((l.y0 ?? 0) + (l.y1 ?? 0)) / 2 };
  }, [active, layout]);

  const pick = (kind: Active["kind"], id: string, via: Active["via"]) => {
    setActive((a) => (a && a.kind === kind && a.id === id && a.via === via ? a : { kind, id, via }));
    if (panel) setKept((k) => (k && k.kind === kind && k.id === id ? k : { kind, id, via }));
  };
  const press = (e: MouseEvent, kind: Active["kind"], id: string) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    // A first touch only chooses; the second (or the link in the details) goes there.
    if (e.detail !== 0 && pointer.current === "touch" && !(active && active.kind === kind && active.id === id)) { e.preventDefault(); pick(kind, id, "touch"); }
  };
  const hover = (e: MouseEvent, kind: Active["kind"], id: string, title: string, lines: string[]) => {
    if (pointer.current !== "mouse") return;
    pick(kind, id, "mouse");
    tip.show(e, <TipLines title={title} lines={lines} />);
  };
  const leave = (kind: Active["kind"], id: string) => {
    if (pointer.current !== "mouse") return;
    tip.hide();
    setActive((a) => (a && a.kind === kind && a.id === id && a.via === "mouse" ? null : a));
  };

  // A touch or a key press brings the panel into view when it is below the fold of a tall diagram.
  useEffect(() => {
    if (panel && kept && kept.via !== "mouse") panelEl.current?.scrollIntoView({ block: "nearest" });
  }, [panel, kept]);

  const colX = (c: number) => 4 + (cols > 1 ? ((innerW - room - NODE_W - 4) * c) / (cols - 1) : 0);
  const state = (kind: "node" | "link", id: string) => (!lit ? "" : (kind === "node" ? lit.nodes : lit.links).has(id) ? " on" : " off");

  return (
    <div className="sk" ref={ref} data-lit={lit ? "" : undefined} onKeyDown={(e) => { if (e.key === "Escape") { setActive(null); setKept(null); tip.hide(); } }}>
      <div className="sk-scroll" tabIndex={-1} onScroll={(e) => setScroll(e.currentTarget.scrollLeft)}>
        <svg width={innerW} height={layout.H} viewBox={`0 0 ${innerW} ${layout.H}`} role="group" aria-label={labels.aria}
          onPointerDown={(e) => { pointer.current = e.pointerType || "mouse"; }}
          onClick={(e) => { if (e.target === e.currentTarget) { setActive(null); setKept(null); } }}>
          {columnTitles.map((t, c) => (
            <text key={c} className="sk-col" x={colX(c)} y={14}>{fit(t, room + NODE_W)}</text>
          ))}
          <g className="sk-links">
            {layout.links.map((l) => {
              const s = l.source as SankeyNode<N, L>, t = l.target as SankeyNode<N, L>;
              const x0 = s.x1!, x1 = t.x0!, xm = (x0 + x1) / 2;
              const d = `M${x0},${l.y0} C${xm},${l.y0} ${xm},${l.y1} ${x1},${l.y1}`;
              const id = l.id;
              const path = <path d={d} strokeWidth={Math.max(l.width ?? 1, 1)} className="sk-band" />;
              return (
                <g key={id} className={`sk-link${state("link", id)}`} style={{ "--sk": l.tone ?? s.tone } as React.CSSProperties}
                  onMouseEnter={(e) => hover(e, "link", id, l.title, l.lines)} onMouseMove={(e) => { if (pointer.current === "mouse") tip.show(e, <TipLines title={l.title} lines={l.lines} />); }}
                  onMouseLeave={() => leave("link", id)}>
                  {l.href ? <Link href={l.href} tabIndex={-1} aria-hidden="true" onClick={(e) => press(e, "link", id)}>{path}</Link> : <g onClick={(e) => press(e, "link", id)}>{path}</g>}
                </g>
              );
            })}
          </g>
          <g className="sk-nodes">
            {layout.nodes.map((n) => {
              const h = Math.max((n.y1 ?? 0) - (n.y0 ?? 0), 1);
              const x = n.x0!, y = n.y0!;
              const showText = h >= 13;
              const two = Boolean(n.sub) && h >= 28;
              const cy = y + h / 2;
              const body = (
                <>
                  <rect className="sk-rect" x={x} y={y} width={NODE_W} height={h} />
                  {showText && (
                    <text className="sk-label" x={x + NODE_W + 6} y={two ? cy - 3 : cy + 4}>
                      {fit(n.label, room - 6)}
                      {two && <tspan className="sk-sub" x={x + NODE_W + 6} dy={13}>{fit(n.sub!, room - 6)}</tspan>}
                    </text>
                  )}
                </>
              );
              const aria = `${n.title}. ${n.lines[0] ?? ""}`;
              return (
                <g key={n.id} className={`sk-node${n.muted ? " muted" : ""}${state("node", n.id)}`} style={{ "--sk": n.tone } as React.CSSProperties}
                  onMouseEnter={(e) => hover(e, "node", n.id, n.title, n.lines)} onMouseMove={(e) => { if (pointer.current === "mouse") tip.show(e, <TipLines title={n.title} lines={n.lines} />); }}
                  onMouseLeave={() => leave("node", n.id)}>
                  {n.href ? (
                    <Link href={n.href} aria-label={aria} onClick={(e) => press(e, "node", n.id)}
                      onFocus={() => { if (pointer.current !== "touch") pick("node", n.id, "key"); }}
                      onBlur={() => setActive((a) => (a && a.kind === "node" && a.id === n.id && a.via === "key" ? null : a))}>{body}</Link>
                  ) : (
                    <g tabIndex={0} role="img" aria-label={aria} onClick={(e) => press(e, "node", n.id)}
                      onFocus={() => { if (pointer.current !== "touch") pick("node", n.id, "key"); }}
                      onBlur={() => setActive((a) => (a && a.kind === "node" && a.id === n.id && a.via === "key" ? null : a))}>{body}</g>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      {tip.element}
      {!panel && detail && anchor && active && active.via !== "mouse" ? (
        <Pop x={anchor.x - scroll} y={anchor.y} boxW={W} boxH={layout.H}>
          <b>{detail.title}</b>
          {detail.lines.map((l, i) => <div key={i}>{l}</div>)}
          {detail.href && <Link className="sk-open" href={detail.href} tabIndex={-1}>{labels.open(detail.title)}</Link>}
        </Pop>
      ) : null}
      {panel ? (
        <div className="sk-panel" ref={panelEl}>
          {detail ? (
            <>
              <b>{detail.title}</b>
              {detail.lines.map((l, i) => <div key={i}>{l}</div>)}
              {detail.items?.length ? (
                <ul className="sk-items">
                  {detail.items.map((it, i) => <li key={i}>{it.href ? <Link href={it.href} prefetch={false}>{it.label}</Link> : it.label}</li>)}
                </ul>
              ) : null}
              {detail.href && <Link className="sk-open" href={detail.href} prefetch={false}>{labels.open(detail.title)}</Link>}
            </>
          ) : <p className="sk-hint">{labels.hint}</p>}
        </div>
      ) : null}
      {panel ? null : <p className="sk-hint">{labels.hint}</p>}
      <div className="sk-sr" aria-live="polite">{detail ? [detail.title, ...detail.lines].join(". ") : ""}</div>
      {children}
    </div>
  );
}
