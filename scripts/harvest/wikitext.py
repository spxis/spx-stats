"""Reading English Wikipedia wikitext (CC BY-SA 4.0) with the standard library: templates, wikitables, infoboxes, rosters and draft tables.

Nothing is guessed. A cell that cannot be read is kept as printed (markup removed) and a field that is not there is None. The parsers are
tested on small excerpts of real articles (scripts/harvest/fixtures); when one is improved, `harvest.py reparse` re-reads the archived pages.
"""
import re
import unicodedata

# ---------------------------------------------------------------- text

_REF = re.compile(r"<ref\b[^>]*?/>|<ref\b[^>]*>.*?</ref>", re.S | re.I)
_COMMENT = re.compile(r"<!--.*?-->", re.S)
_TAG = re.compile(r"</?[a-zA-Z][^>]*>")
_LINK = re.compile(r"\[\[([^\[\]|]*)(?:\|([^\[\]]*))?\]\]")
_EXT = re.compile(r"\[(?:https?:)?//\S+(?:\s+([^\]]*))?\]")
SHOW_ARG = {"flag": 0, "flagu": 0, "flagicon": 0, "flagcountry": 0, "flagathlete": 1, "small": 0, "smaller": 0, "nowrap": 0, "nobold": 0, "tooltip": 0,
            "abbr": 0, "sort": 1, "sortname": 0, "center": 0, "nbsp": None, "dts": None, "lang": 1, "transl": None, "ill": 0, "bd": None}


def find_templates(text, names=None):
    """Top-level-or-nested templates in `text`: list of dicts {name, args (positional, raw), named (dict raw), raw, start, end}.
    `names` (lower-case set) keeps only those. Braces and brackets inside arguments are balanced; the scan is linear in the text."""
    out = []
    i, n = 0, len(text)
    stack = []
    while i < n:
        if text.startswith("{{", i) and not text.startswith("{{{", i):
            stack.append(i)
            i += 2
        elif text.startswith("}}", i) and stack:
            s = stack.pop()
            raw = text[s:i + 2]
            t = _template(raw)
            t["start"], t["end"] = s, i + 2
            if names is None or t["name"] in names:
                out.append(t)
            i += 2
        else:
            i += 1
    out.sort(key=lambda t: t["start"])
    return out


def _template(raw):
    body = raw[2:-2]
    parts, depth_b, depth_l, cur = [], 0, 0, []
    i = 0
    while i < len(body):
        two = body[i:i + 2]
        if two == "{{":
            depth_b += 1; cur.append(two); i += 2
        elif two == "}}":
            depth_b -= 1; cur.append(two); i += 2
        elif two == "[[":
            depth_l += 1; cur.append(two); i += 2
        elif two == "]]":
            depth_l -= 1; cur.append(two); i += 2
        elif body[i] == "|" and depth_b == 0 and depth_l == 0:
            parts.append("".join(cur)); cur = []; i += 1
        else:
            cur.append(body[i]); i += 1
    parts.append("".join(cur))
    name = re.sub(r"\s+", " ", parts[0].strip()).lower()
    args, named = [], {}
    for p in parts[1:]:
        m = re.match(r"\s*([A-Za-z0-9_ .-]+?)\s*=(.*)$", p, re.S)
        if m and not p.lstrip().startswith(("[[", "{{")):
            named[m.group(1).strip().lower()] = m.group(2).strip()
        else:
            args.append(p.strip())
    return {"name": name, "args": args, "named": named, "raw": raw}


def _flatten_templates(text):
    """Innermost templates first: the ones that print one of their arguments are replaced by it, every other template is removed."""
    for _ in range(12):
        ts = find_templates(text)
        if not ts:
            return text
        # replace only templates that contain no other template (innermost), from the end so offsets stay valid
        inner = [t for t in ts if "{{" not in t["raw"][2:]]
        if not inner:
            return text
        for t in sorted(inner, key=lambda t: -t["start"]):
            rep = ""
            idx = SHOW_ARG.get(t["name"], "none")
            if isinstance(idx, int) and idx < len(t["args"]):
                rep = t["args"][idx]
            text = text[:t["start"]] + rep + text[t["end"]:]
    return text


def _link_text(m):
    target, shown = m.group(1), m.group(2)
    if target.lower().startswith(("file:", "image:", "category:")):
        return ""
    return shown if shown else target.split("#")[0]


