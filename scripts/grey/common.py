#!/usr/bin/env python3
"""Shared parts of the fetchers for grey and green sources (standard library only): the polite request, the daily cap, the raw copy and SQL literals.

A fetcher built on this never sends a request that the registry (scripts/daily/sources.py) or the limiter (scripts/daily/limiter.py) would refuse:
  - the URL goes through sources.guard_url (a red or unknown host, the PWHL feed, a grey source used for anything but the daily job or a manual request),
  - a source in HOLDS is refused until a person removes it (its terms need John's decision),
  - the request takes a slot of the shared limiter (one at a time, `spacing` seconds apart, a queue when two jobs meet),
  - a grey source stops at its `daily_cap` requests a day (counted in a small file in the cache folder),
  - an identified User-Agent, a back-off on 429 and 5xx, and never a second try after a 403 or 404 (a blocked request is not worked around).
The raw answer is written byte for byte to <raw dir>/<source>/<day>/ with fetched.json (url, sha256, bytes, time) before anything is parsed; archiving it
into DS1 (scripts/archive_raw.py) and loading it is a step for the coordinating session. Credentials come from the environment, are never printed or stored.
"""
import hashlib, json, os, ssl, sys, time, urllib.error, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "daily"))
import limiter as LM, sources as SRC

UA = os.environ.get("SPX_GREY_UA", "spx-stats/1.0 (https://spxn.com; john@johnmorris.ca)")
_ca = os.environ.get("SSL_CERT_FILE")
CTX = ssl.create_default_context(cafile=_ca) if _ca and os.path.exists(_ca) else ssl.create_default_context()

# Sources whose own terms (read 2026-10-25) may bar what we would do; the fetcher refuses until John decides and this entry is removed.
HOLDS = {
    "fangraphs": "The FanGraphs Terms of Service (section 17) bar access other than through their own interface. John decides whether it is red.",
    "transfermarkt": "Its terms page is unread (bot challenge); a second-hand quote of section 11.1 bars bots, spiders and screen scraping. A person reads them and John decides before any request.",
    "cfl_api": "The API's public licence is non-commercial and share-alike, its key is for individuals, and the host does not resolve (2026-10-30). John decides whether it is red.",
    "ncaa_stats": "The NCAA.org terms (sections 4 and 9) bar robots, scraping and harvesting; stats.ncaa.org answers 403 to a plain request. John decides whether it is red.",
}


class Held(SRC.SourceRefused):
    pass


class CapReached(RuntimeError):
    pass


class Blocked(RuntimeError):
    """The site answered 401, 403 or 404: stop; a blocked request is never worked around."""


def cache_dir():
    d = os.environ.get("SPX_GREY_CACHE") or os.path.expanduser("~/Library/Caches/spx-stats-grey")
    os.makedirs(d, exist_ok=True)
    return d


def today():
    return time.strftime("%Y-%m-%d", time.gmtime())


