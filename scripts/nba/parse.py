#!/usr/bin/env python3
"""Parse NBA/BAA wikitext (English Wikipedia) into game views and standings rows.

A team-season article logs that team's games (regular season and playoffs), so a game appears in
both clubs' articles: pair() joins the two views. Old articles are loose: scores may be written
either way round (the win/loss mark on the row settles it), playoff games before 1956 may be bullet
lists, opponents may be a bare city. Rows nothing here can read are returned as unparsed, never dropped.
"""
import datetime, re
from itertools import groupby

MONTHS = {m: i + 1 for i, m in enumerate("january february march april may june july august september october november december".split())}
MON_RE = r"(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?"
WEEKDAY = r"(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\.?,?\s+)?"   # "Fri. Oct. 31"
DATE_RE = re.compile(r"^\W*" + WEEKDAY + MON_RE + r"\s+(\d{1,2})\b(?!\s*,\s*\d{4})", re.I)
FULL_DATE_RE = re.compile(r"^\W*" + WEEKDAY + MON_RE + r"\s+(\d{1,2})\s*,\s*(\d{4})\b", re.I)   # "October 25, 1985": older articles write the year
DASH = r"[–—\-]"
SCORE_RE = re.compile(r"(?:\b([WL])\s*)?(\d{2,3})\s*" + DASH + r"\s*(\d{2,3})")
WON = ("game-won", "#bfb", "#cfc", "#ccffcc", "#bbffbb", "#cfe", "#ccffc", "#bdb")
LOST = ("game-lost", "#fcc", "#ffcccc", "#ffbbbb", "#fbb", "#fdd", "#ffc0c0")

def clean(s):
    s = re.sub(r"<ref[^>]*?/>|<ref[^>]*>.*?</ref>", "", s, flags=re.S)
    s = re.sub(r"<br\s*/?>", " ", s)
    s = re.sub(r"<!--.*?-->", "", s, flags=re.S)
    s = re.sub(r"</?(?:span|small|sup|b|i|center|font)\b[^>]*>", "", s, flags=re.I)   # colour spans round a cell's text
    return s.replace("'''", "").replace("''", "").lstrip("| ").strip()

def link_of(cell):
    """(target, label) of the first wiki link in a cell, else (None, plain text)."""
    m = re.search(r"\[\[([^\]|]+)(?:\|([^\]]*))?\]\]", cell)
    plain = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", cell)
    plain = re.sub(r"\{\{[^}]*\}\}|'''|''", "", plain)
    return (m.group(1).strip() if m else None), plain.strip()

ATTR_RE = re.compile(r"^\s*(?:style|class|align|bgcolor|colspan|rowspan|width|valign|scope|data-sort-value|nowrap)\b[^|]*=", re.I)

def cell_text(part):
    """A cell without its attributes: 'style="..." | content' -> 'content' (the first bar outside {{ }} and [[ ]] ends the attributes)."""
    if not ATTR_RE.match(part): return part.strip()
    depth = 0
    for k, ch in enumerate(part):
        if part.startswith(("{{", "[["), k): depth += 1
        elif part.startswith(("}}", "]]"), k): depth -= 1
        elif ch == "|" and depth <= 0: return part[k + 1:].strip()
    return part.strip()

def row_cells(lines):
    cells = []
    for ln in lines:
        if cells and ln[:1] in "|!" and (cells[-1].count("{{") > cells[-1].count("}}") or cells[-1].count("[[") > cells[-1].count("]]")):
            cells[-1] += " " + ln.strip()
        elif ln[:1] in ("|", "!") and ln:
            for c in re.split(r"\|\||!!", ln[1:]): cells.append(cell_text(c))
        elif cells: cells[-1] += " " + ln.strip()
    return cells

