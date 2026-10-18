"""Read a club-season article's wikitext (English Wikipedia, CC BY-SA 4.0) for the players it lists. A library for wp_fetch.py and wp_load.py.

  sections(text)          -> {"roster": <the Roster section>, "stats": <the Player statistics section>} (missing ones absent)
  entries(league, sects)  -> the players in those sections, one dict each:
        src     'roster' (the roster table or template list) or 'stats' (the player statistics table)
        ord     position in the section
        name    the name as the article shows it
        title   the article the name links to (the template builds it from first/last/dab/link), or None when it names no article
        num, pos, dob (ISO date or None), ft, inch, lbs, college, note   as the template states them (NBA)

Nothing is guessed: a name with no link to an article has title None. Notes on the formats:
  NBA   {{player2 | num = 1 | first = A | last = B | dab = basketball | link = Title | name = A B | pos = G | ft = 6 | in = 3 | lbs = 190
                  | college = X | DOB = 1990-01-02 | note = TW }}   in "==Roster==", and the player statistics table rows
        {{sort|Last, First|[[Title|First Last]]}}.
  CFL   {{CFL player|12|I|[[Title|Name]]}} (number, nationality flag, link) in a "==Roster==" table; older seasons have none.
  NHA, PCHA, WCHL, WHA (scripts/hockey/): no roster section; the article's own player-statistics wikitables (skaters: Player, Pos, GP, G, A, Pts, PIM ...; goaltenders:
        Player, MIN, GP, W, L, T, GA, GAA, SO), the first cell {{Sortname|First|Last|Article}} or a [[link]]. hockey_tables() keeps those tables with a line of
        context (the heading and the text above the table), hockey_lines() reads them: phase (regular or playoffs, from that context), group (skater or goalie),
        the columns by their header, the club column (a league-wide leaders table names each player's club; only the article's own club is kept).
"""
import datetime, re

HEAD = re.compile(r"^(={2,6})\s*(.*?)\s*\1\s*$", re.M)

def _section(text, names):
    """The body of the first heading whose title matches `names` (a regex), up to the next heading of the same or a higher level."""
    for m in HEAD.finditer(text):
        if re.fullmatch(names, m.group(2), re.I):
            level = len(m.group(1))
            end = len(text)
            for n in HEAD.finditer(text, m.end()):
                if len(n.group(1)) <= level: end = n.start(); break
            return text[m.end():end]
    return None

def sections(text):
    out = {}
    r = _section(text, r"(final )?roster|players|team roster")
    if r: out["roster"] = r
    s = _section(text, r"player statistics|player stats|statistics")
    if s:
        # the regular season: up to the first sub-heading about the playoffs, opponents or totals
        out["stats"] = re.split(r"^={3,}[^=\n]*(?:playoffs|opponents?|totals?|vs\.).*$", s, maxsplit=1, flags=re.M | re.I)[0]
    return out

def _dash(s): return s.replace("–", "-").replace("—", "-").replace("−", "-")

def _date(s):
    m = re.match(r"\s*(\d{4})-(\d\d)-(\d\d)", _dash(s or ""))
    if not m: return None
    try: return datetime.date(int(m.group(1)), int(m.group(2)), int(m.group(3))).isoformat()
    except ValueError: return None   # a date that does not exist (1941-12-33) is not used

def _clean(s):
    """A parameter value as plain text: [[a|b]] -> b, [[a]] -> a, templates and tags dropped."""
    s = re.sub(r"<!--.*?-->|<ref[^>]*?/>|<ref[^>]*?>.*?</ref>", "", s or "", flags=re.S)
    s = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", s)
    s = re.sub(r"\{\{[^{}]*\}\}", "", s)
    return re.sub(r"\s+", " ", s.replace("&nbsp;", " ")).strip()

def _template_args(body):
    """Split the inside of a template on top-level pipes into named and positional arguments."""
    parts, depth, cur = [], 0, ""
    i = 0
    while i < len(body):
        two = body[i:i + 2]
        if two in ("{{", "[["): depth += 1; cur += two; i += 2; continue
        if two in ("}}", "]]"): depth -= 1; cur += two; i += 2; continue
        if body[i] == "|" and depth == 0: parts.append(cur); cur = ""
        else: cur += body[i]
        i += 1
    parts.append(cur)
    named, pos = {}, []
    for p in parts[1:]:
        if "=" in p and not p.strip().startswith(("[[", "{{")):
            k, v = p.split("=", 1); named[k.strip().lower()] = v.strip()
        else: pos.append(p.strip())
    return parts[0].strip(), named, pos

