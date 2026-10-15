#!/usr/bin/env python3
"""nflverse player statistics (nflverse_stats_fetch.py) -> one SQL file that loads legacy_nflverse.player_stat (migration 099) and archives the raw files.

  nflverse_stats_load.py <raw dir> <out.sql> [YYYY-MM-DD]

The SQL is inline, so the coordinator applies it to DS1 with scripts/mac/ds1-apply.sh <out.sql> --force (the file is outside db/). It replaces the rows of
every season the raw dir holds. Each raw file is kept as gzip in legacy_files.raw_archive, named nflverse_player_stats/<day>/<file>.gz (`gunzip` returns
the file exactly as it was saved). <day> is the third argument, else the raw dir's name.

What is stored. nflverse's weekly file has one row per player and game week with that week's team; nflverse's season files total a player's year but give
only the last team. So a season's line is built here, per player, club, season and kind (REG, POST), by adding the weeks of that club:
  * counting columns are added (see SUM below); the longest field goal and punt are the largest of the weeks (MAX);
  * games = the number of weeks that club has a line for (nflverse's own "games" is the same count);
  * rates, shares, EPA and fantasy points are not stored (they are not counting numbers and cannot be added up);
  * a column is kept in a season only where nflverse really has it: an "optional" column (tracking numbers such as air yards, tackles for loss, QB hits)
    that fewer than 5 per cent of the rows of its group carry that season is left out of the whole season, so a figure nflverse never recorded is
    absent and never zero (player_stat_column lists the kept columns of each season);
  * values of zero are not stored; absent in a kept column means zero.
The sum over a player's clubs is checked against the season file (printed): a difference is reported and not hidden."""
import csv, datetime, gzip, hashlib, io, json, os, re, sys

csv.field_size_limit(10 ** 8)

# columns that are added up, by group (the group's own activity column first); MAX columns are the largest week
GROUPS = {
    "passing":   ["attempts", "completions", "passing_yards", "passing_tds", "passing_interceptions", "sacks_suffered", "sack_yards_lost",
                  "passing_first_downs", "passing_2pt_conversions", "passing_air_yards", "passing_yards_after_catch"],
    "rushing":   ["carries", "rushing_yards", "rushing_tds", "rushing_fumbles", "rushing_fumbles_lost", "rushing_first_downs", "rushing_2pt_conversions"],
    "receiving": ["receptions", "targets", "receiving_yards", "receiving_tds", "receiving_fumbles", "receiving_fumbles_lost", "receiving_first_downs",
                  "receiving_air_yards", "receiving_yards_after_catch", "receiving_2pt_conversions"],
    "defense":   ["def_tackles_solo", "def_tackle_assists", "def_tackles_for_loss", "def_sacks", "def_sack_yards", "def_qb_hits", "def_interceptions",
                  "def_interception_yards", "def_pass_defended", "def_fumbles_forced", "fumble_recovery_opp", "def_tds", "def_safeties"],
    "kicking":   ["fg_att", "fg_made", "fg_made_40_49", "fg_made_50_59", "fg_made_60_", "pat_att", "pat_made"],
    "punting":   ["pt_att", "pt_yards", "pt_inside_20", "pt_touchback", "pt_blocked"],
}
MAX = {"kicking": ["fg_long"], "punting": ["pt_long"]}
# columns that exist only where nflverse tracked them: kept in a season only when at least 5 per cent of the group's rows carry them
OPTIONAL = {"passing_first_downs", "passing_air_yards", "passing_yards_after_catch", "rushing_first_downs", "receiving_first_downs", "targets",
            "receiving_air_yards", "receiving_yards_after_catch", "def_tackles_for_loss", "def_qb_hits", "def_pass_defended", "def_tackle_assists",
            "def_sack_yards", "sacks_suffered", "sack_yards_lost", "def_interception_yards", "def_fumbles_forced", "pt_inside_20", "pt_touchback"}
ACTIVITY = {"passing": "attempts", "rushing": "carries", "receiving": "receptions", "defense": "def_tackles_solo", "kicking": "fg_att", "punting": "pt_att"}
SUM = [c for cols in GROUPS.values() for c in cols]
MAXC = [c for cols in MAX.values() for c in cols]

def tsv(v):
    if v is None or v == "": return "\\N"
    return str(v).replace("\\", "\\\\").replace("\t", " ").replace("\n", " ").replace("\r", " ")

def num(v):
    if v in ("", "NA", None): return 0.0
    try: return float(v)
    except ValueError: return 0.0

def rows_of(path):
    return csv.DictReader(io.StringIO(open(path, encoding="utf-8", newline="").read()))

def fmt(x):
    return int(x) if x == int(x) else round(x, 3)

def season_lines(path):
    """Weekly rows -> {(season_type, team, gsis_id): {...}}, adding the weeks of a club."""
    out = {}
    for r in rows_of(path):
        gid = r["player_id"]
        if not gid or gid == "0": continue
        k = (r["season_type"], r["team"], gid)
        o = out.get(k)
        if o is None:
            o = out[k] = {"games": 0, "name": r["player_display_name"] or r["player_name"], "pos": r["position"], "grp": r["position_group"],
                          "v": {c: 0.0 for c in SUM}, "m": {c: 0.0 for c in MAXC}}
        o["games"] += 1
        o["pos"] = r["position"] or o["pos"]; o["grp"] = r["position_group"] or o["grp"]
        for c in SUM: o["v"][c] += num(r.get(c))
        for c in MAXC: o["m"][c] = max(o["m"][c], num(r.get(c)))
    return out

