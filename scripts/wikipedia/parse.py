"""Parse English Wikipedia CFL wikitext (saved raw by fetch.py) into rows.

Nothing here touches the network or the database. Wikitext is parsed, never altered; every row
keeps the cleaned text of the table row it came from (`src`) so a reader can check it.
"""
import datetime, re

MONTHS = {m: i + 1 for i, m in enumerate("jan feb mar apr may jun jul aug sep oct nov dec".split())}
DATE_RE = re.compile(r"\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?,?\s+(\d{1,2})\b")
SCORE_RE = re.compile(r"(?:^|\b)(?:([WLT])\s*)?(\d{1,3})\s*[–—\-]\s*(\d{1,3})\b")
DASH = "[–—\\-]"


def clean(s):
    s = re.sub(r"<ref[^>]*/>|<ref[^>]*>.*?</ref>|<!--.*?-->", "", s, flags=re.S)
    s = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", s)
    for _ in range(4):
        s = re.sub(r"\{\{\s*(?:small|nowrap|nobr|abbr|sort|sortname|flagicon|font)[^{}|]*\|([^{}|]*)(?:\|[^{}]*)?\}\}", r"\1", s, flags=re.I)
    s = re.sub(r"\{\{[^{}]*\}\}", "", s)
    s = re.sub(r"<br\s*/?>", " ", s, flags=re.I)
    s = re.sub(r"<[^>]+>", "", s)
    s = s.replace("&nbsp;", " ").replace("&ndash;", "–").replace("&mdash;", "—").replace("'''", "").replace("''", "")
    return re.sub(r"\s+", " ", s).strip()


def first_link_title(s):
    m = re.search(r"\[\[(\d{4}\s[^\]|]+?)\s+season", s)
    return m.group(1).strip() if m else None


def tables(text):
    """Yield (heading_l2, heading_any, table_text) for each top-level wikitable."""
    h2 = h3 = ""
    pos = 0
    lines = text.split("\n")
    cur, depth = [], 0
    for ln in lines:
        m = re.match(r"^(={2,4})\s*(.*?)\s*\1\s*(<!--.*)?$", ln)
        if m and depth == 0:
            if len(m.group(1)) == 2: h2, h3 = m.group(2), ""
            else: h3 = m.group(2)
            continue
        if ln.lstrip().startswith("{|"):
            depth += 1
        if depth: cur.append(ln)
        if ln.lstrip().startswith("|}") and depth:
            depth -= 1
            if depth == 0:
                yield h2, h3, "\n".join(cur)
                cur = []


def rows(table):
    """Rows of a wikitable as (row_attr, [raw cells])."""
    out, attr, cells, started = [], "", [], False
    def flush():
        if cells: out.append((attr, list(cells)))
    for ln in table.split("\n")[1:]:
        s = ln.strip()
        if s.startswith("|-"):
            flush(); cells.clear(); attr = s[2:].strip(); continue
        if s.startswith("|}") or s.startswith("|+"): continue
        if s[:1] in "|!" and s:
            body = s[1:]
            for part in re.split(r"\|\||!!", body):
                part = re.sub(r"^[^\[\]{}|]*?\b\w+\s*=\s*[^|\[\]{}]*\|(?!\|)", "", part) if re.match(r"^[^\[\]{}|]*=", part) and "|" in part else part
                cells.append(part.strip())
        elif cells:
            cells[-1] += " " + s
    flush()
    return out


def mk_date(year, text):
    m = DATE_RE.search(text)
    if not m: return None
    mon, day = MONTHS[m.group(1).lower()], int(m.group(2))
    try: return datetime.date(year, mon, day)
    except ValueError: return None


def title_name(title):
    return re.sub(r"^\d{4}\s+|\s+season$", "", title)


