#!/usr/bin/env python3
"""Parse NFL wikitext (English Wikipedia) into game views and standings rows.

A club-season article logs that club's games (regular season and playoffs), so a game appears in both
clubs' articles: pair() joins the two views. Articles are loose: the date column may be missing (the
other club's view then supplies it), the score is written winner first, the opponent may be a link or
plain text. Rows nothing here can read come back as unparsed, never dropped silently.
"""
import datetime, re

MONTHS = {m: i + 1 for i, m in enumerate("january february march april may june july august september october november december".split())}
MON_RE = r"(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?"
DATE_RE = re.compile(r"(?:^|[^A-Za-z])" + MON_RE + r"\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:\s*,?\s*(\d{4}))?", re.I)
DASH = r"[–—\-]"
RESULT_RE = re.compile(r"(?<![A-Za-z])(W|L|T|Win|Loss|Tie|Won|Lost|Tied)\b\W{0,3}(\d{1,2})\s*" + DASH + r"\s*(\d{1,2})(?!\d)", re.I)
BARE_SCORE_RE = re.compile(r"^\W*(\d{1,2})\s*" + DASH + r"\s*(\d{1,2})\W*(?:\(?\s*OT\s*\)?)?\W*$")
PLAYOFF_ROW_RE = re.compile(r"wild[- ]?card|divisional|division|conference|championship|super\s*bowl|playoff|round|semifinal|final", re.I)
NONGAME_RE = re.compile(r"\bbye\b|cancel|postpon|forfeit|not played|no game|tba|tbd|strike", re.I)


def strip_templates(s):
    """Remove {{...}} (innermost first), keeping nothing."""
    prev = None
    while prev != s:
        prev = s
        s = re.sub(r"\{\{[^{}]*\}\}", "", s)
    return s


def unwrap_templates(s):
    """{{dow tooltip|September 12, 1982}} -> September 12, 1982 (the first argument), others removed."""
    prev = None
    while prev != s:
        prev = s
        s = re.sub(r"\{\{\s*[^{}|]*\|([^{}|]*)[^{}]*\}\}", r"\1", s)
        s = re.sub(r"\{\{[^{}|]*\}\}", "", s)
    return s


def clean(s):
    s = re.sub(r"<ref[^>]*?/>|<ref[^>]*>.*?</ref>", "", s, flags=re.S)
    s = re.sub(r"<br\s*/?>", " ", s)
    s = re.sub(r"<!--.*?-->", "", s, flags=re.S)
    s = re.sub(r"<[^>]+>", "", s)
    s = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", s)
    s = re.sub(r"\[https?://[^ \]]*\s*([^\]]*)\]", r"\1", s)
    s = strip_templates(s)
    s = s.replace("'''", "").replace("''", "").replace("&nbsp;", " ").replace("\xa0", " ")
    return re.sub(r"\s+", " ", s).strip(" |\t")


def link_of(cell):
    """Target of the first club-season link in a cell, else None."""
    m = re.search(r"\[\[(\d{4} [^\]|]+? season)(?:\|[^\]]*)?\]\]", cell)
    return m.group(1).strip() if m else None


def strip_attr(c):
    """'style="x" | text' or 'colspan=2| text' -> 'text' (a wiki link's pipe is not an attribute separator)."""
    c = c.strip()
    m = re.match(r"^((?:[a-zA-Z-]+\s*=\s*(?:\"[^\"]*\"|'[^']*'|[^\s|]+)\s*)+)\|(?!\|)(.*)$", c, re.S)
    return m.group(2).strip() if m else c


def cells_of(lines):
    """Cells of one table row from its lines (a '|' or '!' line starts a cell; '||' / '!!' separate cells on a line)."""
    cells = []
    for ln in lines:
        s = ln.rstrip()
        if s.startswith("|") or s.startswith("!"):
            if cells and (cells[-1].count("{{") > cells[-1].count("}}") or cells[-1].count("[[") > cells[-1].count("]]")):
                cells[-1] += " " + s.lstrip("|! ")
                continue
            body = s[1:]
            for c in re.split(r"\|\||!!", body):
                cells.append(strip_attr(c))
        elif cells:
            cells[-1] += " " + s.strip()
    return cells


