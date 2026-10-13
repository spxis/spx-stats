#!/usr/bin/env python3
"""Wikitext of a team-season article (or a league postseason page) -> claims.

A claim is one source's statement about one game:
  dict(teams=(x, y), score={x: int, y: int} | None, home=<name> | None, neutral=bool, date, status, phase, round,
       ot=bool|None, so=bool, ot_n=int|None, dh=int|None, src=<the table row>, page=<article title>, source="wp:<title>")
`home` is None when the source does not say which side hosted. status: final, scheduled, postponed, cancelled, suspended.
Nothing here touches the network or a database. Rows that cannot be read are returned as `bad`, never dropped silently.
Source of the text: English Wikipedia, CC BY-SA 4.0 (authors: each article's history).
"""
import datetime, importlib.util, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
MONTHS = {m: i + 1 for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split())}
DATE_RE = re.compile(r"\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})\b(?:,?\s+(\d{4}))?")
SCORE_RE = re.compile(r"^(\d{1,3})\s*[–—-]\s*(\d{1,3})(?:\s*\((\d{1,2})\))?$")
SCORE_WL_RE = re.compile(r"^(?:(W|L)\s*)?(\d{1,3})\s*[–—-]\s*(\d{1,3})(?:\s*\((\d{1,2})\))?$")   # 'W 8-2 (10)': the cell may carry the result
DASH = "[–—-]"


# ---- wikitext plumbing ----

def clean(s):
    s = re.sub(r"<ref[^>]*?/>|<ref[^>]*>.*?</ref>|<!--.*?-->", "", s, flags=re.S)
    s = re.sub(r"\{\{\s*dow tooltip\s*\|([^{}|]*)(?:\|[^{}]*)?\}\}", r"\1", s, flags=re.I)
    s = re.sub(r"\{\{\s*(?:nbsp|spaces?)\s*\}\}", " ", s, flags=re.I)
    s = re.sub(r"\{\{\s*dagger\s*\}\}", "†", s, flags=re.I)
    for _ in range(4):
        s = re.sub(r"\{\{\s*(?:small|nowrap|nobr|abbr|sort|font|smaller)\s*\|([^{}|]*)(?:\|[^{}]*)?\}\}", r"\1", s, flags=re.I)
    s = re.sub(r"\[https?://[^ \]]*\s*([^\]]*)\]", r"\1", s)
    s = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", s)
    s = re.sub(r"\{\{[^{}]*\}\}", "", s)
    s = re.sub(r"<br\s*/?>", " ", s, flags=re.I)
    s = re.sub(r"<[^>]+>", "", s)
    s = s.replace("&nbsp;", " ").replace("&ndash;", "–").replace("&mdash;", "—").replace("\xa0", " ")
    s = s.replace("'''", "").replace("''", "")
    return re.sub(r"\s+", " ", s).strip()


def link_of(cell):
    """Target of the first wiki link in a cell, else None."""
    m = re.search(r"\[\[([^\]|#]+)", cell)
    return m.group(1).strip() if m else None


def strip_attr(c):
    """'align="center" | text' -> 'text' (a cell attribute prefix)."""
    m = re.match(r"^[^\[\]{}|]*?\b\w+\s*=\s*[^|\[\]{}]*\|(?!\|)", c)
    return c[m.end():].strip() if m else c.strip()


