import { createServer, request as httpRequest } from "node:http";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

/**
 * Measures pages of a built site, one request at a time, against a read-only PostgREST on this computer (never production). Two parts:
 *
 *   node scripts/weightCrawl.ts proxy <port> <postgrest url>        logs every read the site makes; GET /__reset clears the log, GET /__dump reads it
 *   node scripts/weightCrawl.ts crawl <site url> <proxy url> <urls file> <csv file>
 *
 * Start the site with SPX_REST_URL set to the proxy's address, so each page's reads are counted. The urls file holds one path a line.
 * The CSV has, for each page: HTML bytes (raw and gzip), the bytes of the Next payload scripts, the time of the request, the reads the
 * site made while drawing it (and how many were the same read again) and the cache state the server reported.
 */

type Read = { path: string; ms: number; bytes: number };

function proxy(port: number, target: string) {
  const to = new URL(target);
  let log: Read[] = [];
  createServer((req, res) => {
    if (req.url === "/__reset") { log = []; res.end("ok"); return; }
    if (req.url === "/__dump") { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(log)); return; }
    const started = Date.now();
    const out = httpRequest({ host: to.hostname, port: to.port, path: req.url, method: req.method, headers: req.headers }, (back) => {
      let bytes = 0;
      back.on("data", (c: Buffer) => { bytes += c.length; });
      back.on("end", () => log.push({ path: `${req.method} ${req.url}${req.headers.range ? ` [${req.headers.range}]` : ""}`, ms: Date.now() - started, bytes }));
      res.writeHead(back.statusCode ?? 502, back.headers);
      back.pipe(res);
    });
    out.on("error", () => { res.statusCode = 502; res.end(); });
    req.pipe(out);
  }).listen(port, "127.0.0.1", () => console.log(`proxy on ${port} to ${target}`));
}

const payloadBytes = (html: string) => {
  let total = 0;
  for (const m of html.matchAll(/<script>self\.__next_f\.push\(([\s\S]*?)\)<\/script>/g)) total += m[1].length;
  return total;
};

async function crawl(site: string, proxyUrl: string, urlsFile: string, csv: string) {
  const paths = readFileSync(urlsFile, "utf8").split("\n").map((s) => s.trim()).filter((s) => s && !s.startsWith("#"));
  writeFileSync(csv, "path,status,html_bytes,gzip_bytes,payload_bytes,ms,reads,distinct_reads,repeated_reads,read_bytes,read_ms,cache\n");
  for (const path of paths) {
    try {
      await fetch(`${proxyUrl}/__reset`);
      const t0 = performance.now();
      const res = await fetch(`${site}${path}`, { headers: { "accept-encoding": "identity" }, redirect: "manual", signal: AbortSignal.timeout(120000) });
      const body = Buffer.from(await res.arrayBuffer());
      const ms = Math.round(performance.now() - t0);
      const reads = (await (await fetch(`${proxyUrl}/__dump`)).json()) as Read[];
      const distinct = new Set(reads.map((r) => r.path)).size;
      const text = body.toString("utf8");
      const html = /html/.test(res.headers.get("content-type") ?? "");
      const row = [path.includes(",") ? `"${path}"` : path, res.status, body.length, gzipSync(body).length, html ? payloadBytes(text) : 0, ms, reads.length, distinct, reads.length - distinct,
        reads.reduce((a, r) => a + r.bytes, 0), reads.reduce((a, r) => a + r.ms, 0), res.headers.get("x-nextjs-cache") ?? ""].join(",");
      appendFileSync(csv, `${row}\n`);
      console.log(row);
    } catch (e) {
      appendFileSync(csv, `${path},ERR,0,0,0,0,0,0,0,0,0,${String(e).replace(/,/g, ";")}\n`);
      console.log(`${path} ERR ${e}`);
    }
  }
}

const [, , mode, a, b, c, d] = process.argv;
if (mode === "proxy") proxy(Number(a), b);
else if (mode === "crawl") await crawl(a, b, c, d);
else console.log("usage: proxy <port> <postgrest url> | crawl <site> <proxy> <urls file> <csv>");