def resolve_opponent(raw_cell, season_teams):
    """Opponent full team name for the season: from the season-page link when there is one, else by matching text."""
    t = first_link_title(raw_cell)
    if t: return title_name(t)
    txt = re.sub(r"^(?:at|vs\.?|v\.?|@)\s+", "", clean(raw_cell), flags=re.I).strip()
    if txt in season_teams: return txt
    nz = lambda x: re.sub(r"[^a-z0-9]", "", x.lower())
    eq = [n for n in season_teams if nz(n) == nz(txt)]
    if len(eq) == 1: return eq[0]
    hits = [n for n in season_teams if n.lower().endswith(" " + txt.lower()) or n.lower().startswith(txt.lower() + " ") or txt.lower() in n.lower()]
    if len(hits) != 1 and len(nz(txt)) >= 5:
        hits = [n for n in season_teams if nz(txt) in nz(n)] or hits
    return hits[0] if len(hits) == 1 else txt


def schedule_tables(text):
    """The regular-season schedule tables of a club-season page (headings decide: not preseason, postseason, roster...)."""
    for h2, h3, tab in tables(text):
        if not re.search(r"regular|schedule|season", h2 + " " + h3, re.I): continue
        if re.search(r"pre-?season|post|play|roster|draft|exhibition|off-?season|award|stat", h2 + " " + h3, re.I): continue
        yield h2, h3, tab


def exact_team(raw_cell, season_teams):
    t = first_link_title(raw_cell)
    if t and title_name(t) in season_teams: return title_name(t)
    c = clean(raw_cell)
    if c in season_teams: return c
    eq = [n for n in season_teams if re.sub(r"[^a-z0-9]", "", n.lower()) == re.sub(r"[^a-z0-9]", "", c.lower())]
    return eq[0] if len(eq) == 1 else None


def team_games(text, year, team, season_teams):
    """One team page's regular-season schedule: per-team views of each game."""
    out, skipped = [], []
    for h2, h3, tab in schedule_tables(text):
        mark = len(out)
        for attr, cells in rows(tab):
            cl = [clean(c) for c in cells]
            di = next((i for i, c in enumerate(cl) if DATE_RE.search(c) and not SCORE_RE.search(c)), None)
            if di is None: continue
            vh = next((i for i in range(di + 1, len(cl) - 1) if SCORE_RE.search(cl[i]) and not SCORE_RE.match(cl[i]) is None and cl[i - 1] and cl[i + 1]
                       and exact_team(cells[i - 1], season_teams) and exact_team(cells[i + 1], season_teams)), None)
            if vh is not None:  # Date | Visitor | Score | Home layout (scores visitor-home)
                m = SCORE_RE.search(cl[vh])
                vis, hom = exact_team(cells[vh - 1], season_teams), exact_team(cells[vh + 1], season_teams)
                vp, hp = int(m.group(2)), int(m.group(3))
                d = mk_date(year, cl[di])
                if d is None or team not in (vis, hom) or vis == hom: skipped.append((h3 or h2, " | ".join(cl))); continue
                mine, theirs, where, opp = (vp, hp, "away", hom) if team == vis else (hp, vp, "home", vis)
                res = "T" if mine == theirs else ("W" if mine > theirs else "L")
                wk = next((c for c in cl[:di] if re.fullmatch(r"\d{1,2}", c)), None)
                out.append(dict(season=year, team=team, week=wk, game_date=d, opponent=opp, location=where, result=res, team_pts=mine,
                                opp_pts=theirs, overtime=bool(re.search(r"\bOT\b|overtime", " ".join(cl[vh + 2:vh + 3]), re.I)), src=" | ".join(cl)))
                continue
            oi = next((i for i in range(di + 1, len(cl)) if re.match(r"^(?:at|vs\.?|v\.?|@)\s", cl[i], re.I) or first_link_title(cells[i]) or (cl[i] and not SCORE_RE.search(cl[i]) and not re.match(r"^\d+\s*[–-]\s*\d+", cl[i]) and not re.match(r"^(?:\d{1,2}(?::\d{2})?\s*[ap]\.?m|TBA|TBD)", cl[i], re.I))), None)
            if oi is None: continue
            raw_opp = cells[oi]
            where = "away" if re.match(r"^(?:at|@)\s", clean(raw_opp), re.I) or clean(raw_opp).startswith("@") else ("home" if re.match(r"^(?:vs\.?|v\.?)\s", clean(raw_opp), re.I) else None)
            si = next((i for i in range(oi + 1, len(cl)) if SCORE_RE.search(cl[i])), None)
            if si is None: skipped.append((h3 or h2, " | ".join(cl))); continue
            m = SCORE_RE.search(cl[si])
            res = m.group(1)
            if not res:
                for c in cl[si + 1:]:
                    if re.fullmatch(r"(?:W|Win|Won)", c): res = "W"
                    elif re.fullmatch(r"(?:L|Loss|Lost)", c): res = "L"
                    elif re.fullmatch(r"(?:T|Tie|Tied)", c): res = "T"
                    if res: break
            if not res:
                a = attr.lower()
                res = "W" if re.search(r"ddffdd|dfd|cfc|c0ffc0|ccffcc|bfb", a) else "L" if re.search(r"ffbbbb|fbb|fcc|ffcccc|ffc0c0", a) else "T" if re.search(r"ffeeaa|ffffbb|ffe", a) else None
            a_, b_ = int(m.group(2)), int(m.group(3))
            hi, lo = max(a_, b_), min(a_, b_)
            if res == "W": mine, theirs = hi, lo
            elif res == "L": mine, theirs = lo, hi
            elif res == "T" and a_ == b_: mine = theirs = a_
            else: skipped.append((h3 or h2, " | ".join(cl))); continue
            if res != "T" and a_ == b_: skipped.append((h3 or h2, " | ".join(cl))); continue
            d = mk_date(year, cl[di])
            if d is None: skipped.append((h3 or h2, " | ".join(cl))); continue
            wk = next((c for c in cl[:di] if re.fullmatch(r"\d{1,2}", c)), None)
            out.append(dict(season=year, team=team, week=wk, game_date=d, opponent=resolve_opponent(raw_opp, season_teams),
                            location=where, result=res, team_pts=mine, opp_pts=theirs,
                            overtime=bool(re.search(r"\bOT\b|overtime", " ".join(cl[si:si + 2]), re.I)), src=" | ".join(cl)))
        _infer(out, mark)
    return out, skipped