def scan(text):
    """Every table row of a page as (ctx, row_attr, [raw cells]). ctx: h2/h3/h4 headings and the current MLB log section.
    Rows only start at a `|-` line and end at the next `|-`, `|}`, `{|` or heading, so template parameters never count."""
    h = ["", "", ""]
    section = None
    in_log = False                    # inside {{Game log start}} .. {{Game log end}} (MLB club articles)
    attr, cells = None, None
    out = []

    def flush():
        if cells is not None: out.append((dict(h2=h[0], h3=h[1], h4=h[2], section=section, in_log=in_log), attr, cells))

    for ln in text.split("\n"):
        s = ln.strip()
        m = re.match(r"^(={2,6})\s*(.*?)\s*\1\s*(?:<!--.*)?$", s)
        if m:
            flush(); cells = None; lvl = len(m.group(1)); section = None
            if lvl == 2: h = [m.group(2), "", ""]
            elif lvl == 3: h[1], h[2] = m.group(2), ""
            else: h[2] = m.group(2)
            continue
        m = re.match(r"\{\{\s*MLB game log section\s*\|(.*)", s, re.I)
        if m:
            flush(); cells = None; in_log = True
            ms = re.search(r"section\s*=\s*([^|}]*)", m.group(1))
            section = clean(ms.group(1)) if ms else None
            continue
        if re.match(r"\{\{\s*(?:mlb )?game log(?: section)?(?: start)?\s*\|", s, re.I):
            flush(); cells = None; in_log = True; continue
        if re.match(r"\{\{\s*game log end", s, re.I):
            flush(); cells = None; in_log = False; continue
        if s.startswith("{|") or s.startswith("|}"):
            flush(); cells = None; continue
        if s.startswith("|-"):
            flush(); attr = s[2:]; cells = []; continue
        if s.startswith("|+") or cells is None:
            continue
        if s.startswith("!"):
            cells.extend(strip_attr(x) for x in re.split(r"!!|\|\|", s[1:]))
        elif s.startswith("|"):
            cells.extend(strip_attr(x) for x in s[1:].split("||"))
        elif cells:
            cells[-1] += " " + s
    flush()
    return out


def phase_of(ctx):
    t = " ".join((ctx["h2"], ctx["h3"], ctx["h4"], ctx.get("section") or "")).lower()
    if re.search(r"pre-?season|exhibition|spring training", t): return "preseason"
    if re.search(r"playoff|postseason|post-season|world series|stanley cup|grey cup", t): return "playoffs"
    return "regular"


def row_flag(attr):
    """'W', 'L', 'T' (other coloured: tie / overtime loss), 'X' (grey: postponed) or None from a table row's attributes."""
    a = attr or ""
    if re.search(r"game-won", a, re.I): return "W"
    if re.search(r"game-lost", a, re.I): return "L"
    if re.search(r"game-otl|game-tied?", a, re.I): return "T"
    if re.search(r"game-p(?:ostponed|pd)", a, re.I): return "X"
    m = re.search(r"background(?:-color)?\s*:?\s*=?\s*\"?#?([0-9a-f]{6}|[0-9a-f]{3})\b", a, re.I) or re.search(r"bgcolor\s*=\s*\"?#?([0-9a-f]{6}|[0-9a-f]{3})\b", a, re.I)
    if not m: return None
    c = m.group(1).lower()
    if len(c) == 3: c = "".join(ch * 2 for ch in c)
    r, g, b = (int(c[i:i + 2], 16) for i in (0, 2, 4))
    if max(r, g, b) - min(r, g, b) < 24: return "X" if max(r, g, b) <= 0xd0 and min(r, g, b) >= 0x90 else None
    if g > r and g >= b: return "W"
    if r > g and r > b: return "L" if g - b < 40 else "T"   # red = loss; yellow (ffeeaa) = tie / overtime loss
    return "T"


def mk_date(season, cell, season_year_rule):
    """Date from a cell. season_year_rule(month) -> year when the cell has no year."""
    m = DATE_RE.search(cell)
    if not m: return None
    mon, day = MONTHS[m.group(1).lower()], int(m.group(2))
    y = int(m.group(3)) if m.group(3) else season_year_rule(mon)
    try: return datetime.date(y, mon, day)
    except ValueError: return None


def status_of_row(text, attr):
    if re.search(r"postpone|ppd", text, re.I): return "postponed"
    if re.search(r"cancel", text, re.I): return "cancelled"
    if re.search(r"suspend", text, re.I): return "suspended"
    if row_flag(attr) == "X": return "postponed"
    return "scheduled"