def is_me(cell, team):
    """True when a table cell names the page's own club (the club's full name, city or nickname, or a link to its season article)."""
    target, label = link_of(clean(cell))
    if target:
        m = re.match(r"^\d{4}[\u2013\-]\d{2,4} (.+) season$", target)
        if m: return m.group(1) == team
    t = re.sub(r"\s+", " ", label.replace("\u2013", "-").replace("\xa0", " ").strip(" .@")).lower()
    city, nick = nick_city(team)
    return bool(t) and t in (team.lower(), city.lower(), nick.lower()) and True

def visitor_home_cols(cells):
    """Column numbers (date, visitor, score, home, ot) when a header row reads Date | Visitor | Score | Home, else None (a header with another layout gives None too)."""
    heads = [re.sub(r"[^a-z/ ]", "", clean(c).lower()).strip() for c in cells]
    if "date" in heads and "visitor" in heads and "score" in heads and "home" in heads:
        return dict(date=heads.index("date"), vis=heads.index("visitor"), score=heads.index("score"), home=heads.index("home"),
                    ot=heads.index("ot") if "ot" in heads else None)
    return None

def year_for(season, month, phase):
    if phase == "playoffs" and season == 2019 and month >= 8: return season + 1
    return season if month >= 8 else season + 1

def parse_score_cell(cell, flag):
    """-> (pf, pa, ot, date or None) from the cell holding a game's score, oriented to the page's team, or None."""
    c = clean(cell)
    m = re.search(r"\{\{\s*NBA game(?:[ _]br)?\s*\|([^}]*)\}\}", c, re.I)
    if m:
        kv = dict((a.strip().lower(), b.strip()) for a, b in (p.split("=", 1) for p in m.group(1).split("|") if "=" in p))
        try:
            d = kv.get("date", "")
            dt = datetime.date(int(d[:4]), int(d[4:6]), int(d[6:8])) if len(d) == 8 else None
            return int(kv["pf"]), int(kv["pa"]), bool(kv.get("ot")), dt, True
        except (KeyError, ValueError):
            return None
    m = SCORE_RE.search(re.sub(r"\[https?://[^ \]]*\s*([^\]]*)\]", r"\1", c))
    if not m: return None
    wl, a, b = m.group(1), int(m.group(2)), int(m.group(3))
    hi, lo = max(a, b), min(a, b)
    ot = bool(re.search(r"\(\d?OT\)|\bOT\b", c))
    res = wl.upper() if wl else ("W" if flag == "W" else "L" if flag == "L" else None)
    if res == "W": return hi, lo, ot, None, True
    if res == "L": return lo, hi, ot, None, True
    return a, b, ot, None, False   # no mark anywhere: as written, team first

def norm_round(r):
    if not r: return r
    r = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]?\]?", r"\1", r).replace("[[", "").replace("]]", "")
    r = re.sub(r"^\d{4}\s+", "", r).strip(" '")
    return " ".join(("NBA" if w.lower() == "nba" else "BAA" if w.lower() == "baa" else w[:1].upper() + w[1:].lower()) for w in r.split())

def flag_of(attr):
    a = attr.lower()
    if any(k in a for k in WON): return "W"
    if any(k in a for k in LOST): return "L"
    return None

