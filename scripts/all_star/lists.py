"""The result tables of the league All-Star Game articles of English Wikipedia (CC BY-SA 4.0) read into events: one dict per event with its games and
Most Valuable Players. Each reader takes the page's wikitext and returns (events, issues); an issue is (year, what, detail) for something it would not take.
A value a table does not print stays None. Nothing is guessed."""
import datetime, re

import wiki
from wiki import (decided_by, int_of, lines_of, links, parse_date, parse_result, person_of, plain, raw_tables, split_top, strip_markup, team_of, txt)

SOURCES = {
    "nhl": ["NHL All-Star Game"],
    "nba": ["NBA All-Star Game"],
    "mlb": ["List of Major League Baseball All-Star Games"],
    "nfl": ["Pro Bowl"],
    "cfl": ["CFL All-Star Game"],
    "wnba": ["WNBA All-Star Game"],
}


def new_event(league, year, article=None):
    return dict(league=league, year=year, event_no=1, article=article, played_on=None, last_day=None, status="played", status_reason=None, format=None,
                venue_name=None, venue_title=None, city_text=None, city_title=None, host_name=None, host_title=None, attendance=None, games=[], mvps=[])


def reason_of(note):
    t = (note or "").lower()
    for key, code in (("lockout", "lockout"), ("olympic", "olympics"), ("covid", "pandemic"), ("pandemic", "pandemic"), ("world cup", "world_cup"),
                      ("world war", "war"), ("strike", "strike"), ("travel restriction", "war")):
        if key in t:
            return code
    return "other"


def mvps_of(cell, plain_kind=None):
    """The Most Valuable Players of a cell: one per line (<br> or <hr>), 'Name, Team'. A bold 'Offense:' prefix is the kind."""
    out = []
    for ln in lines_of(cell):
        kind = plain_kind
        km = re.match(r"^\s*'''([^']+?):?'''\s*:?\s*(.*)$", ln)
        if km:
            kind, ln = km.group(1).strip().rstrip(":").lower(), km.group(2)
        if not plain(ln) or re.match(r"^(n/a|not (yet )?awarded|tbd|none)\b", plain(ln), re.I) or "{{n/a" in ln.lower():
            continue
        # a '{{small|[[Team]]}}' second line belongs to the person before it
        if out and not links(ln) and False:
            continue
        name, title, rest = person_of(ln)
        if not name:
            continue
        team, team_title = team_of(rest)
        out.append(dict(kind=kind, name=name, title=title, team_name=team, team_title=team_title))
    return out


def merge_small_team_lines(cell):
    """NBA cells read 'Name<br>{{small|[[Team]]}}<hr>Name2<br>{{small|[[Team2]]}}': join each name with the team line after it ('Name, Team')."""
    parts = re.split(r"<hr\s*/?>", strip_markup(cell or ""), flags=re.I)
    out = []
    for p in parts:
        ls = [x.strip() for x in re.split(r"<br\s*/?>", p, flags=re.I) if x.strip()]
        if not ls:
            continue
        if len(ls) >= 2:
            out.append(ls[0].rstrip(", ") + ", " + re.sub(r"^\{\{\s*small\s*\|(.*)\}\}$", r"\1", ls[1], flags=re.I))
        else:
            out.append(ls[0])
    return "<br>".join(out)


def games_from_hr(cell):
    """The NBA's 2025 and 2026 cells: one game per <hr> part, '{{small|Semifinal 1}}<br>Team A 41 - 32 Team B<br>{{small|(Overtime)}}'."""
    games = []
    for part in re.split(r"<hr\s*/?>", strip_markup(cell or ""), flags=re.I):
        ls = [x.strip() for x in re.split(r"<br\s*/?>", part, flags=re.I) if x.strip()]
        stage, res = None, None
        for ln in ls:
            r = parse_result(ln)
            if r and res is None:
                res = r
            elif plain(ln) and res is None:
                stage = plain(ln).lower()
        if res:
            by = res[4] or decided_by(" ".join(plain(x) for x in ls))
            games.append(dict(game_no=len(games) + 1, stage=stage, side1=res[0], score1=res[1], side2=res[2], score2=res[3], decided_by=by))
    return games