def claim(page, teams, score, home, date, status, phase, rnd=None, neutral=False, ot=None, so=False, ot_n=None, dh=None, src=""):
    return dict(page=page, source="wp:" + page, teams=tuple(teams), score=score, home=home, neutral=neutral, date=date, status=status,
                phase=phase, round=rnd, ot=ot, so=so, ot_n=ot_n, dh=dh, src=src[:300])


def team_claim(page, team, opp, loc, pf, pa, **kw):
    """A claim from one club's own log: loc 'H' / 'A' / 'N' / None."""
    score = None if pf is None else {team: pf, opp: pa}
    home = team if loc == "H" else opp if loc == "A" else None
    return claim(page, (team, opp), score, home, neutral=(loc == "N"), **kw)


# ---- NHL: two layouts. A: # | Date | Visitor | Score | Home | OT | ...   B: # | Date | Opponent (@ = away) | Score (own first) | OT | ... ----

def _gamelike(cl, di):
    return any(SCORE_RE.match(c) or c in ("\u2013", "-", "\u2014", "TBD") for c in cl[di + 1:di + 5]) or (len(cl) > di + 4 and cl[di + 2] == "")


def parse_nhl(text, season, team, roster, page):
    out, bad = [], []
    for ctx, attr, cells in scan(text):
        if len(cells) < 5: continue
        cl = [clean(c) for c in cells]
        di = next((i for i in range(min(3, len(cl))) if DATE_RE.search(cl[i]) and not re.search(r"\d\s*[\u2013-]\s*\d", cl[i])), None)
        if di is None or di + 3 >= len(cl) or not _gamelike(cl, di): continue
        d = mk_date(season, cl[di], lambda mon: season if mon >= 8 else season + 1)
        phase = phase_of(ctx)
        rnd = ctx["h3"] if phase == "playoffs" and ctx["h3"] else None
        h = roster.resolve(cl[di + 3], link_of(cells[di + 3]))
        if h:      # layout A
            v = roster.resolve(cl[di + 1], link_of(cells[di + 1]))
            score_cell, ot_cell = cl[di + 2], (cl[di + 4] if di + 4 < len(cl) else "")
            if not v or d is None or team not in (v["name"], h["name"]) or v is h:
                bad.append(" | ".join(cl)[:200]); continue
            vname, hname, order = v["name"], h["name"], "visitor"
        else:      # layout B
            raw = cl[di + 1]
            away = bool(re.match(r"^(?:@|at\b)", raw, re.I))
            o = roster.resolve(re.sub(r"^(?:@|at\b|vs\.?)\s*", "", raw, flags=re.I), link_of(cells[di + 1]))
            score_cell, ot_cell = cl[di + 2], cl[di + 3]
            if not o or d is None or o["name"] == team:
                bad.append(" | ".join(cl)[:200]); continue
            vname, hname = (team, o["name"]) if away else (o["name"], team)
            order = "own"
        sc = SCORE_RE.match(score_cell)
        mo = re.fullmatch(r"(\d)?\s*(OT|SO)", ot_cell.strip(), re.I)
        if sc:
            a, b = int(sc.group(1)), int(sc.group(2))
            if order == "own":      # own score first: put it on the visiting or the home side
                a, b = (a, b) if vname == team else (b, a)
            n = (int(mo.group(1) or 1) if mo and mo.group(2).upper() == "OT" else 1) if mo else 0
            c = claim(page, (vname, hname), {vname: a, hname: b}, hname, d, "final", phase, rnd,
                      ot=bool(mo), so=bool(mo and mo.group(2).upper() == "SO"), ot_n=n or None, src=" | ".join(cl))
            fl, mine, theirs = row_flag(attr), (a if vname == team else b), (b if vname == team else a)
            if (fl == "W" and mine < theirs) or (fl == "L" and mine > theirs) or (fl == "T" and mine > theirs):
                c["inconsistent"] = "row colour says %s but the score is %d-%d for %s" % (fl, mine, theirs, team)
            out.append(c)
        else:
            st = status_of_row(" ".join(cl[di + 2:]), attr)
            out.append(claim(page, (vname, hname), None, hname, d, st, phase, rnd, src=" | ".join(cl)))
    return out, bad