def parse_team_page(text, season, team):
    """-> (views, unparsed). A view: one team's record of one game."""
    views, bad = [], []
    phase, rnd, skip = "regular", None, False
    lines = text.split("\n")
    i, n = 0, len(lines)
    h2 = h3 = ""
    in_log = False
    vcols = None
    while i < n:
        ln = lines[i]
        mh = re.match(r"^(={2,4})\s*(.*?)\s*\1\s*$", ln)
        if mh:
            lvl, title = len(mh.group(1)), mh.group(2)
            if lvl == 2: h2, h3 = title, ""
            else: h3 = title
            t = (h2 + " " + h3).lower()
            skip = bool(re.search(r"pre-?season|exhibition", t))
            in_log = bool(re.search(r"game log|schedule|regular season|playoff|postseason|post-season|season log|results", t))
            phase = "playoffs" if re.search(r"playoff|postseason|post-season", t) else "regular"
            rnd = h3 if phase == "playoffs" and h3 and "game log" not in h3.lower() else None
            i += 1; continue
        ms = re.match(r"\{\{\s*NBA game log start\s*\|(.*)", ln)
        if ms:
            args = ms.group(1)
            in_log = True
            skip = bool(re.search(r"pre-season\s*=\s*(yes|y|1)", args))
            phase = "playoffs" if re.search(r"playoffs\s*=\s*(yes|y|1)", args) else "regular"
            rnd = None; i += 1; continue
        ms = re.match(r"\{\{\s*Game log start\s*\|(.*)", ln, re.I)
        if ms:   # the general log template: besides the score log, some articles carry starting-lineup and officials logs that hold no result
            skip = bool(re.search(r"line-?up|official|referee|attendance|pre-?season", ms.group(1), re.I))
            in_log = True; i += 1; continue
        ms = re.match(r"\{\{\s*NBA game log section\s*\|(.*)", ln)
        if ms:
            args = ms.group(1)
            parts = args.split("|")
            if re.search(r"playoffs\s*=\s*(yes|y|1)", args): phase = "playoffs"
            if re.search(r"pre-?season\s*=\s*(yes|y|1)", args): skip = True
            nm = [p for p in parts[1:] if "=" not in p and p.strip()]
            rnd = nm[0].strip() if (phase == "playoffs" and nm) else rnd
            i += 1; continue
        if ln.startswith("|-"):
            attr = ln[2:]
            j = i + 1
            blk = []
            while j < n and not lines[j].startswith("|-") and not lines[j].startswith("|}") and not lines[j].startswith("{{") \
                  and not re.match(r"^={2,4}", lines[j]):
                blk.append(lines[j]); j += 1
            cells = row_cells(blk)
            if any(re.search(r"\bdate\b", clean(c), re.I) for c in cells[:3]) and not date_in(cells[1] if len(cells) > 1 else ""):
                vcols = visitor_home_cols(cells)   # a header row: remember the layout of the rows below it
            r = None if skip else parse_row(cells, attr, season, phase, rnd, vcols, team)
            if r == "bad" and not skip and in_log: bad.append(" | ".join(cells)[:300])
            elif r and r != "bad": views.append(r)
            i = j; continue
        mb = re.match(r"^\*+\s*'*\s*Game\s*(\d+)'*\s*(.*)$", ln, re.I)
        if mb and phase == "playoffs" and not skip:
            r = parse_bullet(ln, season, team, rnd)
            if r == "bad": bad.append(ln[:300])
            elif r: views.append(r)
        i += 1
    # a numbered log that starts over holds an earlier schedule (pre-season games filed under the regular season): keep the last run
    reg = [v for v in views if v["phase"] == "regular"]
    segs, cur = [], []
    for k, v in enumerate(reg):
        if k and v.get("num") == 1 and reg[k - 1].get("num"): segs.append(cur); cur = []
        cur.append(v)
    segs.append(cur)
    drop = {id(v) for sg in segs[:-1] if len(sg) < 12 for v in sg}
    views = [v for v in views if id(v) not in drop]
    prev = (0, 0)
    for v in views:
        if v["phase"] != "regular" or "bullet" in v: continue
        r = tuple(map(int, v["rec"].split("-"))) if v.get("rec") else None
        if r and prev and not v.get("signed") and (r[0] - prev[0], r[1] - prev[1]) in ((1, 0), (0, 1)):
            win = r[0] > prev[0]
            hi, lo = max(v["pf"], v["pa"]), min(v["pf"], v["pa"])
            v["pf"], v["pa"] = (hi, lo) if win else (lo, hi); v["signed"] = True
        prev = r if r else prev
    seen, uniq = set(), []
    for v in views:   # the same game listed twice in one article (a regular-season table and a cup table, say) is one view
        k = (v["phase"], v["date"], v.get("opp_link"), v.get("opp_text"), v.get("loc"), v.get("pf"), v.get("pa"), v.get("bullet"))
        if k in seen: continue
        seen.add(k); uniq.append(v)
    views = uniq
    for v in views: v["team"] = team
    return views, bad

