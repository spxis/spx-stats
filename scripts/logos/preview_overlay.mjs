// A look at new logo rows on the real pages before anything is on DS1: a pass-through to the DS1 preview PostgREST that adds the
// rows of a scratch database to the answer for api.team_brand, and changes nothing else.
// Usage: node scripts/logos/preview_overlay.mjs <listen port> <upstream base, e.g. http://127.0.0.1:7750> <extra.json>
// extra.json: all the rows of each franchise it names (they replace the upstream rows of those franchises), in the rows in api.team_brand's shape (league, franchise_id, brand_from, brand_to, primary_hex, secondary_hex, logo_url,
// logo_licence, logo_page, source, home_venue, latitude, longitude). Run the site with SPX_REST_URL=http://127.0.0.1:<listen port>/.
// Read only: it never writes to the upstream. Stop it by its PID.
import { createServer, request } from "node:http";
import { readFileSync } from "node:fs";

const [port, upstream, extraFile] = process.argv.slice(2);
if (!port || !upstream || !extraFile) throw new Error("usage: preview_overlay.mjs <port> <upstream> <extra.json>");
const extra = JSON.parse(readFileSync(extraFile, "utf8"));
const up = new URL(upstream);

createServer((req, res) => {
  const chunks = [];
  const pr = request({ host: up.hostname, port: up.port, path: req.url, method: req.method, headers: { ...req.headers, host: up.host, "accept-encoding": "identity" } }, (r) => {
    r.on("data", (c) => chunks.push(c));
    r.on("end", () => {
      let body = Buffer.concat(chunks);
      const headers = { ...r.headers };
      if (req.method === "GET" && /^\/team_brand(\?|$)/.test(req.url ?? "") && r.statusCode === 200) {
        const mine = new Set(extra.map((e) => e.franchise_id));
        const rows = JSON.parse(body.toString("utf8")).filter((r) => !mine.has(r.franchise_id));
        rows.push(...extra);
        rows.sort((a, b) => a.franchise_id - b.franchise_id || (a.brand_from ?? "").localeCompare(b.brand_from ?? ""));
        body = Buffer.from(JSON.stringify(rows));
        delete headers["content-range"];
      }
      headers["content-length"] = String(body.length);
      delete headers["content-encoding"];
      delete headers["transfer-encoding"];
      res.writeHead(r.statusCode ?? 502, headers);
      res.end(body);
    });
  });
  pr.on("error", () => { res.writeHead(502); res.end(); });
  req.pipe(pr);
}).listen(Number(port), "127.0.0.1", () => console.log(`overlay on 127.0.0.1:${port} -> ${upstream}, ${extra.length} extra team_brand rows`));