# ---- MLB: # | Date | Opponent | [Venue] | Score | Win | Loss | Save | [Venue] | Attendance | Record ----

def parse_mlb(text, season, team, roster, page):
    out, bad = [], []
    for ctx, attr, cells in scan(text):
        if len(cells) < 4: continue
        cl = [clean(c) for c in cells]
        di = next((i for i in range(min(3, len(cl))) if DATE_RE.match(cl[i])), None)
        if di is None or di + 2 >= len(cl) or cl[0] == "ASG" or "All-Star" in cl[di + 1]: continue
        if not ctx["in_log"]: continue
        d = mk_date(season, cl[di], lambda mon: season)
        raw = cl[di + 1]
        away = bool(re.match(r"^(?:@|at\b)", raw, re.I))
        opp = roster.resolve(re.sub(r"^(?:@|at\b|vs\.?)\s*", "", raw, flags=re.I), link_of(cells[di + 1]))
        phase = phase_of(ctx)
        if d is None or not opp or opp["name"] == team:
            bad.append(" | ".join(cl)[:200]); continue
        dh = re.search(r"\((\d)\)", cl[di])
        dh = int(dh.group(1)) if dh else None
        loc = "A" if away else "H"
        sk = next((k for k in range(di + 2, min(len(cl), di + 5)) if SCORE_WL_RE.match(cl[k])), None)
        rnd = ctx.get("section")
        rnd = re.sub(r":\s*\d+\s*[–-]\s*\d+\s*$", "", rnd).strip() if rnd else None
        if sk is None:
            st = status_of_row(" ".join(cl[di + 2:]), attr)
            out.append(team_claim(page, team, opp["name"], loc, None, None, date=d, status=st, phase=phase, rnd=rnd, dh=dh, src=" | ".join(cl)))
            continue
        m = SCORE_WL_RE.match(cl[sk])
        a, b = int(m.group(2)), int(m.group(3))
        fl = m.group(1) or row_flag(attr)
        if fl not in ("W", "L"):
            wl = [("'''" in c) for c in cells[sk + 1:sk + 3]]
            fl = "W" if wl[:1] == [True] else "L" if wl[1:2] == [True] else None
        if fl not in ("W", "L") or a == b:
            bad.append(" | ".join(cl)[:200]); continue
        pf, pa = (max(a, b), min(a, b)) if fl == "W" else (min(a, b), max(a, b))
        inn = int(m.group(4)) if m.group(4) else None
        out.append(team_claim(page, team, opp["name"], loc, pf, pa, date=d, status="final", phase=phase, rnd=rnd, dh=dh,
                              ot=bool(inn and inn > 9), ot_n=(inn - 9) if inn and inn > 9 else None, src=" | ".join(cl)))
    return out, bad


def template_blocks(text, name):
    """(start offset, text) of every balanced {{name ...}} in a page."""
    for m in re.finditer(r"\{\{\s*" + name + r"\b", text):
        depth, i = 0, m.start()
        while i < len(text):
            if text.startswith("{{", i): depth += 1; i += 2
            elif text.startswith("}}", i):
                depth -= 1; i += 2
                if depth == 0: break
            else: i += 1
        yield m.start(), text[m.start():i]


