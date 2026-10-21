#!/usr/bin/env python3
"""Read the saved "YEAR Stanley Cup Final" wikitext (fetch.py, English Wikipedia, CC BY-SA 4.0) into rows, and write them as SQL for
legacy_wikipedia_stanley_cup_final (migration 142), plus a JSON copy and a report.
Usage: parse.py <raw dir> <out.sql> [<out.json>]
One `final` row per article (teams, games won, dates, format, Conn Smythe winner, who scored the Cup winner) and one `game` row per game: the
score of each team and the overtime periods come from the infobox (team1_1 ... team2_7; a star after a score is an overtime period), the day
from the article's game summaries ({{NHLPlayoffs}}), the arena and city from the infobox location lines, which also say which team was at home.
The recap addresses of those templates point at nhl.com and are never read. Nothing is guessed: a date that cannot be right (the same day as the
game before, outside the series' dates) is left empty and written to `unparsed`, a score the summary contradicts is written there too."""
import datetime, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "wikipedia_awards"))
import wikitable  # noqa: E402

MONTHS = {m: i + 1 for i, m in enumerate("January February March April May June July August September October November December".split())}
MONTH_RE = "(" + "|".join(MONTHS) + ")"


def template_bodies(text, name):
    """The text inside each {{name ...}} (outer braces removed), nested templates kept, in page order."""
    out, i = [], 0
    pat = re.compile(r"\{\{\s*" + name + r"\s*(?=[|\n}])", re.I)
    while True:
        m = pat.search(text, i)
        if not m:
            return out
        depth, j = 0, m.start()
        while j < len(text):
            if text.startswith("{{", j):
                depth += 1; j += 2
            elif text.startswith("}}", j):
                depth -= 1; j += 2
                if depth == 0:
                    break
            else:
                j += 1
        out.append(text[m.end():j - 2])
        i = j


def params(body):
    """{key: value} of the |key=value parameters at the top level of a template body (pipes inside [[ ]] and {{ }} do not split)."""
    parts, cur, depth_l, depth_t, i = [], [], 0, 0, 0
    while i < len(body):
        two = body[i:i + 2]
        if two == "[[":
            depth_l += 1; cur.append(two); i += 2; continue
        if two == "]]":
            depth_l -= 1; cur.append(two); i += 2; continue
        if two == "{{":
            depth_t += 1; cur.append(two); i += 2; continue
        if two == "}}":
            depth_t -= 1; cur.append(two); i += 2; continue
        if body[i] == "|" and depth_l == 0 and depth_t == 0:
            parts.append("".join(cur)); cur = []; i += 1; continue
        cur.append(body[i]); i += 1
    parts.append("".join(cur))
    out = {}
    for p in parts[1:]:
        if "=" in p:
            k, v = p.split("=", 1)
            out[k.strip()] = v.strip()
    return out


def parse_day(text, year):
    """'May 4', 'April 29, 1971', 'June 2 (Tuesday)' -> date or None."""
    m = re.search(MONTH_RE + r"\s+(\d{1,2})\b(?:,?\s*(\d{4}))?", wikitable.clean(text))
    if not m:
        return None
    try:
        return datetime.date(int(m.group(3) or year), MONTHS[m.group(1)], int(m.group(2)))
    except ValueError:
        return None


def parse_range(text, year):
    """'May 24 – June 4, 2008' -> (first day, last day); 'April 8–20, 1958' -> same month."""
    t = wikitable.clean(text).replace("&ndash;", "–")
    a = re.search(MONTH_RE + r"\s+(\d{1,2})", t)
    if not a:
        return None, None
    d0 = datetime.date(year, MONTHS[a.group(1)], int(a.group(2)))
    rest = t[a.end():]
    b = re.search(MONTH_RE + r"\s+(\d{1,2})", rest)
    if b:
        d1 = datetime.date(year, MONTHS[b.group(1)], int(b.group(2)))
    else:
        c = re.search(r"[–-]\s*(\d{1,2})\b", rest)
        d1 = datetime.date(year, d0.month, int(c.group(1))) if c else d0
    return d0, d1


