// A look at new logo rows on the real pages before anything is on DS1: a pass-through to the DS1 preview PostgREST that swaps in the
// rows of a scratch database for api.team_brand (and, if given, api.logo_fit), and changes nothing else.
// Usage: node scripts/logos/preview_overlay.mjs <listen port> <upstream base, e.g. http://127.0.0.1:7750> <brand.json> [<fit.json>]
// brand.json: all the rows of each franchise it names (they replace the upstream rows of those franchises), in api.team_brand's shape
//   (league, franchise_id, brand_from, brand_to, primary_hex, secondary_hex, logo_url, logo_licence, logo_page, source, home_venue, latitude, longitude)
// fit.json:   api.logo_fit rows (logo_file, league, team, wordmark, mark_url, ..., bg, status, note) added to the upstream's, replacing the same logo_file.
// Run the site with SPX_REST_URL=http://127.0.0.1:<listen port>/. Read only: it never writes to the upstream. Stop it by its PID.
import { createServer, request } from "node:http";
import { readFileSync } from "node:fs";

const [port, upstream, brandFile, fitFile] = process.argv.slice(2);
if (!port || !upstream || !brandFile) throw new Error("usage: preview_overlay.mjs <port> <upstream> <brand.json> [<fit.json>]");
const extra = JSON.parse(readFileSync(brandFile, "utf8"));
const fits = fitFile ? JSON.parse(readFileSync(fitFile, "utf8")) : [];
const up = new URL(upstream);

createServer((req, res) => {
  const chunks = [];
  // The site reads a view page by page (Range header). For the two views it must see whole, ask upstream for every row, merge, then cut the page.
  const merged = /^\/(team_brand|logo_fit)(\?|$)/.test(req.url ?? "") && req.method === "GET";
  const range = /^(\d+)-(\d+)$/.exec(String(req.headers.range ?? ""));
  const fwd = { ...req.headers, host: up.host, "accept-encoding": "identity" };
  if (merged) { delete fwd.range; delete fwd["range-unit"]; }
  const pr = request({ host: up.hostname, port: up.port, path: req.url, method: req.method, headers: fwd }, (up2) => {
    up2.on("data", (c) => chunks.push(c));
    up2.on("end", () => {
      let body = Buffer.concat(chunks);
      const headers = { ...up2.headers };
      const get = req.method === "GET" && up2.statusCode === 200;
      if (get && /^\/team_brand(\?|$)/.test(req.url ?? "")) {
        const mine = new Set(extra.map((e) => e.franchise_id));
        const rows = JSON.parse(body.toString("utf8")).filter((row) => !mine.has(row.franchise_id));
        rows.push(...extra);
        rows.sort((a, b) => a.franchise_id - b.franchise_id || (a.brand_from ?? "").localeCompare(b.brand_from ?? ""));
        body = Buffer.from(JSON.stringify(rows));
        delete headers["content-range"];
      } else if (get && fits.length && /^\/logo_fit(\?|$)/.test(req.url ?? "")) {
        const mine = new Set(fits.map((f) => f.logo_file));
        const rows = JSON.parse(body.toString("utf8")).filter((row) => !mine.has(row.logo_file));
        rows.push(...fits);
        rows.sort((a, b) => a.logo_file.localeCompare(b.logo_file));
        body = Buffer.from(JSON.stringify(rows));
        delete headers["content-range"];
      }
      if (merged && range && up2.statusCode === 200) {
        const all = JSON.parse(body.toString("utf8"));
        const a = Number(range[1]), b = Number(range[2]);
        body = Buffer.from(JSON.stringify(all.slice(a, b + 1)));
        headers["content-range"] = `${a}-${Math.min(b, all.length - 1)}/${all.length}`;
      }
      headers["content-length"] = String(body.length);
      delete headers["content-encoding"];
      delete headers["transfer-encoding"];
      res.writeHead(up2.statusCode ?? 502, headers);
      res.end(body);
    });
  });
  pr.on("error", () => { res.writeHead(502); res.end(); });
  req.pipe(pr);
}).listen(Number(port), "127.0.0.1", () => console.log(`overlay on 127.0.0.1:${port} -> ${upstream}, ${extra.length} team_brand rows, ${fits.length} logo_fit rows`));
