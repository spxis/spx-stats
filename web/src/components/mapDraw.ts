import type { ChizuMap, MapBox } from "@johnmorrisdotca/chizu";

/* Shared by the small team map and the large map viewer: Chizu (MIT, https://github.com/johnmorrisdotca/chizu) from Natural Earth
   outlines (public domain), loaded only in the browser and only when a map is drawn. */

export interface Pin {
  f: number;
  name: string;
  /** The official abbreviation in use that season. */
  abbr?: string;
  lat: number;
  lon: number;
  venue?: string | null;
  /** City and state or province of the venue, e.g. "Detroit, MI". */
  place?: string | null;
  /** The venue's Wikipedia page and the team's address slug, for the team-season map's label and team choice. */
  wiki?: string | null;
  slug?: string;
  /** The team's page. */
  href?: string;
  /** For a pin that is itself a venue (`name` is the venue): the team that played there and its page. */
  team?: string;
  teamHref?: string;
  me?: boolean;
  /** The country of the point (US, CA, MX), for the state and province view. */
  cc?: string | null;
  /** Conference and division as their short names, for the filters. */
  conf?: string | null;
  div?: string | null;
  /** The club's logo for that season, shown in place of the dot when asked. */
  logo?: string | null;
}

/** The words a dot says: abbreviation, name, venue (or years) and place, as in its label and its tooltip. */
export const pinText = (t: Pin) => [t.abbr ? `${t.abbr} · ${t.name}` : t.name, t.venue, t.place].filter(Boolean).join(" · ");

/** What the selection panel shows for a dot: the team and its page, the venue and its Wikipedia article, and the rest as plain text. */
export function selectionOf(t: Pin): { team: string; teamHref?: string; venue?: string; wiki?: string | null; rest: string[] } {
  if (t.team) return { team: t.team, teamHref: t.teamHref, venue: t.name, wiki: t.wiki, rest: [t.venue, t.place].filter((x): x is string => !!x) };
  return { team: t.name, teamHref: t.href, venue: t.venue ?? undefined, wiki: t.wiki, rest: t.place ? [t.place] : [] };
}

export type Chizu = {
  WORLD: typeof import("@johnmorrisdotca/chizu/world").default;
  drawChizu: typeof import("@johnmorrisdotca/chizu/draw").drawChizu;
  projectPoint: typeof import("@johnmorrisdotca/chizu").projectPoint;
};
let lib: Promise<Chizu> | null = null;
export function chizu(): Promise<Chizu> {
  lib ??= Promise.all([import("@johnmorrisdotca/chizu/world"), import("@johnmorrisdotca/chizu/draw"), import("@johnmorrisdotca/chizu")]).then(
    ([world, draw, eng]) => ({ WORLD: world.default, drawChizu: draw.drawChizu, projectPoint: eng.projectPoint }),
  );
  return lib;
}

/** A country's states or provinces (Natural Earth admin-1), fetched the first time that country is shown. */
export function regionsOf(cc: "US" | "CA"): Promise<ChizuMap> {
  return (cc === "US" ? import("@johnmorrisdotca/chizu/divisions/us") : import("@johnmorrisdotca/chizu/divisions/ca")).then((m) => m.default as ChizuMap);
}

/** A window round the points, wider than tall, with room to spare; never smaller than a region. */
export function frame(pts: [number, number][], aspect: number, minW: number): MapBox {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  let w = Math.max(x1 - x0, minW) * 1.25, h = Math.max(y1 - y0, minW / aspect) * 1.25;
  if (w / h < aspect) w = h * aspect; else h = w / aspect;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return { x: cx - w / 2, y: cy - h / 2, width: w, height: h };
}

export const NS = "http://www.w3.org/2000/svg";

type Rect = [number, number, number, number];
const meets = (a: Rect, b: Rect) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

/** Small abbreviation labels beside the dots, where they fit: beside, then above or below; one that would cover a dot or another label is left off. */
export function abbreviationLabels(g: SVGGElement, pins: (Pin & { p: [number, number] })[], r: number, box: MapBox, clear = r) {
  const fs = r * 1.7;
  const dots: Rect[] = pins.map((t) => { const rr = t.me ? clear * 1.6 : clear; return [t.p[0] - rr, t.p[1] - rr, t.p[0] + rr, t.p[1] + rr]; });
  const taken: Rect[] = [];
  const order = [...pins].sort((a, b) => (b.me ? 1 : 0) - (a.me ? 1 : 0));
  for (const t of order) {
    if (!t.abbr) continue;
    const w = t.abbr.length * fs * 0.66, h = fs * 0.85, rr = (t.me ? clear * 1.6 : clear) + fs * 0.2;
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
    text.setAttribute("class", "pinab"); text.setAttribute("data-i", String(pins.indexOf(t))); text.setAttribute("style", `--fs:${fs}px`); text.setAttribute("font-size", String(fs));
    text.textContent = t.abbr;
    g.append(text);
  }
}