def _templates(text, name):
    """Every {{name ...}} in the text with its (named, positional) arguments; nested templates are kept inside their argument."""
    low = text.lower()
    key = "{{" + name.lower()
    i = 0
    while True:
        i = low.find(key, i)
        if i < 0: return
        j, depth = i, 0
        while j < len(text):
            if text.startswith("{{", j): depth += 1; j += 2
            elif text.startswith("}}", j):
                depth -= 1; j += 2
                if depth == 0: break
            else: j += 1
        head, named, pos = _template_args(text[i + 2:j - 2])
        if head.lower() == name.lower(): yield named, pos
        i = j

def _title(s):
    s = _clean(s).replace("_", " ").strip()
    return s or None

def nba(sects):
    out = []
    for n, (named, pos) in enumerate(_templates(sects.get("roster", ""), "player2")):
        first, last = _clean(named.get("first", "")), _clean(named.get("last", ""))
        name = _clean(named.get("name", "")) or " ".join(x for x in (first, last) if x)
        if not name: continue
        if named.get("link"): title = _title(named["link"])
        elif named.get("dab"): title = f"{name} ({_clean(named['dab']).split(',')[0].strip()})"
        else: title = name
        out.append(dict(src="roster", ord=n, name=name, title=title, num=_clean(named.get("num", "")) or None, pos=_clean(named.get("pos", "")) or None,
                        dob=_date(named.get("dob")), ft=named.get("ft"), inch=named.get("in"), lbs=named.get("lbs"),
                        college=_clean(named.get("college") or named.get("school") or "") or None, note=_clean(named.get("note", "")) or None))
    # the statistics table (the first one of the section: the regular season): the first cell of each row names the player as
    # {{sort|Last, First|[[Title|Name]]}}, {{sortname|First|Last|Title|dab=..}} or a bare [[Title|Name]]
    seen = set()
    n = 0
    rows = re.split(r"^\|-.*$", sects.get("stats", ""), flags=re.M)[1:]
    for row in rows:
        cell = next((ln for ln in row.splitlines() if ln.startswith("|") and not ln.startswith(("|}", "|+", "|-"))), None)
        if cell is None: continue
        cell = re.sub(r"^[^{\[|]*=[^{\[|]*\|(?!\|)", "", cell[1:].strip()).strip()   # cell attributes: style="..." |
        if cell.startswith("{{"):
            depth, j = 0, 0
            while j < len(cell):
                if cell.startswith("{{", j): depth += 1; j += 2
                elif cell.startswith("}}", j):
                    depth -= 1; j += 2
                    if depth == 0: break
                else: j += 1
            cell = cell[:j]
        else:
            cell = cell.split("||")[0].strip()
        t = name = None
        m = re.search(r"\{\{sort\|[^|{}]*\|\s*\[\[([^\]|]+)(?:\|([^\]]*))?\]\]\s*\}\}", cell)
        if m: t, name = m.group(1), m.group(2) or m.group(1)
        elif re.match(r"\{\{sortname\|", cell, re.I):
            _, na, po = _template_args(cell[2:-2])
            if len(po) >= 2:
                name = f"{_clean(po[0])} {_clean(po[1])}".strip()
                t = _clean(po[2]) if len(po) > 2 and po[2] else (_clean(na["link"]) if na.get("link") else name + (f" ({_clean(na['dab'])})" if na.get("dab") else ""))
        else:
            m = re.match(r"\[\[([^\]|]+)(?:\|([^\]]*))?\]\]", cell)
            if m: t, name = m.group(1), m.group(2) or m.group(1)
        if not t: continue
        t = t.replace("_", " ").strip()
        if t in seen: continue
        seen.add(t)
        out.append(dict(src="stats", ord=n, name=name.strip(), title=t, num=None, pos=None, dob=None, ft=None, inch=None, lbs=None, college=None, note=None))
        n += 1
    return out