def clean(text):
    """Wikitext -> readable plain text: references, comments, templates (but not what flag, small, sort ... print), tags, links, quotes and spaces."""
    if not text:
        return ""
    t = _COMMENT.sub("", text)
    t = _REF.sub("", t)
    t = re.sub(r"<br\s*/?>", " ", t, flags=re.I)
    t = _flatten_templates(t)
    t = _LINK.sub(_link_text, t)
    t = _EXT.sub(lambda m: m.group(1) or "", t)
    t = _TAG.sub("", t)
    t = t.replace("&nbsp;", " ").replace("&ndash;", "–").replace("&mdash;", "—").replace("&amp;", "&")
    t = re.sub(r"'{2,5}", "", t)
    t = re.sub(r"^[*#:;]+\s*", "", t, flags=re.M)
    return re.sub(r"\s+", " ", t).strip()


def links(text):
    """Article titles linked from `text`, in order, without section anchors; files and categories are not articles."""
    out = []
    for m in _LINK.finditer(_COMMENT.sub("", _REF.sub("", text or ""))):
        t = m.group(1).strip().split("#")[0].replace("_", " ")
        if t and not t.lower().startswith(("file:", "image:", "category:", "wikipedia:", "help:", "template:")):
            out.append(t)
    return out


def ascii_fold(s):
    return unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()


# ---------------------------------------------------------------- sections and tables

_HEAD = re.compile(r"^(={2,6})\s*(.*?)\s*\1\s*$")


def split_cells(line):
    """'a || b' -> ['a', 'b'] at the top level only (not inside [[ ]] or {{ }})."""
    sep = "!!" if line.startswith("!") else "||"
    parts, cur, db, dl, i = [], [], 0, 0, 0
    while i < len(line):
        two = line[i:i + 2]
        if two == "{{": db += 1; cur.append(two); i += 2
        elif two == "}}": db -= 1; cur.append(two); i += 2
        elif two == "[[": dl += 1; cur.append(two); i += 2
        elif two == "]]": dl -= 1; cur.append(two); i += 2
        elif (two == sep or (sep == "!!" and two == "||")) and db <= 0 and dl <= 0:
            parts.append("".join(cur)); cur = []; i += 2
        else:
            cur.append(line[i]); i += 1
    parts.append("".join(cur))
    return parts


def _strip_attrs(cell):
    """'style="x" | content' -> 'content'; a cell with no attribute part is returned as it is."""
    db = dl = 0
    for i, ch in enumerate(cell):
        two = cell[i:i + 2]
        if two == "{{": db += 1
        elif two == "}}": db -= 1
        elif two == "[[": dl += 1
        elif two == "]]": dl -= 1
        elif ch == "|" and db <= 0 and dl <= 0:
            head = cell[:i]
            if re.match(r"\s*[A-Za-z][\w-]*\s*=", head):
                return cell[i + 1:]
            return cell
    return cell


class Table:
    def __init__(self, section, caption):
        self.section, self.caption = section, caption
        self.rows = []          # list of list of {"raw", "t", "l", "h"}
        self.header = []

    def finish(self):
        if self.rows and all(c["h"] for c in self.rows[0]):
            self.header = [c["t"] for c in self.rows[0]]
            self.rows = self.rows[1:]
        return self


def logical_lines(text, max_join=60):
    """Lines of the text, where a template left open at the end of a line is joined (with its newlines) to the lines that close it, so a template that
    spans lines inside a table cell stays in that cell. A template still open after `max_join` lines is not joined (a stray brace must not swallow the page)."""
    out, buf, n = [], None, 0
    for line in text.split("\n"):
        if buf is None:
            buf, n = line, 1
        else:
            buf, n = buf + "\n" + line, n + 1
        if buf.count("{{") <= buf.count("}}") or n >= max_join:
            out.append(buf)
            buf = None
    if buf is not None:
        out.append(buf)
    return out


