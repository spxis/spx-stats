"""Fetch team pages and logo images from SportsLogos.Net, slowly, for the marks we lack. Never hotlinked: the bytes are kept for
legacy_files.raw_archive and served from our own files.

Terms (read 2026-10-15): they do not own the logos and grant no rights; research, educational and historical use; credit and link back to
SportsLogos.Net; no commercial use; no vector or high-resolution files supplied; robots.txt allows /logos/ and /teams/. spxn.com is non-commercial.

Usage:
  sportslogos_fetch.py leagues <out dir> <league id>...      the team list of each league  -> <out>/leagues/<id>.html, <out>/teams.json
  sportslogos_fetch.py teams <out dir> <team id>...          each team page (the logos on it) -> <out>/teams/<id>.html, <out>/logos.json
  sportslogos_fetch.py images <out dir> <logo key>...        the image of each logo (as shown on the team page: the 'thumbs' file)
                                                              -> <out>/img/<key>.<ext>, <out>/images.json (size, type, sha256)
One request at a time, never closer than PAUSE seconds (5 s is the rule; this uses 6), a User-Agent naming the project, Retry-After
honoured, and the run stops at the first 403. Only ask for pages and images of marks we lack."""
import hashlib, html, json, os, re, struct, sys, time, urllib.error, urllib.request

PAUSE = 6.0
UA = {"User-Agent": "spx-stats/1.0 (https://spxn.com; john@spxis.com)"}
BASE = "https://www.sportslogos.net"
_last = [0.0]


def fetch(url):
    for n in range(6):
        wait = _last[0] + PAUSE - time.time()
        if wait > 0:
            time.sleep(wait)
        _last[0] = time.time()
        print("GET", url, flush=True)
        try:
            r = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60)
            _last[0] = time.time()
            return r.read(), r.headers.get("content-type", "")
        except urllib.error.HTTPError as e:
            if e.code == 403:
                raise SystemExit("403 from SportsLogos.Net: stopping, not retrying")
            if e.code == 404:
                return None, ""
            if e.code not in (429, 503):
                raise
            time.sleep(int(e.headers.get("Retry-After") or 30) + 10 * n)
    raise SystemExit("gave up: " + url)


def load(path, default):
    return json.load(open(path)) if os.path.exists(path) else default


def dump(path, obj):
    json.dump(obj, open(path + ".tmp", "w"), indent=1, sort_keys=True)
    os.replace(path + ".tmp", path)


TEAM_LINK = re.compile(r'href="(/logos/list_by_team/(\d+)/([^"/]+)/?)"[^>]*>', re.I)
CARD = re.compile(r'<a href="(/logos/view/([A-Za-z0-9]+)/([^"/]+)/([^"/]+)/([^"/]+))"\s+title="([^"]+)"[^>]*>\s*<div[^>]*>\s*<img src="([^"]+)"', re.S)
TITLE = re.compile(r"\((?P<a>\d{4}) - (?P<b>\d{4})\)\s*$")


def parse_leagues(out):
    teams = load(f"{out}/teams.json", {})
    for fn in sorted(os.listdir(f"{out}/leagues")):
        lid = fn.split(".")[0]
        h = open(f"{out}/leagues/{fn}", encoding="utf8").read()
        title = re.search(r"<title>(.*?)</title>", h, re.S)
        for m in re.finditer(r'<a href="(/logos/list_by_team/(\d+)/([^"/]+)/?)"[^>]*?(?:title="([^"]*)")?[^>]*>', h):
            tid = m.group(2)
            name = html.unescape(m.group(4) or m.group(3).replace("-", " ")).strip()
            name = re.sub(r"\s+Logos?$", "", name)
            teams[tid] = {"id": int(tid), "league_id": int(lid), "slug": m.group(3), "name": name, "page": BASE + m.group(1)}
    dump(f"{out}/teams.json", teams)
    print(len(teams), "teams listed")


def parse_team(out, tid, body):
    h = body.decode("utf8", "replace")
    logos = load(f"{out}/logos.json", {})
    n = 0
    for m in CARD.finditer(h):
        path, key, slug, year, kind_slug, title, thumb = m.groups()
        t = TITLE.search(html.unescape(title))
        entry = {"key": key, "team_id": int(tid), "page": BASE + path, "title": html.unescape(title), "image": thumb,
                 "kind": re.sub(r"-Logo$", "", kind_slug).replace("-", " "),
                 "from": int(t.group("a")) if t else None, "to": int(t.group("b")) if t else None}
        logos[key] = entry
        n += 1
    dump(f"{out}/logos.json", logos)
    print("team", tid, ":", n, "logo cards")


def image_size(b):
    if b[:6] in (b"GIF87a", b"GIF89a"):
        return struct.unpack("<HH", b[6:10]), "image/gif"
    if b[:8] == b"\x89PNG\r\n\x1a\n":
        return struct.unpack(">II", b[16:24]), "image/png"
    if b[:2] == b"\xff\xd8":
        i = 2
        while i < len(b):
            if b[i] != 0xFF:
                break
            mk = b[i + 1]
            if 0xC0 <= mk <= 0xCF and mk not in (0xC4, 0xC8, 0xCC):
                h, w = struct.unpack(">HH", b[i + 5:i + 9])
                return (w, h), "image/jpeg"
            i += 2 + struct.unpack(">H", b[i + 2:i + 4])[0]
    return (None, None), None


def main(argv):
    cmd, out, args = argv[0], argv[1], argv[2:]
    for d in ("leagues", "teams", "img"):
        os.makedirs(f"{out}/{d}", exist_ok=True)
    if cmd == "leagues":
        for lid in args:
            if not os.path.exists(f"{out}/leagues/{lid}.html"):
                body, _ = fetch(f"{BASE}/teams/list_by_league/{lid}/")
                if body:
                    open(f"{out}/leagues/{lid}.html", "wb").write(body)
        parse_leagues(out)
    elif cmd == "teams":
        teams = load(f"{out}/teams.json", {})
        for tid in args:
            f = f"{out}/teams/{tid}.html"
            if not os.path.exists(f):
                slug = teams.get(tid, {}).get("slug", "x")
                body, _ = fetch(f"{BASE}/logos/list_by_team/{tid}/{slug}/")
                if not body:
                    print("no page for team", tid)
                    continue
                open(f, "wb").write(body)
            parse_team(out, tid, open(f, "rb").read())
    elif cmd == "images":
        logos = load(f"{out}/logos.json", {})
        meta = load(f"{out}/images.json", {})
        for key in args:
            if key in meta:
                continue
            url = logos[key]["image"]
            body, ctype = fetch(url)
            if not body:
                print("no image for", key)
                continue
            (w, h), mime = image_size(body)
            ext = {"image/gif": "gif", "image/png": "png", "image/jpeg": "jpg"}.get(mime or ctype, "bin")
            open(f"{out}/img/{key}.{ext}", "wb").write(body)
            meta[key] = {"file": f"img/{key}.{ext}", "bytes": len(body), "mime": mime or ctype, "width": w, "height": h,
                         "sha256": hashlib.sha256(body).hexdigest(), "from": url}
            dump(f"{out}/images.json", meta)
    else:
        raise SystemExit(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
