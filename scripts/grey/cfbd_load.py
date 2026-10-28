#!/usr/bin/env python3
"""Parse the raw CollegeFootballData.com answers saved by cfbd_fetch.py into rerunnable load files for the legacy_cfbd tables (migrations 154 and 157).

    python3 -I scripts/grey/cfbd_load.py <raw day dir> --out-dir DIR [--fetched-on 2026-10-28] [--only game,team,...]

Reads <raw day dir>/<endpoint>/<params>.json, writes DIR/<nn>_<table>_<first season>-<last season>.sql (one file per table, split at about 150,000 rows on a season
boundary) and DIR/expected-counts.tsv. A load file creates a temp table, COPYs its rows in, replaces the rows of the seasons it carries (tables with a season; the
others replace by key) and inserts. Apply each with `bash scripts/mac/ds1-apply.sh <file> [--dry-run] [--force]` (the coordinating session). The files are not for git.
An item without its key columns is listed as unparsed and left out (never guessed). Standard library only.
"""
import glob, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import common as C, cfbd

CHUNK = 150000


def pick(d, *names):
    for n in names:
        if n in d and d[n] is not None:
            return d[n]
    return None


def jt(v):
    return None if v is None else json.dumps(v, separators=(",", ":"), sort_keys=True, ensure_ascii=False)


def rec_cols(prefix, r):
    r = r or {}
    return {prefix + "_games": C.to_int(r.get("games")), prefix + "_wins": C.to_int(r.get("wins")), prefix + "_losses": C.to_int(r.get("losses")), prefix + "_ties": C.to_int(r.get("ties"))}


# ---------------------------------------------------------------------- the parsers: answer -> (rows, unparsed)

def p_game(data, day):
    return cfbd.parse_games(json.dumps(data), day)


def p_conference(data, day):
    rows, bad = [], []
    for x in data:
        i = C.to_int(x.get("id"))
        if i is None or not x.get("name"):
            bad.append(x)
            continue
        rows.append(dict(conference_id=i, name=x["name"], short_name=x.get("shortName"), abbreviation=x.get("abbreviation"), classification=x.get("classification"),
                         member_count=C.to_int(x.get("memberCount")), fetched_on=day, source_key="cfbd:conference:%d" % i))
    return rows, bad


def venue_cols(v):
    v = v or {}
    return dict(city=v.get("city"), state=v.get("state"), zip=v.get("zip"), country_code=v.get("countryCode"), timezone=v.get("timezone"), latitude=v.get("latitude"),
                longitude=v.get("longitude"), elevation=v.get("elevation"), capacity=C.to_int(v.get("capacity")), construction_year=C.to_int(v.get("constructionYear")),
                grass=C.to_bool(v.get("grass")), dome=C.to_bool(v.get("dome")))


def p_venue(data, day):
    rows, bad = [], []
    for x in data:
        i = C.to_int(x.get("id"))
        if i is None or not x.get("name"):
            bad.append(x)
            continue
        rows.append(dict(venue_id=i, name=x["name"], fetched_on=day, source_key="cfbd:venue:%d" % i, **venue_cols(x)))
    return rows, bad


def p_team(data, day):
    rows, bad = [], []
    for x in data:
        i = C.to_int(x.get("id"))
        if i is None or not x.get("school"):
            bad.append(x)
            continue
        loc = x.get("location") or {}
        rows.append(dict(team_id=i, school=x["school"], mascot=x.get("mascot"), abbreviation=x.get("abbreviation"), alternate_names=jt(x.get("alternateNames")),
                         conference=x.get("conference"), division=x.get("division"), classification=x.get("classification"), color=x.get("color"),
                         alternate_color=x.get("alternateColor"), twitter=x.get("twitter"), logos=jt(x.get("logos")), venue_id=C.to_int(loc.get("id")),
                         venue_name=loc.get("name"), fetched_on=day, source_key="cfbd:team:%d" % i, **venue_cols(loc)))
    return rows, bad


def p_affiliation(data, day):
    rows, bad = [], []
    for x in data:
        t, c, s = C.to_int(x.get("teamId")), C.to_int(x.get("conferenceId")), C.to_int(x.get("startYear"))
        if t is None or c is None or s is None or not x.get("team") or not x.get("conference"):
            bad.append(x)
            continue
        e, dv = C.to_int(x.get("endYear")), x.get("conferenceDivision")
        rows.append(dict(team_id=t, team=x["team"], conference_id=c, conference=x["conference"], conference_abbreviation=x.get("conferenceAbbreviation"),
                         classification=x.get("classification"), division=dv, start_year=s, end_year=e, fetched_on=day,
                         source_key="cfbd:aff:%d:%d:%d:%s:%s" % (t, c, s, e if e is not None else "", dv or "")))
    return rows, bad