def table_with(text, needle, header_row=0):
    for t in raw_tables(text):
        rows = t.rows
        if rows and any(needle.lower() in plain(b).lower() for _, b in rows[header_row]):
            return t
    return None


def venue_fields(ev, venue_cell, city_cell, host_cell=None):
    if venue_cell is not None:
        ls = links(venue_cell)
        ev["venue_name"] = plain(venue_cell) or None
        ev["venue_title"] = ls[0][0] if ls else None
    if city_cell is not None:
        ls = links(city_cell)
        ev["city_text"] = plain(city_cell) or None
        ev["city_title"] = ls[0][0] if ls else None
    if host_cell is not None:
        ls = links(host_cell)
        ev["host_name"] = plain(host_cell) or None
        ev["host_title"] = ls[0][0] if ls else None


def games_from_lines(cell, tournament):
    """Each line of a result cell that holds two scores is one game (the NHL 2016 to 2024 mini-tournaments and the two Soviet series have three or two lines)."""
    out = []
    for ln in lines_of(cell):
        r = parse_result(ln)
        if r:
            out.append(r)
    games = []
    for i, (a, sa, b, sb, by) in enumerate(out):
        stage = None
        if tournament and len(out) == 3:
            stage = "semifinal" if i < 2 else "final"
        elif len(out) > 1:
            stage = "game %d" % (i + 1)
        games.append(dict(game_no=i + 1, stage=stage, side1=a, score1=sa, side2=b, score2=sb, decided_by=by))
    return games


def nhl(text, today):
    t = table_with(text, "Host arena")
    if t is None:
        return [], [(None, "table", "no results table with a Host arena column")]
    events, issues, prev_reason = [], [], None
    for row in t.rows[1:]:
        c0 = txt(row[0][1])
        ym = re.search(r"\((\d{4})\)", c0) or re.search(r"\b(19\d\d|20\d\d)\b", c0)
        if not ym:
            continue
        year = int(ym.group(1))
        ls0 = links(row[0][1])
        ev = new_event("nhl", year, ls0[0][0] if ls0 else None)
        if ev["article"] in ("4 Nations Face-Off",):
            continue
        if len(row) <= 2:
            if year > today.year:
                continue
            note = plain(row[1][1]) if len(row) > 1 else ""
            if "shifted" in note:
                continue
            ev["status"] = "cancelled"
            ev["status_reason"] = reason_of(note) if note else prev_reason
            prev_reason = ev["status_reason"]
            ev["article"] = None
            events.append(ev)
            continue
        prev_reason = None
        if re.search(r"TBD", plain(row[1][1])) or year > today.year:
            continue
        special = ev["article"] and not re.search(r"All-Star Game", ev["article"])
        ev["format"] = "series" if special else None
        ev["games"] = games_from_lines(row[1][1], tournament=year >= 2016 and not special)
        if not ev["games"]:
            issues.append((year, "result", "no score read from: " + plain(row[1][1])[:80]))
        cells = [b for _, b in row]
        venue_fields(ev, cells[3] if len(cells) > 3 else None, cells[4] if len(cells) > 4 else None, cells[2] if len(cells) > 2 else None)
        if len(cells) > 5:
            ev["mvps"] = mvps_of(cells[5])
        events.append(ev)
    return events, issues


def nba(text, today):
    t = table_with(text, "Host arena")
    if t is None:
        return [], [(None, "table", "no results table with a Host arena column")]
    events, issues = [], []
    for row in t.rows[1:]:
        cells = [b for _, b in row]
        ls0 = links(cells[0])
        ym = re.search(r"\b(19\d\d|20\d\d)\b", txt(cells[0]))
        if not ym:
            continue
        year = int(ym.group(1))
        ev = new_event("nba", year, ls0[0][0] if ls0 else None)
        if len(cells) < 4:
            ev["status"] = "cancelled"
            ev["status_reason"] = reason_of(plain(cells[-1]))
            events.append(ev)
            continue
        if re.search(r"TBD", plain(cells[1])) or year > today.year:
            continue
        ev["games"] = games_from_hr(cells[1])
        if not ev["games"]:
            issues.append((year, "result", "no score read from: " + plain(cells[1])[:80]))
        venue_fields(ev, cells[2], cells[3])
        if len(cells) > 4:
            ev["mvps"] = mvps_of(merge_small_team_lines(cells[4]))
        events.append(ev)
    return events, issues


