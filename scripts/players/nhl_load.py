#!/usr/bin/env python3
"""Raw NHL season summaries (nhl_fetch.py) -> legacy_nhlapi.player_season, and the answers -> legacy_files.raw_archive.

  nhl_load.py <raw dir> <bundle dir>

One row per player, season, game type and club. A single-club row of the league-wide answer is stored as it is; a
player who played for several clubs in a season is stored once per club, from the answer for that club alone. Combined
rows are not stored. Each season's files are bundled into <bundle dir>/<season>.tar.gz (kept for the Mac to copy to
Dropbox) and archived under 'nhl_stats/<date>/' from the bundle's own bytes (pg_read_binary_file: the local server
must be able to read <bundle dir>). Rerunnable."""
import io, json, os, subprocess, sys, tarfile, datetime
CONN = ["psql", "-h", "/tmp", "-p", "55432", "-U", "postgres", "-d", "spx_stats", "-X", "-q", "-v", "ON_ERROR_STOP=1"]
SAVED = datetime.date.today().isoformat()

def tsv(v):
    if v is None: return "\\N"
    return str(v).replace("\\", "\\\\").replace("\t", " ").replace("\n", " ").replace("\r", " ")

def main(raw, bundles):
    os.makedirs(bundles, exist_ok=True)
    teams = {t["id"]: t["triCode"] for t in json.load(open(os.path.join(raw, "teams.json")))}
    files = sorted(f for f in os.listdir(raw) if f.endswith(".json") and f != "teams.json")
    rows, by_season = {}, {}
    for f in files:
        season, gt, kind, who = f[:-5].split("-")
        by_season.setdefault(season, []).append(f)
        data = json.load(open(os.path.join(raw, f)))["data"]
        for r in data:
            ab = r.get("teamAbbrevs") or ""
            name = r.get("skaterFullName") or r.get("goalieFullName")
            if who == "all":
                if "," in ab or not ab: continue
                team = ab
            else:
                if "," not in ab: continue          # already stored from the league-wide answer
                team = teams.get(int(who))
                if team is None: continue
            key = (int(season[:4]), int(gt), kind, team, r["playerId"])
            rows[key] = (name, r.get("positionCode") or ("G" if kind == "goalie" else None), r.get("shootsCatches"), r)
    sql = ["begin;", "truncate legacy_nhlapi.player_season;", "copy legacy_nhlapi.player_season (season, game_type, kind, team_abbrev, player_id, full_name, position, hand, stats) from stdin;"]
    for (s, gt, kind, team, pid), (name, pos, hand, r) in sorted(rows.items()):
        sql.append("\t".join(tsv(x) for x in (s, gt, kind, team, pid, name, pos, hand, json.dumps(r, separators=(",", ":")))))
    sql += ["\\.", "commit;"]
    subprocess.run(CONN, input="\n".join(sql) + "\n", text=True, check=True)
    print(len(rows), "rows", flush=True)
    for season, fs in sorted(by_season.items()):
        bp = os.path.join(bundles, season + ".tar.gz")
        with tarfile.open(bp, "w:gz") as t:
            for f in fs:
                ti = tarfile.TarInfo(f); b = open(os.path.join(raw, f), "rb").read(); ti.size = len(b); ti.mtime = 0
                t.addfile(ti, io.BytesIO(b))
        name = "nhl_stats/%s/%s.tar.gz" % (SAVED, season)
        subprocess.run(CONN + ["-c", "insert into legacy_files.raw_archive (name, saved_on, sha256, data) select '%s', '%s', encode(sha256(b), 'hex'), b "
                               "from (select pg_read_binary_file('%s') b) x where not exists (select 1 from legacy_files.raw_archive where name = '%s')"
                               % (name, SAVED, os.path.abspath(bp), name)], check=True)
    print(len(by_season), "seasons archived", flush=True)

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