def kept_columns(lines):
    """The columns this season really has: every column of a group with enough rows, and the optional ones only where 5 per cent of the group's rows carry them."""
    kept = set()
    for g, cols in GROUPS.items():
        act = ACTIVITY[g]
        n_act = sum(1 for o in lines.values() if o["v"][act] != 0)
        if n_act < 5: continue
        for c in cols + MAX.get(g, []):
            if c == act or c not in OPTIONAL: kept.add(c); continue
            n = sum(1 for o in lines.values() if o["v"][c] != 0)
            if n >= 0.05 * n_act: kept.add(c)
    return kept

def check(season, lines, reg_path, post_path):
    """Sum of a player's clubs against the season files; returns (rows compared, rows that differ, examples)."""
    bad, n, ex = 0, 0, []
    for kind, p in (("REG", reg_path), ("POST", post_path)):
        if not os.path.exists(p): continue
        mine = {}
        for (t, team, gid), o in lines.items():
            if t != kind: continue
            m = mine.setdefault(gid, {"games": 0, **{c: 0.0 for c in SUM}})
            m["games"] += o["games"]
            for c in SUM: m[c] += o["v"][c]
        for r in rows_of(p):
            gid = r["player_id"]
            if not gid or gid not in mine: continue
            n += 1
            diff = [c for c in SUM if c in r and abs(num(r[c]) - mine[gid][c]) > 1e-6]
            if abs(num(r.get("games")) - mine[gid]["games"]) > 1e-6: diff.append("games")
            if diff:
                bad += 1
                if len(ex) < 3: ex.append((season, kind, gid, diff[:4]))
    return n, bad, ex

def main(raw, out, day):
    weeks = sorted(f for f in os.listdir(raw) if re.fullmatch(r"stats_player_week_\d{4}\.csv", f))
    files = sorted(f for f in os.listdir(raw) if re.fullmatch(r"stats_player_(week|reg|post)_\d{4}\.csv", f))
    sql = ["begin;"]
    total = 0
    noteam = [0]
    colrows = []
    for f in weeks:
        season = int(f[-8:-4])
        lines = season_lines(f"{raw}/{f}")
        kept = kept_columns(lines)
        n, bad, ex = check(season, lines, f"{raw}/stats_player_reg_{season}.csv", f"{raw}/stats_player_post_{season}.csv")
        print(season, len(lines), "club lines;", len(kept), "columns kept; season-file check:", n, "players compared,", bad, "differ", ex if bad else "", flush=True)
        sql.append(f"delete from legacy_nflverse.player_stat where season = {season};")
        sql.append(f"delete from legacy_nflverse.player_stat_column where season = {season};")
        sql.append("copy legacy_nflverse.player_stat (season, season_type, team, gsis_id, player_name, position, position_group, games, stats) from stdin;")
        for (t, team, gid), o in sorted(lines.items()):
            st = {}
            for c in SUM:
                if c in kept and o["v"][c] != 0: st[c] = fmt(o["v"][c])
            for c in MAXC:
                if c in kept and o["m"][c] != 0: st[c] = fmt(o["m"][c])
            if not st: continue
            if not team:
                noteam[0] += 1; continue          # a week nflverse gives no team for: not placed on any club
            sql.append("\t".join(tsv(v) for v in (season, t, team, gid, o["name"], o["pos"], o["grp"], o["games"], json.dumps(st, separators=(",", ":")))))
            total += 1
        sql.append("\\.")
        sql.append("copy legacy_nflverse.player_stat_column (season, col) from stdin;")
        for c in sorted(kept): sql.append(f"{season}\t{c}")
        sql.append("\\.")
    for f in files:
        b = gzip.compress(open(f"{raw}/{f}", "rb").read(), mtime=0)
        sql.append("insert into legacy_files.raw_archive (name, saved_on, sha256, data) values "
                   f"('nflverse_player_stats/{day}/{f}.gz', '{day}', '{hashlib.sha256(b).hexdigest()}', decode('{b.hex()}', 'hex')) "
                   "on conflict (name) do update set saved_on = excluded.saved_on, sha256 = excluded.sha256, data = excluded.data;")
    sql.append("select count(*) as club_lines, count(distinct gsis_id) as players, min(season) as first_season, max(season) as last_season from legacy_nflverse.player_stat;")
    sql.append("commit;")
    open(out, "w", encoding="utf-8").write("\n".join(sql) + "\n")
    print(noteam[0], "club lines have no team in the file and are left out")
    print(total, "club lines,", len(weeks), "seasons,", len(files), "files archived ->", out)

if __name__ == "__main__":
    a = sys.argv[1:]
    if len(a) < 2: sys.exit(__doc__)
    main(a[0].rstrip("/"), a[1], a[2] if len(a) > 2 else os.path.basename(a[0].rstrip("/")))