def wnba(text, today):
    t = table_with(text, "Host arena")
    if t is None:
        return [], [(None, "table", "no results table with a Host arena column")]
    events, issues = [], []
    for row in t.rows[1:]:
        cells = [b for _, b in row]
        ym = re.search(r"\b(19\d\d|20\d\d)\b", txt(cells[0]))
        if not ym:
            continue
        year = int(ym.group(1))
        ls0 = links(cells[0])
        ev = new_event("wnba", year, ls0[0][0] if ls0 else None)
        if len(cells) == 2:
            ev["status"] = "cancelled"
            ev["status_reason"] = reason_of(plain(cells[1]))
            events.append(ev)
            continue
        if re.search(r"TBD", plain(cells[1])) or year > today.year or len(cells) < 5:
            continue
        r = parse_result(cells[1])
        if r:
            ev["games"] = [dict(game_no=1, stage=None, side1=r[0], score1=r[1], side2=r[2], score2=r[3], decided_by=r[4])]
        else:
            issues.append((year, "result", "no score read from: " + plain(cells[1])[:80]))
        venue_fields(ev, cells[2], cells[3])
        ev["mvps"] = mvps_of(cells[4])
        events.append(ev)
    return events, issues


def mlb(text, today):
    t = table_with(text, "Winning League")
    if t is None:
        return [], [(None, "table", "no results table with a Winning League column")]
    head = [plain(b).lower() for _, b in t.rows[0]]

    def col(name):
        return next((i for i, h in enumerate(head) if name in h), None)

    ci = dict(date=col("date"), league=col("winning"), score=col("score"), venue=col("venue"), host=col("host"), att=col("attendance"), mvp=col("mvp"))
    events, issues, per_year = [], [], {}
    for row in t.rows[1:]:
        cells = [b for _, b in row]
        d = parse_date(cells[0])
        if d is None:
            continue
        ls0 = links(cells[0])
        ev = new_event("mlb", d.year, ls0[0][0] if ls0 else None)
        per_year[d.year] = per_year.get(d.year, 0) + 1
        ev["event_no"] = per_year[d.year]
        ev["played_on"] = d
        if len(cells) <= 2:
            ev["status"] = "cancelled"
            ev["status_reason"] = reason_of(plain(cells[1]))
            ev["played_on"] = None
            ev["article"] = None
            events.append(ev)
            continue
        if d > today or not plain(cells[ci["score"]]):
            continue
        win = lines_of(cells[ci["league"]])[0] if lines_of(cells[ci["league"]]) else ""
        s = re.search(r"(\d+)\s*[–-]\s*(\d+)", plain(cells[ci["score"]]))
        if not s:
            issues.append((d.year, "result", "no score read from: " + plain(cells[ci["score"]])[:60]))
        else:
            tie = bool(re.match(r"^\s*tie", plain(win), re.I))
            w = plain(win)
            w_name = None if tie else ("American League" if w.lower().startswith("american") else "National League" if w.lower().startswith("national") else w)
            if tie:
                a, b = "American League", "National League"
            else:
                a, b = w_name, wiki.OPPOSITE.get(w_name.lower(), None)
            if b is None:
                issues.append((d.year, "result", "no other league for " + str(w_name)))
            else:
                ev["games"] = [dict(game_no=1, stage=None, side1=a, score1=int(s.group(1)), side2=b, score2=int(s.group(2)), decided_by=None)]
        venue_fields(ev, cells[ci["venue"]], None, cells[ci["host"]])
        ev["attendance"] = int_of(plain(cells[ci["att"]])) if ci["att"] is not None else None
        if ci["mvp"] is not None and len(cells) > ci["mvp"]:
            ev["mvps"] = mvps_of(cells[ci["mvp"]])
        events.append(ev)
    return events, issues