class Fetcher:
    """One source, one purpose ("daily" or "manual"). `opener(req) -> (status, headers, body)` is replaceable for tests."""

    def __init__(self, source, purpose="manual", limiter=None, opener=None, state_dir=None, day=None, registry=None, holds=None):
        self.source, self.purpose, self.registry = source, purpose, registry
        self.limiter, self.opener = limiter, opener or _urlopen
        self.state_dir, self.day = state_dir or cache_dir(), day or today()
        self.holds = HOLDS if holds is None else holds
        self.requests = 0

    # ------------------------------------------------------------------ the daily cap
    def _count_path(self):
        return os.path.join(self.state_dir, "count-%s.json" % self.source)

    def used_today(self):
        try:
            with open(self._count_path(), encoding="utf-8") as f:
                d = json.load(f)
            return d["n"] if d.get("day") == self.day else 0
        except (OSError, ValueError, KeyError):
            return 0

    def _count(self):
        n = self.used_today() + 1
        with open(self._count_path(), "w", encoding="utf-8") as f:
            json.dump({"day": self.day, "n": n}, f)

    # ------------------------------------------------------------------ one request
    def check(self, url):
        """The registry entry for the URL, or an exception saying why the request may not go out."""
        if self.source in self.holds:
            raise Held(self.source, "on hold: " + self.holds[self.source])
        entry = SRC.guard_url(url, self.registry, self.purpose)
        if entry["id"] != self.source:
            raise SRC.SourceRefused(self.source, "the URL belongs to %s, not to this fetcher's source" % entry["id"])
        cap = entry.get("daily_cap")
        if cap and self.used_today() >= cap:
            raise CapReached("%s: %d requests today is the daily cap" % (self.source, cap))
        return entry

    def get(self, url, headers=None):
        """-> (status, body bytes). Raises Held, SourceRefused, CapReached or Blocked; retries 429 and 5xx three times with a growing pause."""
        self.check(url)
        lim = self.limiter or LM.default()
        delay = 5
        for attempt in range(4):
            self.requests += 1
            self._count()
            try:
                with lim.slot(self.source, url[:80], purpose=self.purpose):
                    status, hdr, body = self.opener(urllib.request.Request(url, headers=dict({"User-Agent": UA, "Accept-Encoding": "identity"}, **(headers or {}))))
            except (urllib.error.URLError, TimeoutError, ConnectionError):
                status, hdr, body = 599, {}, b""
            if status in (401, 403, 404):
                raise Blocked("%s answered %d for %s: stopped, no workaround" % (self.source, status, url.split("?")[0]))
            if status == 429 or status >= 500:
                if attempt == 3:
                    raise RuntimeError("%s: still %d after 4 tries" % (self.source, status))
                ra = hdr.get("Retry-After") if hdr else None
                lim.penalize(self.source, max(delay, int(ra) if ra and ra.isdigit() else 0), purpose=self.purpose)
                delay = min(delay * 2, 120)
                continue
            return status, body
        raise RuntimeError("unreachable")


def _urlopen(req):
    try:
        with urllib.request.urlopen(req, timeout=60, context=CTX) as r:
            return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers or {}), b""


# ---------------------------------------------------------------------- the raw copy

def save_raw(raw_dir, source, day, name, body, url):
    """Write the answer byte for byte and record it in fetched.json (the URL has its query cut: it may hold a key). -> path."""
    d = os.path.join(os.path.expanduser(raw_dir), source, day)
    os.makedirs(d, exist_ok=True)
    path = os.path.join(d, name)
    with open(path, "wb") as f:
        f.write(body)
    meta = os.path.join(d, "fetched.json")
    try:
        with open(meta, encoding="utf-8") as f:
            index = json.load(f)
    except (OSError, ValueError):
        index = {}
    index[name] = {"url": url.split("?")[0], "sha256": hashlib.sha256(body).hexdigest(), "bytes": len(body), "fetched_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())}
    with open(meta, "w", encoding="utf-8") as f:
        json.dump(index, f, indent=1, sort_keys=True)
    return path


# ---------------------------------------------------------------------- SQL

def lit(v):
    """A SQL literal: null, a number, a boolean or a quoted string."""
    if v is None or v == "":
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(v)
    return "'" + str(v).replace("'", "''") + "'"


def inserts(table, cols, rows, key):
    """Rerunnable load text: one insert per row that replaces a row with the same key (key: a tuple of column names)."""
    out = []
    for r in rows:
        vals = ", ".join(lit(r.get(c)) for c in cols)
        sets = ", ".join("%s = excluded.%s" % (c, c) for c in cols if c not in key)
        out.append("insert into %s (%s) values (%s) on conflict (%s) do update set %s;" % (table, ", ".join(cols), vals, ", ".join(key), sets))
    return "\n".join(out) + ("\n" if out else "")


def to_int(v):
    try:
        return int(str(v).strip())
    except (TypeError, ValueError):
        return None


def to_bool(v):
    if isinstance(v, bool):
        return v
    if v is None or v == "":
        return None
    return str(v).strip().lower() in ("1", "true", "yes", "y")