def cfl(sects):
    out = []
    for n, (named, pos) in enumerate(_templates(sects.get("roster", ""), "CFL player")):
        if len(pos) < 3: continue
        m = re.search(r"\[\[([^\]|]+)(?:\|([^\]]*))?\]\]", pos[2])
        num = _clean(pos[0]).replace("\xa0", "") or None
        if m: out.append(dict(src="roster", ord=n, name=(m.group(2) or m.group(1)).strip(), title=m.group(1).replace("_", " ").strip(), num=num, pos=None,
                              dob=None, ft=None, inch=None, lbs=None, college=None, note=None))
        else:
            nm = _clean(pos[2])
            if nm: out.append(dict(src="roster", ord=n, name=nm, title=None, num=num, pos=None, dob=None, ft=None, inch=None, lbs=None, college=None, note=None))
    return out

# ------------------------------------------------------------------------------------------------------------------------------ hockey (NHA, PCHA, WCHL, WHA)
TABLE = re.compile(r"^\{\|.*?^\|\}", re.M | re.S)

def hockey_tables(text):
    """The innermost wikitables of a club-season article that hold player statistics (a Player or Name column and a GP column), each with its context:
    -> [{"ctx": the last heading, then the text between the previous such table and this one, "text": the table}]. Tables nest (a collapsible box named
    "Regular season" or "Playoffs" around a scoring table and a goaltending table), so the tables are found by their opening and closing lines."""
    heads = [(m.start(), m.end(), m.group(2)) for m in HEAD.finditer(text)]
    out, stack, prev_end, pos = [], [], 0, 0
    for ln in text.splitlines(keepends=True):
        st = ln.lstrip()
        if st.startswith("{|"):
            if stack: stack[-1][2] = True
            stack.append([pos, None, False])
        elif st.startswith("|}") and stack:
            start, _, has_child = stack.pop()
            if not has_child:
                t = text[start:pos + len(ln)]
                if re.search(r"(?im)^!.*\b(player|name)\b", t) and re.search(r"(?i)\bGP\b|games played", t):
                    h = [(he, x) for sp, he, x in heads if sp < start]
                    above = re.sub(r"<ref[^>]*?/>|<ref[^>]*?>.*?</ref>|<!--.*?-->", "", text[max(prev_end, h[-1][0] if h else 0):start], flags=re.S)
                    out.append({"ctx": ((h[-1][1] if h else "") + " | " + re.sub(r"\s+", " ", above).strip())[-400:], "text": t})
                    prev_end = pos + len(ln)
        pos += len(ln)
    return out

def top_split(s, sep):
    """s split at sep outside {{ }} and [[ ]]."""
    parts, depth, cur, i = [], 0, "", 0
    while i < len(s):
        two = s[i:i + 2]
        if two in ("{{", "[["): depth += 1; cur += two; i += 2; continue
        if two in ("}}", "]]"): depth -= 1; cur += two; i += 2; continue
        if depth == 0 and s.startswith(sep, i): parts.append(cur); cur = ""; i += len(sep); continue
        cur += s[i]; i += 1
    parts.append(cur)
    return parts

def cell_text(c):
    """A table cell without its attributes (style="..." | value)."""
    parts = [p for p in top_split(c, "|") if True]
    if len(parts) > 1 and re.search(r"\w=|\"", parts[0]) and "[[" not in parts[0] and "{{" not in parts[0].replace("{{box-shadow", "").replace("{{abbr", ""):
        return "|".join(parts[1:]).strip()
    return c.strip() if len(parts) == 1 else parts[-1].strip()

def header_name(h):
    h = re.sub(r"\{\{abbr\|([^|}]*)\|[^}]*\}\}", r"\1", h, flags=re.I)
    h = re.sub(r"\{\{[^{}]*\}\}", "", h)
    h = h.split("|")[-1] if "|" in h else h
    h = re.sub(r"\s+", " ", _clean(re.sub(r"<[^>]+>", "", h))).strip().lower().rstrip(".")
    return {"player": "player", "name": "player", "pos": "pos", "position": "pos", "gp": "gp", "g": "g", "a": "a", "pts": "pts", "points": "pts", "pim": "pim", "+/-": "pm",
            "min": "min", "mins": "min", "w": "w", "l": "l", "t": "t", "ga": "ga", "gaa": "gaa", "avg": "gaa", "so": "so", "sv%": "svp", "sv": "sv", "sa": "sa", "sh": "sh", "toi": "min", "ppg": "ppg", "shg": "shg", "gwg": "gwg", "club": "club", "team": "club"}.get(h, h)