def nfl(text, today):
    """The Pro Bowl: every table of the 'Game results' section; the columns are found by their headers."""
    events, issues = [], []
    for t in raw_tables(text):
        if "Game results" not in t.path or not t.rows:
            continue
        head = [plain(b).lower() for _, b in t.rows[0]]
        if not any("date" in h for h in head):
            continue

        def col(name):
            return next((i for i, h in enumerate(head) if name in h), None)

        ci = dict(date=col("date"), score=col("score"), mvp=col("most valuable"), venue=col("venue"), att=col("attendance"))
        for row in t.rows[1:]:
            cells = [b for _, b in row]
            if len(cells) <= 2 or ci["date"] is None or len(cells) <= ci["date"]:
                continue
            d0, d1 = wiki.date_range(cells[ci["date"]])
            if d0 is None:
                continue
            sc = cells[ci["score"]]
            ls = links(sc) or links(cells[ci["date"]])
            ev = new_event("nfl", d0.year, ls[0][0] if ls and re.search(r"(Pro Bowl|All-Star Game)", ls[0][0]) else None)
            ev["played_on"], ev["last_day"] = d0, (d1 if d1 and d1 != d0 else None)
            if d0 > today or re.search(r"TBD|TBA", plain(sc)):
                continue
            segs = [plain(x) for x in lines_of(sc)]
            r = parse_result(" ".join(segs) if len(segs) == 1 else ", ".join(segs))
            if r:
                ev["games"] = [dict(game_no=1, stage=None, side1=r[0], score1=r[1], side2=r[2], score2=r[3], decided_by=None)]
            else:
                issues.append((d0.year, "result", "no score read from: " + plain(sc)[:80]))
            if ci["venue"] is not None and len(cells) > ci["venue"]:
                venue_fields(ev, cells[ci["venue"]], None)
            if ci["att"] is not None and len(cells) > ci["att"]:
                ev["attendance"] = int_of(plain(cells[ci["att"]]))
            if ci["mvp"] is not None and len(cells) > ci["mvp"]:
                ev["mvps"] = mvps_of(cells[ci["mvp"]])
            events.append(ev)
    # the season column says which season; the Pro Bowl of January 2024 belongs to the 2023 season, so the event keeps its calendar year
    seen = {}
    for ev in events:
        key = ev["year"]
        seen[key] = seen.get(key, 0) + 1
        ev["event_no"] = seen[key]
    return events, issues


def cfl(text, today):
    t = table_with(text, "Visitor")
    if t is None:
        return [], [(None, "table", "no results table with a Visitor column")]
    head = [plain(b).lower() for _, b in t.rows[0]]
    idx = {h: i for i, h in enumerate(head)}
    events, issues = [], []
    for row in t.rows[1:]:
        cells = [b for _, b in row]
        d = parse_date(cells[idx["date"]])
        if d is None:
            continue
        ev = new_event("cfl", d.year)
        ev["played_on"] = d
        venue_fields(ev, cells[idx["venue"]], cells[idx["city"]])
        ev["attendance"] = int_of(plain(cells[idx["attendance"]]))
        s = re.search(r"(\d+)\s*[–-]\s*(\d+)", plain(cells[idx["score"]]))
        v, h = plain(cells[idx["visitor"]]), plain(cells[idx["home"]])
        if s:
            ev["games"] = [dict(game_no=1, stage=None, side1=v, score1=int(s.group(1)), side2=h, score2=int(s.group(2)), decided_by=None)]
        else:
            issues.append((d.year, "result", "no score read"))
        events.append(ev)
    return events, issues


READERS = dict(nhl=nhl, nba=nba, mlb=mlb, nfl=nfl, cfl=cfl, wnba=wnba)


def read_list(league, text, today=None):
    return READERS[league](text, today or datetime.date.today())
