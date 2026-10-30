"""Pre-render the site's team logos into small files it serves itself (docs/logos-serving.md, ticket cmv99sy290000l606fpdcpjf4).

For every logo address the site's public API names (api.team_brand.logo_url and the marks in api.logo_fit) this writes, into <web dir>/public/team-logos/:
  <hash>-<tag>-<24|48|96>.webp   the logo contained in a box of that edge (and at most 2.4x as wide), never enlarged
  <hash>-<tag>.svg               a Commons SVG of under 3 KB, unchanged (the real mark; nothing is vectorised)
  manifest.json                  hash -> [tag, ext, largest tier]; next.config.ts reads it into SPX_LOGO_FILES, web/src/lib/logoFiles.ts picks the file
<hash> is FNV-1a (32 bit) of the logo's key ("commons:File.svg", "en:File.svg", "sl:5044.gif", same as web/src/lib/logoFit.ts logoKey), <tag> is
the first 6 hex digits of sha256(source bytes + RENDER_VERSION), so the files can be cached forever. The files are not committed to git (web/.gitignore):
scripts/mac/lib/hosted-logos.sh runs this before the build in deploy-prebuilt.sh and ds1-preview.sh.

Sources, in order of what is read: the source cache (<library>/render-src/, outside the repository, default ~/Projects/backups/spx-stats/logo-library),
then for a SportsLogos.Net mark the file export_hosted.py wrote under public/team-logos/sl/, else Wikimedia: the 250 px thumbnail (the size the site already
hot-links; the 120 px one it names, or the original, when a 250 px one does not exist), fetched one request at a time, PAUSE seconds apart, with the project
User-Agent, and kept in the cache so the next run makes no request. A logo whose source cannot be had is left out of the manifest and keeps its hot link.
Nothing here writes DS1 or production: the API is read with GET only.

Usage: render_site.py [--web DIR] [--rest URL] [--library DIR] [--offline] [--dry-run]
  --rest      read-only PostgREST of the api schema (default $SPX_REST_URL, else http://127.0.0.1:7750/)
  --offline   never fetch: a logo whose source is not in the cache is left out
Needs Pillow with WebP (python3 -m venv ~/.cache/spx-stats/logo-venv && ~/.cache/spx-stats/logo-venv/bin/pip install pillow).
Exit codes: 0 done (also when some logos were left out, listed), 1 an error that makes the output unusable."""
import argparse, hashlib, io, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path

RENDER_VERSION = "1"          # bump to re-tag every file after changing how they are made
TIERS = (24, 48, 96)          # keep in step with LOGO_TIERS in web/src/lib/logoFiles.ts
WIDE = 2.4                    # keep in step with WIDE there and with --wmax in web/src/components/teamlogo.css
SVG_MAX = 3000                # a Commons SVG up to this size is copied as it is
PAUSE = 1.5                   # seconds between two requests to Wikimedia (AGENTS.md section 9)
MAX_SOURCE = 4_000_000        # a source file larger than this is never taken
UA = {"User-Agent": "spx-stats/1.0 (https://spxn.com; john@spxis.com)"}
OUT = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{6}(?:-\d+)?\.(?:webp|svg)$")
WM = re.compile(r"^https://(?:upload|thumb)\.wikimedia\.org/wikipedia/([^/]+)/(thumb/)?([0-9a-f])/([0-9a-f]{2})/([^/?]+)")
KEY = re.compile(r"/wikipedia/([^/]+)/(?:thumb/)?[0-9a-f]/[0-9a-f]{2}/([^/?]+)")
SL = re.compile(r"^/team-logos/sl/([^/?]+)$")
UNSAFE_SVG = re.compile(rb"<script|<foreignObject|<image|<iframe|<use[^>]+href=[\"'](?!#)|\son[a-z]+\s*=|javascript:|<!ENTITY|@import", re.I)


def logo_key(url):
    """The same as logoKey in web/src/lib/logoFit.ts."""
    if not url:
        return None
    m = KEY.search(url)
    if m:
        return f"{m.group(1)}:{m.group(2)}"
    m = SL.match(url)
    return f"sl:{m.group(1)}" if m else None


def logo_hash(key):
    """The same as logoHash in web/src/lib/logoFiles.ts: FNV-1a, 32 bit, over the UTF-8 bytes."""
    h = 0x811C9DC5
    for b in key.encode("utf-8"):
        h = ((h ^ b) * 0x01000193) & 0xFFFFFFFF
    return f"{h:08x}"


def tag_of(data):
    return hashlib.sha256(data + b"|" + RENDER_VERSION.encode()).hexdigest()[:6]


def tier_dims(w, h, tier):
    """The size of an (w x h) logo contained in a tier box at most WIDE times as wide, never enlarged."""
    s = min(1.0, tier / h, tier * WIDE / w)
    return max(1, round(w * s)), max(1, round(h * s))


# ---- reading the API ------------------------------------------------------------------------------------------------------------------