def date_in(cell):
    """(month, day, year or None) when the cell starts with a game date, else None. A year is kept only for the season's own calendar years."""
    c = re.sub(r"\{\{\s*dow[ _]tooltip\s*\|\s*([^{}|]*?)\s*(?:\|[^{}]*)?\}\}", r"\1", cell, flags=re.I)   # {{dow tooltip|November 13, 1975}}
    c = clean(re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", c))
    m = DATE_RE.match(c)
    yr = None
    if not m:
        m = FULL_DATE_RE.match(c)
        if not m: return None
        yr = int(m.group(3))
    key = m.group(1).lower()
    return next(v for k, v in MONTHS.items() if k.startswith(key[:3])), int(m.group(2)), yr

def parse_vh_row(cells, flag, season, phase, rnd, cols, team):
    """A row of a 'Date | Visitor | Score | Home' table, the score visitor first: the page's club is on one side, which settles home or road."""
    need = max(v for v in cols.values() if v is not None)
    if len(cells) <= need: return None
    dt = date_in(cells[cols["date"]])
    if not dt: return None
    mon, day, yr = dt
    if yr is not None and yr not in (season, season + 1): return None
    m = re.search(r"(\d{2,3})\s*" + DASH + r"\s*(\d{2,3})", clean(re.sub(r"\[https?://[^ \]]*\s*([^\]]*)\]", r"\1", cells[cols["score"]])))
    if not m: return None
    a, b = int(m.group(1)), int(m.group(2))
    vis, home = cells[cols["vis"]], cells[cols["home"]]
    if is_me(vis, team) and not is_me(home, team): loc, pf, pa, oc = "A", a, b, home
    elif is_me(home, team) and not is_me(vis, team): loc, pf, pa, oc = "H", b, a, vis
    else: return None
    target, label = link_of(clean(oc))
    ot = False
    if cols["ot"] is not None:
        o = clean(cells[cols["ot"]]).strip().lower()
        ot = bool(o) and o not in ("na", "no", "n/a", "-", "\u2014", "\u2013", "none")
    try:
        d0 = datetime.date(yr if yr is not None else year_for(season, mon, phase), mon, day)
    except ValueError:
        return None
    if phase == "playoffs" and d0.month in (10, 11, 12, 1, 2): phase, rnd = "regular", None
    rec = next((x.group(1) + "-" + x.group(2) for c in reversed(cells) for x in [re.fullmatch(r"\W*(\d{1,2})\s*[\u2013\-]\s*(\d{1,2})\W*", clean(c))] if x), None)
    num = intr(clean(cells[0])) if cols["date"] >= 1 and re.fullmatch(r"\W*\d{1,3}\W*", clean(cells[0])) else None
    return dict(phase=phase, round=norm_round(rnd), num=num, date=d0, alt=None, shown=d0, opp_link=target, opp_text=label, loc=loc, pf=pf, pa=pa, ot=ot,
                flag=flag, signed=True, rec=rec, tpl=False, src=" | ".join(cells)[:400])

def parse_row(cells, attr, season, phase, rnd, cols=None, team=None):
    flag = flag_of(attr)
    vh = parse_vh_row(cells, flag, season, phase, rnd, cols, team) if cols and team else None
    if vh: return vh
    di = next((k for k, c in enumerate(cells[:4]) if date_in(c)), None)
    if di is None or di + 2 >= len(cells):
        return None
    mon, day, yr = date_in(cells[di])
    if yr is not None and yr not in (season, season + 1): return None   # not this season's calendar: a transaction or an award line
    if di >= 1 and re.search(r"[A-Za-z]{3}", clean(cells[0])) and not re.fullmatch(r"\W*(G\d+|\d+[A-Za-z]?)\W*", clean(cells[0])):
        return None   # a series-summary or award table, not a game log row ("Game 1 | June 7 | Orlando | 118-120 | Houston")
    oi = di + 1
    opp = clean(cells[oi])
    loc = "H"
    if opp in ("H", "A", "N", "h", "a", "n", "Home", "Away", "Neutral", "home", "away") and oi + 2 < len(cells):
        loc = {"h": "H", "a": "A", "n": "N"}[opp[0].lower()]; oi += 1; opp = clean(cells[oi])
    mo = re.match(r"^(@|at\b|vs\.?|N\b|\(N\)|neutral)\s*", opp, re.I)
    if mo:
        t = mo.group(1).lower()
        loc = "A" if t in ("@", "at") else "N" if t.startswith(("n", "(n")) else "H"
        opp = opp[mo.end():]
    target, label = link_of(opp)
    sc = None
    for c in cells[oi + 1: oi + 3]:
        sc = parse_score_cell(c, flag)
        if sc: break
    if not sc:
        # result word then the two scores in cells of their own: Loss | 82 | 91
        for k in range(oi + 1, min(len(cells) - 2, oi + 4)):
            w = clean(re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", cells[k])).strip("' ").lower()
            a, b = clean(cells[k + 1]), clean(cells[k + 2])
            if w in ("win", "loss", "w", "l") and a.isdigit() and re.fullmatch(r"\d+(\s*\(\d?OT\))?", b):
                sc = (int(a), int(re.match(r"\d+", b).group()), "OT" in b, None, True); break
    if not sc:
        for k in range(oi + 1, min(len(cells) - 1, oi + 4)):
            w = clean(cells[k]).strip().upper()
            if w in ("W", "L", "WIN", "LOSS"):
                sc = parse_score_cell((w[0] + " " + cells[k + 1]), flag)
                if sc: break
    if not sc: return "bad"
    pf, pa, ot, dt, signed = sc
    rec = next((m.group(1) + "-" + m.group(2) for c in reversed(cells) for m in [re.fullmatch(r"\W*(\d{1,2})\s*[\u2013\-]\s*(\d{1,2})\W*", clean(c))] if m), None)
    try:
        d0 = datetime.date(yr if yr is not None else year_for(season, mon, phase), mon, day)
    except ValueError:
        return "bad"
    if phase == "playoffs" and (d0.month in (10, 11, 12, 1, 2) and not (season == 2019 and d0 >= datetime.date(2020, 8, 1))):
        phase, rnd = "regular", None
    rnd = norm_round(rnd)
    num = intr(clean(cells[0])) if di >= 1 and re.fullmatch(r"\W*\d{1,3}\W*", clean(cells[0])) else None
    return dict(phase=phase, round=rnd, num=num, date=d0, alt=dt, shown=d0, opp_link=target, opp_text=label, loc=loc, pf=pf, pa=pa, ot=ot,
                flag=flag, signed=signed, rec=rec, tpl=("NBA game" in " ".join(cells).replace("_", " ")), src=" | ".join(cells)[:400])

def parse_bullet(ln, season, team, rnd):
    m = re.match(r"^\*+\s*'*\s*Game\s*\d+'*\s*(?:@|at)?\s*([^()]*?)\s*\((?:[A-Za-z]+day,\s*)?([A-Za-z]+\.?\s+\d{1,2})\)\s*:?\s*(.*)$", ln, re.I)
    if not m: return "bad"
    where, dtxt, rest = m.group(1).strip(" '"), m.group(2), re.sub(r"'''?|\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", m.group(3))
    dm = DATE_RE.match(dtxt)
    if not dm: return "bad"
    key = dm.group(1).lower(); mon = next(v for k, v in MONTHS.items() if k.startswith(key[:3]))
    parts = re.findall(r"([A-Za-z.\- ]+?)\s+(\d{2,3})\b", rest)
    if len(parts) < 2: return "bad"
    (na, sa), (nb, sb) = parts[0], parts[1]
    return dict(phase="playoffs", round=rnd, date=datetime.date(year_for(season, mon, "playoffs"), mon, int(dm.group(2))), shown=None,
                bullet=(na.strip(" ,"), int(sa), nb.strip(" ,"), int(sb)), where=where, src=ln[:400])

# ---- opponent / team naming ----
def nick_city(full):
    w = full.split()
    for k in (2, 1):
        if len(w) > k and (k == 1 or " ".join(w[-2:]) in ("Trail Blazers", "Red Skins", "Steam Rollers", "Iron Men")): return " ".join(w[:-k]), " ".join(w[-k:])
    return "", full

def resolve(text, link, teams, me=None):
    """-> list of candidate team names (exact link/title first)."""
    if link:
        m = re.match(r"^\d{4}–\d{2,4} (.+) season$", link)
        nm = m.group(1) if m else link
        nm = re.sub(r"\s*\([^)]*\)$", "", nm)
        if nm in teams: return [nm]
    t = re.sub(r"\s+", " ", text.replace("\u2013", "-").replace("\xa0", " ").strip().strip(".")).lower()
    if not t: return []
    best = {}
    for full in teams:
        city, nick = nick_city(full)
        f, c, k = (x.lower().replace("\u2013", "-") for x in (full, city, nick))
        sc = 4 if t == f else 3 if t == k else 2 if t == c else 1 if (f.startswith(t + " ") or f.endswith(" " + t)) else \
             1 if (c and (t.startswith(c + " ") or t.endswith(" " + k))) else 0
        if sc: best[full] = sc
    if not best: return []
    top = max(best.values())
    return sorted(k for k, v in best.items() if v == top and k != me) or sorted(k for k, v in best.items() if v == top)

def pair(views_by_team, teams):
    """Join the two clubs' views of each game. -> list of game dicts, unresolved list."""
    flat, unresolved = [], []
    for team, vs in views_by_team.items():
        for v in vs:
            if "bullet" in v:
                na, sa, nb, sb = v["bullet"]
                ra, rb = resolve(na, None, teams), resolve(nb, None, teams)
                if team not in ra and team not in rb: unresolved.append(v["src"]); continue
                mine, other = (ra, rb) if team in ra else (rb, ra)
                if len(other) != 1: unresolved.append(v["src"]); continue
                pf, pa = (sa, sb) if team in ra else (sb, sa)
                wh = resolve(v["where"], None, teams) if v["where"] else []
                loc = "H" if wh == [team] else "A" if wh == other else "N"
                flat.append(dict(v, opp=[other[0]], pf=pf, pa=pa, loc=loc, ot=False, flag=None, opp_link=None, opp_text=""))
            else:
                c = resolve(v["opp_text"], v["opp_link"], teams, me=team)
                c = [x for x in c if x != team]
                if not c: unresolved.append(v["src"]); continue
                flat.append(dict(v, opp=c))
    # resolve ambiguous opponents by the mirror view
    index = {}
    for v in flat:
        index.setdefault((v["phase"], v["team"]), []).append(v)
    for v in flat:
        if len(v["opp"]) > 1:
            ok = [o for o in v["opp"] if any(min(abs((x - y).days) for x in (w["date"], w.get("alt")) for y in (v["date"], v.get("alt")) if x and y) <= 1 and w["pf"] == v["pa"] and w["pa"] == v["pf"] and (v["team"] in w["opp"])
                                           for w in index.get((v["phase"], o), []))]
            v["opp"] = ok[:1] if ok else v["opp"][:1]
            if not ok: v["ambiguous"] = True
    groups = {}
    for v in flat:
        groups.setdefault((v["phase"], frozenset((v["team"], v["opp"][0]))), []).append(v)
    games = []
    for (phase, pr), vs in groups.items():
        a_name = sorted(pr)[0]
        A = sorted([v for v in vs if v["team"] == a_name], key=lambda v: v["date"])
        B = sorted([v for v in vs if v["team"] != a_name], key=lambda v: v["date"])
        used = set()
        def take(a, strict):
            best = None
            for k, b in enumerate(B):
                if k in used: continue
                dd = min(abs((x - y).days) for x in (a["date"], a.get("alt")) for y in (b["date"], b.get("alt")) if x and y)
                same = a["pf"] == b["pa"] and a["pa"] == b["pf"]
                if dd <= 1 and (same or not strict):
                    key = (0 if same else 1, dd)
                    if best is None or key < best[0]: best = (key, k)
            return best[1] if best else None
        pairs = []
        for a in A:
            k = take(a, True)
            if k is not None: used.add(k); pairs.append((a, B[k]))
            else: pairs.append((a, None))
        pairs = [(a, b) if b else (a, None) for a, b in pairs]
        left = [a for a, b in pairs if b is None]
        pairs = [(a, b) for a, b in pairs if b is not None]
        for a in left:
            k = take(a, False)
            if k is not None: used.add(k); pairs.append((a, B[k]))
            else: pairs.append((a, None))
        for k, b in enumerate(B):
            if k not in used: pairs.append((None, b))
        for a, b in pairs:
            games.append(merge(phase, a, b))
    games.sort(key=lambda g: (g["date"], g["phase"], g["home"], g["away"]))
    seen = {}
    for g in games:
        k = (g["phase"], g["date"], g["home"], g["away"])
        g["seq"] = seen.get(k, 0); seen[k] = g["seq"] + 1
    return games, unresolved

def merge(phase, a, b):
    vs = [v for v in (a, b) if v]
    notes = []
    def as_home(v):
        """(home, away, home_pts, away_pts, neutral) from one view."""
        t, o = v["team"], v["opp"][0]
        if v["loc"] == "A": return o, t, v["pa"], v["pf"], False
        if v["loc"] == "N": return None, None, None, None, True
        return t, o, v["pf"], v["pa"], False
    if len(vs) == 2 and not (a["pf"] == b["pa"] and a["pa"] == b["pf"]):
        notes.append(f"score {a['team']} {a['pf']}-{a['pa']} vs {b['team']} {b['pf']}-{b['pa']}")
    if len(vs) == 2 and a["loc"] == b["loc"] and a["loc"] in ("H", "A"):
        notes.append("both views claim the same side")
    # the home team's own view is preferred when the two disagree
    pick = vs[0]
    if len(vs) == 2 and notes:
        pick = next((v for v in vs if v.get("tpl")), None) or next((v for v in vs if v["loc"] == "H"), vs[0])
        if all(v.get("tpl") for v in vs): pick = next((v for v in vs if v["loc"] == "H"), vs[0])
    h, aw, hp, ap, neutral = as_home(pick)
    if h is None:
        t, o = sorted((pick["team"], pick["opp"][0]))
        if pick["team"] == t: h, aw, hp, ap = t, o, pick["pf"], pick["pa"]
        else: h, aw, hp, ap = t, o, pick["pa"], pick["pf"]
        neutral = True
    if len(vs) == 2 and any(v["loc"] == "N" for v in vs): neutral = True
    d = pick["date"]
    return dict(phase=phase, round=next((v["round"] for v in vs if v.get("round")), None), date=d, home=h, away=aw,
                home_pts=hp, away_pts=ap, ot=any(v.get("ot") for v in vs), neutral=neutral, views=len(vs),
                conflict="; ".join(notes) or None, src=" // ".join(v["src"] for v in vs)[:800],
                ambiguous=any(v.get("ambiguous") for v in vs))

# ---- standings templates ----
def parse_standings(text, season):
    """-> rows: dict(team, w, l, pct, gb, home, road, div, gp, division, src)"""
    rows = []
    if re.search(r"\{\{\s*NBA team standings", text):
        for ln in text.split("\n"):
            mt = re.search(r"\[\[(\d{4}\u2013\d{2,4} [^\]|]+? season)(?:\|[^\]]*)?\]\]", ln)
            if not mt or not ln.startswith("|"): continue
            f = [x.strip() for x in re.sub(r"\[\[([^\]|]*)\|([^\]]*)\]\]", "[[\\1\u00a6\\2]]", ln).split("|")[1:]]
            nums = [intr(x) for x in f[2:6]]
            if len(f) < 7 or None in nums: continue
            hw, hl, rw, rl = nums
            rows.append(dict(team=re.sub(r"^\d{4}\u2013\d{2,4} ", "", mt.group(1))[:-7], w=hw + rw, l=hl + rl, gp=hw + rw + hl + rl,
                             home=f"{hw}\u2013{hl}", road=f"{rw}\u2013{rl}", div=f[6], src=ln[:400]))
        return rows
    m = re.search(r"\{\|.*?\n(.*?)\n\|\}", text, re.S)
    if not m: return rows
    body = m.group(1)
    hdr = []
    blocks = re.split(r"\n\|-", "\n" + body)
    for blk in blocks:
        blk = blk.strip()
        if not blk: continue
        if "!" in blk and not re.search(r"\[\[\d{4}\u2013\d{2,4} [^\]|]+? season", blk):
            heads = re.split(r"\n?!!?", blk)
            hdr = []
            for h in heads:
                h = h.strip()
                if not h: continue
                mm = re.search(r"\{\{\s*[Aa]bbr\s*\|\s*([^|}]+?)\s*\|", h)
                t = mm.group(1) if mm else re.sub(r"\{\{[^}]*\}\}|\[\[(?:[^\]|]*\|)?([^\]]*)\]\]|width=\"[^\"]*\"|\|", r"\1", h).strip()
                hdr.append(t.upper())
            continue
        # a data row: first line may hold {{#switch...}} styling; cells follow
        blk = re.sub(r"^[^\n|]*\{\{#switch:[^\n]*\n", "", blk)
        blk = re.sub(r"^\{\{#switch:.*?\}\}\s*", "", blk) if blk.startswith("{{#switch") else blk
        cellline = [ln for ln in blk.split("\n") if ln.startswith("|") or "||" in ln]
        cells = []
        for ln in cellline:
            ln = ln[1:] if ln.startswith("|") else ln
            cells += [c.strip() for c in ln.split("||")]
        if len(cells) < 3: continue
        first = cells[0]
        mt = re.search(r"\[\[(\d{4}–\d{2,4} [^\]|]+? season)(?:\|([^\]]*))?\]\]", first)
        if not mt: continue
        title = mt.group(1)
        team = re.sub(r"^\d{4}–\d{2,4} ", "", title)[:-7]
        d = {"team": team, "src": " | ".join(cells)[:400]}
        for k, c in enumerate(cells[1:], 1):
            if k >= len(hdr): break
            h = hdr[k]
            c = re.sub(r"\{\{[^}]*\}\}|<[^>]*>|'''|''", "", c).strip()
            if h == "W": d["w"] = intr(c)
            elif h == "L": d["l"] = intr(c)
            elif h in ("PCT", "WIN%", "W-L%", "PCT."): d["pct"] = c
            elif h == "GB": d["gb"] = c
            elif h == "HOME": d["home"] = c
            elif h in ("ROAD", "AWAY"): d["road"] = c
            elif h in ("DIV", "DIVISION"): d["div"] = c
            elif h in ("CONF", "CONFERENCE"): d["conf"] = c
            elif h in ("GP", "G"): d["gp"] = intr(c)
        rows.append(d)
    return rows

def intr(s):
    m = re.match(r"^\D*(\d+)", s)
    return int(m.group(1)) if m else None
