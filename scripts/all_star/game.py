"""One All-Star Game article of English Wikipedia (CC BY-SA 4.0): the infobox (date, venue, city, attendance) and the rosters (the players picked for each side).
Rosters are read from wiki tables with a Player column, from the Pro Bowl's position grids and from bulleted lines ('* 4 - LW [[Name]] ([[Team]])'), under the page's
Rosters or Lineup headings (else under headings that name a side). A table or list it cannot read is reported, not guessed."""
import datetime
import re

import wiki
from wiki import (date_range, links, norm_title, params, person_of, plain, raw_tables, split_top, strip_markup, team_of, template_bodies)

ROLE_RE = re.compile(r"starter|starting|reserve|bench|replace|injur|alternate|selection|substitute|honorary", re.I)
SIDE_RE = re.compile(r"league|conference|division|team|east|west|america|world|afc|nfc|all-?stars|canada|united states|usa", re.I)
SKIP_HEAD = re.compile(r"vot|pool|draft|selections per|note|coach|ballot|candidate|nominee|finalist|history|schedule|summary|referee|official|uniform|score by|scoring|statistic|skills", re.I)


def _template_days(raw):
    """{{start date|1987|2|8}} and {{start and end dates|1987|2|8|1987|2|11}} -> (first day, last day)."""
    m = re.search(r"\{\{\s*start and end dates?\s*\|\s*(\d{4})\s*\|\s*(\d+)\s*\|\s*(\d+)\s*\|\s*(\d{4})\s*\|\s*(\d+)\s*\|\s*(\d+)", raw or "", re.I)
    if m:
        n = [int(x) for x in m.groups()]
        return datetime.date(*n[:3]), datetime.date(*n[3:])
    m = re.search(r"\{\{\s*(?:start|end) date\s*\|\s*(\d{4})\s*\|\s*(\d+)\s*\|\s*(\d+)", raw or "", re.I)
    if m:
        d = datetime.date(*[int(x) for x in m.groups()])
        return d, d
    return None, None


def infobox(text):
    boxes = template_bodies(text, r"Infobox[^|{}\n]*?")
    if not boxes:
        return {}
    p = params(boxes[0])
    out = {}
    raw_day = p.get("date") or p.get("Date") or p.get("date1") or p.get("dates") or ""
    d0, d1 = _template_days(raw_day)
    if d0 is None:
        d0, d1 = date_range(raw_day)
    out["first_day"], out["last_day"] = d0, (d1 if d1 and d1 != d0 else None)
    for key in ("arena", "venue", "stadium", "location", "location1"):
        if p.get(key):
            parts = split_top(strip_markup(p[key]), [",", "<br"])
            ls = links(parts[0])
            out["venue_name"] = plain(parts[0]) or None
            out["venue_title"] = ls[0][0] if ls else None
            if key == "location1" and len(parts) > 1 and not p.get("city"):
                lc = links(parts[1])
                out["city_text"] = plain(parts[1]) or None
                out["city_title"] = lc[0][0] if lc else None
            break
    if p.get("city"):
        ls = links(p["city"])
        out["city_text"] = plain(p["city"]) or None
        out["city_title"] = ls[0][0] if ls else None
    if p.get("attendance"):
        out["attendance"] = wiki.int_of(plain(p["attendance"]))
    return out


def norm_role(label):
    t = (label or "").strip().lower()
    if not t:
        return None
    if "starter" in t or t.startswith("start"):
        return "starter"
    if "reserve" in t or "bench" in t or "substitute" in t:
        return "reserve"
    if "replace" in t or "injur" in t:
        return "replacement"
    if "alternate" in t:
        return "alternate"
    return t[:40]


def side_of(caption, path):
    c = re.sub(r"\b(All-?Stars?|rosters?|lineups?|line-ups?)\b", "", caption or "", flags=re.I).strip(" :-–")
    if c:
        return c
    for h in reversed(path):
        h = re.sub(r"\b(rosters?|lineups?|line-ups?|team lineups?)\b", "", h, flags=re.I).strip(" :-–")
        if h and SIDE_RE.search(h) and not SKIP_HEAD.search(h):
            return h
    return None


def sections(text):
    """The wikitext cut at its headings: [(path tuple, body)], each body only the section's own text (up to the next heading)."""
    heads = [(m.start(), len(m.group(1)), wiki.wikitable.clean(m.group(2))) for m in re.finditer(r"^(={2,6})\s*(.*?)\s*\1\s*$", text, re.M)]
    out, stack = [], []
    for i, (pos, lvl, title) in enumerate(heads):
        end = heads[i + 1][0] if i + 1 < len(heads) else len(text)
        stack = [x for x in stack if x[0] < lvl] + [(lvl, title)]
        out.append((tuple(t for _, t in stack), text[pos:end]))
    return out


