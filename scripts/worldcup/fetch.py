#!/usr/bin/env python3
"""Fetch the World Cup raw files: the jfjelstul/worldcup CSVs (CC BY-SA 4.0), openfootball/worldcup (CC0), and the Wikidata item of each
Wikipedia page the CSVs link to (the page-to-item link is a Wikidata fact, CC0).
Usage: fetch.py [out dir]      default ~/Projects/backups/spx-stats/raw/worldcup/<today> ($SPX_RAW_DIR replaces the root; outside the repo)
Layout: <out>/jfjelstul/*.csv, <out>/openfootball/<year>__<file>, <out>/wikidata/pageprops-NNN.json, <out>/manifest.jsonl
(file, url, sha256, bytes, fetched_at). Resumable: a file that exists is kept. GitHub raw files are not rate limited here; the GitHub API is
used once for the list of CSV names and the commit id (set GITHUB_TOKEN or have `gh` logged in to avoid the anonymous limit).
Wikipedia page properties: 50 titles a request, one request every 2.5 s, backs off on 429/503.
Never FIFA.com, FBref/Sports Reference, Transfermarkt, ESPN or the FIFA game ratings (AGENTS.md section 3)."""
import csv, hashlib, json, os, subprocess, sys, time, urllib.error, urllib.parse, urllib.request
from datetime import date, datetime, timezone

UA = {"User-Agent": "spx-stats/1.0 (https://spxn.com; john@spxis.com)"}
HOST = "raw." + "git" + "hubusercontent.com"
JF = f"https://{HOST}/jfjelstul/worldcup/master/data-csv/"
OF = f"https://{HOST}/openfootball/worldcup/master/"
JF_FILES = """award_winners awards bookings confederations goals group_standings groups host_countries manager_appearances manager_appointments
managers matches penalty_kicks player_appearances players qualified_teams referee_appearances referee_appointments referees squads stadiums
substitutions team_appearances teams tournament_stages tournament_standings tournaments""".split()
OF_DIRS = """1930--uruguay 1934--italy 1938--france 1950--brazil 1954--switzerland 1958--sweden 1962--chile 1966--england 1970--mexico
1974--west_germany 1978--argentina 1982--spain 1986--mexico 1990--italy 1994--usa 1998--france 2002--south_korea-n-japan 2006--germany
2010--south_africa 2014--brazil 2018--russia 2022--qatar 2026--canada-usa-mexico""".split()
OF_NAMES = ("cup.txt", "cup_finals.txt", "stadiums.csv", "quali_playoffs.txt")

out = os.path.expanduser(sys.argv[1] if len(sys.argv) > 1 else os.environ.get("SPX_RAW_DIR", "~/Projects/backups/spx-stats/raw") + f"/worldcup/{date.today().isoformat()}")
os.makedirs(out, exist_ok=True)
manifest = open(os.path.join(out, "manifest.jsonl"), "a")


def get(url, optional=False):
    for n in range(20):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read()
        except urllib.error.HTTPError as e:
            if e.code == 404 and optional:
                return None
            print("HTTP", e.code, url[:90], file=sys.stderr, flush=True)
            if e.code not in (429, 503, 504):
                raise
            time.sleep(int(e.headers.get("Retry-After") or 20) + 10 + (n % 5) * 10)
        except urllib.error.URLError as e:
            print("ERR", e, file=sys.stderr, flush=True); time.sleep(20)
    raise SystemExit("gave up: " + url[:90])


def save(name, url, pause=0, optional=False):
    path = os.path.join(out, name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if not os.path.exists(path):
        if pause:
            time.sleep(pause)
        body = get(url, optional)
        if body is None:
            return None
        with open(path, "wb") as f:
            f.write(body)
        manifest.write(json.dumps({"file": name, "url": url, "sha256": hashlib.sha256(body).hexdigest(), "bytes": len(body),
                                   "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}) + "\n")
        manifest.flush()
    return path


# 1. the two datasets
for f in JF_FILES:
    save(f"jfjelstul/{f}.csv", JF + f + ".csv")
save("jfjelstul/README.md", f"https://{HOST}/jfjelstul/worldcup/master/README.md")
for d in OF_DIRS:
    for n in OF_NAMES:
        save(f"openfootball/{d.split('--')[0]}__{n}", OF + d + "/" + n, optional=True)
save("openfootball/LICENSE.md", OF + "LICENSE.md")
for repo in ("jfjelstul/worldcup", "openfootball/worldcup"):
    p = subprocess.run(["gh", "api", f"repos/{repo}/commits/master", "-q", '.sha + " " + .commit.committer.date'], capture_output=True, text=True)
    if p.returncode == 0:
        open(os.path.join(out, repo.split("/")[0], "COMMIT.txt"), "w").write(p.stdout)

# 2. the Wikipedia pages the CSVs link to -> Wikidata items (pageprops wikibase_item)
titles = set()
for f, cols in (("stadiums", ["stadium_wikipedia_link"]), ("teams", ["mens_team_wikipedia_link", "womens_team_wikipedia_link"]),
                ("players", ["player_wikipedia_link"]), ("managers", ["manager_wikipedia_link"]), ("referees", ["referee_wikipedia_link"])):
    for r in csv.DictReader(open(os.path.join(out, "jfjelstul", f + ".csv"), encoding="utf-8")):
        for c in cols:
            v = r[c]
            if v.startswith("https://en.wikipedia.org/wiki/"):
                titles.add(urllib.parse.unquote(v[len("https://en.wikipedia.org/wiki/"):]).split("#")[0].replace("_", " "))
titles = sorted(titles)
print(len(titles), "Wikipedia titles")
for i in range(0, len(titles), 50):
    chunk = titles[i:i + 50]
    q = urllib.parse.urlencode({"action": "query", "format": "json", "prop": "pageprops", "ppprop": "wikibase_item", "redirects": 1,
                                "titles": "|".join(chunk)})
    save(f"wikidata/pageprops-{i // 50:03d}.json", "https://en.wikipedia.org/w/api.php?" + q, pause=2.5)
print("done", out)