def score_cell(v):
    """'3***' / "'''4'''*" -> (3, 3 overtime periods); None when there is no number."""
    if v is None:
        return None, 0
    t = wikitable.clean(re.sub(r"<[^>]*>", "", v))
    m = re.search(r"\d+", t)
    if not m:
        return None, 0
    return int(m.group(0)), t.count("*")


def split_team(raw):
    """'''[[1957–58 Montreal Canadiens season|Montreal Canadiens]]''' (NHL) -> name, league, season article, bold."""
    bold = "'''" in raw
    art = re.search(r"\[\[([^|\]]*season)\|", raw) or re.search(r"\[\[([^|\]]*season)\]\]", raw)
    name = wikitable.clean(raw)
    lg = None
    m = re.match(r"^(.*?)\s*\(([A-Za-z]{2,6})\)$", name)
    if m:
        name, lg = m.group(1).strip(), m.group(2)
    return name, lg, (art.group(1) if art else None), bold


# A city the arena is in that the club's name does not carry (the club's name is what the infobox line is matched to).
CITY_CLUB = {"New York City": "New York", "Uniondale": "Islanders", "Bloomington": "North Stars", "Inglewood": "Los Angeles", "East Rutherford": "New Jersey",
             "Newark": "New Jersey", "Miami": "Florida", "Sunrise": "Florida", "Raleigh": "Carolina", "Paradise": "Vegas", "Denver": "Colorado",
             "Tampa": "Tampa Bay", "Saint Paul": "Minnesota", "St. Paul": "Minnesota", "Glendale": "Arizona", "Landover": "Washington", "Elmont": "Islanders",
             "Chicago": "Chicago", "Boston": "Boston"}


def home_of(city, t1, t2):
    """1 or 2: the finalist whose name carries the city of the arena (or the club's name for a suburb), else None (a neutral or unknown ground)."""
    if not city:
        return None
    key = CITY_CLUB.get(city.split(",")[0].strip(), city.split(",")[0].strip()).lower()
    a, b = key in t1.lower(), key in t2.lower()
    return 1 if a and not b else 2 if b and not a else None


def locations(p):
    """[(index, city, venue, [game numbers])] from location1..location4."""
    out = []
    for i in range(1, 5):
        v = p.get("location%d" % i)
        if not v:
            continue
        nums = []
        t = wikitable.clean(v)
        mm = re.search(r"\(([\d,\s&and–-]+)\)\s*$", t)
        if mm:
            for part in re.split(r"[,&]|\band\b", mm.group(1)):
                r = re.match(r"^\s*(\d+)\s*[–-]\s*(\d+)\s*$", part)
                if r:
                    nums += list(range(int(r.group(1)), int(r.group(2)) + 1))
                elif re.search(r"\d+", part):
                    nums.append(int(re.search(r"\d+", part).group(0)))
            t = t[:mm.start()].strip()
        if ":" in t:
            city, venue = [x.strip() for x in t.split(":", 1)]
        else:
            city, venue = None, t
        out.append((i, city, venue, nums))
    return out


def summaries(text, year):
    """The {{NHLPlayoffs}} game summaries in page order: [{'date', 'score', 'ot', 'won'}]. The recap address is dropped."""
    games = []
    for body in template_bodies(text, "NHLPlayoffs"):
        p = params(body)
        idx = sorted({int(m.group(1)) for k in p for m in [re.match(r"^(?:date|score|won|ot|home)(\d+)$", k)] if m})
        for n in idx:
            games.append(dict(date_text=p.get("date%d" % n), score=p.get("score%d" % n), ot=p.get("ot%d" % n), won=p.get("won%d" % n),
                              stadium=wikitable.clean(p["stadium1"]) if len(idx) == 1 and p.get("stadium1") else None))
    return games