def roster_sections(text, wide=False):
    """The sections under a heading that mentions a roster or a lineup (the strict reading), or, with `wide`, every section whose heading names a side (a division,
    a conference, a league, a team) and is not about votes, the draft, coaches or the game."""
    out = []
    for path, body in sections(text):
        if SKIP_HEAD.search(path[-1]):
            continue
        if wide:
            if SIDE_RE.search(path[-1]) and not any(re.search(r"roster|line-?up", t, re.I) for t in path):
                out.append((path, body))
        elif any(re.search(r"roster|line-?up|boxscore|reserves|starters|starting", t, re.I) for t in path):
            out.append((path, body))
    return out


BULLET = re.compile(r"^\*+\s*(?P<rest>.+)$")


def bullet_player(line):
    """('* {{flagicon|CAN}} 10 - C [[Syl Apps]] (C)' -> name, title, position, number, team text) for a hockey style roster line."""
    body = strip_markup(BULLET.match(line.strip()).group("rest"))
    body = re.sub(r"\{\{\s*flag[^{}]*\}\}", "", body, flags=re.I).strip()
    m = re.match(r"^\s*(?:(\d+)\s*[-–]\s*)?(?:([A-Z]{1,3}(?:/[A-Z]{1,2})?)\s+)?(.*)$", body)
    num, pos, rest = m.group(1), m.group(2), m.group(3)
    ls = links(rest)
    if not ls:
        return None
    name, title = ls[0][1], ls[0][0]
    team = None
    tm = re.search(r"\(\s*\[\[([^\]|]+)(?:\|[^\]]*)?\]\]", rest)
    if tm:
        team = norm_title(tm.group(1))
    return dict(name=name, title=title, position=pos, team_name=team, team_title=team, number=int(num) if num else None)


def bullets(text, side, role=None):
    """The bulleted roster lines of a piece of text. A bold line ('''Reserves''': or '''Maple Leafs''':) names the group of the lines after it: a role word
    makes it the role, anything else the side."""
    out = []
    for ln in text.split("\n"):
        s = ln.strip().lstrip("|!").strip()
        bm = re.match(r"^'''([^']+)'''\s*:?\s*$", s)
        if bm:
            label = bm.group(1).strip(": ")
            if ROLE_RE.search(label):
                role = norm_role(label)
            else:
                side, role = label, None
            continue
        if BULLET.match(s):
            p = bullet_player(s)
            if p:
                out.append(dict(side=side, role=role, group=None, position=p["position"], name=p["name"], title=p["title"], team_name=p["team_name"], team_title=p["team_title"]))
    return out


def expand(row):
    """A row's cells with each colspan repeated, so a header's columns line up with the data's: [(attrs, raw)] -> [raw]."""
    out = []
    for a, b in row:
        m = re.search(r'colspan\s*=\s*"?(\d+)', a or "")
        out.extend([b] * (int(m.group(1)) if m else 1))
    return out


def grid_rows(t):
    """The Pro Bowl's recent tables: one row per position, a column each for starters, reserves and alternates, several players a cell ('{{Small|1}} [[Name]], [[Team season|City]]')."""
    rows = t.rows
    hi = next((i for i, r in enumerate(rows) if len(r) >= 3 and any(re.search(r"starter", plain(b), re.I) for _, b in r)), None)
    if hi is None:
        return None
    head = [plain(b).lower() for _, b in rows[hi]]
    side = side_of("", t.path)
    unit = t.caption or None
    out = []
    for r in rows[hi + 1:]:
        cells = [b for _, b in r]
        if len(cells) < 2:
            continue
        pos = plain(cells[0]) or None
        for ci in range(1, min(len(cells), len(head))):
            role = norm_role(head[ci])
            for ln in wiki.lines_of(cells[ci]):
                name, title, rest = person_of(re.sub(r"^\s*\{\{\s*small\s*\|[^{}]*\}\}", "", ln, flags=re.I))
                if not name:
                    continue
                team, team_title = team_of(rest)
                out.append(dict(side=side, role=role, group=unit, position=pos, name=name, title=title, team_name=team, team_title=team_title))
    return out


def side_grid_rows(t):
    """The older Pro Bowl tables: a row per position, a column per side (AFC, NFC), several players a cell ('[[Name]] - [[Team]]<br>...')."""
    rows = t.rows
    hi = next((i for i, r in enumerate(rows) if len(r) >= 3 and plain(r[0][1]).lower().startswith("pos")), None)
    if hi is None:
        return None
    sides = [plain(b) for _, b in rows[hi]]
    group = t.path[-1] if t.path else None
    out = []
    for r in rows[hi + 1:]:
        cells = [b for _, b in r]
        if len(cells) < 2:
            continue
        pos = plain(cells[0]) or None
        for ci in range(1, min(len(cells), len(sides))):
            for ln in wiki.lines_of(cells[ci]):
                name, title, _ = person_of(ln)
                if not name or not links(ln):
                    continue
                parts = re.split(r"\s+[–—-]\s+", strip_markup(ln), maxsplit=1)
                team = plain(parts[1]) if len(parts) > 1 else None
                out.append(dict(side=sides[ci] or None, role=None, group=group, position=pos, name=name, title=title, team_name=team or None, team_title=None))
    return out