def _infer(out, start):
    rows_ = out[start:]
    if sum(1 for v in rows_ if v["location"]) >= 3:
        for v in rows_:
            v.setdefault("inferred", "home" if v["location"] is None else None)
    for v in rows_: v.setdefault("inferred", None)


def merge_views(views):
    """Pair each game's two team views. Returns (games, conflicts, unpaired_count)."""
    by = {}
    for v in views: by.setdefault(frozenset((v["team"], v["opponent"])), []).append(v)
    games, conflicts = [], []
    for key, vs in by.items():
        used = set()
        for i, a in enumerate(vs):
            if i in used: continue
            best = None
            for j, b in enumerate(vs):
                if j == i or j in used or b["team"] != a["opponent"] or a["team"] == b["team"]: continue
                dd = abs((a["game_date"] - b["game_date"]).days)
                consistent = a["team_pts"] == b["opp_pts"] and a["opp_pts"] == b["team_pts"]
                score = (0 if consistent else 1, dd)
                if dd <= 2 and (best is None or score < best[0]): best = (score, j, b)
            b = None
            if best: used.add(i); used.add(best[1]); b = best[2]
            else: used.add(i)
            games.append(dict(a=a, b=b))
    out = []
    for g in games:
        a, b = g["a"], g["b"]
        loc = a["location"]
        if loc is None and b is not None and b["location"]: loc = "home" if b["location"] == "away" else "away"
        if loc is None and b is not None:
            ai, bi = a.get("inferred"), b.get("inferred")
            if ai == "home" and bi != "home": loc = "home"
            elif bi == "home" and ai != "home": loc = "away"
        if loc is None and b is None and a.get("inferred") == "home": loc = "home"
        conflict = None
        if b is not None:
            if a["location"] and b["location"] and a["location"] == b["location"]: conflict = f"both pages say {a['team']} and {b['team']} were {a['location']}"
            if a["team_pts"] != b["opp_pts"] or a["opp_pts"] != b["team_pts"]: conflict = f"scores differ: {a['team']} page {a['team_pts']}-{a['opp_pts']}, {b['team']} page {b['opp_pts']}-{b['team_pts']}"
            if a["game_date"] != b["game_date"]: conflict = (conflict + "; " if conflict else "") + f"dates differ: {a['game_date']} / {b['game_date']}"
        # the home team's own page is the view taken when the two disagree
        h = a if loc == "home" or b is None else b
        if loc == "home": home, away, hp, ap = a["team"], a["opponent"], a["team_pts"], a["opp_pts"]
        elif loc == "away": home, away, hp, ap = a["opponent"], a["team"], a["opp_pts"], a["team_pts"]
        else: home = away = hp = ap = None
        if b is not None and loc == "away": hp, ap = b["team_pts"], b["opp_pts"]
        out.append(dict(game_date=h["game_date"], week=a["week"] or (b or {}).get("week"),
                        home=home, away=away, home_pts=hp, away_pts=ap, overtime=a["overtime"] or bool(b and b["overtime"]),
                        views=2 if b else 1, conflict=conflict, location_known=loc is not None,
                        teams=(a["team"], a["opponent"]), src=a["src"] + ((" || " + b["src"]) if b else "")))
    return out