def p_coach(data, day):
    """-> two row lists (coach, coach_season) in one answer; returned as a tuple the caller splits."""
    coaches, seasons, bad = [], [], []
    for x in data:
        i = C.to_int(x.get("id"))
        if i is None:
            bad.append(x)
            continue
        coaches.append(dict(coach_id=i, first_name=x.get("firstName"), last_name=x.get("lastName"), hire_date=x.get("hireDate"), fetched_on=day, source_key="cfbd:coach:%d" % i))
        for s in x.get("seasons") or []:
            y, t = C.to_int(s.get("year")), C.to_int(s.get("teamId"))
            if y is None or t is None:
                bad.append(s)
                continue
            seasons.append(dict(coach_id=i, season=y, team_id=t, school=s.get("school"), conference=s.get("conference"), games=C.to_int(s.get("games")),
                                wins=C.to_int(s.get("wins")), losses=C.to_int(s.get("losses")), ties=C.to_int(s.get("ties")), win_percentage=s.get("winPercentage"),
                                preseason_rank=C.to_int(s.get("preseasonRank")), postseason_rank=C.to_int(s.get("postseasonRank")), srs=s.get("srs"),
                                sp_overall=s.get("spOverall"), sp_offense=s.get("spOffense"), sp_defense=s.get("spDefense"), fetched_on=day,
                                source_key="cfbd:coach:%d:%d:%d" % (i, y, t)))
    return (coaches, seasons), bad


def p_record(data, day):
    rows, bad = [], []
    for x in data:
        y, t = C.to_int(x.get("year")), C.to_int(x.get("teamId"))
        if y is None or t is None or not x.get("team"):
            bad.append(x)
            continue
        r = dict(season=y, team_id=t, team=x["team"], classification=x.get("classification"), conference=x.get("conference"), division=x.get("division"),
                 expected_wins=x.get("expectedWins"), fetched_on=day, source_key="cfbd:record:%d:%d" % (y, t))
        for pre, key in (("total", "total"), ("conf", "conferenceGames"), ("home", "homeGames"), ("away", "awayGames"), ("neutral", "neutralSiteGames"),
                         ("regular", "regularSeason"), ("post", "postseason")):
            r.update(rec_cols(pre, x.get(key)))
        rows.append(r)
    return rows, bad


def p_poll(data, day):
    rows, bad = [], []
    for w in data:
        y, wk, st = C.to_int(w.get("season")), C.to_int(w.get("week")), w.get("seasonType")
        if y is None or wk is None or not st:
            bad.append(w)
            continue
        for p in w.get("polls") or []:
            for r in p.get("ranks") or []:
                rk = C.to_int(r.get("rank"))
                if rk is None or not r.get("school") or not p.get("poll"):
                    bad.append(r)
                    continue
                rows.append(dict(season=y, season_type=st, week=wk, poll=p["poll"], is_final=C.to_bool(p.get("isFinal")), rank=rk, team_id=C.to_int(r.get("teamId")),
                                 school=r["school"], conference=r.get("conference"), first_place_votes=C.to_int(r.get("firstPlaceVotes")), points=C.to_int(r.get("points")),
                                 fetched_on=day, source_key="cfbd:poll:%d:%s:%d:%s:%s" % (y, st, wk, p["poll"], r["school"])))
    return rows, bad


def p_draft(data, day):
    rows, bad = [], []
    for x in data:
        y, o = C.to_int(x.get("year")), C.to_int(x.get("overall"))
        if y is None or o is None:
            bad.append(x)
            continue
        rows.append(dict(draft_year=y, overall=o, round=C.to_int(x.get("round")), pick=C.to_int(x.get("pick")), name=x.get("name"), position=x.get("position"),
                         height=x.get("height"), weight=C.to_int(x.get("weight")), college_athlete_id=C.to_int(x.get("collegeAthleteId")),
                         nfl_athlete_id=C.to_int(x.get("nflAthleteId")), college_id=C.to_int(x.get("collegeId")), college_team=x.get("collegeTeam"),
                         college_conference=x.get("collegeConference"), nfl_team_id=C.to_int(x.get("nflTeamId")), nfl_team=x.get("nflTeam"),
                         pre_draft_ranking=C.to_int(x.get("preDraftRanking")), pre_draft_position_ranking=C.to_int(x.get("preDraftPositionRanking")),
                         pre_draft_grade=C.to_int(x.get("preDraftGrade")), hometown=jt(x.get("hometownInfo")), fetched_on=day, source_key="cfbd:draft:%d:%d" % (y, o)))
    return rows, bad


