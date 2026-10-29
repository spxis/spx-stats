#!/usr/bin/env python3
"""One minor-league hockey season at a time: fetch -> archive the raw wikitext -> parse -> load legacy_wikipedia_hockey_minor (migration 158).

  season.py LEAGUE [--dry] [--no-archive] [YEAR ...]       LEAGUE: ahl; YEAR = the year a season starts (1936 = 1936-37); none = every season
  season.py --extras [--dry] [--no-archive]                archive the league articles (the league article, the list of seasons)

For each season: fetch.py saves the season article, its standings templates and its playoffs article (raw, never edited); every file is copied byte
for byte into DS1's legacy_files.raw_archive (name 'wikipedia-hockey-minor/<league>/<year>/<kind>/<file>', one folder per season in the Dropbox copy
made by scripts/mac/spx-raw-export.sh) BEFORE anything is parsed; the parsed rows replace that season's rows. --dry fetches and parses, prints the counts
and the checks, and writes nothing. The core tables are built from these rows by db/build/230_ahl_from_wikipedia.sql, a separate, reviewed step.
Source: English Wikipedia (CC BY-SA 4.0), action=raw, one request per 2.5 s. DS1 is reached with scripts/daily/ds1.sh; HOCKEY_MINOR_PSQL (a command that
reads SQL on stdin) points the loader at a scratch database instead.
"""
import hashlib, os, re, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fetch as F, parse as P   # noqa: E402  (this folder's own modules)

DS1 = os.path.join(HERE, "..", "daily", "ds1.sh")
S = "legacy_wikipedia_hockey_minor"
NO_ARCHIVE = "--no-archive" in sys.argv
TIDY_ROUNDS = {"echl"}      # leagues read with the later parsers (game blocks and tables as series sources, round names cleaned of dates, "(Best of 5)" and old spellings and numbered
                            # by stage); the AHL's rows were loaded as they came and stay as they are


def psql(sql):
    cmd = os.environ["HOCKEY_MINOR_PSQL"].split() if os.environ.get("HOCKEY_MINOR_PSQL") else ["bash", DS1, "-q", "-f", "-"]
    p = subprocess.run(cmd, input=sql, text=True, capture_output=True)
    if p.returncode: raise RuntimeError(p.stderr[-1500:])
    return p.stdout


def q(s):
    return "null" if s is None else "'" + str(s).replace("'", "''") + "'"


def n(v):
    return "null" if v is None else str(v)


def archive(name_prefix, files):
    """Copy each raw file, byte for byte, into legacy_files.raw_archive and check the stored hash."""
    for f in files:
        data = open(os.path.join(F.CACHE, f), "rb").read()
        sha = hashlib.sha256(data).hexdigest()
        name = f"{name_prefix}/{f}"
        psql(f"insert into legacy_files.raw_archive (name, saved_on, sha256, data) values ({q(name)}, {q(F.RUN_DATE)}, {q(sha)}, decode('{data.hex()}', 'hex')) "
             f"on conflict (name) do nothing;")
        got = psql(f"select encode(sha256(data), 'hex') = {q(sha)} from legacy_files.raw_archive where name = {q(name)};").split()
        if "t" not in got: raise RuntimeError("archive checksum mismatch " + name)


def lk(s):
    """A link title for comparing: dashes alike, spaces for underscores."""
    return re.sub(r"[–—]", "-", (s or "").replace("_", " ")).strip().lower()


class Clubs:
    """The clubs of one season, as the standings name them; finds the one a bracket, a sentence or a game box means."""

    def __init__(self, rows):
        self.names = []
        self.by_link = {}
        for r in rows:
            if r["team"] not in self.names: self.names.append(r["team"])
            if r["link"]: self.by_link.setdefault(lk(r["link"]), r["team"])

    def find(self, name, link=None):
        if link and lk(link) in self.by_link: return self.by_link[lk(link)]
        if name in self.names: return name
        flat = {re.sub(r"[^a-z0-9]", "", x.lower()): x for x in self.names}
        if name and re.sub(r"[^a-z0-9]", "", name.lower()) in flat: return flat[re.sub(r"[^a-z0-9]", "", name.lower())]
        if name and name.isupper() and 2 <= len(name) <= 4:      # "WBS" for Wilkes-Barre/Scranton
            hit = [x for x in self.names if "".join(w[0] for w in re.split(r"[-/ ]", x.rsplit(" ", 1)[0]) if w) == name]
            if len(hit) == 1: return hit[0]
        return P.P.match_name(name, self.names) if name else None


