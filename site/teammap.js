/* Team maps, drawn with Chizu (MIT, https://github.com/johnmorrisdotca/chizu) from Natural Earth
   outlines (public domain). A small map on a team page marks its home; pressing it opens a large
   map of every team in the league that season. Loaded only when a page has coordinates to show. */
const CZ = 'https://cdn.jsdelivr.net/npm/@johnmorrisdotca/chizu@1.4.0/dist/';
let lib = null;
async function chizu() {
  if (!lib) {
    const [world, draw, eng] = await Promise.all([import(CZ + 'world-entry.js'), import(CZ + 'draw-entry.js'), import(CZ + 'index.js')]);
    lib = { WORLD: world.default, drawChizu: draw.drawChizu, projectPoint: eng.projectPoint };
  }
  return lib;
}

// A window round the points, wider than tall, with room to spare; never smaller than a region.
function frame(pts, aspect, minW) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  let w = Math.max(x1 - x0, minW) * 1.25, h = Math.max(y1 - y0, minW / aspect) * 1.25;
  if (w / h < aspect) w = h * aspect; else h = w / aspect;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return { x: cx - w / 2, y: cy - h / 2, width: w, height: h };
}

const tonesFor = (codes) => Object.fromEntries(codes.map((c) => [c, 'faint']));

// teams: [{ f, name, lat, lon, href, me }]; returns an element, or null when nothing can be placed.
export async function drawTeamMap(teams, { big = false, title = '' } = {}) {
  const { WORLD, drawChizu, projectPoint } = await chizu();
  const placed = teams.map((t) => ({ ...t, p: projectPoint(WORLD, Number(t.lon), Number(t.lat)) })).filter((t) => t.p);
  if (!placed.length) return null;
  const focus = big ? placed : placed.filter((t) => t.me);
  const box = frame((focus.length ? focus : placed).map((t) => t.p), big ? 1.7 : 1.4, big ? 60 : 90);
  const host = document.createElement('div');
  host.className = 'teammap' + (big ? ' big' : '');
  host.innerHTML = drawChizu(WORLD, { box, tones: tonesFor(['US', 'CA', 'MX']), language: 'en', style: true });
  const svg = host.querySelector('svg');
  if (!svg) return null;
  svg.setAttribute('aria-label', title || 'Map of team locations');
  const r = box.width / (big ? 140 : 40);
  const NS = 'http://www.w3.org/2000/svg';
  const g = document.createElementNS(NS, 'g');
  g.setAttribute('class', 'pins');
  for (const t of placed.sort((a, b) => (a.me ? 1 : 0) - (b.me ? 1 : 0))) {
    const a = document.createElementNS(NS, 'a');
    if (big && t.href) a.setAttribute('href', t.href);
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', t.p[0]); c.setAttribute('cy', t.p[1]); c.setAttribute('r', t.me ? r * 1.6 : r);
    c.setAttribute('class', t.me ? 'pin me' : 'pin');
    const ti = document.createElementNS(NS, 'title'); ti.textContent = t.name + (t.venue ? ` · ${t.venue}` : '');
    c.append(ti); a.append(c); g.append(a);
  }
  svg.append(g);
  return host;
}