# ---------------------------------------------------------------- standings

def st_from_sports_table(text, year):
    out = []
    for blk in re.split(r"\{\{#invoke:sports table\|main", text)[1:]:
        blk = blk.split("}}<noinclude>")[0].split("\n}}")[0]
        title = clean((re.search(r"\|\s*title\s*=\s*(.*)", blk) or [None, ""])[1]) or clean((re.search(r"\|\s*section\s*=\s*(.*)", blk) or [None, ""])[1])
        order = re.findall(r"team(\d+)\s*=\s*(\w+)", blk)
        for rank, (_, code) in enumerate(sorted(order, key=lambda t: int(t[0])), 1):
            def g(k):
                m = re.search(r"\b%s_%s\s*=\s*(-?\d+)" % (k, re.escape(code)), blk); return int(m.group(1)) if m else None
            nm = re.search(r"name_%s\s*=\s*(.*)" % re.escape(code), blk)
            name = clean(nm.group(1)).split("|")[0].strip() if nm else code
            w, l, t, otl = g("win"), g("loss"), g("draw"), g("OTloss")
            gp = sum(x or 0 for x in (w, l, t, otl)) if w is not None else None
            out.append(dict(season=year, division=title, rank=rank, team=name, gp=gp, w=w, l=l, t=t, otl=otl, pts=None,
                            pf=g("pf"), pa=g("pa"), src=f"{code} w{w} l{l} t{t} otl{otl} pf{g('pf')} pa{g('pa')}"))
    return out


def st_from_wikitable(text, year):
    out = []
    for h2, h3, tab in tables(text):
        rs = rows(tab)
        hdr = next((r for a, r in rs if any(re.fullmatch(r"(?:GP|W)", clean(c)) for c in r)), None)
        if not hdr: continue
        names = [clean(c) for c in hdr]
        title = clean((re.search(r"^\|\+\s*(.*)", tab, re.M) or [None, ""])[1]) or clean((re.search(r"navbar-header\|(.*?)\|", tab) or [None, ""])[1]) or h3 or h2
        rank = 0
        for a, r in rs:
            if r is hdr or len(r) < 4: continue
            cl = [clean(c) for c in r]
            if not re.search(r"[A-Za-z]{3}", cl[0]) or not any(re.fullmatch(r"\d+", c) for c in cl[1:]): continue
            rank += 1
            def v(*keys):
                for k in keys:
                    if k in names:
                        i = names.index(k)
                        if i < len(cl) and re.fullmatch(r"-?\d+", cl[i]): return int(cl[i])
                return None
            out.append(dict(season=year, division=title, rank=rank, team=cl[0], gp=v("GP", "G"), w=v("W"), l=v("L"), t=v("T"), otl=v("OTL"),
                            pts=v("Pts", "PTS"), pf=v("PF"), pa=v("PA"), src=" | ".join(cl)))
    return out