def parse_tables(text):
    """Every wikitable in the text (nested ones too, each on its own), with the section it is in. Header cells are those written with `!`."""
    tables, stack = [], []
    section = {2: None, 3: None}
    cur_cell = None

    def flush_cell():
        nonlocal cur_cell
        if cur_cell is not None and stack:
            raw, is_h = cur_cell
            stack[-1]["cur_row"].append({"raw": raw.strip(), "t": clean(raw), "l": links(raw), "h": is_h})
        cur_cell = None

    def flush_row():
        flush_cell()
        if stack and stack[-1]["cur_row"]:
            stack[-1]["table"].rows.append(stack[-1]["cur_row"])
        if stack:
            stack[-1]["cur_row"] = []

    for line in logical_lines(text):
        s = line.strip()
        m = _HEAD.match(s)
        if m and not stack:
            lvl = len(m.group(1))
            title = clean(m.group(2))
            if lvl == 2:
                section[2], section[3] = title, None
            elif lvl == 3:
                section[3] = title
            continue
        if s.startswith("{|"):
            flush_cell()
            sec = " / ".join(x for x in (section[2], section[3]) if x)
            stack.append({"table": Table(sec or None, None), "cur_row": []})
            continue
        if not stack:
            continue
        if s.startswith("|}"):
            flush_row()
            tables.append(stack.pop()["table"].finish())
            continue
        if s.startswith("|+"):
            stack[-1]["table"].caption = clean(_strip_attrs(s[2:]))
            continue
        if s.startswith("|-"):
            flush_row()
            continue
        if s.startswith(("|", "!")) and not s.startswith("|}"):
            flush_cell()
            is_h = s.startswith("!")
            parts = split_cells(s[1:] if not s.startswith("!") else "!" + s[1:])
            parts[0] = parts[0][1:] if parts[0].startswith("!") else parts[0]
            for k, p in enumerate(parts):
                body = _strip_attrs(p)
                if k < len(parts) - 1:
                    stack[-1]["cur_row"].append({"raw": body.strip(), "t": clean(body), "l": links(body), "h": is_h})
                else:
                    cur_cell = (body, is_h)
            continue
        if cur_cell is not None:
            cur_cell = (cur_cell[0] + "\n" + line, cur_cell[1])
    return tables


def section_of(text, pattern):
    """The wikitext of the first section whose heading matches `pattern` (regex, case-insensitive), up to the next heading of the same or higher level."""
    lines = text.split("\n")
    start, lvl = None, None
    for i, line in enumerate(lines):
        m = _HEAD.match(line.strip())
        if not m:
            continue
        if start is None:
            if re.search(pattern, clean(m.group(2)), re.I):
                start, lvl = i + 1, len(m.group(1))
        elif len(m.group(1)) <= lvl:
            return "\n".join(lines[start:i])
    return "\n".join(lines[start:]) if start is not None else None


# ---------------------------------------------------------------- infobox

def infobox(text):
    """The first Infobox template: [{"field", "value", "raw", "links"}] in page order, empty fields left out."""
    for t in find_templates(text):
        if t["name"].startswith("infobox"):
            out = []
            for k, v in t["named"].items():
                c = clean(v)
                if c or links(v):
                    out.append({"field": k, "value": c, "raw": v.strip()[:2000], "links": links(v)})
            return out
    return []


# ---------------------------------------------------------------- rosters

def _int(s):
    m = re.match(r"\s*(\d+)", s or "")
    return int(m.group(1)) if m else None


def _date(s):
    m = re.match(r"\s*(\d{4})-(\d{2})-(\d{2})", s or "")
    return "%s-%s-%s" % m.groups() if m else None


def roster_nba(text):
    """{{player2 | num | first | last | pos | ft | in | lbs | college | DOB | from | note}}"""
    out = []
    for t in find_templates(text, {"player2", "nbaplayer", "nba player"}):
        n = t["named"]
        first, last = clean(n.get("first", "")), clean(n.get("last", ""))
        name = (first + " " + last).strip()
        if not name:
            continue
        ft, inch = _int(n.get("ft")), _int(n.get("in"))
        link = n.get("link")
        link = clean(link).replace("_", " ") if link else (name + (" (%s)" % clean(n["dab"]) if n.get("dab") else ""))
        out.append({"group": None, "number": clean(n.get("num", "")) or None, "name": name, "link": link, "position": clean(n.get("pos", "")) or None,
                    "height_in": (ft * 12 + (inch or 0)) if ft is not None else None, "weight_lb": _int(n.get("lbs")), "born": _date(n.get("dob")),
                    "school": clean(n.get("college") or n.get("school") or "") or None, "nationality": clean(n.get("from") or n.get("nat") or "") or None,
                    "note": clean(n.get("note", "")) or None, "raw": t["raw"][:600]})
    return out