def p_teamstat(data, day):
    rows, bad = [], []
    for x in data:
        y = C.to_int(x.get("season"))
        if y is None or not x.get("team") or not x.get("statName"):
            bad.append(x)
            continue
        v = x.get("statValue")
        rows.append(dict(season=y, team=x["team"], conference=x.get("conference"), stat_name=x["statName"], stat_value=v if isinstance(v, (int, float)) else None,
                         fetched_on=day, source_key="cfbd:teamstat:%d:%s:%s" % (y, x["team"], x["statName"])))
    return rows, bad


def p_roster(data, day, season=None):
    rows, bad = [], []
    for x in data:
        pid = x.get("id")
        if pid in (None, "") or not x.get("team") or season is None:
            bad.append(x)
            continue
        rows.append(dict(season=season, player_id=str(pid), team=x["team"], first_name=x.get("firstName"), last_name=x.get("lastName"), weight=C.to_int(x.get("weight")),
                         height=C.to_int(x.get("height")), jersey=C.to_int(x.get("jersey")), class_year=C.to_int(x.get("year")), position=x.get("position"),
                         home_city=x.get("homeCity"), home_state=x.get("homeState"), home_country=x.get("homeCountry"), home_latitude=x.get("homeLatitude"),
                         home_longitude=x.get("homeLongitude"), home_county_fips=x.get("homeCountyFIPS"), recruit_ids=jt(x.get("recruitIds")), fetched_on=day,
                         source_key="cfbd:roster:%d:%s:%s" % (season, pid, x["team"])))
    return rows, bad


def p_pstat(data, day):
    rows, bad = [], []
    for x in data:
        y, pid = C.to_int(x.get("season")), x.get("playerId")
        if y is None or pid in (None, "") or not x.get("team") or not x.get("category") or not x.get("statType"):
            bad.append(x)
            continue
        rows.append(dict(season=y, player_id=str(pid), team=x["team"], player=x.get("player"), position=x.get("position"), conference=x.get("conference"),
                         category=x["category"], stat_type=x["statType"], stat=None if x.get("stat") is None else str(x["stat"]), fetched_on=day,
                         source_key="cfbd:pstat:%d:%s:%s:%s:%s" % (y, pid, x["team"], x["category"], x["statType"])))
    return rows, bad


def p_boxscore(data, day, season=None):
    rows, bad = [], []
    for g in data:
        gid = C.to_int(g.get("id"))
        if gid is None or season is None:
            bad.append(g)
            continue
        for t in g.get("teams") or []:
            tid = C.to_int(t.get("teamId"))
            if tid is None or not t.get("team"):
                bad.append(t)
                continue
            for st in t.get("stats") or []:
                if not st.get("category"):
                    bad.append(st)
                    continue
                rows.append(dict(season=season, game_id=gid, team_id=tid, team=t["team"], conference=t.get("conference"), home_away=t.get("homeAway"),
                                 points=C.to_int(t.get("points")), category=st["category"], stat=None if st.get("stat") is None else str(st["stat"]), fetched_on=day,
                                 source_key="cfbd:boxscore:%d:%d:%s" % (gid, tid, st["category"])))
    return rows, bad


# table -> (raw folder, parser, columns, key columns, season column or None)
T_GAME = ("game", "games", p_game, cfbd.COLS, ("game_id",), "season")
T_CONF = ("conference", "conferences", p_conference, ("conference_id", "name", "short_name", "abbreviation", "classification", "member_count", "fetched_on", "source_key"), ("conference_id",), None)
VENUE_COLS = ("city", "state", "zip", "country_code", "timezone", "latitude", "longitude", "elevation", "capacity", "construction_year", "grass", "dome")
T_VENUE = ("venue", "venues", p_venue, ("venue_id", "name") + VENUE_COLS + ("fetched_on", "source_key"), ("venue_id",), None)
T_TEAM = ("team", "teams", p_team, ("team_id", "school", "mascot", "abbreviation", "alternate_names", "conference", "division", "classification", "color", "alternate_color",
                                      "twitter", "logos", "venue_id", "venue_name") + VENUE_COLS + ("fetched_on", "source_key"), ("team_id",), None)