def rest_get(base, path):
    rows, off = [], 0
    while True:
        req = urllib.request.Request(base.rstrip("/") + "/" + path, headers={"Accept-Profile": "api", "Range-Unit": "items", "Range": f"{off}-{off + 999}", **UA})
        with urllib.request.urlopen(req, timeout=60) as r:
            page = json.load(r)
        rows += page
        if len(page) < 1000:
            return rows
        off += 1000


def logo_urls(base):
    """Every logo address the public pages draw, by key: {key: [url, ...]}."""
    urls = [r["logo_url"] for r in rest_get(base, "team_brand?select=logo_url&logo_url=not.is.null&order=league,franchise_id,brand_from,brand_to,logo_url,source")]
    urls += [r["mark_url"] for r in rest_get(base, "logo_fit?select=mark_url&mark_url=not.is.null&status=neq.rejected&order=logo_file")]
    by_key = {}
    for u in urls:
        k = logo_key(u)
        if k and u not in by_key.setdefault(k, []):
            by_key[k].append(u)
    return by_key


# ---- finding the source bytes ---------------------------------------------------------------------------------------------------------

class Fetcher:
    def __init__(self, offline):
        self.offline, self.last, self.requests = offline, 0.0, 0

    def get(self, url):
        """The bytes at url, or None (404, 400, a refusal, or --offline). One at a time, PAUSE apart, Retry-After honoured."""
        if self.offline:
            return None
        for attempt in range(4):
            wait = self.last + PAUSE - time.monotonic()
            if wait > 0:
                time.sleep(wait)
            self.last = time.monotonic()
            self.requests += 1
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r:
                    data = r.read(MAX_SOURCE + 1)
                return data if 0 < len(data) <= MAX_SOURCE else None
            except urllib.error.HTTPError as e:
                if e.code in (429, 500, 502, 503, 504) and attempt < 3:
                    try:
                        time.sleep(min(60, int(e.headers.get("Retry-After", "5"))))
                    except ValueError:
                        time.sleep(5)
                    continue
                return None
            except (urllib.error.URLError, TimeoutError):
                if attempt < 3:
                    time.sleep(5)
                    continue
                return None
        return None


def wiki_candidates(urls):
    """Wikimedia addresses to try for one logo, best first: the standard 250 px thumbnail, then the largest thumbnail the site names, then the original
    (the first fails with a 400 for a file smaller than 250 px, and the next is tried)."""
    m = next((m for m in map(WM.match, urls) if m), None)
    if not m:
        return []
    wiki, _thumb, a, ab, name = m.groups()
    base = f"https://upload.wikimedia.org/wikipedia/{wiki}"
    out = [f"{base}/thumb/{a}/{ab}/{name}/250px-{name}" + (".png" if name.lower().endswith(".svg") else "")]
    named = []
    for u in urls:
        w = re.search(r"/(\d+)px-[^/?]+", u)
        if w and "/thumb/" in u:
            named.append((int(w.group(1)), u.split("?")[0].replace("https://thumb.wikimedia.org", "https://upload.wikimedia.org")))
    for _w, u in sorted(named, reverse=True):
        if u not in out:
            out.append(u)
    out.append(f"{base}/{a}/{ab}/{name}")
    return out


def is_svg(data):
    return b"<svg" in data[:4096].lower()


def source_for(key, urls, web, cache, fetcher):
    """(bytes, how) for one logo, or (None, why). SVG sources of a Commons file are the original when small and safe, else the 250 px render."""
    h = logo_hash(key)
    if key.startswith("sl:"):
        path = web / "public" / "team-logos" / "sl" / key[3:]
        if path.is_file():
            return path.read_bytes(), "sl"
        return None, f"{path} is missing (run export_hosted.py first)"
    cached = sorted(cache.glob(f"{h}.*"))
    if cached:
        return cached[0].read_bytes(), "cache"
    cands = wiki_candidates(urls)
    if not cands:
        return None, "no Wikimedia address"
    want_svg = key.lower().endswith(".svg")
    order = [cands[-1]] + cands[:-1] if want_svg else cands   # an SVG: look at the original first, to keep a small one as it is
    for url in order:
        data = fetcher.get(url)
        if data is None:
            continue
        if want_svg and url == cands[-1]:
            if is_svg(data) and len(data) <= SVG_MAX and not UNSAFE_SVG.search(data):
                return data, url
            continue
        if is_svg(data):
            continue    # a thumbnail address must give a raster
        return data, url
    return None, "no source could be fetched" + (" (offline)" if fetcher.offline else "")


# ---- rendering ----------------------------------------------------------------------------------------------------------------------

def render(data):
    """{tier: webp bytes} for a raster logo, the tiers whose box the source can fill without being enlarged (always at least the first)."""
    from PIL import Image, ImageDraw
    im = Image.open(io.BytesIO(data))
    gif = im.format == "GIF"
    im.seek(0)
    im = im.convert("RGBA")
    if gif:
        im = clear_white_box(im, ImageDraw)
    w, h = im.size
    out, last = {}, None
    for tier in TIERS:
        dims = tier_dims(w, h, tier)
        if dims == last:
            break
        last = dims
        small = im if dims == (w, h) else im.resize(dims, Image.LANCZOS)
        out[tier] = best_webp(small)
    return out