_LISTED = {}


def listed_champions(league):
    """The champion column of the league's list of seasons (an infobox is missing in the early articles)."""
    if league not in _LISTED:
        _LISTED[league] = {}
        for t in F.LEAGUES[league][4]:
            f = os.path.join(F.CACHE, "league", F.F.fname(t))
            if t.startswith("List of") and os.path.exists(f):
                txt = open(f, encoding="utf-8").read()
                if not txt.startswith("#MISSING"): _LISTED[league] = P.listed_champions(P.strip_comments(txt))
    return _LISTED[league]


def run(league, y, dry=False):
    files, text = F.fetch_season(league, y)
    if text is None:
        print(league, y, "no season article"); return
    text = P.strip_comments(text)
    if not dry and not NO_ARCHIVE: archive(f"wikipedia-hockey-minor/{league}/{y}", files)
    cache = {}
    for f in files:
        sub, fn = f.split("/", 1)
        if sub in ("playoffs", "season"):
            t = open(os.path.join(F.CACHE, f), encoding="utf-8").read()
            if not t.startswith("#MISSING"): cache[f] = P.strip_comments(t)
    pt = F.playoffs_title(league, y)
    pfile = f"playoffs/{F.F.fname(pt)}"
    ptext = cache.get(pfile) or ""
    # a redirect page holds only "#REDIRECT": F.page followed it and listed the target too
    pages = {}
    for f, t in cache.items():
        if f.startswith("playoffs/") and not t.lstrip().upper().startswith("#REDIRECT"):
            pages[t and re.sub(r"_", " ", re.sub(r"\.wikitext$", "", f.split("/", 1)[1]))] = t
    tpls = {}
    for t in sorted(set(F.bracket_templates(text)) | set(F.bracket_templates(ptext))):
        tt = F.fetch_template(t, [])
        if tt: tpls[t] = P.strip_comments(tt)
    text_x = P.expand_named(text, tpls)
    ptext_x = P.expand_named(ptext, tpls)
    full = P.expand_sections(text_x, pages)

    std, bad = P.parse_standings(text, v2=league in TIDY_ROUNDS)
    clubs = Clubs(std)
    unparsed = [("standings", b) for b in bad]

    # playoff series: the season article's bracket (a section of the playoffs article in recent years), else its sentences, else the playoffs article's bracket
    series, how = [], None
    br, odd = P.bracket_series(full)
    unparsed += [("bracket", o) for o in odd]
    if br:
        how = "bracket"
        for i, rd in enumerate(dict.fromkeys(b[0] for b in br), 1):
            for (name, ta, la, sa, tb, lb, sb) in [b for b in br if b[0] == rd]:
                a, b2 = clubs.find(ta, la), clubs.find(tb, lb)
                if not a or not b2:
                    unparsed.append(("bracket", f"{rd}: {ta} {sa} - {sb} {tb}")); continue
                w, l, ww, lw = (a, b2, sa, sb) if sa > sb else (b2, a, sb, sa)
                if sa == sb: unparsed.append(("bracket", f"{rd}: {ta} {sa} - {sb} {tb} (a tie)")); continue
                series.append(dict(round=rd, no=i, winner=w, loser=l, ww=ww, lw=lw, src="bracket template"))
    if not series:
        pr, pu = P.prose_series(text)
        unparsed += [("playoffs", u) for u in pu]
        if pr:
            how = "sentences"
            order = list(dict.fromkeys(b[0] for b in pr))
            for (rd, w, wl, l, ll, a, b, raw) in pr:
                cw, cl = clubs.find(w, wl), clubs.find(l, ll)
                if not cw or not cl:
                    unparsed.append(("playoffs", raw)); continue
                if a < b:
                    unparsed.append(("playoffs", raw + " (winner has fewer)")); continue
                series.append(dict(round=rd, no=order.index(rd) + 1, winner=cw, loser=cl, ww=a, lw=b, src="sentence: " + raw))
    if not series and ptext:
        br, odd = P.bracket_series(P.expand_sections(ptext_x, pages))
        unparsed += [("bracket", o) for o in odd]
        if br:
            how = "bracket (playoffs article)"
            for i, rd in enumerate(dict.fromkeys(b[0] for b in br), 1):
                for (name, ta, la, sa, tb, lb, sb) in [b for b in br if b[0] == rd]:
                    a, b2 = clubs.find(ta, la), clubs.find(tb, lb)
                    if not a or not b2 or sa == sb:
                        unparsed.append(("bracket", f"{rd}: {ta} {sa} - {sb} {tb}")); continue
                    w, l, ww, lw = (a, b2, sa, sb) if sa > sb else (b2, a, sb, sa)
                    series.append(dict(round=rd, no=i, winner=w, loser=l, ww=ww, lw=lw, src="bracket template (playoffs article)"))

    # series told by game blocks ({{NHLPlayoffs}}) or by game tables, when no bracket gives them
    tg_series, tg_games = [], []
    for src_text in (ptext_x, text_x) if league in TIDY_ROUNDS else ():
        if not src_text: continue
        sx = P.expand_sections(src_text, pages)
        bs, bb = P.block_series(sx)
        ts, tgm, tb = P.table_games(sx, y)
        unparsed += [("playoffs", b) for b in bb + tb]
        tg_series += bs + ts; tg_games += tgm
    if tg_series and (not series or league in TIDY_ROUNDS):
        how = how or "game blocks and tables"
        order = list(dict.fromkeys(x["group"] for x in tg_series))
        for x in tg_series:
            a, b2 = clubs.find(x["team1"]), clubs.find(x["team2"])
            if not a or not b2:
                unparsed.append(("playoffs", f"{x['round']}: {x['team1']} {x['wins1']} - {x['wins2']} {x['team2']}")); continue
            w, l, ww, lw = (a, b2, x["wins1"], x["wins2"]) if x["wins1"] > x["wins2"] else (b2, a, x["wins2"], x["wins1"])
            if any({s0["winner"], s0["loser"]} == {w, l} for s0 in series) if league in TIDY_ROUNDS else any(s0["winner"] == w and s0["loser"] == l and s0["round"] == x["round"] for s0 in series): continue
            series.append(dict(round=x["round"], no=order.index(x["group"]) + 1, winner=w, loser=l, ww=ww, lw=lw, src=x["src"]))

    if league in TIDY_ROUNDS:
        for x in series: x["round"] = P.tidy_round(x["round"])
        for x in series: x["round"] = " ".join(w[:1].upper() + w[1:] for w in x["round"].split())
        stages = {x["round"]: P.round_stage(x["round"]) for x in series}
        if series and all(v is not None for v in stages.values()):
            rank = {v: i for i, v in enumerate(sorted(set(stages.values())), 1)}
            for x in series: x["no"] = rank[stages[x["round"]]]
        else:
            names = list(dict.fromkeys(x["round"].lower() for x in series))
            for x in series: x["no"] = names.index(x["round"].lower()) + 1

    # games the articles tabulate
    games = []
    for src_text in (ptext_x, text_x):
        g, gb = P.playoff_games(P.expand_sections(src_text, pages) if src_text else "", y)
        unparsed += [("games", b) for b in gb]
        for x in g:
            h, a = clubs.find(x["home"]), clubs.find(x["away"])
            if not h or not a:
                unparsed.append(("games", x["src"])); continue
            games.append(dict(x, home=h, away=a))
        if games: break
    if not games:
        for x in tg_games:
            h, a = clubs.find(x["home"]), clubs.find(x["away"])
            if not h or not a:
                unparsed.append(("games", x["src"])); continue
            games.append(dict(x, home=h, away=a))
    seen, uniq = set(), []
    for g in games:
        k = (g["date"], g["home"], g["away"], g["home_pts"], g["away_pts"])
        if k in seen: continue
        seen.add(k); uniq.append(g)
    games = uniq
    # a round the article calls a total-goals series, or one whose winner has more than 4 "wins", gives goals, not games won
    goal_lines = " ".join(ln.lower() for ln in text.splitlines() if re.search(r"total[- ]goals?", ln))
    for s in series:
        stated = s["round"].lower() in goal_lines
        s["goals"] = stated or s["ww"] > 4
        s["kind"] = "total goals" if stated else "single game" if s["ww"] > 4 else "games won"
        if s["goals"]: s["gw"], s["gl"], s["ww"], s["lw"] = s["ww"], s["lw"], None, None
    # a series' games are kept only when they do not contradict its result (an article may list some of a series' games, never more wins than the series had)
    by_pair = {}
    for g in games:
        wnr = g["home"] if g["home_pts"] > g["away_pts"] else g["away"]
        d = by_pair.setdefault(frozenset((g["home"], g["away"])), {})
        d[wnr] = d.get(wnr, 0) + 1
    drop = set()
    for s in series:
        d = by_pair.get(frozenset((s["winner"], s["loser"])))
        if d and not s["goals"] and (d.get(s["winner"], 0) > s["ww"] or d.get(s["loser"], 0) > s["lw"]):
            drop.add(frozenset((s["winner"], s["loser"])))
            unparsed.append(("games", f"{s['winner']} v {s['loser']}: games add up to {d.get(s['winner'], 0)}-{d.get(s['loser'], 0)}, the series result is {s['ww']}-{s['lw']}: games left out"))
    games = [g for g in games if frozenset((g["home"], g["away"])) not in drop]
    for g in games:
        s = next((s for s in series if {s["winner"], s["loser"]} == {g["home"], g["away"]}), None)
        g["round"] = s["round"] if s else None


    cn, cl_ = P.champion_of(text)
    champ = clubs.find(cn, cl_) if cn else None
    basis = "the season article's infobox"
    last = max(series, key=lambda s: s["no"]) if series else None
    final = last["winner"] if last and re.search(r"(calder|kelly|riley) cup" + (r"|\bfinals?\b" if league in TIDY_ROUNDS else ""), last["round"], re.I) and not re.search(r"division|conference|semi", last["round"], re.I) else None
    if not champ:
        ln, ll = listed_champions(league).get(y, (None, None))
        champ = clubs.find(ln, ll) if ln else None
        if champ: cl_, basis = ll, f"the league's list of seasons"
    if not champ and final:
        champ, basis = final, "the winner of the last playoff series"
    elif champ and final and final != champ:
        print(f"   champion differs: {basis} {champ}, final series {final}")
        unparsed.append(("champion", f"{basis} names {champ}; the last playoff series was won by {final}"))

    # checks: a league plays only itself, so wins = losses (+ nothing) and goals for = goals against
    sw, sl = sum(r["w"] for r in std), sum(r["l"] for r in std)
    gf, ga = sum(r["gf"] or 0 for r in std), sum(r["ga"] or 0 for r in std)
    flags = []
    sl += sum((r.get("otl") or 0) + (r.get("sol") or 0) for r in std)
    st = sum(r.get("t") or 0 for r in std)
    if std and sw != sl and sw != sl + st: flags.append(f"wins {sw} != losses {sl}")
    if std and gf != ga: flags.append(f"GF {gf} != GA {ga}")
    gw = {}
    for g in games:
        wnr = g["home"] if g["home_pts"] > g["away_pts"] else g["away"]
        key = frozenset((g["home"], g["away"]))
        gw.setdefault(key, {}); gw[key][wnr] = gw[key].get(wnr, 0) + 1
    for s in series:
        d = gw.get(frozenset((s["winner"], s["loser"])))
        if d and not s["goals"] and (d.get(s["winner"], 0), d.get(s["loser"], 0)) != (s["ww"], s["lw"]):
            flags.append(f"series {s['winner']} v {s['loser']}: bracket {s['ww']}-{s['lw']}, games {d.get(s['winner'], 0)}-{d.get(s['loser'], 0)}")
    dv = sorted({(r["conference"], r["division"]) for r in std}, key=str)
    print(f"{league} {y}: clubs={len(clubs.names)} standings={len(std)} divisions={len(dv)} series={len(series)} ({how}) games={len(games)} unparsed={len(unparsed)} champion={champ}"
          + (" FLAGS: " + "; ".join(flags) if flags else ""))
    for u in unparsed[:5]: print("   unparsed:", u)
    if dry: return

    out = ["begin;"] + [f"delete from {S}.{t} where league = {q(league)} and season = {y};" for t in ("season", "team_season", "game", "standing", "series", "unparsed")]
    out.append(f"insert into {S}.season (league, season, page_title, playoffs_title, teams, fetched_on, champion, champion_link, champion_basis) values "
               f"({q(league)}, {y}, {q(F.season_title(league, y))}, {q(pt if ptext else None)}, {len(clubs.names)}, {q(F.RUN_DATE)}, {q(champ)}, {q(cl_)}, {q(basis if champ else None)});")
    seen_ts = set()
    for r in std:
        if r["team"] in seen_ts: continue
        seen_ts.add(r["team"])
        out.append(f"insert into {S}.team_season (league, season, team_name, link_title, affiliation, affiliation_links) values ({q(league)}, {y}, {q(r['team'])}, {q(r['link'])}, {q(r['affiliation'])}, {q(r.get('affiliation_links'))});")
    for r in std:
        out.append("insert into %s.standing values (%s,%d,%s,%s,%s,%d,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s);" % (
            S, q(league), y, q(r["team"]), q(r["division"] or "League"), q(r["conference"]), r["rank"], n(r.get("gp")), n(r.get("w")), n(r.get("l")), n(r.get("t")),
            n(r.get("otl")), n(r.get("sol")), n(r.get("pts")), n(r.get("gf")), n(r.get("ga")), q(r["link"]), q(r["affiliation"]), q("standings table")))
    for s in series:
        out.append(f"insert into {S}.series values ({q(league)}, {y}, {q(s['round'])}, {s['no']}, {q(s['winner'])}, {q(s['loser'])}, {n(s['ww'])}, {n(s['lw'])}, "
                   f"{n(s.get('gw'))}, {n(s.get('gl'))}, {q(s['kind'])}, {q(s['src'])}) on conflict do nothing;")
    seq = {}
    for g in games:
        k = (g["date"], g["home"], g["away"])
        seq[k] = seq.get(k, 0) + 1
        out.append("insert into %s.game values (%s,%d,'playoffs',%s,%s,%s,%s,%d,%d,%s,%s,%d);" % (
            S, q(league), y, q(str(g["date"])), q(g["round"]), q(g["home"]), q(g["away"]), g["home_pts"], g["away_pts"], "true" if g["overtime"] else "false",
            q(g["src"]), seq[k]))
    for page, txt in unparsed:
        out.append(f"insert into {S}.unparsed values ({q(league)}, {y}, {q(page)}, {q(txt)});")
    out.append("commit;")
    psql("\n".join(out) + "\n")


def extras(dry):
    d = os.path.join(F.CACHE, "league")
    if not os.path.isdir(d): return
    files = [f"league/{f}" for f in sorted(os.listdir(d)) if not open(os.path.join(d, f), encoding="utf-8").read(40).startswith("#MISSING")]
    print("league", len(files), "files")
    if not dry and not NO_ARCHIVE: archive("wikipedia-hockey-minor", files)


if __name__ == "__main__":
    a = [x for x in sys.argv[1:] if x not in ("--dry", "--no-archive")]
    dry = "--dry" in sys.argv
    if a and a[0] == "--extras": extras(dry); raise SystemExit
    if not a or a[0] not in F.LEAGUES: raise SystemExit(__doc__)
    lg = a[0]
    F.fetch_league(lg)
    for y in ([int(x) for x in a[1:]] or F.years(lg)): run(lg, y, dry)
