"""Turn what sportslogos_fetch.py collected into the SQL that loads legacy_sportslogos (migration 108), and name the raw files for the archive.
Usage: sportslogos_load.py <fetch dir> <YYYY-MM-DD> <load.sql>
Run scripts/archive_raw.py first (it keeps the page HTML and every image byte for byte in legacy_files.raw_archive as
sportslogos/<day>/<path>); the rows written here point at those archive names, so the archive SQL is applied first:
  python3 -I scripts/archive_raw.py sportslogos <fetch dir> <day> --sql-out archive.sql
  python3 -I scripts/logos/sportslogos_load.py <fetch dir> <day> load.sql
  bash scripts/mac/ds1-apply.sh archive.sql ; bash scripts/mac/ds1-apply.sh load.sql
Only teams whose page was fetched and logos whose image was downloaded are loaded. The hosted path is where the site serves the file:
/team-logos/sl/<logo key>.<ext>, written by scripts/logos/export_hosted.py from the archive rows."""
import json, os, sys

fetch, day, out = sys.argv[1:4]


def q(v):
    return "null" if v is None or v == "" else "'" + str(v).replace("'", "''") + "'"


teams = json.load(open(f"{fetch}/teams.json")) if os.path.exists(f"{fetch}/teams.json") else {}
logos = json.load(open(f"{fetch}/logos.json"))
images = json.load(open(f"{fetch}/images.json")) if os.path.exists(f"{fetch}/images.json") else {}
# SportsLogos.Net league ids (the number in /teams/list_by_league/<id>/) and their names
leagues = {"1": "National Hockey League", "4": "Major League Baseball", "6": "National Basketball Association", "7": "National Football League",
           "8": "Canadian Football League", "147": "Pacific Coast Hockey Association", "172": "Federal League", "197": "Western Canada Hockey League"}
page_ids = {fn.split(".")[0] for fn in os.listdir(f"{fetch}/teams")} if os.path.isdir(f"{fetch}/teams") else set()
used = sorted({str(l["team_id"]) for k, l in logos.items() if k in images})

with open(out, "w") as fh:
    for tid in used:
        t = teams.get(tid, {})
        name = t.get("name") or next((l["title"].split(" Logo")[0] for l in logos.values() if str(l["team_id"]) == tid), tid)
        page = t.get("page") or f"https://www.sportslogos.net/logos/list_by_team/{tid}/"
        arch = f"sportslogos/{day}/teams/{tid}.html" if tid in page_ids else None
        fh.write("insert into legacy_sportslogos.team (sl_team_id, league_name, name, page_url, archive_name, fetched_on) values "
                 f"({tid}, {q(leagues.get(str(t.get('league_id'))))}, {q(name)}, {q(page)}, {q(arch)}, {q(day)}) "
                 "on conflict (sl_team_id) do update set league_name = excluded.league_name, name = excluded.name, page_url = excluded.page_url, "
                 "archive_name = excluded.archive_name, fetched_on = excluded.fetched_on;\n")
    for key, l in sorted(logos.items()):
        im = images.get(key)
        if not im:
            continue
        ext = os.path.splitext(im["file"])[1]
        fh.write("insert into legacy_sportslogos.logo (sl_logo_key, sl_team_id, page_url, title, kind, year_from, year_to, image_url, archive_name, sha256, mime, "
                 "width, height, bytes, hosted_path, fetched_on) values "
                 f"({q(key)}, {l['team_id']}, {q(l['page'])}, {q(l['title'])}, {q(l['kind'])}, {q(l['from'])}, {q(l['to'])}, {q(im['from'])}, "
                 f"{q('sportslogos/' + day + '/' + im['file'])}, {q(im['sha256'])}, {q(im['mime'])}, {q(im['width'])}, {q(im['height'])}, {q(im['bytes'])}, "
                 f"{q('/team-logos/sl/' + key + ext)}, {q(day)}) "
                 "on conflict (sl_logo_key) do update set title = excluded.title, kind = excluded.kind, year_from = excluded.year_from, "
                 "year_to = excluded.year_to, archive_name = excluded.archive_name, sha256 = excluded.sha256, hosted_path = excluded.hosted_path, "
                 "fetched_on = excluded.fetched_on;\n")
print("wrote", out, ":", len(used), "teams,", sum(1 for k in logos if k in images), "logos")