def player_cell(cell):
    """(name, article title or None) from {{Sortname|First|Last|Article}}, {{sort|Last, First|[[Title|Name]]}} or [[Title|Name]]."""
    cell = cell.strip()
    m = re.search(r"\{\{sort\|[^|{}]*\|\s*\[\[([^\]|]+)(?:\|([^\]]*))?\]\]", cell, re.I)
    if m: return (m.group(2) or m.group(1)).strip(), m.group(1).replace("_", " ").strip()
    if re.match(r"\{\{sortname\|", cell, re.I):
        _, na, po = _template_args(cell[2:cell.rfind("}}")])
        if len(po) >= 2:
            name = f"{_clean(po[0])} {_clean(po[1])}".strip()
            if len(po) > 2 and po[2]: return name, _clean(po[2]).replace("_", " ")
            if na.get("link"): return name, _clean(na["link"]).replace("_", " ")
            return name, None   # no article named: the loader never guesses one
    m = re.search(r"\[\[([^\]|]+)(?:\|([^\]]*))?\]\]", cell)
    if m and not m.group(1).lower().startswith(("file:", "image:")): return (m.group(2) or m.group(1)).strip(), m.group(1).replace("_", " ").strip()
    nm = _clean(re.sub(r"\{\{(?:sort|sortname)[^}]*\}\}", "", cell))
    return (nm or None), None

def _num(s):
    s = _clean(s).replace(",", "")
    m = re.fullmatch(r"-?\d+(\.\d+)?", s)
    return m.group(0) if m else None

def _head_cells(heads):
    """[(content, colspan, rowspan)] of one header row: its "!" lines, each cut at "!!" and then at the "|" that ends the cell's attributes."""
    out = []
    for hline in heads:
        for c in top_split(hline, "!!"):
            parts = top_split(c, "|")
            attrs = " ".join(parts[:-1]) if len(parts) > 1 else ""
            cs = re.search(r"colspan\s*=\s*\"?(\d+)", attrs); rs = re.search(r"rowspan\s*=\s*\"?(\d+)", attrs)
            out.append((parts[-1], int(cs.group(1)) if cs else 1, int(rs.group(1)) if rs else 1))
    return out

def _columns(hrows):
    """The columns of a header of one or more rows (colspan and rowspan honoured): [(name, label)], label the text of the upper row over it (Regular season, Playoffs) or None."""
    grid, nrows = {}, len(hrows)
    width = 0
    for r, row in enumerate(hrows):
        c = 0
        for content, cs, rs in row:
            while (r, c) in grid: c += 1
            for dr in range(rs):
                for dc in range(cs): grid[(r + dr, c + dc)] = (content, r, dr)
            c += cs
        width = max(width, c)
    cols = []
    for c in range(width):
        cells = [grid.get((r, c)) for r in range(nrows)]
        cells = [x for x in cells if x]
        if not cells: cols.append(("", None)); continue
        bottom = cells[-1][0]
        upper = cells[0][0] if len(cells) > 1 and cells[0][0] is not bottom else None
        cols.append((header_name(bottom), re.sub(r"\s+", " ", _clean(re.sub(r"<[^>]+>|&nbsp;", " ", upper))).strip().lower() if upper else None))
    return cols

GOALIE_KEYS = {"w", "l", "t", "ga", "gaa", "min", "so", "svp", "sv", "sa", "sh"}
KEEP = ("gp", "g", "a", "pts", "pim", "pm", "ppg", "shg", "gwg", "min", "w", "l", "t", "ga", "gaa", "so", "svp", "sv", "sa")

def _minutes(v):
    """Minutes played as a whole number from "1718" or "28:38" (minutes:seconds, rounded down to the minute)."""
    v = _clean(v).replace(",", "")
    m = re.fullmatch(r"(\d+):(\d\d)", v)
    if m: return str(int(m.group(1)))
    return _num(v)

