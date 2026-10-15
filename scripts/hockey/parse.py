#!/usr/bin/env python3
"""Parse the season articles of the NHA, PCHA, WCHL/WHL and WHA (English Wikipedia wikitext) into standings, games and a champion.

What an article holds (checked on all 33 seasons, 2026-10-15):
  * the final standings: a wikitable (GP W L T [Pts] GF GA ...), a standings template ("{{1915-16 NHA standings}}", a wikitable too) or the
    sports-table module ("{{#invoke:sports table|main|team1=..|win_X=..}}");
  * the NHA's and PCHA's whole regular season as a "Results" table (Month, Day, Visitor, Score, Home, Score), club names shortened
    ("Wanderers", "Quebec HC"), and the playoff games of the league as tables (Date, Visitor/Away, Score, Home, Score, or Date, Winning
    Team, Score, Losing Team, Location). The WCHL and WHA articles tell the playoffs in prose or a bracket only;
  * an infobox naming the champion (or a sentence that does).
Everything is a fact in a table or none: a row nothing here can read comes back in `unparsed`, a game between a club of the league and
one outside it (a Stanley Cup challenge, an interleague playoff) comes back in `skipped` and is not a game of this league: those series
live in core.cup_series (db/build/210), the games of the NHL's Cup finals in the NHL's own season.
"""
import datetime, importlib.util, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("nfl_parse", os.path.join(HERE, "..", "nfl", "parse.py"))
NP = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(NP)   # clean(), strip_attr(): the one wikitext cleaner
clean, strip_attr = NP.clean, NP.strip_attr

MONTHS = NP.MONTHS
MON_RE = NP.MON_RE
DASH = r"[–—\-]"
DATE_PAT = r"(?P<m>" + MON_RE + r")\s*(?P<d>\d{1,2})(?:,?\s*(?P<y>\d{4}))?"


def tidy(s):
    """Plain text of a cell: footnote marks (<sup>1</sup>), refs, links, bold and templates gone."""
    s = re.sub(r"<sup>.*?</sup>", "", s, flags=re.S)
    return clean(s).strip(" *†‡+")


NOT_A_CLUB = re.compile(r"all-stars?\b|^(soviet|czechoslovakia|finland|canada|sweden|usa)\b|^wha\b", re.I)


def club_name(s):
    """A standings team cell as a club name: the footnote marks WHA tables put before it ('xIndianapolis Racers', '#Finland') are gone."""
    return re.sub(r"^[x#*+†‡]+(?=[A-Z])", "", tidy(s))


# --------------------------------------------------------------------------------------------------------- wikitext structure
def headings(text):
    """[(position, level, title)] of every == heading ==."""
    return [(m.start(), len(m.group(1)), clean(m.group(2))) for m in re.finditer(r"^(={2,5})\s*([^=\n].*?)\s*\1\s*$", text, re.M)]


def heading_path(hs, pos):
    """Titles of the headings that enclose a position, outermost first."""
    path = []
    for p, lv, t in hs:
        if p > pos: break
        path = [x for x in path if x[0] < lv] + [(lv, t)]
    return [t for _, t in path]


def wikitables(text):
    """[(start, end, body)] of each top-level {| ... |} table."""
    out, depth, start = [], 0, 0
    pos = 0
    for line in text.splitlines(keepends=True):
        s = line.lstrip()
        if s.startswith("{|"):
            if depth == 0: start = pos
            depth += 1
        elif s.startswith("|}") and depth:
            depth -= 1
            if depth == 0: out.append((start, pos + len(line), text[start:pos + len(line)]))
        pos += len(line)
    return out


