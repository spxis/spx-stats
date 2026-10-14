"""Polite HTTP for the MediaWiki Action API (en.wikipedia.org, www.wikidata.org) and the Wikidata Query Service.

Wikimedia etiquette: a descriptive User-Agent with the project's URL, one request at a time, a pause between requests (Throttle), `maxlag=5`
on the Action API, a wait of Retry-After on 429, 5xx and maxlag answers, doubling waits otherwise. `Api.get` returns the answer's bytes exactly as
received (they are archived as they came); a request that cannot succeed raises Permanent, one that kept failing raises Transient (the job is
tried again later, see queue.after_error). The transport, clock and sleep are parameters so the tests run with no network and no waiting.
"""
import gzip
import json
import time
import urllib.error
import urllib.parse
import urllib.request


class Transient(Exception):
    """The service did not answer properly after every try: ask again later."""


class Lagged(Transient):
    """The wiki asked us to wait (maxlag) on every try. Not a failure of the job: it is put back for a while without counting an attempt."""


class Permanent(Exception):
    """The request itself is refused (a 4xx other than 429): asking again will not help."""


def backoff_delay(attempt, retry_after=None, base=5.0, cap=300.0):
    """Seconds to wait before try number `attempt` + 1: base * 2^attempt up to cap, never less than the server's Retry-After (up to an hour)."""
    d = min(cap, base * (2 ** attempt))
    if retry_after:
        d = max(d, min(float(retry_after), 3600.0))
    return d


class Throttle:
    """At least `gap` seconds between the starts of two requests."""

    def __init__(self, gap, clock=time.monotonic, sleep=time.sleep):
        self.gap, self.clock, self.sleep, self.last = gap, clock, sleep, None

    def wait(self):
        if self.last is not None:
            w = self.gap - (self.clock() - self.last)
            if w > 0:
                self.sleep(w)
        self.last = self.clock()


def urllib_transport(url, headers, timeout):
    """-> (status, {lower-case header: value}, body bytes). HTTP errors are returned, not raised; network errors raise OSError."""
    req = urllib.request.Request(url, headers=dict(headers, **{"Accept-Encoding": "gzip"}))
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            status, hdr, body = r.status, {k.lower(): v for k, v in r.headers.items()}, r.read()
    except urllib.error.HTTPError as e:
        status, hdr, body = e.code, {k.lower(): v for k, v in (e.headers or {}).items()}, e.read()
    if hdr.get("content-encoding") == "gzip":
        body = gzip.decompress(body)
    return status, hdr, body


class Api:
    def __init__(self, base, gap, ua, maxlag=None, transport=urllib_transport, clock=time.monotonic, sleep=time.sleep,
                 max_tries=4, accept="application/json", timeout=120):
        self.base, self.ua, self.maxlag, self.transport = base, ua, maxlag, transport
        self.sleep, self.max_tries, self.accept, self.timeout = sleep, max_tries, accept, timeout
        self.throttle = Throttle(gap, clock, sleep)
        self.requests = 0          # requests sent, retries included
        self.bytes = 0
        self.last_status = None

    def get(self, params):
        """GET base?params -> body bytes. maxlag is added when the client was made with one."""
        p = dict(params)
        if self.maxlag is not None:
            p["maxlag"] = self.maxlag
        url = self.base + "?" + urllib.parse.urlencode(p)
        why = "no answer"
        for attempt in range(self.max_tries):
            self.throttle.wait()
            self.requests += 1
            try:
                status, hdr, body = self.transport(url, {"User-Agent": self.ua, "Accept": self.accept}, self.timeout)
            except (OSError, TimeoutError) as e:
                why = "network: %s" % e
                self.sleep(backoff_delay(attempt))
                continue
            self.last_status = status
            self.bytes += len(body)
            ra = hdr.get("retry-after")
            ra = float(ra) if ra and ra.replace(".", "", 1).isdigit() else None
            if status == 429 or status >= 500:
                why = "HTTP %d" % status
                self.sleep(backoff_delay(attempt, ra))
                continue
            if status >= 400:
                raise Permanent("HTTP %d for %s" % (status, self.base))
            if self.maxlag is not None and body[:20].lstrip().startswith(b'{"error"'):
                try:
                    err = json.loads(body).get("error", {})
                except ValueError:
                    err = {}
                if err.get("code") == "maxlag":
                    why = "maxlag"
                    self.sleep(backoff_delay(attempt, ra or err.get("lag")))
                    continue
            return body
        raise (Lagged if why == "maxlag" else Transient)("%s (%s)" % (why, self.base))