def clear_white_box(im, ImageDraw):
    """A GIF drawn on an opaque flat white background: make the white that touches the edge transparent. Anything else is returned as it is."""
    w, h = im.size
    corners = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
    if not all(im.getpixel(c)[3] == 255 and min(im.getpixel(c)[:3]) >= 250 for c in corners):
        return im
    im = im.copy()
    for c in corners:
        if im.getpixel(c)[3] == 255:
            ImageDraw.floodfill(im, c, (255, 255, 255, 0), thresh=12)
    return im


def best_webp(im):
    """The smaller of a lossy and a lossless WebP: flat logos are often smaller lossless."""
    best = None
    for kw in ({"quality": 82, "method": 6}, {"lossless": True, "method": 6}):
        buf = io.BytesIO()
        im.save(buf, "WEBP", **kw)
        if best is None or len(buf.getvalue()) < len(best):
            best = buf.getvalue()
    return best


# ---- main ---------------------------------------------------------------------------------------------------------------------------

def build(by_key, web, library, offline, dry_run):
    cache = library / "render-src"
    if not dry_run:
        cache.mkdir(parents=True, exist_ok=True)
    fetcher = Fetcher(offline)
    seen = {}
    for k in by_key:
        h = logo_hash(k)
        if h in seen:
            raise SystemExit(f"render_site: {k} and {seen[h]} have the same hash {h}: change logo_hash on both sides")
        seen[h] = k
    files, manifest, left_out = {}, {}, []
    for key in sorted(by_key):
        h = logo_hash(key)
        data, how = source_for(key, by_key[key], web, cache, fetcher)
        if data is None:
            left_out.append((key, how))
            continue
        if how not in ("cache", "sl") and not dry_run:
            (cache / f"{h}.{'svg' if is_svg(data) else 'src'}").write_bytes(data)
        tag = tag_of(data)
        if is_svg(data):
            if len(data) > SVG_MAX or UNSAFE_SVG.search(data):
                left_out.append((key, "a cached SVG that is large or unsafe"))
                continue
            files[f"{h}-{tag}.svg"] = data
            manifest[h] = [tag, "svg", 0]
            continue
        try:
            tiers = render(data)
        except Exception as e:  # a file Pillow cannot read: keep the hot link
            left_out.append((key, f"cannot be read as an image ({type(e).__name__})"))
            continue
        for tier, blob in tiers.items():
            files[f"{h}-{tag}-{tier}.webp"] = blob
        manifest[h] = [tag, "webp", max(tiers)]
    if dry_run:
        print(f"dry run: {len(manifest)} logos would be written ({sum(len(b) for b in files.values())} bytes in {len(files)} files); {len(left_out)} left out")
        return manifest, files, left_out, fetcher
    dest = web / "public" / "team-logos"
    dest.mkdir(parents=True, exist_ok=True)
    for old in dest.iterdir():
        if old.is_file() and OUT.match(old.name) and old.name not in files:
            old.unlink()
    for name, blob in files.items():
        (dest / name).write_bytes(blob)
    (dest / "manifest.json").write_text(json.dumps({"v": 1, "files": manifest}, separators=(",", ":"), sort_keys=True) + "\n")
    return manifest, files, left_out, fetcher


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    root = Path(__file__).resolve().parents[2]
    ap.add_argument("--web", default=str(root / "web"))
    ap.add_argument("--rest", default=os.environ.get("SPX_REST_URL") or "http://127.0.0.1:7750/")
    ap.add_argument("--library", default=os.environ.get("SPX_LOGO_LIBRARY") or str(Path.home() / "Projects/backups/spx-stats/logo-library"))
    ap.add_argument("--offline", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args(argv)
    try:
        import PIL  # noqa: F401
        from PIL import features
        if not features.check("webp"):
            raise ImportError("Pillow has no WebP support")
    except ImportError as e:
        raise SystemExit(f"render_site: {e}. Run: python3 -m venv ~/.cache/spx-stats/logo-venv && ~/.cache/spx-stats/logo-venv/bin/pip install pillow")
    try:
        by_key = logo_urls(a.rest)
    except (urllib.error.URLError, OSError, ValueError) as e:
        raise SystemExit(f"render_site: could not read the logo addresses from {a.rest}: {e}")
    if not by_key:
        raise SystemExit(f"render_site: {a.rest} named no logos; refusing to write an empty set")
    manifest, files, left_out, fetcher = build(by_key, Path(a.web), Path(os.path.expanduser(a.library)), a.offline, a.dry_run)
    total = sum(len(b) for b in files.values())
    print(f"render_site: {len(manifest)} of {len(by_key)} logos, {len(files)} files, {total} bytes; {fetcher.requests} requests to Wikimedia")
    for key, why in left_out:
        print(f"  left out (keeps its hot link): {key}: {why}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
