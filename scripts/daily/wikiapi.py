#!/usr/bin/env python3
"""Polite client for the English Wikipedia MediaWiki API (CC BY-SA 4.0 text).

Follows the Wikimedia API etiquette: a descriptive User-Agent with contact details, one request at a time,
a pause between requests, `maxlag=5`, and a wait of Retry-After seconds on 429/5xx or a maxlag answer.

Every request goes through the shared limiter (limiter.py, sources.py): one request at a time for every job on the NAS, the pause between
requests from the registry, a queue when a scheduled run and an admin's request meet, and revision ids reused for a minute.

Two calls only:
  revisions(titles)  latest revision id + timestamp of up to 50 titles per request (cheap, no text)
  contents(titles)   latest wikitext of up to CONTENT_BATCH titles per request
Redirects are followed by the API (`redirects=1`) and mapped back to the title that was asked for.
"""
import json, os, ssl, sys, time, urllib.error, urllib.parse, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import limiter as LM, sources as SRC

UA = os.environ.get("SPX_WIKI_UA", "spx-stats/1.0 (https://spxn.com; john@spxis.com)")
API = "https://en.wikipedia.org/w/api.php"
GAP = float(os.environ.get("SPX_WIKI_GAP", "1.0"))      # seconds between requests
CONTENT_BATCH = 10                                      # titles per wikitext request (a few MB at most)
REV_BATCH = 50                                          # the API's limit for titles per request
_ca = os.environ.get("SSL_CERT_FILE")
CTX = ssl.create_default_context(cafile=_ca) if _ca and os.path.exists(_ca) else ssl.create_default_context()


class Client:
    def __init__(self, limiter=None, force=None):
        self.requests = 0
        self.log = []                 # (what, n titles) per request, for the run summary
        self.limiter, self.force = limiter, force

    def _lim(self):
        return self.limiter or LM.default()

    def _get(self, params, what, n):
        params = dict(params, format="json", formatversion="2", maxlag="5")
        url = API + "?" + urllib.parse.urlencode(params)
        delay = 5
        lim = self._lim()
        for _ in range(8):
            self.requests += 1
            self.log.append((what, n))
            try:
                with lim.slot("wikipedia", "%s x%d" % (what, n)):       # one request at a time, spaced; a back-off waits in the limiter, outside the slot
                    SRC.guard_url(url)
                    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "identity"})
                    with urllib.request.urlopen(req, timeout=60, context=CTX) as r:
                        d = json.loads(r.read().decode("utf-8"))
                        ra = r.headers.get("Retry-After")
            except urllib.error.HTTPError as e:
                ra = e.headers.get("Retry-After") if e.headers else None
                if e.code == 429 or e.code >= 500:
                    lim.penalize("wikipedia", max(delay, int(ra) if ra and ra.isdigit() else 0)); delay = min(delay * 2, 120); continue
                raise
            except (urllib.error.URLError, TimeoutError, ConnectionError):
                lim.penalize("wikipedia", delay); delay = min(delay * 2, 120); continue
            if "error" in d:
                if d["error"].get("code") == "maxlag":
                    lim.penalize("wikipedia", max(delay, int(ra) if ra and ra.isdigit() else 0)); delay = min(delay * 2, 120); continue
                raise RuntimeError("wikipedia api: " + json.dumps(d["error"])[:300])
            return d
        raise RuntimeError("giving up: wikipedia api not answering (" + what + ")")

    def _query(self, titles, rvprop, what):
        d = self._get({"action": "query", "prop": "revisions", "rvprop": rvprop, "rvslots": "main",
                       "titles": "|".join(titles), "redirects": "1"}, what, len(titles))
        q = d.get("query", {})
        hop = {}                                  # asked-for title -> final title
        for x in q.get("normalized", []): hop[x["from"]] = x["to"]
        for x in q.get("redirects", []): hop[x["from"]] = x["to"]
        pages = {p["title"]: p for p in q.get("pages", [])}
        out = {}
        for t in titles:
            f = t
            for _ in range(5):
                if f in hop: f = hop[f]
            p = pages.get(f)
            if p is None or p.get("missing") or not p.get("revisions"):
                out[t] = {"missing": True, "resolved": f}
                continue
            r = p["revisions"][0]
            out[t] = {"missing": False, "resolved": f, "revid": r["revid"], "timestamp": r["timestamp"],
                      "text": r.get("slots", {}).get("main", {}).get("content")}
        return out

    def revisions(self, titles):
        """Latest revision id of each title, 50 titles per request. A title asked about in the last minute (by any run) is not asked again."""
        out = {}
        for i in range(0, len(titles), REV_BATCH):
            batch = titles[i:i + REV_BATCH]
            got = self._lim().fetch_many("wikipedia", ["rev:" + t for t in batch],
                                         lambda keys: {"rev:" + t: v for t, v in self._query([k[4:] for k in keys], "ids|timestamp", "revisions").items()},
                                         force=self.force)
            for t in batch: out[t] = got["rev:" + t]
        return out

    def contents(self, titles):
        out = {}
        for i in range(0, len(titles), CONTENT_BATCH):
            out.update(self._query(titles[i:i + CONTENT_BATCH], "ids|timestamp|content", "content"))
        return out


# ---- state file: the revision id of every page as last downloaded ----

def load_state(path):
    try:
        with open(path, encoding="utf-8") as f: return json.load(f)
    except (OSError, ValueError):
        return {"pages": {}}


def save_state(path, state):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f: json.dump(state, f, indent=1, sort_keys=True, ensure_ascii=False)
    os.replace(tmp, path)


if __name__ == "__main__":
    c = Client()
    print(json.dumps(c.revisions(sys.argv[1:]), indent=1, ensure_ascii=False))