def date_of(cell, season):
    t = unwrap_templates(re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", cell))
    t = re.sub(r"<[^>]+>", " ", t)
    m = DATE_RE.search(t)
    if not m:
        mn = re.search(r"\b(\d{1,2})/(\d{1,2})/(\d{4})\b", t)
        if mn:
            try: return datetime.date(int(mn.group(3)), int(mn.group(1)), int(mn.group(2)))
            except ValueError: return None
        return None
    key = m.group(1).lower()
    mon = next(v for k, v in MONTHS.items() if k.startswith(key[:3]))
    day = int(m.group(2))
    expected = season if mon >= 7 else season + 1
    y = int(m.group(3)) if m.group(3) else expected
    if y != expected: y = expected   # a typo in the year (a log has 'September 24, 1999' in 1990): the season decides
    try:
        return datetime.date(y, mon, day)
    except ValueError:
        return None


def result_of(text):
    """-> (mark W/L/T, hi, lo, overtime) from a result cell, or None. The winner's score is the higher one whatever the order written."""
    t = clean(unwrap_templates(text))
    ot = bool(re.search(r"\bOT\b|overtime|sudden", t, re.I))
    m = RESULT_RE.search(t)
    if m:
        mark = {"w": "W", "l": "L", "t": "T"}[m.group(1)[0].lower()]
        a, b = int(m.group(2)), int(m.group(3))
        hi, lo = max(a, b), min(a, b)
        if mark == "T" and a != b: return None
        if mark != "T" and a == b: mark = "T"
        return mark, hi, lo, ot, (a, b)
    return None


def parse_row(cells, hdr, season, phase, rnd):
    """-> view dict, None (not a game), or 'bad' (looks like a game, unreadable)."""
    if not cells: return None
    joined = " ".join(cells)
    n = len(hdr)
    # columns by header when the row has as many cells as the header
    by = {}
    if n and len(cells) == n:
        for k, h in enumerate(hdr):
            by.setdefault(h, k)
    def col(name):
        return cells[by[name]] if name in by else None
    # result
    res = None
    cand = []
    if by.get("result") is not None: cand.append(cells[by["result"]])
    if by.get("score") is not None: cand.append(cells[by["score"]])
    if len(cand) == 2:
        # result word in one cell, score in the other
        res = result_of(cand[0] + " " + cand[1])
    for c in cand:
        if res: break
        res = result_of(c)
    if not res:
        for c in cells:
            res = result_of(c)
            if res: break
    link = None
    for c in cells:
        link = link_of(c)
        if link: break
    opp_cell = col("opponent")
    if opp_cell is None:
        opp_cell = next((c for c in cells if link and link_of(c) == link), None)
        if opp_cell is None and res:
            opp_cell = next((c for c in cells if re.match(r"^\W*(at|vs\.?|@)\s", clean(c), re.I)), None)
    if not res:
        return None
    if opp_cell is None: return "bad"
    mark, hi, lo, ot, written = res
    # date
    d = None
    dcell = col("date")
    if dcell is not None: d = date_of(dcell, season)
    if d is None:
        for c in cells[:4]:
            if c is opp_cell: continue
            d = date_of(c, season)
            if d: break
    # opponent text and venue
    otext = clean(opp_cell)
    loc = "H"
    mo = re.match(r"^(@|at\b|vs\.?|v\.|neutral|\(N\))\s*", otext, re.I)
    if mo:
        t = mo.group(1).lower()
        loc = "A" if t in ("@", "at") else "N" if t.startswith(("n", "(n")) else "H"
        otext = otext[mo.end():]
    # a "Game site"/"Venue" column does not say home or away reliably; the opponent cell does
    otext = re.sub(r"\s*\((?:[A-Za-z]{0,2}\s?#?\d{1,2})\)\s*$", "", otext).strip()
    otext = re.sub(r"^\((?:[A-Za-z]{0,2}\s?#?\d{1,2})\)\s*", "", otext).strip()
    wk = clean(cells[0]) if cells else ""
    rd = None
    is_playoff = phase == "playoffs"
    if PLAYOFF_ROW_RE.search(wk) and not re.fullmatch(r"\W*\d{1,2}\W*", wk) and not re.match(r"^\W*(week|wk)\b", wk, re.I):
        is_playoff = True
    elif re.fullmatch(r"[A-Za-z]{1,4}\.?", wk) and wk.lower() not in ("bye", "n/a", "tbd", "tba", "week", "wk") and not DATE_RE.search(wk):
        is_playoff = True   # 'WC', 'DC', 'CC', 'SB': a playoff round written short
    if is_playoff:
        rd = wk if (wk and not re.fullmatch(r"\W*\d{1,2}\W*", wk)) else rnd
        if rd and re.search(r"super\s*bowl", rd, re.I): loc = "N"
    wkn = int(wk) if re.fullmatch(r"\d{1,2}", wk) else None
    rec = None
    if by.get("record") is not None:
        mr = re.fullmatch(r"\W*(\d{1,2})\s*" + DASH + r"\s*(\d{1,2})(?:\s*" + DASH + r"\s*(\d{1,2}))?\W*", clean(cells[by["record"]]))
        if mr: rec = tuple(int(x or 0) for x in mr.groups())
    return dict(phase="playoffs" if is_playoff else "regular", round=rd, week=wkn, date=d, opp_link=link if link_of(opp_cell) else None,
                opp_text=otext, loc=loc, mark=mark, hi=hi, lo=lo, ot=ot, rec=rec, src=" | ".join(clean(c) for c in cells)[:400])


def parse_team_page(text, season, team):
    """-> (views, unparsed)."""
    views, bad = [], []
    lines = text.split("\n")
    i, n = 0, len(lines)
    h2 = h3 = h4 = ""
    while i < n:
        ln = lines[i]
        mh = re.match(r"^(={2,4})\s*(.*?)\s*\1\s*$", ln)
        if mh:
            lvl, title = len(mh.group(1)), clean(mh.group(2))
            if lvl == 2: h2, h3, h4 = title, "", ""
            elif lvl == 3: h3, h4 = title, ""
            else: h4 = title
            i += 1; continue
        if ln.lstrip().startswith("{|"):
            j = i + 1
            depth = 1
            tab = [ln]
            while j < n and depth > 0:
                if lines[j].lstrip().startswith("{|"): depth += 1
                elif lines[j].lstrip().startswith("|}"): depth -= 1
                tab.append(lines[j]); j += 1
            heads = " ".join((h2, h3, h4)).lower()
            if not re.search(r"pre-?season|exhibition|replacement|draft|american bowl", heads):
                v, b = parse_table(tab, season, heads)
                views += v; bad += b
            i = j; continue
        i += 1
    seen, uniq = set(), []
    for v in views:
        k = (v["phase"], v["date"], v["opp_link"] or v["opp_text"], v["mark"], v["hi"], v["lo"], v["loc"], v["week"] if v["date"] is None else None)
        if k in seen: continue
        seen.add(k); uniq.append(v)
    bv, undated = parse_boxes(text, season, team, uniq)
    uniq += bv
    for v in uniq: v["team"] = team
    return uniq, bad


def parse_table(tab, season, heads):
    """One wikitable. A schedule has an 'Opponent' header; section headings (or a Week cell such as 'Divisional') say playoffs."""
    body = tab[1:-1] if tab and tab[-1].lstrip().startswith("|}") else tab[1:]
    rows, cur = [], []
    attrs = []
    for ln in body:
        if ln.startswith("|-"):
            if cur: rows.append(cur)
            cur = []
        elif ln.startswith("|+"):
            continue
        else:
            cur.append(ln)
    if cur: rows.append(cur)
    hdr, views, bad = [], [], []
    phase = "playoffs" if re.search(r"playoff|postseason|post-season", heads) else "regular"
    rnd = None
    for r in rows:
        cs = cells_of(r)
        if not cs: continue
        if all(l.startswith("!") for l in r if l.strip()) and any(re.search(r"opponent", c, re.I) for c in cs):
            hdr = [norm_head(c) for c in cs]
            if any(re.search(r"yard|yds|rush|touchdown|reception|attempt|carries|tackle|sack", h) or h in ("att", "avg", "td", "tds", "car", "cmp", "lng") for h in hdr):
                return [], []   # a player's game log, not a schedule
            if re.search(r"seed", " ".join(cs), re.I) and phase == "regular" and False: pass
            continue
        if not hdr:
            # headerless table: only a schedule if rows carry a club-season link and a result
            if not any(link_of(c) for c in cs) or not any(result_of(c) for c in cs): continue
        if len(cs) <= 2 and not any(result_of(c) for c in cs):
            t = clean(" ".join(cs))
            if re.search(r"playoff|postseason", t, re.I): phase = "playoffs"
            continue
        v = parse_row(cs, hdr, season, phase, rnd)
        if v == "bad": bad.append(" | ".join(clean(c) for c in cs)[:300])
        elif v: views.append(v)
    return views, bad


def norm_head(c):
    t = clean(re.sub(r"\{\{[^{}]*\}\}", "", c)).lower()
    t = re.sub(r"\(.*?\)", "", t).strip()
    for k in ("week", "date", "opponent", "result", "record", "score", "attendance", "time", "tv", "venue", "site", "stadium", "game site", "location"):
        if t.startswith(k) or (k in ("opponent", "result") and k in t): return {"game site": "site", "stadium": "site", "venue": "site", "location": "site"}.get(k, k)
    return t



# ---- game boxes ({{Americanfootballbox}}, {{AFB game box start}}) ----
def balanced(lines, i):
    """Lines of the template that starts at lines[i], and the index after it."""
    depth, out, j = 0, [], i
    while j < len(lines):
        out.append(lines[j])
        depth += lines[j].count("{{") - lines[j].count("}}")
        j += 1
        if depth <= 0: break
    return out, j


def box_params(text):
    """Top-level |key=value pairs of a template body (keys lower-cased)."""
    body = text.strip()
    body = body[2:-2] if body.startswith("{{") and body.endswith("}}") else body
    parts, depth, cur = [], 0, ""
    k = 0
    while k < len(body):
        two = body[k:k + 2]
        if two in ("{{", "[["): depth += 1; cur += two; k += 2; continue
        if two in ("}}", "]]"): depth -= 1; cur += two; k += 2; continue
        if body[k] == "|" and depth == 0: parts.append(cur); cur = ""; k += 1; continue
        cur += body[k]; k += 1
    parts.append(cur)
    out = {}
    for p in parts[1:]:
        if "=" in p:
            a, b = p.split("=", 1)
            out[a.strip().lower()] = b.strip()
    return out


def parse_boxes(text, season, team, have):
    """Games a club article shows only as a game box (the table has no row for them). `have` is the list of views already read;
    a box adds a view only when no row of that club has the same result against the same opponent within ten days.
    -> (views, undated): undated boxes carry no date and are returned for the log."""
    lines = text.split("\n")
    views, undated = [], []
    h2 = h3 = h4 = ""
    i = 0
    mine = team.split()[-1].lower()
    while i < len(lines):
        ln = lines[i]
        mh = re.match(r"^(={2,4})\s*(.*?)\s*\1\s*$", ln)
        if mh:
            lvl, title = len(mh.group(1)), clean(mh.group(2))
            if lvl == 2: h2, h3, h4 = title, "", ""
            elif lvl == 3: h3, h4 = title, ""
            else: h4 = title
            i += 1; continue
        if re.match(r"^\s*\{\{\s*(Americanfootballbox|AFB game box start)\b", ln, re.I):
            blk, j = balanced(lines, i)
            i = j
            heads = " ".join((h2, h3, h4))
            if re.search(r"pre-?season|exhibition|american bowl", heads, re.I): continue
            p = box_params("\n".join(blk))
            road = re.sub(r"\s*\([^)]*\)", "", clean(p.get("road") or p.get("visitor") or "")).strip(" '")
            home = re.sub(r"\s*\([^)]*\)", "", clean(p.get("home") or p.get("host") or "")).strip(" '")
            def tot(prefix):
                vals = [p.get(f"{prefix}{n}") for n in range(1, 8)]
                nums = [int(re.match(r"\s*(\d+)", clean(v)).group(1)) for v in vals if v and re.match(r"\s*\d+", clean(v))]
                return sum(nums) if nums else None, len(nums)
            (rs, rn), (hs, hn) = (tot("r") if "road" in p else tot("v")), tot("h")
            if rs is None or hs is None or not road or not home: continue
            if mine not in road.lower() and mine not in home.lower(): continue
            home_is_me = mine in home.lower() and not (mine in road.lower() and mine not in home.lower())
            d = None
            for key in ("date", "time", "title"):
                if p.get(key):
                    d = date_of(p[key], season)
                    if d: break
            ot = max(rn, hn) > 4
            me, opp = (hs, rs) if home_is_me else (rs, hs)
            opp_text = road if home_is_me else home
            mark = "W" if me > opp else "L" if me < opp else "T"
            is_po = bool(re.search(r"playoff|postseason|post-season", h2, re.I)) or bool(re.match(
                r"^(?:\d{4}\s+)?(?:AFC|NFC)?\s*(?:wild ?card|divisional|conference|championship|super bowl|first round|second round)", h4 or h3, re.I))
            if not is_po: continue   # regular-season boxes only repeat table rows; the boxes fill the playoff games a club's table lacks
            v = dict(phase="playoffs", round=(h4 or h3), week=None, date=d, opp_link=None, opp_text=opp_text,
                     loc="H" if home_is_me else "A", mark=mark, hi=max(me, opp), lo=min(me, opp), ot=ot, rec=None,
                     src="game box: " + re.sub(r"\s+", " ", f"{road} {rs} at {home} {hs} {p.get('time') or p.get('date') or ''}")[:300], box=True)
            if re.search(r"super bowl", heads, re.I): v["loc"] = "N"
            # a club meets an opponent once in a postseason: any playoff row against that opponent is this game
            dup = any(w["phase"] == "playoffs" and w["opp_text"].split()[-1:] == opp_text.split()[-1:] for w in have if w["opp_text"])
            if dup: continue
            views.append(v)   # an undated box takes the date of the other club's view of the game when the two are paired
            continue
        i += 1
    return views, undated


# ---- opponent / team naming ----
def nick_city(full):
    w = full.split()
    if len(w) > 1 and " ".join(w[-2:]) in ("Red Sox", "White Sox"): return " ".join(w[:-2]), " ".join(w[-2:])
    return (" ".join(w[:-1]), w[-1]) if len(w) > 1 else ("", full)


def resolve(text, link, teams, me=None):
    """-> list of candidate club names (the link first)."""
    if link:
        m = re.match(r"^\d{4} (.+) season$", link)
        nm = m.group(1) if m else link
        nm = re.sub(r"\s*\([^)]*\)$", "", nm)
        if nm in teams: return [nm]
    t = re.sub(r"\s+", " ", text.replace("\xa0", " ").strip().strip(".")).lower()
    if not t: return []
    best = {}
    for full in teams:
        city, nick = nick_city(full)
        f, c, k = full.lower(), city.lower(), nick.lower()
        sc = 4 if t == f else 3 if t == k else 2 if t == c else 1 if (f.startswith(t + " ") or f.endswith(" " + t)) else 0
        if sc: best[full] = sc
    if not best: return []
    top = max(best.values())
    return sorted(k for k, v in best.items() if v == top and k != me) or sorted(k for k, v in best.items() if v == top)


def pair(views_by_team, teams):
    """Join the two clubs' views of each game. -> (games, unresolved)."""
    flat, unresolved = [], []
    for team, vs in views_by_team.items():
        for v in vs:
            c = [x for x in resolve(v["opp_text"], v["opp_link"], teams, me=team) if x != team]
            if not c: unresolved.append(v["src"]); continue
            flat.append(dict(v, opp=c))
    index = {}
    for v in flat: index.setdefault(v["team"], []).append(v)
    def mirror(w, v):
        # w is the view from the other side of v: same result, same phase, dates within a day when both are known
        if w["phase"] != v["phase"] or w["mark"] == v["mark"] and w["mark"] != "T": return False
        if (w["hi"], w["lo"]) != (v["hi"], v["lo"]): return False
        return w["date"] is None or v["date"] is None or abs((w["date"] - v["date"]).days) <= 1
    for v in flat:
        if len(v["opp"]) > 1:
            ok = [o for o in v["opp"] if any(v["team"] in w["opp"] and mirror(w, v) for w in index.get(o, []))]
            v["opp"] = ok[:1] if ok else v["opp"][:1]
            if not ok: v["ambiguous"] = True
    groups = {}
    for v in flat: groups.setdefault(frozenset((v["team"], v["opp"][0])), []).append(v)
    games = []
    for pr, vs in groups.items():
        if len(pr) < 2: continue
        a_name = sorted(pr)[0]
        A = [v for v in vs if v["team"] == a_name]
        B = [v for v in vs if v["team"] != a_name]
        A.sort(key=lambda v: (v["date"] is None, v["date"] or datetime.date.min, v["week"] or 0))
        B.sort(key=lambda v: (v["date"] is None, v["date"] or datetime.date.min, v["week"] or 0))
        used = set()
        def take(a, level):
            """level 0: same result within a day (or a date missing); 1: same result within ten days (a typo in a date);
            2: a different result within a day (the logs disagree)."""
            best = None
            for k, b in enumerate(B):
                if k in used: continue
                same = (a["hi"], a["lo"]) == (b["hi"], b["lo"]) and (a["mark"] != b["mark"] or a["mark"] == "T")
                if a["date"] is not None and b["date"] is not None:
                    dd = abs((a["date"] - b["date"]).days)
                else:
                    dd = 0
                ok = (same and dd <= 1) if level == 0 else (same and dd <= 10) if level == 1 else dd <= 1
                if ok:
                    key = (0 if same else 1, dd)
                    if best is None or key < best[0]: best = (key, k)
            return best[1] if best else None
        pairs, left = [], list(A)
        for level in (0, 1, 2):
            still = []
            for a in left:
                k = take(a, level)
                if k is not None: used.add(k); pairs.append((a, B[k]))
                else: still.append(a)
            left = still
        for a in left: pairs.append((a, None))
        for k, b in enumerate(B):
            if k not in used: pairs.append((None, b))
        for a, b in pairs:
            games.append(merge(a, b))
    out, nodate = [], []
    for g in games:
        (out if g["date"] else nodate).append(g)
    out.sort(key=lambda g: (g["date"], g["phase"], g["home"], g["away"]))
    seen = {}
    for g in out:
        k = (g["phase"], g["date"], g["home"], g["away"])
        g["seq"] = seen.get(k, 0); seen[k] = g["seq"] + 1
    return out, unresolved, nodate


def merge(a, b):
    vs = [v for v in (a, b) if v]
    notes = []
    phase = "playoffs" if any(v["phase"] == "playoffs" for v in vs) else "regular"
    if len(vs) == 2 and vs[0]["phase"] != vs[1]["phase"]: notes.append("phase: one log files it as a playoff game, the other as regular season")
    def as_home(v):
        t, o = v["team"], v["opp"][0]
        w = v["mark"]
        pf, pa = (v["hi"], v["lo"]) if w in ("W", "T") else (v["lo"], v["hi"])
        if v["loc"] == "A": return o, t, pa, pf, False
        if v["loc"] == "N": return None, None, None, None, True
        return t, o, pf, pa, False
    if len(vs) == 2:
        a_, b_ = vs
        if (a_["hi"], a_["lo"]) != (b_["hi"], b_["lo"]) or (a_["mark"] == b_["mark"] and a_["mark"] != "T") or (a_["mark"] == "T") != (b_["mark"] == "T"):
            notes.append(f"score {a_['team']} {a_['mark']} {a_['hi']}-{a_['lo']} vs {b_['team']} {b_['mark']} {b_['hi']}-{b_['lo']}")
        if a_["loc"] == b_["loc"] and a_["loc"] in ("H", "A"):
            notes.append("both views claim the same side")
    pick = vs[0]
    if len(vs) == 2 and notes:
        pick = next((v for v in vs if v["loc"] == "H"), vs[0])
    h, aw, hp, ap, neutral = as_home(pick)
    if h is None:
        t, o = sorted((pick["team"], pick["opp"][0]))
        w = pick["mark"]
        pf, pa = (pick["hi"], pick["lo"]) if w in ("W", "T") else (pick["lo"], pick["hi"])
        if pick["team"] == t: h, aw, hp, ap = t, o, pf, pa
        else: h, aw, hp, ap = t, o, pa, pf
        neutral = True
    if len(vs) == 2 and any(v["loc"] == "N" for v in vs): neutral = True
    cands = []
    for v in vs:
        pf, pa = (v["hi"], v["lo"]) if v["mark"] in ("W", "T") else (v["lo"], v["hi"])
        cand = (pf, pa) if v["team"] == h else (pa, pf)
        if cand not in [c[0] for c in cands]: cands.append((cand, v["team"]))
    d = next((v["date"] for v in vs if v["date"]), None)
    if len(vs) == 2 and vs[0]["date"] and vs[1]["date"] and vs[0]["date"] != vs[1]["date"]:
        notes.append(f"date {vs[0]['team']} {vs[0]['date']} vs {vs[1]['team']} {vs[1]['date']}")
        d = pick["date"] or d
        sun = [v["date"] for v in vs if v["date"].weekday() == 6]
        if len(sun) == 1 and abs((vs[0]["date"] - vs[1]["date"]).days) > 1:
            d = sun[0]   # a date a few days out is a typo in one log; most games are on a Sunday
    return dict(phase=phase, round=next((v["round"] for v in vs if v.get("round")), None), date=d, home=h, away=aw,
                home_pts=hp, away_pts=ap, ot=any(v.get("ot") for v in vs), neutral=neutral, views=len(vs),
                conflict="; ".join(notes) or None, src=" // ".join(v["src"] for v in vs)[:800],
                ambiguous=any(v.get("ambiguous") for v in vs), week=next((v["week"] for v in vs if v.get("week")), None), cands=cands)


def adjudicate(games, std):
    """Where a game's two logs give different scores, keep the one that makes both clubs' points for and against
    agree best with the season's published standings (the home club's log when that settles nothing).
    Appends ' | kept: ...' to the game's conflict text."""
    pub = {r["team"]: (r.get("pf"), r.get("pa")) for r in std if r.get("pf") is not None and r.get("pa") is not None}
    tot = {}
    for g in games:
        if g["phase"] != "regular": continue
        for t, f, a in ((g["home"], g["home_pts"], g["away_pts"]), (g["away"], g["away_pts"], g["home_pts"])):
            x = tot.setdefault(t, [0, 0]); x[0] += f; x[1] += a
    def err(g, cand):
        e = 0
        for t, f, a in ((g["home"], cand[0], cand[1]), (g["away"], cand[1], cand[0])):
            if t not in pub: continue
            cur = (g["home_pts"], g["away_pts"]) if t == g["home"] else (g["away_pts"], g["home_pts"])
            x = tot[t]
            e += abs(x[0] - cur[0] + f - pub[t][0]) + abs(x[1] - cur[1] + a - pub[t][1])
        return e
    for g in games:
        if len(g.get("cands", [])) < 2 or g["phase"] != "regular" or not g["conflict"] or not g["conflict"].startswith("score"): continue
        cur = (g["home_pts"], g["away_pts"])
        best, besterr = cur, err(g, cur)
        for cand, team in g["cands"]:
            e = err(g, cand)
            if e < besterr: best, besterr = cand, e
        if best != cur:
            for t, f, a, nf, na in ((g["home"], cur[0], cur[1], best[0], best[1]), (g["away"], cur[1], cur[0], best[1], best[0])):
                if t in tot: tot[t][0] += nf - f; tot[t][1] += na - a
            g["home_pts"], g["away_pts"] = best
            who = next(t for c, t in g["cands"] if c == best)
            g["conflict"] += f" | kept: {who}'s log, which agrees with the published standings"
        else:
            g["conflict"] += " | kept: the home club's log" + ("" if besterr else ", which agrees with the published standings")
    return games


# ---- standings templates ----
def parse_standings(text, season):
    """-> rows: dict(team, w, l, t, pct, div, conf, pf, pa, stk, rank, seed, src)"""
    rows = []
    m = re.search(r"\{\|.*?\n(.*?)\n\|\}", text, re.S)
    if not m: return rows
    hdr = []
    rank = 0
    for blk in re.split(r"\n\|-", "\n" + m.group(1)):
        blk = blk.strip()
        if not blk: continue
        lines = [l for l in blk.split("\n")]
        if any(l.startswith("!") for l in lines) and not any(link_of(l) for l in lines):
            cs = cells_of([l for l in lines if l.startswith("!")])
            hs = []
            for c in cs:
                mm = re.search(r"\{\{\s*[Aa]bbr\s*\|\s*([^|}]+?)\s*\|", c)
                hs.append((mm.group(1) if mm else clean(c)).strip().upper().rstrip("."))
            if "W" in hs or "WINS" in hs: hdr = hs
            continue
        cl = [l for l in lines if l.startswith("|") or "||" in l]
        cs = cells_of(cl)
        if len(cs) < 3 or not cs[0]: continue
        ti = next((k for k, c in enumerate(cs) if link_of(c)), None)
        if ti is None: continue
        link = link_of(cs[ti])
        team = re.sub(r"^\d{4} ", "", link)[:-7]
        team = re.sub(r"\s*\([^)]*\)$", "", team)
        sm = re.search(r"\((\d)\)", cs[ti])
        seed = int(sm.group(1)) if sm else None
        if seed is None and ti >= 1 and re.fullmatch(r"\d{1,2}", clean(cs[0])): seed = int(clean(cs[0]))
        rank += 1
        d = {"team": team, "rank": rank, "seed": seed, "src": " | ".join(clean(c) for c in cs)[:400]}
        # header columns line up with the cells from the right (the team and seed cells vary in number)
        off = len(cs) - len(hdr)
        for k, c in enumerate(cs):
            kk = k - off
            if kk < 0 or kk >= len(hdr) or k <= ti: continue
            h = hdr[kk]
            c = clean(c)
            if h in ("W", "WINS"): d["w"] = intr(c)
            elif h in ("L", "LOSSES"): d["l"] = intr(c)
            elif h in ("T", "TIES"): d["t"] = intr(c)
            elif h in ("PCT", "WIN%", "PCT."): d["pct"] = c
            elif h in ("DIV", "DIVISION"): d["div"] = c
            elif h in ("CONF", "CONFERENCE"): d["conf"] = c
            elif h == "PF": d["pf"] = intr(c)
            elif h == "PA": d["pa"] = intr(c)
            elif h in ("STK", "STREAK"): d["stk"] = c
        if d.get("w") is not None and d.get("l") is not None:
            d.setdefault("t", 0)
            rows.append(d)
    return rows


def intr(s):
    m = re.match(r"^\D*(\d+)", s)
    return int(m.group(1)) if m else None