def parse_article(text, year, info):
    boxes = template_bodies(text, "Infobox Stanley Cup Finals?") or template_bodies(text, "Infobox ice hockey series")
    if not boxes:
        raise SystemExit("%d: no infobox" % year)
    p = params(boxes[0])
    issues = []
    t1, l1, a1, b1 = split_team(p["team1"])
    t2, l2, a2, b2 = split_team(p["team2"])
    d0, d1 = parse_range(p.get("dates", ""), year)
    tot1 = int(re.search(r"\d+", p["team1_tot"]).group(0)) if p.get("team1_tot") else None
    tot2 = int(re.search(r"\d+", p["team2_tot"]).group(0)) if p.get("team2_tot") else None
    winner = None
    if tot1 is not None and tot2 is not None and tot1 != tot2:
        winner = t1 if tot1 > tot2 else t2
        if (b1 or b2) and (b1 != (tot1 > tot2)):
            issues.append(("winner", "the bold team (%s) is not the one with more games won" % (t1 if b1 else t2)))
    mvp = p.get("mvp")
    cs_name = cs_team = None
    if mvp:
        m = re.match(r"^(.*?)\s*\(([^()]*)\)\s*$", wikitable.clean(mvp))
        cs_name, cs_team = (m.group(1), m.group(2)) if m else (wikitable.clean(mvp), None)
    sw = p.get("series_winner")
    goal_name = goal_detail = None
    if sw:
        m = re.match(r"^(.*?)\s*\(([^()]*)\)\s*$", wikitable.clean(sw))
        goal_name, goal_detail = (m.group(1), m.group(2)) if m else (wikitable.clean(sw), None)
    final = dict(cup_year=year, article="%d Stanley Cup Final" % year, revision_id=info["revid"], fetched_on=info["fetched"],
                 dates_text=wikitable.clean(p.get("dates", "")), first_day=d0, last_day=d1, format=wikitable.clean(p["format"]) if p.get("format") else None,
                 team1=t1, team1_league=l1, team1_article=a1, team2=t2, team2_league=l2, team2_article=a2, team1_games=tot1, team2_games=tot2,
                 winner=winner, conn_smythe=cs_name, conn_smythe_team=cs_team, cup_goal_by=goal_name, cup_goal_detail=goal_detail)
    # games from the infobox
    ks = sorted({int(m.group(2)) for k in p for m in [re.match(r"^team([12])_(\d+)$", k)] if m})
    sums = summaries(text, year)
    locs = locations(p)
    table_days = {int(m.group(1)): m.group(2) for m in re.finditer(r"^\|(\d+)\|\|\s*(" + MONTH_RE + r" \d{1,2})\s*\|\|", text, re.M)}
    games = []
    for k in ks:
        s1, o1 = score_cell(p.get("team1_%d" % k))
        s2, o2 = score_cell(p.get("team2_%d" % k))
        sm = sums[k - 1] if k <= len(sums) else None
        day = parse_day(sm["date_text"], year) if sm and sm["date_text"] else (parse_day(table_days[k], year) if k in table_days else None)
        ot = max(o1, o2)
        if sm and sm["ot"]:
            m = re.search(r"\d+", sm["ot"])
            if m and ot and int(m.group(0)) != ot:
                issues.append(("game %d" % k, "overtime periods: infobox %d, summary %s" % (ot, sm["ot"])))
            ot = max(ot, int(m.group(0))) if m else ot
        if sm and sm["score"]:
            nums = sorted(int(x) for x in re.findall(r"\d+", wikitable.clean(sm["score"]))[:2])
            if nums != sorted([s1, s2]):
                issues.append(("game %d" % k, "score: infobox %s-%s, game summary %s" % (s1, s2, sm["score"])))
        elif sm is None and k not in table_days:
            issues.append(("game %d" % k, "no game summary: no date"))
        if day and games and games[-1]["played_on"] and day <= games[-1]["played_on"]:
            issues.append(("game %d" % k, "date %s is not after game %d (%s): left empty" % (day, k - 1, games[-1]["played_on"]))); day = None
        if day and d0 and not (d0 <= day <= d1):
            issues.append(("game %d" % k, "date %s is outside the series dates %s: left empty" % (day, final["dates_text"]))); day = None
        city = venue = None
        home_side = None
        for (i, c, v, nums) in locs:
            if k in nums or (not nums and len(locs) == 1):
                city, venue = c, v
                home_side = home_of(c, t1, t2)
        if venue is None and sm and sm["stadium"]:
            venue = sm["stadium"]
            for (i, c, v, nums) in locs:
                if v == venue:
                    city = c
                    home_side = home_of(c, t1, t2)
        games.append(dict(cup_year=year, game_no=k, played_on=day, team1_score=s1, team2_score=s2, overtime_periods=ot, venue=venue, city=city, home_side=home_side))
    if final["team1_games"] is not None and games:
        w1 = sum(1 for g in games if g["team1_score"] is not None and g["team2_score"] is not None and g["team1_score"] > g["team2_score"])
        w2 = sum(1 for g in games if g["team1_score"] is not None and g["team2_score"] is not None and g["team2_score"] > g["team1_score"])
        if (w1, w2) != (final["team1_games"], final["team2_games"]):
            issues.append(("series", "games add up to %d-%d, the infobox says %d-%d" % (w1, w2, final["team1_games"], final["team2_games"])))
    if year >= 1965 and not mvp:
        issues.append(("conn_smythe", "no Conn Smythe winner in the infobox"))
    return final, games, issues