def rows_of(table):
    """-> (caption, rows); a row is ('h' or 'd', [cell text...]). A line starting '|' or '!' starts a cell, '||' and '!!' split cells on a line."""
    caption, rows, cur, kind = "", [], None, None
    lines = table.splitlines()[1:]
    for ln in lines:
        s = ln.strip()
        if not s: continue
        if s.startswith("|}"): break
        if s.startswith("|-"):
            if cur: rows.append((kind, cur))
            cur, kind = None, None
            continue
        if s.startswith("|+"):
            caption = clean(strip_attr(s[2:])); continue
        if s[0] in "|!":
            k = "h" if s[0] == "!" else "d"
            body = s[1:]
            if body.startswith("|") and k == "d": body = body[1:]       # '|| 30 || x': the line goes on with the cells of the row above
            parts = re.split(r"\|\||!!", body)
            if cur is None: cur, kind = [], k
            elif k == "h" and kind == "d" and not cur: kind = "h"
            for c in parts:
                cur.append(strip_attr(c) if not c.lstrip().startswith("[[") else c.strip())
        elif cur:
            cur[-1] += " " + s
    if cur: rows.append((kind, cur))
    return caption, rows


def intof(s):
    m = re.search(r"\d[\d,]*", s or "")
    return int(m.group(0).replace(",", "")) if m else None


# --------------------------------------------------------------------------------------------------------- club names
def norm(name):
    """Words of a club name for matching: 'Quebec Hockey Club' and 'Quebec HC' agree; 'Les Canadiens' = 'Canadiens'."""
    s = name.lower().replace("&nbsp;", " ")
    s = re.sub(r"\bhockey club\b", "hc", s)
    s = re.sub(r"\([^)]*\)", " ", s)
    s = re.sub(r"[^a-z0-9 ]", " ", s)
    return [w for w in s.split() if w not in ("the", "les", "of", "club")]


def match_name(short, names):
    """The one full name a short name ('Wanderers', 'Ottawa') stands for, among the season's clubs; None when none or several fit."""
    st = set(norm(short))
    if not st: return None
    best, score = [], 0
    for n in names:
        nt = set(norm(n))
        if st == nt: sc = 3
        elif st <= nt: sc = 2
        elif nt <= st and len(nt) >= 2: sc = 1
        elif len(st) == 1 and any(len(w) >= 5 and w.startswith(next(iter(st))) and len(next(iter(st))) >= 5 for w in nt): sc = 0.5   # a clipped word ('Ontari')
        else: continue
        if sc > score: best, score = [n], sc
        elif sc == score: best.append(n)
    if len(best) > 1 and len(st) == 1:                       # 'Toronto' with two Toronto clubs: the one called '<Town> Hockey Club' (the main club)
        hc = [n for n in best if "hc" in norm(n)]
        if len(hc) == 1: return hc[0]
    return best[0] if len(best) == 1 else None


# --------------------------------------------------------------------------------------------------------- standings
STAND_COLS = {"GP": "gp", "W": "w", "L": "l", "T": "t", "OTL": "otl", "PTS": "pts", "P": "pts", "GF": "gf", "GA": "ga", "PIM": "pim", "PCT": "pct"}


def club_of(name, names):
    """The season's club a champion's name stands for: the full match, else the one club of that town ('Quebec Bulldogs' for the 'Quebec Hockey Club')."""
    m = match_name(name, names)
    if m or not name: return m
    city = norm(name)[:1]
    same = [n for n in names if norm(n)[:1] == city]
    return same[0] if city and len(same) == 1 else None