def standings(text, year):
    a = st_from_sports_table(text, year)
    return a + st_from_wikitable(text, year)


# ---------------------------------------------------------------- brackets

def season_info(text):
    def f(k):
        m = re.search(r"\|\s*%s\s*=\s*(.*)" % k, text); return clean(m.group(1)) if m else None
    return dict(grey_cup=f("finals"), grey_cup_date=f("finals_date"), grey_cup_venue=f("finals_venue"), champion=f("finals_champ"),
                east_champion=f("conf1_champ"), west_champion=f("conf2_champ"), duration=f("duration"))


def brackets(text, year):
    """Playoff games from the {{NTeamBracket}} template."""
    m = re.search(r"\{\{\s*(\d*Team\w*Bracket\w*)[^\n]*\n(.*?)\n\}\}", text, re.S)
    if not m: return [], None
    body = m.group(2)
    kv = dict((a.strip(), b.strip()) for a, b in re.findall(r"^\|\s*([\w\-]+)\s*=\s*(.*)$", body, re.M))
    rounds = sorted({int(k[2]) for k in kv if re.match(r"RD\d-team\d+", k)})
    games = []
    for rd in rounds:
        head = kv.get(f"RD{rd}", "")
        hd = clean(head)
        date = mk_date(year, hd)
        rname = re.sub(r"^.*?:\s*", "", hd) if ":" in hd else hd
        rname = "Grey Cup" if re.search(r"grey cup", rname, re.I) else rname.split(" @ ")[0].strip()
        slots = sorted({int(re.search(r"team(\d+)", k).group(1)) for k in kv if re.match(rf"RD{rd}-team\d+$", k)})
        done = set()
        for s in slots:
            p = (s + 1) // 2
            if p in done: continue
            a_, b_ = 2 * p - 1, 2 * p
            if a_ not in slots or b_ not in slots: continue
            done.add(p)
            def t(n):
                return dict(team=clean(kv.get(f"RD{rd}-team{n}", "")), seed=clean(kv.get(f"RD{rd}-seed{n}", "")), score=clean(kv.get(f"RD{rd}-score{n}", "")))
            ta, tb = t(a_), t(b_)
            games.append(dict(season=year, round_no=rd, round_name=rname, game_date=date, a=ta, b=tb, src=f"RD{rd} {head}: {ta['team']} ({ta['seed']}) {ta['score']} - {tb['team']} ({tb['seed']}) {tb['score']}"))
    return games, kv


def seed_no(s):
    m = re.search(r"(\d+)", s or ""); return int(m.group(1)) if m else None


# ---------------------------------------------------------------- playoff tables (1958-1972)
# The season articles of those years tabulate every playoff game in wikitables (semi-finals, finals),
# each with its date and an Away and a Home column; the {{8TeamBracket}} there has no home side. The
# Grey Cup table has no date per row and stays with the bracket.
TEAM_SCORE_RE = re.compile(r"^(.+?)\s+(\d{1,3})$")


