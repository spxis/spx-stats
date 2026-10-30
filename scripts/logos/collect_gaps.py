"""Collect Commons logos for clubs that have none, without DS1: the gap list comes from production's public read-only API.

Needs no key beyond the public one the site uses. Writes only into the local library folder (outside the repository):
  <dest>/collect/raw.json          the Commons API cache (commons_sweep.py)
  <dest>/collect/gaps.csv          every club still without a logo and what was found
  <dest>/files/commons/<File>      each downloaded file, byte for byte
  <dest>/collect/downloads.csv     one line per file: club, league, licence, class, page, sha256, size (the hand-off lists these)
Nothing writes DS1 or production. Commons API and file requests are 1.5 s apart (commons_sweep.PAUSE) with the project User-Agent.

Usage: python3 -I scripts/logos/collect_gaps.py [--dest PATH] [--limit N] [--no-download]
"""
import csv, hashlib, json, os, sys, urllib.request
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import commons_report
import commons_sweep
import library

ROOT = Path(__file__).resolve().parents[2]
BASE = "https://njpvfrceahkvnrduerkk.supabase.co/rest/v1/"
KEY = "sb_publishable_FmeiL6oX9_Mrb8psQZFSQg_YO_O4afC"
# commons_report only knows these as "own sport" leagues; a women's league is searched as its men's counterpart
SEARCH_AS = {"wnba": "nba", "pwhl": "nhl"}
SKIP = {"nwsl"}


def api(view, query):
    rows, offset = [], 0
    while True:
        req = urllib.request.Request(f"{BASE}{view}?{query}&limit=1000&offset={offset}", headers={"apikey": KEY, "Accept-Profile": "api"})
        page = json.loads(urllib.request.urlopen(req, timeout=60).read())
        rows += page
        if len(page) < 1000:
            return rows
        offset += 1000


def gap_idents():
    teams = api("team_index", "select=league,franchise_id,name,first_season,last_season&order=league,franchise_id")
    brands = api("team_brand", "select=franchise_id,logo_url&order=league,franchise_id,brand_from,brand_to,logo_url,source")
    has = {b["franchise_id"] for b in brands if b["logo_url"]}
    seeded = {commons_report.norm(r["team"]) for r in library.read_extra()}
    out = []
    for t in teams:
        if t["franchise_id"] in has or t["league"] in SKIP or commons_report.norm(t["name"]) in seeded:
            continue
        words = t["name"].split()
        nick = words[-1] if len(words) > 1 else t["name"]
        out.append({"iid": str(t["franchise_id"]), "fid": str(t["franchise_id"]), "lg": SEARCH_AS.get(t["league"], library.report_league(t["league"])),
                    "name": t["name"], "location": " ".join(words[:-1]), "nickname": nick, "y0": t["first_season"], "y1": t["last_season"],
                    "cur": None, "fr_logos": 0, "league": t["league"]})
    return out


def main(argv):
    dest = library.library_dest(argv).resolve()
    limit = int(argv[argv.index("--limit") + 1]) if "--limit" in argv else None
    idents = gap_idents()
    if limit:
        idents = idents[:limit]
    folder = dest / "collect"
    folder.mkdir(parents=True, exist_ok=True)
    ident_path = folder / "gap_identities.json"
    ident_path.write_text(json.dumps(idents))
    print(f"{len(idents)} clubs without a logo", flush=True)
    commons_sweep.main(str(ident_path), str(folder))
    out_csv = folder / "gap_candidates.csv"
    commons_report.main(str(ident_path), str(folder), str(out_csv))
    info = json.loads((folder / "raw.json").read_text()).get("info") or {}
    league_of = {i["name"]: i["league"] for i in idents}
    rows = list(csv.DictReader(out_csv.open()))
    done, last, seen = [], [0.0], set()
    for row in rows:
        title = row.get("best") or ""
        club = row["era"]
        if title:
            kind = "free"
        else:
            pick = library.nonfree_hit(club, info)
            if not pick:
                continue
            title, kind = pick[0], "non-free"
        if title in seen or "--no-download" in argv:
            continue
        meta = info.get(title) or {}
        if not meta.get("url"):
            continue
        leaf = library.safe_name(title.removeprefix("File:").replace(" ", "_"))
        path = dest / "files" / ("commons" if kind == "free" else "nonfree") / leaf
        if not (path.is_file() and path.stat().st_size):
            data = library.fetch_bytes(meta["url"], last)
            if not data:
                continue
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        data = path.read_bytes()
        seen.add(title)
        done.append({"club": club, "league": league_of.get(club, row["league"]), "file": leaf, "class": kind if kind == "non-free" else row["best_class"],
                     "licence": row.get("best_licence") or (meta.get("meta") or {}).get("LicenseShortName") or "", "page": meta.get("page") or "",
                     "mime": meta.get("mime") or "", "width": meta.get("w") or "", "height": meta.get("h") or "", "bytes": len(data),
                     "sha256": hashlib.sha256(data).hexdigest(), "path": str(path.relative_to(dest))})
    if done:
        with (folder / "downloads.csv").open("w", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=list(done[0]))
            w.writeheader()
            w.writerows(done)
    found = {d["club"] for d in done}
    with (folder / "gaps.csv").open("w", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(["league", "club", "first", "last", "found"])
        for i in idents:
            w.writerow([i["league"], i["name"], i["y0"], i["y1"], "yes" if i["name"] in found else "no"])
    print(f"downloaded {len(done)} files for {len(found)} of {len({i['name'] for i in idents})} clubs")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