def standings_from_table(table, division_hint=""):
    """Rows of one standings wikitable (header with GP, W, L), or []."""
    caption, rows = rows_of(table)
    hdr = None
    for kind, cells in rows:
        if kind == "h" and len(cells) >= 4:
            names = [re.sub(r"[^A-Z]", "", tidy(c).upper()) for c in cells]
            if "W" in names and "L" in names and ("GF" in names or "PTS" in names or "GP" in names):
                hdr = names; break
    if hdr is None: return []
    div = tidy(hdr and next((c for k, cells in rows if k == "h" for c in cells[:1]), "")) or caption or division_hint
    if re.fullmatch(r"(team|club|)", div, re.I) or "pacific coast" in div.lower() or "national hockey" in div.lower() or "western canada" in div.lower() or "world hockey" in div.lower():
        div = caption or division_hint or ""
    out = []
    for kind, cells in rows:
        if kind != "d" or len(cells) < len(hdr) - 1: continue
        team_raw = cells[0]
        name = club_name(re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", team_raw))
        if not name or NOT_A_CLUB.search(name) or not intof(cells[1]) and cells[1].strip() not in ("0",): continue
        link = re.search(r"\[\[([^\]|#]+)", team_raw)
        r = {"team": name, "link": link.group(1).strip() if link else None, "division": div}
        for i, h in enumerate(hdr):
            if i == 0 or i >= len(cells): continue
            k = STAND_COLS.get(h)
            if k and k != "pct": r[k] = intof(cells[i])
        if r.get("gp") is None and r.get("w") is not None: r["gp"] = (r.get("w") or 0) + (r.get("l") or 0) + (r.get("t") or 0)
        out.append(r)
    return out


def standings_from_module(text):
    """Rows of {{#invoke:sports table|main|team1=QHC|name_QHC=[[..]]|win_QHC=..|draw_QHC=..|loss_QHC=..|gf_QHC=..|ga_QHC=..}} blocks."""
    out = []
    for blk in re.finditer(r"\{\{#invoke:sports table\|main\|(.*?)\n\}\}", text, re.S):
        body = blk.group(1)
        kv = {k: v.strip() for k, v in re.findall(r"\|?\s*([A-Za-z_0-9]+)\s*=\s*((?:\[\[[^\]]*\]\]|[^|\n])*)", body)}
        teams = [(int(k[4:]), v) for k, v in kv.items() if re.fullmatch(r"team\d+", k)]
        for _, key in sorted(teams):
            nm = kv.get("name_" + key, key)
            link = re.search(r"\[\[([^\]|#]+)", nm)
            r = {"team": tidy(nm), "link": link.group(1).strip() if link else None, "division": ""}
            for src, dst in (("win", "w"), ("loss", "l"), ("draw", "t"), ("gf", "gf"), ("ga", "ga")):
                v = kv.get(f"{src}_{key}")
                r[dst] = intof(v) if v not in (None, "") else None
            r["t"] = r.get("t") or 0
            r["gp"] = (r["w"] or 0) + (r["l"] or 0) + r["t"]
            out.append(r)
    return out


def parse_standings(text, templates):
    """Final standings of a season: from the module call or tables in a 'standing' section, else from the standings templates."""
    rows = standings_from_module(text)
    if rows: return rows
    hs = headings(text)
    sect = None
    for i, (p, lv, t) in enumerate(hs):
        if re.search(r"standing", t, re.I):
            end = next((q for q, l2, _ in hs[i + 1:] if l2 <= lv), len(text))
            sect = text[p:end]
            break
    out = []
    if sect:
        for _, _, tb in wikitables(sect):
            out += standings_from_table(tb)
    for name, ttext in templates:
        if not ttext: continue
        for _, _, tb in wikitables(ttext):
            out += standings_from_table(tb, division_hint=re.sub(r"^\d{4}[–-]\d{2}\s*(WHA|NHA|PCHA|WCHL|WHL)?\s*", "", name).replace(" standings", "").strip())
    seen, uniq = set(), []
    for r in out:
        if (r["team"], r["division"]) in seen: continue
        seen.add((r["team"], r["division"])); uniq.append(r)
    return sum_halves(uniq)


def sum_halves(rows):
    """A season published as 'First Half' and 'Second Half' tables (the NHA of 1916-17) is one standing per club: the halves added up."""
    if not rows or not all(re.search(r"half", r["division"], re.I) for r in rows): return rows
    out = {}
    for r in rows:
        o = out.setdefault(r["team"], {"team": r["team"], "link": r["link"], "division": ""})
        for k in ("gp", "w", "l", "t", "gf", "ga"): o[k] = (o.get(k) or 0) + (r.get(k) or 0)
    return list(out.values())


# --------------------------------------------------------------------------------------------------------- champion
CHAMP_KEYS = ("league_champs", "finals_champ", "season_champs", "league_champ", "champion", "champions", "champs")


def champion_of(text):
    """The champion the infobox names, as plain text, or None."""
    m = re.search(r"\{\{\s*Infobox sports season.*?\n\}\}", text, re.S | re.I)
    if not m: return None
    kv = {k.strip().lower(): v.strip() for k, v in re.findall(r"^[ \t]*\|[ \t]*([A-Za-z_0-9 -]+?)[ \t]*=[ \t]*(.*)$", m.group(0), re.M)}
    for k in CHAMP_KEYS:
        if kv.get(k):
            v = tidy(kv[k])
            if v: return v
    return None


# --------------------------------------------------------------------------------------------------------- games
def date_of(month_text, day_text, season, explicit_year=None):
    """(month name or 'Dec.', day, season start year) -> date; months from July on belong to the year the season starts in."""
    m = re.match(MON_RE, (month_text or "").strip(), re.I)
    d = intof(day_text)
    if not m or d is None: return None
    mon = MONTHS[next(k for k in MONTHS if k.startswith(m.group(1).lower()[:3]))]
    y = explicit_year or (season if mon >= 7 else season + 1)
    try: return datetime.date(y, mon, d)
    except ValueError: return None


def score_of(cell):
    """('6', ...) -> (6, overtime, mark). Blank -> (None, False, '')."""
    c = re.sub(r"<[^>]+>", "", cell or "")
    n = intof(re.sub(r"\(.*?\)", "", c))
    ot = bool(re.search(r"\bOT\b|overtime", c, re.I))
    mark = "†" if "†" in c else ""
    return n, ot, mark


def table_kind(rows):
    """'visitor' (Month/Day or Date, Visitor/Away, Score, Home, Score), 'winner' (Date, Winning Team, Score, Losing Team) or None."""
    for kind, cells in rows:
        if kind != "h": continue
        h = [tidy(c).lower() for c in cells]
        if any(x in ("visitor", "away", "visitors") for x in h) and "home" in h: return "visitor", h
        if any(x.startswith("winning") for x in h) and any(x.startswith("losing") for x in h): return "winner", h
        if len(h) >= 4 and "game" in h[0] and any(x.startswith("winning") for x in h): return "winner", h
    return None, None


def footnotes(after):
    """{mark: text} of the footnote lines right after a table: '† Protested by Renfrew.'"""
    out = {}
    for ln in after.splitlines()[:12]:
        m = re.match(r"^\s*\*?\s*([†‡])\s*(.+)$", ln)
        if m: out[m.group(1)] = tidy(m.group(2))
        elif ln.strip() and not ln.strip().startswith(("<", "{")) and out: break
    return out


def games_from_table(table, season, names):
    """-> (games, unparsed, skipped) for a results or playoff table. A game: dict(date, away, home, away_pts, home_pts, overtime, neutral, note, raw)."""
    caption, rows = rows_of(table)
    kind, hdr = table_kind(rows)
    if kind is None: return None
    games, bad, skipped = [], [], []
    month = None
    for k, cells in rows:
        if k != "d": continue
        raw = " | ".join(tidy(c) for c in cells)
        if len(cells) <= 2 or re.search(r"colspan|wins|win series|total", raw, re.I) and len(cells) < 4: continue
        try:
            r = one_row(kind, cells, hdr, month, season, raw)
        except IndexError:
            bad.append(raw); continue
        if r is None: continue
        month, g, b, sk = r
        if g: games.append(g)
        if b: bad.append(b)
        if sk: skipped.append(sk)
    return games, bad, skipped


def one_row(kind, cells, hdr, month, season, raw):
    """One data row of a results table -> (month carried on, game or None, unparsed text or None, skipped text or None)."""
    c = list(cells)
    dre = DATE_PAT
    if kind == "visitor":
        if "month" in hdr:
            if re.match(MON_RE, tidy(c[0]), re.I) and not re.match(r"\d", tidy(c[0])): month = tidy(c[0]); c = c[1:]
            if len(c) < 5: return month, None, raw, None
            dayc, vis, vs, home, hs = c[0], c[1], c[2], c[3], c[4]
            note = " ".join(tidy(x) for x in c[5:])
            date = date_of(month, tidy(dayc), season, None)
        else:
            di = next(i for i, x in enumerate(hdr) if x.startswith("date"))
            ti = [i for i, x in enumerate(hdr) if x in ("visitor", "away", "visitors", "home")]
            mm = re.search(dre, tidy(c[di]))
            if not mm or len(ti) < 2: return month, None, raw, None
            date = date_of(mm.group("m"), mm.group("d"), season, int(mm.group("y")) if mm.group("y") else None)
            first, second = ti[0], ti[1]
            t1, s1, t2, s2 = c[first], c[first + 1], c[second], c[second + 1]
            vis, vs, home, hs = (t2, s2, t1, s1) if hdr[first] == "home" else (t1, s1, t2, s2)   # the first club listed is the visitor, unless the column says Home
            dayc = c[di]
            note = " ".join(tidy(x) for x in c[second + 2:])
        a, ao, am = score_of(vs); h, ho, hm = score_of(hs)
        if a is None or h is None:
            if a is None and h is None or re.search(r"cancel|not played|postpon", raw, re.I): return month, None, None, "not played: " + raw
            return month, None, raw, None
        if date is None: return month, None, raw, None
        marks = set(re.findall(r"[†‡]", dayc + vs + hs))
        return month, {"date": date, "away": tidy(vis), "home": tidy(home), "away_pts": a, "home_pts": h, "overtime": ao or ho or bool(re.search(r"\bOT\b", note)),
                       "neutral": False, "note": note, "marks": sorted(marks), "raw": raw}, None, None
    # winner table: [Game |] Date | Winning Team | Score | Losing Team | ... | Location
    di = next((i for i, x in enumerate(c) if re.fullmatch(r"\s*" + dre + r"\s*", tidy(x)) and re.search(r"\d+\s*" + DASH + r"\s*\d+", tidy(c[i + 2]) if i + 2 < len(c) else "")), None)
    if di is None: return month, None, raw, None
    wi = di + 1                                                  # Date | Winning team | Score | Losing team (a leading Game cell shifts the row)
    if len(c) < wi + 3: return month, None, raw, None
    mm = re.search(dre, tidy(c[wi - 1]))
    sc = re.search(r"(\d+)\s*" + DASH + r"\s*(\d+)", tidy(c[wi + 1]))
    if not mm or not sc: return month, None, raw, None
    date = date_of(mm.group("m"), mm.group("d"), season, int(mm.group("y")) if mm.group("y") else None)
    if date is None: return month, None, raw, None
    loc = " ".join(tidy(x) for x in c[wi + 3:])
    ot = bool(re.search(r"\bOT\b|overtime", tidy(c[wi + 1]) + " " + loc, re.I))
    return month, {"date": date, "away": tidy(c[wi + 2]), "home": tidy(c[wi]), "away_pts": int(sc.group(2)), "home_pts": int(sc.group(1)), "overtime": ot,
                   "neutral": True, "note": loc, "raw": raw, "winner_first": True}, None, None


def club_city(name):
    """Place word of a club name for finding its home in a location: 'Montreal Wanderers' -> 'montreal'."""
    w = norm(name)
    return w[0] if w else ""


def resolve_games(games, names, rnd, phase, skipped, outside):
    """Name the clubs of each game after the season's clubs; a game with a club outside the league is skipped (a Cup challenge, an interleague
    playoff). A winner-first game (playoff table) takes as home the club whose city the location names, else it is a game at a neutral site."""
    out = []
    for g in games:
        a, h = match_name(g["away"], names), match_name(g["home"], names)
        if a is None or h is None:
            skipped.append(f"{phase} {g['away']} {g['away_pts']} at {g['home']} {g['home_pts']} ({g['date']}): club outside the league")
            if (a is None) != (h is None): outside.append(dict(g, away=a or g["away"], home=h or g["home"], phase=phase, round=rnd))
            continue
        g = dict(g, away=a, home=h, phase=phase, round=rnd)
        if g.pop("winner_first", False):
            loc = g["note"].lower()
            ha, hh = club_city(a) in loc and club_city(a) != club_city(h), club_city(h) in loc and club_city(a) != club_city(h)
            if hh and not ha: g["neutral"] = False
            elif ha and not hh:
                g["away"], g["home"], g["away_pts"], g["home_pts"] = h, a, g["home_pts"], g["away_pts"]; g["neutral"] = False
            else: g["neutral"] = True
        out.append(g)
    return out


def parse_season(text, templates, season, league, league_text=""):
    """-> dict(standings, games, teams, champion, champion_basis, series, unparsed, skipped, outside). The champion is the one the league article's table
    of seasons names (the playoff winner: a season's infobox may name the regular-season winner), else the season article's infobox."""
    st = parse_standings(text, templates)
    names = []
    for r in st:
        if r["team"] not in names: names.append(r["team"])
    hs = headings(text)
    games, unparsed, skipped, outside = [], [], [], []
    for start, end, tb in wikitables(text):
        path = heading_path(hs, start)
        res = games_from_table(tb, season, names)
        if res is None: continue
        g, bad, sk = res
        notes = footnotes(text[end:end + 900])
        for x in g:
            for mk in x.get("marks", []):
                f = notes.get(mk, "")
                if f and re.search(r"protest|before .*join|not count|void|disregard|ordered|replayed|abandon|forfeit", f, re.I) and not re.match(r"replay of", f, re.I):
                    x["counts"] = False; x["note"] = "; ".join(y for y in (x.get("note", ""), f) if y)
                elif f: x["note"] = "; ".join(y for y in (x.get("note", ""), f) if y)
        skipped += sk
        unparsed += [(" > ".join(path), b) for b in bad]
        if any(re.search(r"exhibition|all-star|charity|benefit", t, re.I) for t in path):
            skipped += [f"exhibition {x['away']} at {x['home']} ({x['date']})" for x in g]; continue
        in_play = any(re.search(r"playoff|post-?season|finals?\b|championship|vs\.?", t, re.I) for t in path)
        phase = "playoffs" if in_play else "regular"
        rnd = path[-1] if in_play and path else None
        if in_play and any(re.search(r"stanley cup|cup final", t, re.I) for t in path):
            skipped += [f"Cup final game {x['away']} at {x['home']} ({x['date']})" for x in g]; continue
        games += resolve_games(g, names, rnd, phase, skipped, outside)
    seen, uniq = set(), []
    for g in games:
        key = (g["phase"], g["date"], g["away"], g["home"], g["away_pts"], g["home_pts"])
        if key in seen: continue
        seen.add(key); uniq.append(g)
    info = champion_of(text)
    info = (club_of(info, names) or info) if info else None
    table = league_champions(league_text).get(season) if league_text else None
    table = club_of(table, names) if table else None
    champ, basis = (table, "the league article's table of seasons") if table else (info, "the season article's infobox")
    if table and info and info != table:
        basis += f" (the season's infobox says {info})"
    return {"standings": st, "games": uniq, "teams": names, "champion": champ, "champion_basis": basis if champ else None,
            "series": series_from_brackets(text, names), "unparsed": unparsed, "skipped": skipped, "outside": outside}


def check_standings(standings, games, extra=()):
    """Published standings against the games as parsed (regular season; `extra`: games the league's clubs played against clubs of another league,
    which the standings count): -> [(club, published (gp, w, l, t, gf, ga), from games)] for every club whose line differs. A club with no games at all
    is not compared (a league whose article has no results table)."""
    tot = {}
    for g in list(games) + list(extra):
        if g["phase"] != "regular" or g.get("counts") is False: continue
        for side, f, a in (("home", g["home_pts"], g["away_pts"]), ("away", g["away_pts"], g["home_pts"])):
            t = tot.setdefault(g[side], [0, 0, 0, 0, 0, 0])
            t[0] += 1; t[1 if f > a else 2 if f < a else 3] += 1; t[4] += f; t[5] += a
    out = []
    for r in standings:
        t = tot.get(r["team"])
        if t is None: continue
        pub = (r.get("gp"), r.get("w"), r.get("l"), r.get("t") or 0, r.get("gf"), r.get("ga"))
        if tuple(t) != pub: out.append((r["team"], pub, tuple(t)))
    return out


# --------------------------------------------------------------------------------------------------------- playoff brackets (the WHA)
def balanced_templates(text, name_re):
    """The {{...}} blocks whose name matches name_re, braces balanced."""
    out = []
    for m in re.finditer(r"\{\{\s*(" + name_re + r")", text):
        depth, i = 0, m.start()
        while i < len(text):
            if text.startswith("{{", i): depth += 1; i += 2
            elif text.startswith("}}", i):
                depth -= 1; i += 2
                if depth == 0: break
            else: i += 1
        out.append(text[m.start():i])
    return out


def series_from_brackets(text, names):
    """[(round, winner, loser, winner wins, loser wins)] from {{8TeamBracket|RD1-team1=..|RD1-score1=4|RD1-team2=..|RD1-score2=1|...}} blocks
    (the WHA playoffs: games won in a best-of series). A round's name is the bracket's own label (RD1=Quarterfinals<br/>April 9-30)."""
    out = []
    for blk in balanced_templates(text, r"\d+TeamBracket[^|}]*"):
        kv = {k.strip(): v.strip() for k, v in re.findall(r"^[ \t]*\|[ \t]*([A-Za-z0-9_-]+)[ \t]*=[ \t]*(.*)$", blk, re.M)}
        rounds = sorted({m.group(1) for k in kv for m in [re.match(r"RD(\w+?)-team\d+$", k)] if m})
        for rd in rounds:
            label = tidy(re.split(r"<br", kv.get(f"RD{rd}", "") or kv.get(f"RD{rd[0]}", ""))[0]) or (f"Round {rd}")
            n = 1
            while f"RD{rd}-team{n}" in kv and f"RD{rd}-team{n + 1}" in kv:
                a, b = tidy(kv[f"RD{rd}-team{n}"]), tidy(kv[f"RD{rd}-team{n + 1}"])
                sa, sb = intof(kv.get(f"RD{rd}-score{n}")), intof(kv.get(f"RD{rd}-score{n + 1}"))
                n += 2
                if not a or not b or sa is None or sb is None or sa == sb: continue
                wa, wb = match_name(a, names), match_name(b, names)
                if wa is None or wb is None: continue
                out.append((label if rd.isdigit() or True else label, wa if sa > sb else wb, wb if sa > sb else wa, max(sa, sb), min(sa, sb)))
    return out


# --------------------------------------------------------------------------------------------------------- the league article's seasons table
def league_champions(text):
    """{season start year: playoff champion} from the league article's table of seasons (columns Season, ..., Champion); {} when it has none."""
    out = {}
    for _, _, tb in wikitables(text):
        caption, rows = rows_of(tb)
        hdr = next((c for k, c in rows if k == "h" and any("champion" in tidy(x).lower() for x in c)), None)
        if hdr is None: continue
        ci = max(i for i, x in enumerate(hdr) if "champion" in tidy(x).lower())    # 'Playoff champion' comes after 'Regular season winner'
        for k, c in rows:
            if k != "d" or len(c) <= ci: continue
            lab = tidy(c[0])
            m = re.search(r"(\d{4})", lab)
            champ = re.sub(r"\s*\(.*?\)|[†‡*]", "", tidy(c[ci])).strip()
            # '1912-13' starts in 1912; a bare '1912' is the season of the "1912 PCHA season" article, which ends in 1912
            if m and champ: out[int(m.group(1)) if re.search(r"\d{4}\s*[–-]\s*\d", lab) else int(m.group(1)) - 1] = champ
    return out