def hockey_lines(tables, club):
    """The player-statistics lines of a club-season article: [dict(phase, group, tbl, ord, name, title, pos, stats {key: number as text})] and a count of rows
    left out for naming another club. A table with two header rows (Regular season and Playoffs side by side) gives both phases' lines."""
    out, other = [], 0
    for ti, tb in enumerate(tables):
        text = tb["text"]
        head, _, between = tb["ctx"].partition(" | ")
        caption = " ".join(re.findall(r"^\|\+(.*)$", text, re.M))
        ctx_phase = "regular" if re.search(r"(?i)regular season", between + " " + caption) else "playoffs" if re.search(r"(?i)playoff|post-?season", between + " " + caption) else \
            "playoffs" if re.search(r"(?i)playoff|post-?season", head) else "regular"
        rows = re.split(r"^\|-.*$", text, flags=re.M)
        hrows, cols, counter = [], None, {}
        for row in rows:
            lines = [ln for ln in row.splitlines() if ln.strip()]
            if not lines: continue
            heads = [ln[1:] for ln in lines if ln.startswith("!")]
            datal = [ln for ln in lines if ln.startswith("|") and not ln.startswith(("|+", "|}"))]
            if heads and not datal:
                if cols is not None and any(n in ("gp",) for n, _ in cols):    # a header after data: another block, or a totals row
                    if not any(h in ("player",) for h, _ in [(header_name(c[0]), 0) for c in _head_cells(heads)]): continue
                    cols = None; hrows = []
                hrows.append(_head_cells(heads))
                continue
            if hrows:
                cols = _columns(hrows); hrows = []
            if cols is None or not any(n == "gp" for n, _ in cols) or not datal: continue
            cells = []
            for dl in datal: cells += top_split(dl[1:], "||")
            cells = [cell_text(c) for c in cells]
            names = [n for n, _ in cols]
            if len(cells) < len(cols) - 1 or "player" not in names: continue
            name, title = player_cell(cells[names.index("player")])
            if name and name.count(", ") == 1 and "(" not in name: name = " ".join(reversed(name.split(", ")))
            if not name or name.startswith("\'\'") or re.match(r"(?i)(team|totals?)\b", name): continue
            kv = {}
            for i, (n, lab) in enumerate(cols):
                if i < len(cells) and n and n != "player":
                    ph = "playoffs" if lab and re.search(r"(?i)playoff|post", lab) else "regular" if lab and re.search(r"(?i)regular", lab) else ctx_phase
                    kv.setdefault(ph, {}).setdefault(n, cells[i])
            if "club" in {n for n, _ in cols}:
                cl = _clean(next((v.get("club", "") for v in kv.values()), "")).lower()
                if cl and not (cl in club.lower() or club.lower() in cl or any(w for w in re.findall(r"[a-z]{4,}", club.lower()) if w in cl and w not in ("hockey", "club"))):
                    other += 1; continue
            goalie = bool(GOALIE_KEYS & set(names)) and "g" not in names
            for ph, d in kv.items():
                stats = {}
                for k, v in d.items():
                    if k == "sh": k = "sa"
                    if k not in KEEP: continue
                    n = _minutes(v) if k == "min" else _num(v)
                    if n is None: continue
                    if k in ("sa", "sv") and not goalie: continue
                    stats[k] = n
                if "gp" not in stats: continue
                if not goalie and set(stats) <= {"gp"} and False: continue
                key = (ti, ph)
                out.append(dict(phase=ph, group="goalie" if goalie else "skater", tbl=ti, ord=counter.setdefault(key, 0), name=name, title=title,
                                pos=_clean(d.get("pos", kv.get(ctx_phase, {}).get("pos", ""))) or None, stats=stats))
                counter[key] += 1
    # a plus/minus column whose every figure is 0 was not kept by the source (a filled-in placeholder), not a table of players who all broke even
    for key in {(x["tbl"], x["phase"]) for x in out}:
        rows = [x for x in out if (x["tbl"], x["phase"]) == key and "pm" in x["stats"]]
        if len(rows) >= 3 and all(x["stats"]["pm"] == "0" for x in rows):
            for x in rows: del x["stats"]["pm"]
    return out, other

def hockey(sects, club=""):
    """Roster entries (src 'stats') for the players of the statistics tables: the regular season's first, then players only the playoffs table names."""
    lines, _ = hockey_lines(sects.get("tables", []), club)
    out, seen = [], set()
    for ln in sorted(lines, key=lambda x: (x["phase"] != "regular", x["tbl"], x["ord"])):
        key = ln["title"] or ln["name"]
        if key in seen: continue
        seen.add(key)
        out.append(dict(src="stats", ord=len(out), name=ln["name"], title=ln["title"], num=None, pos=ln["pos"], dob=None, ft=None, inch=None, lbs=None, college=None, note=None))
    return out

def entries(league, sects, club=""):
    if league in ("nha", "pcha", "wchl", "wha"): return hockey(sects, club)
    return {"nba": nba, "cfl": cfl}[league](sects)