def playoff_table_games(text, year):
    """Playoff games from the wikitables under the playoffs heading: a list of dicts (round_name, game_date, week=None,
    home, away, home_pts, away_pts, game_no, uncertain, src). A row counts only with a date and two team-and-score
    cells; the home side is the Home column of the table (the header names the order, Away first by default)."""
    out = []
    for h2, h3, tab in tables(text):
        if not re.search(r"playoff", h2, re.I): continue
        rs = rows(tab)
        cap = re.search(r"^\|\+\s*(.*)", tab, re.M)
        rname = clean(cap.group(1)) if cap else h3
        rname = re.sub(r"\s+", " ", rname.replace("-", " ").replace("Finals", "Final").replace("finals", "final")).strip()
        away_first = True
        for attr, cells in rs:
            cl = [clean(c) for c in cells]
            low = [c.lower() for c in cl]
            if "away" in low and "home" in low:
                away_first = low.index("away") < low.index("home")
        for attr, cells in rs:
            cl = [clean(c) for c in cells]
            ts = [(i, TEAM_SCORE_RE.match(c)) for i, c in enumerate(cl)]
            ts = [(i, m) for i, m in ts if m and not DATE_RE.search(c := cl[i]) and re.search(r"[A-Za-z]{3}", m.group(1))]
            if len(ts) != 2: continue
            dcell = next((c for i, c in enumerate(cl) if DATE_RE.search(c) and i not in (ts[0][0], ts[1][0])), None)
            if dcell is None: continue
            d = mk_date(year, dcell)
            if d is None: continue
            no = next((int(c) for c in cl[:1] if re.fullmatch(r"\d", c)), None)
            first, second = ts[0][1], ts[1][1]
            (a, b) = (first, second) if away_first else (second, first)
            out.append(dict(round_name=rname, game_date=d, week=None, away=a.group(1).strip(), home=b.group(1).strip(),
                            away_pts=int(a.group(2)), home_pts=int(b.group(2)), game_no=no, uncertain="?" in dcell,
                            src=f"{rname}: " + " | ".join(cl)))
    return out


# ---------------------------------------------------------------- complete schedules

def nz(name):
    """A club's name as letters only, so 'Hamilton Tiger-Cats' and 'Hamilton Tiger Cats' meet."""
    return re.sub(r"[^a-z]", "", name.lower())


def complete_schedules(views, standings_rows):
    """Clubs whose own schedule table is the whole season: as many games as the published standings count and the same
    wins, losses and ties. A game only that club's page lists (its opponent has no article, or does not list it) then
    stands on the standings' agreement. Returns the set of nz(club) names."""
    by = {}
    for v in views: by.setdefault(nz(v["team"]), []).append(v)
    out, seen = set(), set()
    for s in standings_rows:
        k = nz(s["team"])
        if k in seen or k not in by or s["w"] is None or s["l"] is None: continue
        seen.add(k)
        vs = by[k]
        w, l, t = (sum(1 for v in vs if v["result"] == r) for r in "WLT")
        if w == s["w"] and l == s["l"] and t == (s["t"] or 0) and len(vs) == (s["gp"] if s["gp"] is not None else s["w"] + s["l"] + (s["t"] or 0)):
            out.add(k)
    return out


def trusted_singles(merged, complete, standings_rows):
    """The ids of the games only one club's page lists that may be loaded. The logging club's whole schedule matches the
    standings (complete) and the opponent's does not (a complete opponent that does not list the game contradicts it).
    Then any club whose loaded games would exceed its published games, wins, losses or ties loses the single-page games
    it is in (a page that names the wrong opponent shows up this way), until none does."""
    st = {}
    for s in standings_rows:
        st.setdefault(nz(s["team"]), s)
    ok = {id(g) for g in merged if g["views"] == 1 and nz(g["teams"][0]) in complete and nz(g["teams"][1]) not in complete}
    singles = [g for g in merged if id(g) in ok]
    for _ in range(5):
        tally = {}
        for g in merged:
            if g["views"] < 2 and id(g) not in ok: continue
            if g["home"] is None or g["home_pts"] is None: continue
            for club, mine, theirs in ((g["home"], g["home_pts"], g["away_pts"]), (g["away"], g["away_pts"], g["home_pts"])):
                t = tally.setdefault(nz(club), [0, 0, 0, 0])
                t[0] += 1
                t[1 if mine > theirs else 2 if mine < theirs else 3] += 1
        bad = set()
        for club, (n, w, l, t) in tally.items():
            r = st.get(club)
            if r is None or r["w"] is None or r["l"] is None: continue
            gp = r["gp"] if r["gp"] is not None else r["w"] + r["l"] + (r["t"] or 0)
            if n > gp or w > r["w"] or l > r["l"] or t > (r["t"] or 0): bad.add(club)
        drop = {id(g) for g in singles if id(g) in ok and (nz(g["home"] or "") in bad or nz(g["away"] or "") in bad)}
        if not drop: break
        ok -= drop
    return ok
