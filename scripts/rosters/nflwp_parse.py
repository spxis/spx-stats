"""Read the roster of an NFL, AFL or AAFC club-season article (English Wikipedia, CC BY-SA 4.0) from the wikitext scripts/nfl/fetch.py cached.
A library for nflwp_fetch.py and nflwp_load.py.

  roster_section(text)   -> the body of the article's Roster heading (or None), cut before a sub-heading about staff, coaches or the draft
  entries(section)       -> the players it lists, one dict each:
        ord     position in the section
        name    the name as the article shows it
        title   the article the name links to, or None (no link: the name stays in the table, no person is placed)
        num     jersey number as text (or None), pos the position text as written ("QB/RB", or None)
  club_titles(league, year, find)  -> {club name: article title} the way scripts/nfl/season.py finds them (the season article's standings
        templates name the clubs); `find(sub, title)` returns cached wikitext or None. No request is ever made here.

Nothing is guessed: a name with no link has title None. Formats read (each seen in real articles of 1920-1972):
  {{NFLplayer|num|Name|POS|d=disambiguation|link=no|rookie=y|d3=Jr.}}   one per player, in {{NFL final roster}}, {{NFL season roster}} or a table
  * {{player|num}} [[Title|Name]] POS/POS      a bullet list inside a table ('''Backs''' ... '''Linemen''')
  *88 ''[[Title|Name]]'' POS, * 63 [[Name]]     numbers as plain text; italics mark a rookie
  14 [[Name]]<br>16 [[Name]]                   several to a line, separated by <br>
  * [[Title|Name]]* POS                         the same without numbers (1920s)
  * {{player|num}} ''Name'' POS                 a name with no article
  |  ||- align=left|[[Name]]||22 ||E-DB ||...    a table with one row a player (Eagles of the 1940s and 50s)
"""
import re

HEAD = re.compile(r"^(={2,6})\s*(.*?)\s*\1\s*$", re.M)
ROSTER = r"(final |team |season )?roster( and coaching staff| and staff)?"
STOP = re.compile(r"staff|coach|management|front office|draft|transaction|notes?|references|trades?|waived|released|offseason|schedule", re.I)
POSTXT = r"[A-Z]{1,3}(?:[/-][A-Z]{1,3})*"

def _cut(text, m, stop=True):
    level = len(m.group(1))
    end = len(text)
    for n in HEAD.finditer(text, m.end()):
        if len(n.group(1)) <= level or (stop and STOP.search(n.group(2))):
            end = n.start(); break
    return text[m.end():end]

def roster_section(text):
    for m in HEAD.finditer(text):
        if re.fullmatch(ROSTER, m.group(2), re.I):
            sec = _cut(text, m)
            # "Roster" followed at once by a Staff sub-heading and then the players (1959 49ers): read past it
            if not entries(sec): sec = _cut(text, m, stop=False)
            return sec
    # an article whose roster sits under "Players" (a few 1960s ones): taken only when the section holds a roster template or numbered names
    for m in HEAD.finditer(text):
        if re.fullmatch(r"players|personnel", m.group(2), re.I):
            s = _cut(text, m)
            if re.search(r"NFL (final|season) roster|NFLplayer|\{\{player\|", s, re.I): return s
    return None

def _strip(s):
    s = re.sub(r"<!--.*?-->|<ref[^>]*?/>|<ref[^>]*?>.*?</ref>", "", s or "", flags=re.S)
    s = re.sub(r"<span[^>]*>(.*?)</span>", r"\1", s, flags=re.S | re.I)
    return re.sub(r"<br\s*/?>", "\n", s, flags=re.I)

def _plain(s):
    s = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", s)
    s = re.sub(r"\{\{[^{}]*\}\}", "", s)
    s = s.replace("'''", "").replace("''", "").replace("&nbsp;", " ")
    return re.sub(r"\s+", " ", s).strip()

def _args(body):
    """Split the inside of a template on top-level pipes: (head, named, positional)."""
    parts, depth, cur, i = [], 0, "", 0
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
        m = re.match(r"\s*([A-Za-z0-9_ ]+?)\s*=(.*)$", p, re.S)
        if m: named[m.group(1).lower()] = m.group(2).strip()
        else: pos.append(p.strip())
    return parts[0].strip(), named, pos

def _number(s):
    s = _plain(s or "").replace("\xa0", "").strip()
    return s if re.fullmatch(r"\d{1,2}", s) else None

NOT_PLAYER = re.compile(r"^(File|Image|Category|Template|Wikipedia|Help|List of|Pro Bowl|Pro Football Hall|\d{4} .*(season|draft))", re.I)