def parse_mlb_postseason(text, season, roster, page):
    """The league postseason page: {{MLB Playoff Summary}} blocks with dateN / scoreN ('Away - 3, Home - 4' or 'Away at Home')."""
    heads = [(m.start(), len(m.group(1)), m.group(2).strip()) for m in re.finditer(r"^(={2,4})\s*(.*?)\s*\1\s*$", text, re.M)]
    out, bad = [], []
    for pos, blk in template_blocks(text, "MLB Playoff Summary"):
        h2 = next((t for p, lv, t in reversed(heads) if p < pos and lv == 2), "")
        rnd = clean(re.sub(r"^\d{4}\s+", "", h2))
        kv = {}
        for ln in blk.split("\n"):
            m = re.match(r"^\|\s*(\w+?)\s*=\s*(.*)$", ln.strip())
            if m: kv[m.group(1).lower()] = m.group(2)
        for n in range(1, 10):
            if "score%d" % n not in kv: continue
            sc, dt = clean(kv["score%d" % n]), clean(kv.get("date%d" % n, ""))
            d = mk_date(season, dt, lambda mon: season)
            mf = re.match(r"^(.+?)\s*[–—-]\s*(\d+),?\s+(.+?)\s*[–—-]\s*(\d+)(?:\s*\((\d+)\))?$", sc)
            if sc.startswith("TBD"): continue
            ms = re.match(r"^(.+?)\s+at\s+(.+)$", sc)
            if mf:
                a, h = roster.resolve(mf.group(1)), roster.resolve(mf.group(3))
                score = (int(mf.group(2)), int(mf.group(4))); st = "final"
            elif ms:
                a, h = roster.resolve(ms.group(1)), roster.resolve(ms.group(2)); score = None; st = "scheduled"
            else:
                bad.append(sc[:200]); continue
            if not (a and h and d):
                bad.append(sc[:200]); continue
            inn = int(mf.group(5)) if mf and mf.group(5) else None
            out.append(claim(page, (a["name"], h["name"]), None if score is None else {a["name"]: score[0], h["name"]: score[1]}, h["name"], d, st,
                             "playoffs", rnd, ot=bool(inn and inn > 9) if st == "final" else None, ot_n=(inn - 9) if inn and inn > 9 else None,
                             src="%s game %d: %s" % (rnd, n, sc)))
    return out, bad


# ---- NFL: Week | Date | [Time] | Opponent | Result | Record | Venue | ... ----

def parse_nfl(text, season, team, roster, page):
    out, bad = [], []
    for ctx, attr, cells in scan(text):
        if len(cells) < 4: continue
        cl = [clean(c) for c in cells]
        di = next((i for i in range(min(3, len(cl))) if DATE_RE.search(cl[i])), None)
        if di is None or di + 1 >= len(cl) or not re.match(r"^(?:\d{1,2}|WC|DIV|CON|SB|Wild Card|Divisional|Conference|Super Bowl)\b", cl[0], re.I): continue
        if re.search(r"\bbye\b", " ".join(cl), re.I): continue
        if re.search(r"\bTBD\b|/\d", " ".join(cl[di:di + 3])): continue    # flexed weeks: date and time not set yet
        d = mk_date(season, cl[di], lambda mon: season if mon >= 3 else season + 1)
        k = di + 1
        while k < len(cl) and re.match(r"^\d{1,2}:\d{2}", cl[k]): k += 1
        if k >= len(cl) or d is None:
            bad.append(" | ".join(cl)[:200]); continue
        raw = cl[k]
        loc = "A" if re.match(r"^(?:at|@)\s", raw, re.I) else "H"
        opp = roster.resolve(re.sub(r"^(?:at|@|vs\.?)\s+", "", raw, flags=re.I), link_of(cells[k]))
        if not opp or opp["name"] == team:
            bad.append(" | ".join(cl)[:200]); continue
        phase = phase_of(ctx)
        rnd = None
        if phase == "playoffs":
            rnd = next((c for c in cl[:di] if c and not c.isdigit()), None) or ctx["h3"] or None
        mr = next((re.match(r"^(W|L|T)\s*(\d{1,3})\s*[–—-]\s*(\d{1,3})\b(.*)$", c) for c in cl[k + 1:k + 3] if re.match(r"^(W|L|T)\s*\d", c)), None)
        if mr:
            res, a, b = mr.group(1), int(mr.group(2)), int(mr.group(3))
            hi, lo = max(a, b), min(a, b)
            pf, pa = (hi, lo) if res == "W" else (lo, hi) if res == "L" else (a, b)
            if (res == "T") != (a == b):
                bad.append(" | ".join(cl)[:200]); continue
            ot = bool(re.search(r"\bOT\b|overtime", mr.group(4), re.I)) or None
            out.append(team_claim(page, team, opp["name"], loc, pf, pa, date=d, status="final", phase=phase, rnd=rnd, ot=ot, src=" | ".join(cl)))
        else:
            st = status_of_row(" ".join(cl[k + 1:k + 3]), attr)
            out.append(team_claim(page, team, opp["name"], loc, None, None, date=d, status=st, phase=phase, rnd=rnd, src=" | ".join(cl)))
    return out, bad