T_AFF = ("conference_affiliation", "conferences_affiliations", p_affiliation, ("team_id", "team", "conference_id", "conference", "conference_abbreviation", "classification",
                                                                               "division", "start_year", "end_year", "fetched_on", "source_key"), ("source_key",), None)
T_COACH = ("coach", None, None, ("coach_id", "first_name", "last_name", "hire_date", "fetched_on", "source_key"), ("coach_id",), None)
T_COACHSEASON = ("coach_season", None, None, ("coach_id", "season", "team_id", "school", "conference", "games", "wins", "losses", "ties", "win_percentage", "preseason_rank",
                                              "postseason_rank", "srs", "sp_overall", "sp_offense", "sp_defense", "fetched_on", "source_key"), ("coach_id", "season", "team_id"), None)
REC_COLS = tuple("%s_%s" % (p, k) for p in ("total", "conf", "home", "away", "neutral", "regular", "post") for k in ("games", "wins", "losses", "ties"))
T_RECORD = ("team_record", "records", p_record, ("season", "team_id", "team", "classification", "conference", "division", "expected_wins") + REC_COLS + ("fetched_on", "source_key"),
            ("season", "team_id"), "season")
T_POLL = ("poll_rank", "rankings", p_poll, ("season", "season_type", "week", "poll", "is_final", "rank", "team_id", "school", "conference", "first_place_votes", "points",
                                             "fetched_on", "source_key"), ("season", "season_type", "week", "poll", "school"), "season")
T_DRAFT = ("draft_pick", "draft_picks", p_draft, ("draft_year", "overall", "round", "pick", "name", "position", "height", "weight", "college_athlete_id", "nfl_athlete_id",
                                                   "college_id", "college_team", "college_conference", "nfl_team_id", "nfl_team", "pre_draft_ranking",
                                                   "pre_draft_position_ranking", "pre_draft_grade", "hometown", "fetched_on", "source_key"), ("draft_year", "overall"), "draft_year")
T_TEAMSTAT = ("team_season_stat", "stats_season", p_teamstat, ("season", "team", "conference", "stat_name", "stat_value", "fetched_on", "source_key"), ("season", "team", "stat_name"), "season")
T_ROSTER = ("roster_player", "roster", p_roster, ("season", "player_id", "team", "first_name", "last_name", "weight", "height", "jersey", "class_year", "position", "home_city",
                                                   "home_state", "home_country", "home_latitude", "home_longitude", "home_county_fips", "recruit_ids", "fetched_on", "source_key"),
            ("season", "player_id", "team"), "season")
T_PSTAT = ("player_season_stat", "stats_player_season", p_pstat, ("season", "player_id", "team", "player", "position", "conference", "category", "stat_type", "stat", "fetched_on",
                                                                   "source_key"), ("season", "player_id", "team", "category", "stat_type"), "season")
T_BOX = ("team_game_stat", "games_teams", p_boxscore, ("season", "game_id", "team_id", "team", "conference", "home_away", "points", "category", "stat", "fetched_on", "source_key"),
         ("game_id", "team_id", "category"), "season")
ORDER = [T_CONF, T_VENUE, T_TEAM, T_AFF, T_COACH, T_COACHSEASON, T_GAME, T_RECORD, T_POLL, T_DRAFT, T_TEAMSTAT, T_ROSTER, T_PSTAT, T_BOX]


# ---------------------------------------------------------------------- COPY text

def cell(v):
    if v is None:
        return "\\N"
    if isinstance(v, bool):
        return "t" if v else "f"
    if isinstance(v, float):
        return repr(v)
    return str(v).replace("\\", "\\\\").replace("\t", "\\t").replace("\n", "\\n").replace("\r", "\\r")


def load_text(table, cols, key, season_col, rows, day):
    seasons = sorted({r[season_col] for r in rows if r.get(season_col) is not None}) if season_col else []
    head = "-- legacy_cfbd.%s, %d rows%s, fetched %s (scripts/grey/cfbd_load.py). Rerunnable: %s. DS1 only.\nbegin;\n" % (
        table, len(rows), (", seasons %s-%s" % (seasons[0], seasons[-1])) if seasons else "", day,
        "the rows of these seasons are replaced" if season_col else "a row replaces itself by key")
    out = [head, "create temp table _load (like legacy_cfbd.%s) on commit drop;\n" % table, "copy _load (%s) from stdin;\n" % ", ".join(cols)]
    for r in rows:
        out.append("\t".join(cell(r.get(c)) for c in cols) + "\n")
    out.append("\\.\n")
    if season_col:
        out.append("delete from legacy_cfbd.%s where %s = any (array[%s]);\n" % (table, season_col, ",".join(str(s) for s in seasons)))
    sets = ", ".join("%s = excluded.%s" % (c, c) for c in cols if c not in key)
    out.append("insert into legacy_cfbd.%s (%s) select %s from _load on conflict (%s) do update set %s;\ncommit;\n" % (table, ", ".join(cols), ", ".join(cols), ", ".join(key), sets))
    return "".join(out)