def entries(section):
    """The players of a Roster section in the order the article lists them."""
    out = []
    text = _strip(section or "")
    # {{NFLplayer ...}}: found by scanning for the template and balancing braces
    for m in re.finditer(r"\{\{\s*NFL\s*player\s*\|", text, re.I):
        j, depth = m.start(), 0
        while j < len(text):
            if text.startswith("{{", j): depth += 1; j += 2
            elif text.startswith("}}", j):
                depth -= 1; j += 2
                if depth == 0: break
            else: j += 1
        head, named, pos = _args(text[m.start() + 2:j - 2])
        if len(pos) < 2: continue
        name = _plain(pos[1])
        if not name: continue
        link = named.get("link", "").strip()
        d = _plain(named.get("d", "")) if named.get("d") else ""
        if link.lower() in ("no", "n", "false", "0"): title = None
        elif link: title = _plain(link)
        else: title = f"{name} ({d})" if d else name
        tail = re.match(r"[ \t]*(%s)\*?[ \t]*(?:$|\n)" % POSTXT, text[j:])
        p = _plain(pos[2]) if len(pos) > 2 and re.fullmatch(POSTXT, _plain(pos[2])) else (tail.group(1) if tail else None)
        out.append(dict(at=m.start(), name=name, title=(title.replace("_", " ").strip() if title else None), num=_number(pos[0]), pos=p))
    at = 0
    prev_num = None
    for ln in text.split("\n"):
        start = at; at += len(ln) + 1
        s = ln.strip()
        if not s or re.search(r"\bNFL\s*player\b", s, re.I): continue
        if s.startswith("|") and "||" not in s and not s.startswith(("|-", "|}", "|+")):   # one cell to a line: a number, then the name
            cell = s[1:].strip()
            if _number(cell): prev_num = _number(cell); continue
            ml = re.fullmatch(r"(?:''|\s)*\[\[([^\]|#]+)(?:\|([^\]]*))?\]\](?:''|\s)*", cell)
            if ml and prev_num is not None and not NOT_PLAYER.match(ml.group(1).strip()):
                out.append(dict(at=start, name=_plain(ml.group(2) or ml.group(1)), title=ml.group(1).replace("_", " ").strip(), num=prev_num, pos=None))
            prev_num = None
            continue
        if s.startswith("|"):                           # a table row with one player: the first link of its first three cells
            cells = s.lstrip("|").split("||")
            if len(cells) < 4: continue
            for c in cells[:3]:
                ml = re.search(r"\[\[([^\]|#]+)(?:\|([^\]]*))?\]\]", c)
                if ml:
                    if not NOT_PLAYER.match(ml.group(1).strip()):
                        out.append(dict(at=start, name=_plain(ml.group(2) or ml.group(1)), title=ml.group(1).replace("_", " ").strip(), num=_number(cells[0]), pos=None))
                    break
            continue
        bullet = s[0] in "*\u2022"
        body = s.lstrip("*\u2022").strip()
        num = None
        mn = re.match(r"\{\{\s*player\s*\|([^{}|]*)\}\}\s*", body, re.I)
        if mn: num = _number(mn.group(1)); body = body[mn.end():]
        else:
            mn = re.match(r"(\d{1,2})(?:\s+[-\u2013\u2014])?\s+(?=\S)", body)
            if mn and (bullet or True): num = mn.group(1); body = body[mn.end():]
            else: mn = None
        if not (bullet or mn): continue
        ml = re.match(r"(?:''|\s)*\[\[([^\]|#]+)(?:\|([^\]]*))?\]\]", body)
        if ml and not NOT_PLAYER.match(ml.group(1).strip()):
            name = _plain(ml.group(2) or ml.group(1))
            tail = _plain(body[ml.end():]).replace("*", "").strip("() ")
            p = re.match(r"(%s)\b" % POSTXT, tail)
            if name: out.append(dict(at=start, name=name, title=ml.group(1).replace("_", " ").strip(), num=num, pos=p.group(1) if p else None))
            continue
        if mn and (mn.re.pattern.startswith(r"\{\{") or bullet):     # an unlinked player a jersey number marked
            nm = _plain(body)
            p = re.search(r"\s+(%s)\*?$" % POSTXT, nm)
            if p: nm = nm[:p.start()].strip()
            nm = nm.replace("*", "").strip()
            if nm and re.fullmatch(r"[A-Z][\w'.\- ]{1,40}", nm) and len(nm.split()) <= 4 and not NOT_PLAYER.match(nm):
                out.append(dict(at=start, name=nm, title=None, num=num, pos=p.group(1) if p else None))
    out.sort(key=lambda e: e["at"])
    res = []
    for n, e in enumerate(out):
        del e["at"]; e["ord"] = n; res.append(e)
    return res

def season_label(league, year, title):
    """The club name an article title carries: '1962 Dallas Texans season' -> 'Dallas Texans' (as scripts/nfl/season.py names it)."""
    return re.sub(r"\s*\([^)]*\)$", "", title[len(str(year)) + 1:-7].strip())

def club_titles(league, year, find):
    """{club name: article title}. `find(sub, title)` gives cached wikitext or None."""
    LT = {"nfl": "NFL", "afl": "AFL", "aafc": "AAFC"}[league]
    stext = find("season", f"{year} {LT} season")
    if stext is None: return {}
    tpl = sorted(set(m.strip() for m in re.findall(r"\{\{\s*(%d (?:AFC|NFC|AFL|NFL|APFA|AAFC)[^{}|]*?[Ss]tandings)\s*(?:\|[^{}]*)?\}\}" % year, stext)))
    ttext = ""
    for t in tpl:
        x = find("template", "Template:" + t)
        if x: ttext += x
    src = ttext if ttext else stext
    out = set()
    for m in re.findall(r"\[\[(%d [^\]|#]+? season)" % year, src):
        if re.fullmatch(r"%d (NFL|AFL|AFC|NFC|APFA|AAFC) season" % year, m): continue
        if re.search(r"(NFL|AFL|NFL draft|Pro Bowl|Super Bowl)\b.* season$", m) and "(NFL)" not in m and "(AFL)" not in m: continue
        out.add(m.strip())
    names = {season_label(league, year, t): t for t in sorted(out)}
    extra = {("nfl", 1943): {"Phil-Pitt Steagles": "Steagles"}, ("nfl", 1944): {"Card-Pitt": "Card-Pitt"}}.get((league, year), {})
    names.update(extra)
    return names