def sql_val(v):
    if v is None:
        return "null"
    if isinstance(v, (int,)):
        return str(v)
    if isinstance(v, datetime.date):
        return "'%s'" % v.isoformat()
    return "'" + str(v).replace("'", "''") + "'"


FINAL_COLS = ["cup_year", "article", "revision_id", "fetched_on", "dates_text", "first_day", "last_day", "format", "team1", "team1_league", "team1_article",
              "team2", "team2_league", "team2_article", "team1_games", "team2_games", "winner", "conn_smythe", "conn_smythe_team", "cup_goal_by", "cup_goal_detail"]
GAME_COLS = ["cup_year", "game_no", "played_on", "team1_score", "team2_score", "overtime_periods", "venue", "city", "home_side"]


def main():
    raw, out_sql = os.path.expanduser(sys.argv[1]), os.path.expanduser(sys.argv[2])
    out_json = os.path.expanduser(sys.argv[3]) if len(sys.argv) > 3 else None
    log = json.load(open(os.path.join(raw, "fetched.json")))
    finals, games, unparsed = [], [], []
    for title in sorted(t for t in log if t.endswith("Stanley Cup Final")):
        year = int(title[:4])
        text = open(os.path.join(raw, title.replace(" ", "_") + ".wikitext"), encoding="utf-8").read()
        if text.lstrip().upper().startswith("#REDIRECT"):
            unparsed.append(dict(cup_year=year, what="article", detail="the article is a redirect (no final was played)"))
            continue
        f, g, iss = parse_article(text, year, log[title])
        finals.append(f); games += g
        unparsed += [dict(cup_year=year, what=w, detail=d) for w, d in iss]
    with open(out_sql, "w", encoding="utf-8") as f:
        f.write("-- generated by scripts/stanley_cup_final/parse.py from the saved wikitext (CC BY-SA 4.0); rerunnable\n")
        f.write("delete from legacy_wikipedia_stanley_cup_final.unparsed;\ndelete from legacy_wikipedia_stanley_cup_final.game;\ndelete from legacy_wikipedia_stanley_cup_final.final;\n")
        for r in finals:
            f.write("insert into legacy_wikipedia_stanley_cup_final.final (%s) values (%s);\n" % (", ".join(FINAL_COLS), ", ".join(sql_val(r[c]) for c in FINAL_COLS)))
        for r in games:
            f.write("insert into legacy_wikipedia_stanley_cup_final.game (%s) values (%s);\n" % (", ".join(GAME_COLS), ", ".join(sql_val(r[c]) for c in GAME_COLS)))
        for r in unparsed:
            f.write("insert into legacy_wikipedia_stanley_cup_final.unparsed (cup_year, what, detail) values (%d, %s, %s);\n" % (r["cup_year"], sql_val(r["what"]), sql_val(r["detail"])))
    if out_json:
        json.dump({"finals": finals, "games": games, "unparsed": unparsed}, open(out_json, "w"), indent=1, ensure_ascii=False, default=str)
    print(len(finals), "finals,", len(games), "games,", sum(1 for g in games if g["played_on"]), "with a day,", len(unparsed), "notes in unparsed")


if __name__ == "__main__":
    main()
