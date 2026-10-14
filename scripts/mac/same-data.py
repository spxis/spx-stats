#!/usr/bin/env python3
"""Is the PostgREST that is about to feed a build serving the same data as production? Used by deploy-prebuilt.sh.

    python3 -I scripts/mac/same-data.py LOCAL_REST_URL PRODUCTION_REST_URL PRODUCTION_KEY

Compares two api views, read in full from both sides (a handful of requests to production, never a loop):
  data_version     the latest data release number (what the site footer shows)
  season_summary   one row per league and season with its game and team counts (a materialized view, so it also shows a stale refresh)
Exit code 0 the same, 1 different (the differences are printed), 2 one side could not be read.
A build from DS1 is only a faithful copy of production while DS1 has nothing production lacks (a release waiting for approval, scores
loaded since the last release) and DS1's materialized views are current; this is the cheap check for both.
"""
import json
import sys
import urllib.error
import urllib.request

VIEWS = (("data_version", "select=number"), ("season_summary", "select=*&order=league.asc,year.asc"))
PAGE = 1000


def read(base, view, query, key=None):
    rows = []
    for page in range(20):
        headers = {"Accept-Profile": "api", "Accept": "application/json", "Range": "%d-%d" % (page * PAGE, page * PAGE + PAGE - 1),
                   "User-Agent": "spx-stats-same-data/1"}
        if key:
            headers["apikey"] = key
        req = urllib.request.Request("%s%s?%s" % (base, view, query), headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                part = json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code == 416:
                break
            raise
        rows += part
        if len(part) < PAGE:
            break
    return rows


def main(argv):
    if len(argv) != 4:
        print(__doc__)
        return 2
    local, prod, key = argv[1], argv[2].rstrip("/") + "/", argv[3]
    local = local.rstrip("/") + "/"
    bad = 0
    for view, query in VIEWS:
        try:
            a = read(local, view, query)
        except Exception as e:  # noqa: BLE001
            print("same-data: could not read %s from the local PostgREST: %s" % (view, e))
            return 2
        try:
            b = read(prod, view, query, key)
        except Exception as e:  # noqa: BLE001
            print("same-data: could not read %s from production: %s" % (view, e))
            return 2
        if a == b:
            print("same-data: %s same (%d rows)" % (view, len(a)))
            continue
        bad = 1
        ka = {json.dumps(x, sort_keys=True) for x in a}
        kb = {json.dumps(x, sort_keys=True) for x in b}
        print("same-data: %s DIFFERS (DS1 %d rows, production %d rows)" % (view, len(a), len(b)))
        for tag, only in (("only on DS1", sorted(ka - kb)), ("only in production", sorted(kb - ka))):
            for row in only[:5]:
                print("  %s: %s" % (tag, row[:200]))
            if len(only) > 5:
                print("  ... %d more %s" % (len(only) - 5, tag))
    return bad


if __name__ == "__main__":
    sys.exit(main(sys.argv))