def roster_nfl(text):
    """{{NFL final roster |Quarterbacks= {{NFLplayer|num|name|pos|...}} ... }}"""
    out = []
    for box in find_templates(text, {"nfl final roster", "nfl roster", "nflroster"}):
        for group, body in box["named"].items():
            if group in ("year", "teamname", "team", "title", "coach", "coaches", "reflist"):
                continue
            for t in find_templates(body, {"nflplayer", "nfl player"}):
                a = t["args"]
                if len(a) < 2:
                    continue
                name = clean(a[1])
                d = t["named"].get("d")
                notes = [clean(x) for x in a[3:] if clean(x)]
                if t["named"].get("rookie", "").lower() in ("y", "yes"):
                    notes.append("rookie")
                out.append({"group": group.replace("_", " ").title() if group.islower() else group, "number": clean(a[0]) or None, "name": name,
                            "link": name + (" (%s)" % clean(d) if d else ""), "position": clean(a[2]) if len(a) > 2 and clean(a[2]) else None,
                            "height_in": None, "weight_lb": None, "born": None, "school": None, "nationality": None,
                            "note": ", ".join(notes) or None, "raw": t["raw"][:300]})
    return out


_GROUP = re.compile(r"'''\s*([^'\n]+?)\s*'''")


def roster_cfl(text):
    """* {{CFL player|num|I/N|[[Link|Name]]}} POS  under '''Quarterbacks''' headings (the roster is a table of columns)."""
    out, group = [], None
    for line in text.split("\n"):
        ts = find_templates(line, {"cfl player"})
        if not ts:
            g = _GROUP.search(line)
            if g and not line.lstrip().startswith("*"):
                group = g.group(1)
            continue
        g = _GROUP.search(line[:ts[0]["start"]])
        if g:
            group = g.group(1)
        for k, t in enumerate(ts):
            a = t["args"]
            if len(a) < 3:
                continue
            lk = links(a[2])
            tail = line[t["end"]:(ts[k + 1]["start"] if k + 1 < len(ts) else len(line))]
            status = {"i": "import", "n": "national", "g": "global", "u": "university"}.get(a[1].lower(), a[1] or None)
            out.append({"group": group, "number": clean(a[0]) or None, "name": clean(a[2]), "link": lk[0] if lk else clean(a[2]), "position": clean(tail) or None,
                        "height_in": None, "weight_lb": None, "born": None, "school": None, "nationality": None, "note": status,
                        "raw": (t["raw"] + tail.rstrip())[:300]})
    return out


def roster_tables(text):
    """A roster written as a wikitable (hockey, baseball, older articles): rows of the tables in a section named like a roster."""
    out = []
    for t in parse_tables(text):
        if not (t.section and re.search(r"roster|players", t.section, re.I)) or not t.header:
            continue
        h = [x.lower() for x in t.header]

        def col(*pats):
            for i, x in enumerate(h):
                if any(re.search(p, x) for p in pats):
                    return i
            return None
        c_name, c_no, c_pos = col(r"^(player|name)", r"player"), col(r"^(no|#|num)"), col(r"^pos")
        if c_name is None:
            continue
        c_ht, c_wt, c_born, c_sch = col(r"^(ht|height)"), col(r"^(wt|weight)"), col(r"^(born|birth|dob)"), col(r"college|school|university|from|last")
        c_nat = col(r"^(nat|country)")
        for r in t.rows:
            if len(r) <= c_name or not r[c_name]["t"]:
                continue
            g = lambda i: r[i]["t"] if i is not None and i < len(r) and r[i]["t"] else None
            nm = r[c_name]
            out.append({"group": t.section.split(" / ")[-1], "number": g(c_no), "name": re.sub(r"\s*\(.*?\)\s*$", "", nm["t"]).strip("*†‡ "),
                        "link": nm["l"][0] if nm["l"] else None, "position": g(c_pos), "height_in": None, "weight_lb": _int(g(c_wt)), "born": None,
                        "school": g(c_sch), "nationality": g(c_nat), "note": None, "raw": " | ".join(c["t"] for c in r)[:300]})
    return out


def _wp_parse():
    """scripts/rosters/wp_parse.py (the NBA and CFL roster parser of the rosters pipeline), loaded by path: its player statistics table reader is reused here."""
    import importlib.util, os
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "rosters", "wp_parse.py")
    if not os.path.exists(path):
        return None
    spec = importlib.util.spec_from_file_location("rosters_wp_parse", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def roster_from_stats_table(text, league):
    """An NBA article with no roster list but a regular-season player statistics table: the players the table names (scripts/rosters/wp_parse.py)."""
    wp = _wp_parse()
    if wp is None or league not in ("nba", "cfl"):
        return []
    out = []
    for e in wp.entries(league, wp.sections(text)):
        if e["src"] != "stats":
            continue
        out.append({"group": None, "number": e["num"], "name": e["name"], "link": e["title"], "position": e["pos"], "height_in": None, "weight_lb": None,
                    "born": e["dob"], "school": e["college"], "nationality": None, "note": e["note"], "raw": e["name"], "src": "stats"})
    return out


def parse_roster(text, league):
    """The roster rows of a team-season article. Tries the template families, then wikitables, then (NBA, CFL) the player statistics table. Returns (rows, how)."""
    sec = section_of(text, r"roster") or ""
    for how, fn, src in (("player2", roster_nba, text), ("NFL final roster", roster_nfl, text), ("CFL player", roster_cfl, sec or text)):
        rows = fn(src)
        if rows:
            return rows, how
    rows = roster_tables(text)
    if rows:
        return rows, "table"
    rows = roster_from_stats_table(text, league)
    return rows, ("statistics table" if rows else None)


# ---------------------------------------------------------------- draft

_ORD = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12,
        "first": 1, "second": 2, "third": 3, "fourth": 4, "fifth": 5, "sixth": 6, "seventh": 7, "eighth": 8, "ninth": 9, "tenth": 10}