# ---- CFL and NBA: the readers already written for the historic loads ----

def _load(name, *parts):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, "..", *parts))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    return m


def parse_cfl(text, season, team, roster, page):
    """scripts/wikipedia/parse.py (regular season only: playoffs follow on Oct 31, see README)."""
    P = _load("cfl_parse", "wikipedia", "parse.py")
    rows, skipped = P.team_games(text, season, team, set(roster.names()))
    out, bad = [], []
    for _, txt in skipped:
        cl = txt.split(" | ")
        di = next((i for i, c in enumerate(cl) if DATE_RE.search(c)), None)
        k = next((i for i in range((di or 0) + 1, len(cl)) if re.match(r"^(?:at|vs\.?)\s", cl[i])), None) if di is not None else None
        opp = roster.resolve(re.sub(r"^(?:at|vs\.?)\s+", "", cl[k])) if k is not None else None
        d = P.mk_date(season, cl[di]) if di is not None else None
        if opp and d and not any(SCORE_RE.search(c) for c in cl[k + 1:k + 3]):
            out.append(team_claim(page, team, opp["name"], "A" if cl[k].startswith("at") else "H", None, None, date=d, status="scheduled", phase="regular", src=txt))
        else:
            bad.append(txt[:200])
    for r in rows:
        opp = roster.resolve(r["opponent"])
        if not opp:
            bad.append(r["src"][:200]); continue
        loc = {"home": "H", "away": "A"}.get(r["location"])
        out.append(team_claim(page, team, opp["name"], loc, r["team_pts"], r["opp_pts"], date=r["game_date"], status="final", phase="regular",
                              ot=bool(r["overtime"]) or None, src=r["src"]))
    return out, bad


def parse_nba(text, season, team, roster, page):
    """scripts/nba/parse.py (preseason skipped by it; scheduled games have no score there, so only played games appear)."""
    P = _load("nba_parse", "nba", "parse.py")
    text = re.sub(r"\bpreseason(\s*=)", r"pre-season\1", text)      # the parser knows only 'pre-season=yes'
    views, unparsed = P.parse_team_page(text, season, team)
    out, bad = [], [u for u in unparsed if "pf=|pa=" not in u and "pf= |" not in u]
    names = set(roster.names())
    for v in views:
        if "bullet" in v: continue
        c = [x for x in P.resolve(v["opp_text"], v["opp_link"], names, me=team) if x != team]
        opp = roster.resolve(c[0]) if len(c) == 1 else None
        if not opp:
            bad.append(v["src"][:200]); continue
        out.append(team_claim(page, team, opp["name"], v["loc"], v["pf"], v["pa"], date=v["date"], status="final", phase=v["phase"], rnd=v.get("round"),
                              ot=bool(v["ot"]) or None, src=v["src"]))
    return out, bad


PARSERS = dict(nhl=parse_nhl, mlb=parse_mlb, nfl=parse_nfl, cfl=parse_cfl, nba=parse_nba)