def table_rows(t):
    """The players of one table: header columns by name, group rows (a row of one cell such as 'Starters') as the role (or, for 'Goaltenders', the position group)."""
    rows = t.rows
    hi = next((i for i, r in enumerate(rows) if any(re.search(r"\bplayers?\b|^\W*name\W*$", plain(b), re.I) for _, b in r) and len(r) >= 2), None)
    if hi is None:
        return None
    head = [plain(b).lower() for b in expand(rows[hi])]
    pc = next((i for i, h in enumerate(head) if "player" in h or h == "name"), None)
    if pc is None:
        return None
    pos_c = next((i for i, h in enumerate(head) if h.startswith("pos")), None)
    team_c = next((i for i, h in enumerate(head) if "team" in h or "club" in h), None)
    cap_role = bool(ROLE_RE.search(t.caption or "") or re.search(r"pitcher|catcher|bullpen", t.caption or "", re.I))
    side = side_of("" if cap_role else t.caption, t.path)
    role = norm_role(t.caption) if cap_role else None
    group = None
    out = []
    for r in rows[hi + 1:]:
        cells = [b for _, b in r]
        wide = expand(r)
        if len(r) == 1 or len(wide) < pc + 1 or (len(r) <= 2 and not any(links(c) for c in cells)):
            label = plain(cells[0]) if cells else ""
            if label:
                if ROLE_RE.search(label):
                    role = norm_role(label)
                elif SIDE_RE.search(label) and not out:
                    side = label
                else:
                    group = label.lower()[:40]
            continue
        cell = wide[pc]
        if not plain(cell):
            continue
        name, title, rest = person_of(re.sub(r"\{\{\s*(?:dagger|double-?dagger|sup)[^{}]*\}\}", "", cell, flags=re.I))
        if not name:
            continue
        team = team_title = None
        if team_c is None and rest:
            team, team_title = team_of(rest)
        if team_c is not None and len(wide) > team_c:
            team, team_title = plain(wide[team_c]) or None, (links(wide[team_c])[0][0] if links(wide[team_c]) else None)
        pos = plain(wide[pos_c]) if pos_c is not None and len(wide) > pos_c else None
        if pos and (pos == name or len(pos) > 24):
            pos = None
        if not (title or team or pos):
            continue
        out.append(dict(side=side, role=role, group=group, position=pos or None, name=name, title=title, team_name=team, team_title=team_title))
    return out


def cell_bullets(t):
    """Bulleted lines inside table cells: a 'Lineup' row whose cells (one per side, named by the header row) each hold a list."""
    rows = t.rows
    col_side = {}
    if rows and sum(1 for _, b in rows[0] if plain(b)) >= 2:
        col_side = {i: plain(b) for i, (_, b) in enumerate(rows[0]) if plain(b)}
    out = []
    for r in rows:
        for i, (_, b) in enumerate(r):
            if "\n*" in "\n" + b:
                out.extend(bullets(b, col_side.get(i) or side_of(t.caption, t.path)))
    return out


def read_sections(secs):
    out = []
    for path, body in secs:
        for t in raw_tables(body):
            t.path = path
            got = table_rows(t) or grid_rows(t) or side_grid_rows(t) or cell_bullets(t)
            out.extend(got)
        # bulleted lines outside tables
        flat, depth = [], 0
        for ln in body.split("\n"):
            st = ln.strip()
            if st.startswith("{|"):
                depth += 1
            if depth == 0:
                flat.append(ln)
            if st.startswith("|}"):
                depth = max(0, depth - 1)
        out.extend(bullets("\n".join(flat), side_of("", path)))
    return out


def rosters(text, issues):
    got = read_sections(roster_sections(text))
    if not got:
        got = read_sections(roster_sections(text, wide=True))
    seen, out = set(), []
    for r in got:
        k = (r["side"], r["name"])
        if k not in seen:
            seen.add(k)
            out.append(r)
    return out


def parse_game(text):
    issues = []
    info = infobox(text)
    ros = rosters(text, issues)
    if re.search(r"^=+\s*[^=]*(roster|line-?ups?)", text, re.I | re.M) and not ros:
        issues.append(("rosters", "a Rosters section is on the page but no player could be read"))
    return info, ros, issues