def season_of(path):
    for part in os.path.basename(path)[:-5].split("&"):
        if part.startswith("year="):
            return int(part[5:])
    return None


def files_of(day_dir, folder):
    return sorted(glob.glob(os.path.join(day_dir, folder, "*.json")))


def parse_table(day_dir, spec, day):
    """-> (rows, unparsed count) for a table; coach and coach_season come from the one coaches answer."""
    name, folder, parser, cols, key, season_col = spec
    rows, bad = [], 0
    if name in ("coach", "coach_season"):
        for f in files_of(day_dir, "coaches"):
            (coaches, seasons), b = p_coach(json.load(open(f, encoding="utf-8")), day)
            rows += coaches if name == "coach" else seasons
            bad += len(b)
        return rows, bad
    for f in files_of(day_dir, folder):
        data = json.load(open(f, encoding="utf-8"))
        r, b = (parser(data, day, season_of(f)) if name in ("roster_player", "team_game_stat") else parser(data, day))
        rows += r
        bad += len(b)
    return rows, bad


def dedupe(rows):
    """-> (rows, identical repeats dropped, conflicts). The API repeats some items (a poll row four times, a game that two weekly requests both return); a repeat that
    differs from the first is a conflict: the first is kept and the count is reported."""
    seen, out, same, conflict = {}, [], 0, 0
    for r in rows:
        k = r["source_key"]
        if k in seen:
            if seen[k] == r:
                same += 1
            else:
                conflict += 1
            continue
        seen[k] = r
        out.append(r)
    return out, same, conflict


def write_files(out_dir, spec, rows, day, seq):
    name, _, _, cols, key, season_col = spec
    files = []
    if not season_col:
        groups = [rows]
    else:
        groups, cur, by = [], [], {}
        for r in rows:
            by.setdefault(r[season_col], []).append(r)
        for s in sorted(by):
            if cur and len(cur) + len(by[s]) > CHUNK:
                groups.append(cur)
                cur = []
            cur += by[s]
        if cur:
            groups.append(cur)
    for g in groups:
        if season_col:
            ss = sorted({r[season_col] for r in g})
            tag = "_%s-%s" % (ss[0], ss[-1])
        else:
            tag = ""
        path = os.path.join(out_dir, "%02d_%s%s.sql" % (seq, name, tag))
        with open(path, "w", encoding="utf-8") as f:
            f.write(load_text(name, cols, key, season_col, g, day))
        files.append((path, len(g)))
    return files


def main(argv):
    if not argv or argv[0].startswith("-"):
        print(__doc__)
        return 2
    opt = lambda n, d=None: argv[argv.index(n) + 1] if n in argv else d
    day_dir = os.path.expanduser(argv[0])
    out_dir = os.path.expanduser(opt("--out-dir", ""))
    if not out_dir:
        print(__doc__)
        return 2
    os.makedirs(out_dir, exist_ok=True)
    day = opt("--fetched-on", os.path.basename(day_dir.rstrip("/")))
    only = set(opt("--only", "").split(",")) - {""}
    counts = []
    for seq, spec in enumerate(ORDER, 1):
        if only and spec[0] not in only:
            continue
        rows, bad = parse_table(day_dir, spec, day)
        rows, same, dup = dedupe(rows)
        if not rows:
            print("%-24s no raw files" % spec[0])
            continue
        files = write_files(out_dir, spec, rows, day, seq)
        counts.append((spec[0], len(rows), bad, same, dup))
        print("%-24s %8d rows, %d unparsed, %d identical repeats dropped, %d conflicting repeats, %d file(s)" % (spec[0], len(rows), bad, same, dup, len(files)))
    with open(os.path.join(out_dir, "expected-counts.tsv"), "w", encoding="utf-8") as f:
        f.write("table\trows\tunparsed\tidentical_repeats_dropped\tconflicting_repeats\n")
        for c in counts:
            f.write("%s\t%d\t%d\t%d\t%d\n" % c)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
