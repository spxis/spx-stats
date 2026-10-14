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

def entries(league, sects):
    return {"nba": nba, "cfl": cfl}[league](sects)
