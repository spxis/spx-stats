#!/usr/bin/env python3
"""Fetch the NHL, NBA and CFL club-season articles of English Wikipedia (CC BY-SA 4.0) for their infobox
head coach, captain and alternate captain.

Titles come from the database named by the PG* variables (core.team_season, api.team_name; NBA and CFL use the
page titles of legacy_wikipedia_nba/cfl where they match). Pages are read through the MediaWiki API, 25 titles per
request, one request every 2 seconds, with a descriptive User-Agent. Each answer is saved as served under
RAW/batch/NNNN.json; manifest.jsonl records sha256, titles and revision ids. A title already in a saved batch (as served, or as the redirect it was asked under) is not refetched.

Usage: fetch_wikipedia.py [--raw DIR] [--leagues nhl,nba,cfl]
"""
import argparse, datetime, glob, hashlib, json, os, subprocess, sys, time, urllib.error, urllib.parse, urllib.request

UA = "spx-stats/0.1 (https://github.com/spxis/spx-stats; john@spxis.com)"
API = "https://en.wikipedia.org/w/api.php"
GAP, BATCH = 2.0, 25

TARGETS = """
select s.league_code, ts.team_season_id, s.start_year,
  coalesce((select case when count(*) = 1 then max(t.page_title) end from legacy_wikipedia_nba.team_season t
            where s.league_code = 'nba' and t.season = s.start_year and (t.team_name = api.team_name(ts.team_season_id) or t.team_name like api.team_name(ts.team_season_id) || ' %')),
           (select case when count(*) = 1 then max(t.page_title) end from legacy_wikipedia_cfl.team_season t
            where s.league_code = 'cfl' and t.season = s.start_year and (t.team_name = api.team_name(ts.team_season_id) or t.team_name like api.team_name(ts.team_season_id) || ' %')),
           case when s.league_code = 'cfl' then s.start_year || ' ' || translate(api.team_name(ts.team_season_id), chr(233), 'e') || ' season'
                else s.start_year || chr(8211) || case when s.start_year = 1999 then '2000' else lpad(((s.start_year + 1) % 100)::text, 2, '0') end || ' '
                     || replace(translate(api.team_name(ts.team_season_id), chr(233) || chr(232), 'ee'), case when s.league_code = 'nhl' and s.start_year < 1986 then 'Blackhawks' else '-' end,
                                case when s.league_code = 'nhl' and s.start_year < 1986 then 'Black Hawks' else '-' end) || ' season' end)
from core.team_season ts join core.season s using (season_id)
where s.league_code = any(string_to_array('LEAGUES', ',')) order by 1, 3, 2
"""

def targets(leagues):
    p = subprocess.run(["psql", "-X", "-AtF", "\t", "-v", "ON_ERROR_STOP=1", "-c", TARGETS.replace("LEAGUES", leagues)],
                       capture_output=True, text=True)
    if p.returncode: sys.exit(p.stderr)
    return [l.split("\t") for l in p.stdout.splitlines()]

def get(titles):
    q = urllib.parse.urlencode({"action": "query", "format": "json", "formatversion": 2, "redirects": 1, "prop": "revisions",
                                "rvprop": "ids|content", "rvslots": "main", "titles": "|".join(titles)})
    delay = 10
    for _ in range(8):
        try:
            with urllib.request.urlopen(urllib.request.Request(API + "?" + q, headers={"User-Agent": UA}), timeout=90) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            if e.code == 429 or e.code >= 500: time.sleep(delay); delay = min(delay * 2, 300); continue
            raise
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            time.sleep(delay); delay = min(delay * 2, 300)
    raise RuntimeError("giving up")

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", default=os.path.expanduser("~/spx-raw/wikipedia_staff/" + datetime.date.today().isoformat()))
    ap.add_argument("--leagues", default="nhl,nba,cfl")
    ap.add_argument("--extra", default="", help="more page titles, separated by |, fetched as well (franchise lists of head coaches)")
    a = ap.parse_args()
    os.makedirs(a.raw + "/batch", exist_ok=True)
    rows = targets(a.leagues)
    with open(a.raw + "/targets.tsv", "w") as f: f.write("".join("\t".join(r) + "\n" for r in rows))
    have, nxt = set(), 0
    for f in glob.glob(a.raw + "/batch/*.json"):
        nxt = max(nxt, int(os.path.basename(f)[:4]) + 1)
        q = json.load(open(f)).get("query", {})
        have |= {p["title"] for p in q.get("pages", [])} | {r["from"] for r in q.get("normalized", []) + q.get("redirects", [])}
    titles = sorted(({r[3] for r in rows} | set(filter(None, a.extra.split("|")))) - have)
    last = 0.0
    for i in range(0, len(titles), BATCH):
        path = f"{a.raw}/batch/{nxt + i // BATCH:04d}.json"
        time.sleep(max(0, GAP - (time.time() - last))); last = time.time()
        body = get(titles[i:i + BATCH])
        open(path, "wb").write(body)
        pages = json.loads(body).get("query", {}).get("pages", [])
        with open(a.raw + "/manifest.jsonl", "a") as m:
            m.write(json.dumps({"file": os.path.basename(path), "sha256": hashlib.sha256(body).hexdigest(), "bytes": len(body),
                                "fetched": datetime.datetime.now(datetime.UTC).isoformat(timespec="seconds"),
                                "pages": [{"title": p["title"], "revid": (p.get("revisions") or [{}])[0].get("revid"), "missing": bool(p.get("missing"))} for p in pages]}) + "\n")
        print(path, len(body), flush=True)

if __name__ == "__main__":
    main()