def round_from_section(section):
    m = re.search(r"round\s+(\w+)|(\w+)\s+round", section or "", re.I)
    if not m:
        return None
    w = (m.group(1) or m.group(2)).lower()
    return int(w) if w.isdigit() else _ORD.get(w)


def _player_name(cell):
    t = re.sub(r"[*†‡^~#x×§]+$", "", cell["t"]).strip()
    lk = [x for x in cell["l"] if not x.lower().startswith(("list of", "draft"))]
    return t, (lk[0] if lk else None)


def draft_tables(text):
    """Draft picks from wikitables whose header has a player column and a pick or team column."""
    out = []
    for t in parse_tables(text):
        h = [x.lower() for x in t.header]
        if not h:
            continue

        def col(*pats):
            for i, x in enumerate(h):
                if any(re.search(p, x) for p in pats):
                    return i
            return None
        c_pl = col(r"^player", r"^name", r"^selection")
        c_pick = col(r"^pick", r"^overall", r"^no\b", r"^#", r"^sel")
        c_rnd = col(r"^rnd", r"^round")
        c_team = col(r"team")
        rnd_sec = round_from_section(t.section)
        if c_pl is None or (c_pick is None and c_rnd is None and rnd_sec is None) or c_pl == c_pick:
            continue
        c_pos, c_sch, c_nat = col(r"^pos"), col(r"school|college|univ|club"), col(r"^nat")
        for r in t.rows:
            if len(r) <= c_pl or not r[c_pl]["t"]:
                continue
            g = lambda i: r[i]["t"] if i is not None and i < len(r) and r[i]["t"] else None
            nm, lk = _player_name(r[c_pl])
            team_cell = r[c_team] if c_team is not None and c_team < len(r) else None
            team = (team_cell["l"][0] if team_cell and team_cell["l"] else (re.sub(r"\s*\(.*$", "", team_cell["t"]) if team_cell else None)) or None
            rnd, ov = (_int(g(c_rnd)) if c_rnd is not None else rnd_sec), _int(g(c_pick))
            if rnd is None and ov is None:
                continue
            out.append({"round": rnd, "overall": ov, "team": team, "player": nm, "link": lk,
                        "position": g(c_pos), "school": g(c_sch), "nationality": g(c_nat),
                        "note": (re.search(r"\((.*)\)", team_cell["t"]).group(1) if team_cell and re.search(r"\((.*)\)", team_cell["t"]) else None),
                        "raw": {h[i] if i < len(h) else str(i): c["t"] for i, c in enumerate(r)}})
    return out


def draft_templates(text):
    """{{NFLDraft-row |draftyear= |round= |picknum= |team= |first= |last= |position= |college= }}"""
    out = []
    for t in find_templates(text, {"nfldraft-row"}):
        n = t["named"]
        name = (clean(n.get("first", "")) + " " + clean(n.get("last", ""))).strip()
        if not name:
            continue
        if n.get("undrafted", "").lower() in ("y", "yes") or _int(n.get("picknum")) is None:
            continue
        out.append({"round": _int(n.get("round")), "overall": _int(n.get("picknum")), "team": clean(n.get("team", "")) or None, "player": name,
                    "link": clean(n.get("dab", "")) or name, "position": clean(n.get("position", "")) or None, "school": clean(n.get("college", "")) or None, "nationality": None,
                    "note": clean(n.get("note", ""))[:200] or None, "year": _int(n.get("draftyear")), "raw": {k: clean(v)[:200] for k, v in n.items() if k != "note"}})
    return out


def parse_draft(text):
    rows = draft_templates(text)
    return rows if rows else draft_tables(text)
