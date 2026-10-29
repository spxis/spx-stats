#!/usr/bin/env python3
"""Parse the season articles of North American minor-league hockey (English Wikipedia wikitext) into standings, playoff series, games and a champion.

What an AHL season article holds (checked on all 90 seasons, 2026-10-28):
  * "Final standings": one wikitable per division (GP W L [T] [OTL] [SOL] Pts [Pts%] GF GA), the club cell carrying the NHL club(s) it was
    affiliated with in brackets ("[[Hershey Bears]] ([[Washington Capitals|WSH]])", "(independent)");
  * the Calder Cup playoffs as a bracket template ({{8TeamBracket}}, {{16TeamBracket}}, taken from the season's own playoffs article through
    {{#section:...}} in recent years) or as prose ("X defeated Y 3 games to 1");
  * the games of a series as {{NHLPlayoffs}} blocks on the playoffs article, where an editor wrote them out;
  * an infobox naming the Calder Cup winner (finals_champ).
Everything is a fact in a table or none: a row nothing here can read comes back in `unparsed`. No regular-season game is tabulated by any article,
so none is made up.
"""
import datetime, importlib.util, os, re

HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location("hockey_parse", os.path.join(HERE, "..", "hockey", "parse.py"))
P = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(P)   # clean(), wikitables(), rows_of(), headings(): the one wikitext reader
clean, wikitables, rows_of, headings, heading_path, intof = P.clean, P.wikitables, P.rows_of, P.headings, P.heading_path, P.intof
MONTHS = P.MONTHS
DASH = r"[–—\-]"


def strip_comments(text):
    """The wikitext without its <!-- comments --> (an editor's note after a heading hides the heading from a reader of the raw text)."""
    return re.sub(r"<!--.*?-->", "", text, flags=re.S)


# ---------------------------------------------------------------------------------------------------------------- standings
COLS = {"GP": "gp", "G": "gp", "W": "w", "WINS": "w", "L": "l", "LOSSES": "l", "T": "t", "TIES": "t", "OTL": "otl", "OL": "otl", "OT": "otl", "SOL": "sol",
        "SL": "sol", "PTS": "pts", "P": "pts", "POINTS": "pts", "GF": "gf", "GA": "ga"}
MARK = re.compile(r"^(?:'''|\s)*[xyzpe*†‡#]\s*[–-]\s*(?:'''|\s)*", re.I)       # '''y–''' (clinched), '''e–''' (eliminated)
NHL_ABBR = re.compile(r"\[\[[^\]|]+\|([A-Z]{2,4})\]\]")


def team_of(cell):
    """-> (display name, link title, affiliation) of a standings club cell: "'''x–'''[[Maine Mariners (AHL)|Maine Mariners]] ([[New Jersey Devils|NJD]])"."""
    c = MARK.sub("", cell.strip())
    c = re.sub(r"<ref[^>]*?/>|<ref[^>]*>.*?</ref>", "", c, flags=re.S)
    m = re.search(r"\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]", c)
    link = m.group(1).strip() if m else None
    shown = (m.group(2) or m.group(1)).strip() if m else None
    rest = c[m.end():] if m else c
    aff = None
    pm = re.search(r"\(([^()]*(?:\[\[[^\]]*\]\][^()]*)*)\)", rest)
    if pm:
        ab = NHL_ABBR.findall(pm.group(1))
        if ab: aff = "/".join(ab)
        elif re.search(r"independent", pm.group(1), re.I): aff = "independent"
        else:
            t = clean(pm.group(1))
            if t: aff = t[:60]
    name = clean(shown) if shown else clean(re.sub(r"\([^)]*\)", "", c))
    name = re.sub(r"^[xyzpe*†‡#]\s*[–-]\s*", "", name).strip(" *†‡")
    if link and not re.search(r"\bseason$", link):                   # a cell that shows only the city ("Cleveland" for [[Cleveland Barons (1937–1973)|Cleveland]]) takes the article's name
        full = re.sub(r"\s*\([^)]*\)$", "", link).strip()
        if len(full) > len(name) and full.startswith(name + " "): name = full
    return name, link, aff


def leaf_tables(text):
    """[(start, end, body)] of each innermost {| ... |} table, one that holds no other table: some standings are a table in a table (the outer one only lays them out)."""
    out, stack, pos = [], [], 0
    for line in text.splitlines(keepends=True):
        s = line.lstrip()
        if s.startswith("{|"):
            if stack: stack[-1][1] = True
            stack.append([pos, False])
        elif s.startswith("|}") and stack:
            st, has_child = stack.pop()
            if not has_child: out.append((st, pos + len(line), text[st:pos + len(line)]))
        pos += len(line)
    return out


CONF_LINE = re.compile(r"^(?:;\s*|'''\s*)([A-Za-z ]+? Conference)\s*(?:'''\s*)?(?:<br\s*/?>)?\s*$", re.M)


ABBR_LINK = re.compile(r"\[\[([^\]|#]+?)\s*\|\s*([A-Za-z.]{2,5})\s*\)?\s*\]\]")


def affiliation_of(cell):
    """The NHL club(s) a standings club cell names after the club's own link -> (label, links): "([[Detroit Red Wings|DET]]/[[San Jose Sharks|SJS]])" is ("DET/SJS",
    "Detroit Red Wings/San Jose Sharks"); "(independent)" or "(Ind.)" is ("independent", None); a footnote mark such as "(z)" is no affiliation."""
    c = MARK.sub("", cell.strip())
    c = re.sub(r"<ref[^>]*?/>|<ref[^>]*>.*?</ref>|<nowiki>.*?</nowiki>", "", c, flags=re.S)
    c = re.sub(r"\{\{\s*abbr\s*\|\s*([^|{}]*)\|[^{}]*\}\}", r"\1", c, flags=re.I)             # ({{abbr|Ind.|Independent}})
    m = re.search(r"\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]", c)
    rest = c[m.end():] if m else c
    pm = re.search(r"\((.*)", rest, re.S)
    if not pm: return None, None
    inner = pm.group(1)
    found = ABBR_LINK.findall(inner)
    if found: return "/".join(a for _t, a in found), "/".join(t for t, _a in found)
    txt = clean(inner).strip(" ()")
    if re.fullmatch(r"ind(ependent)?\.?", txt, re.I): return "independent", None
    if not txt or re.fullmatch(r"[a-z*]", txt): return None, None
    return txt[:60], None


def group_names(hs, pos, text=None):
    """The conference a table is under ('Eastern Conference'): the nearest enclosing heading that names one, or a bold or ';' line above it, whichever is closer."""
    hpos, hit = -1, None
    for t in reversed(heading_path(hs, pos)):
        if re.search(r"conference|league$", t, re.I) and not re.search(r"standings|playoff", t, re.I):
            hit = t; hpos = max((p for p, _lv, tt in hs if tt == t and p < pos), default=-1); break
    if text is not None:
        last = max((p for p, _lv, _t in hs if p < pos), default=-1)       # a heading after the line ends its reach
        for m in CONF_LINE.finditer(text, 0, pos):
            if m.start() > max(hpos, last): hit, hpos = m.group(1).strip(), m.start()
    return hit


def parse_standings(text, v2=False):
    """-> (rows, unparsed). A row: team, link, affiliation, division (the table's first header cell, else its caption), conference, rank_in_table and the numbers.
    A table that ranks a whole conference (headed "American Conference") is left out when the season also has the tables of its divisions."""
    hs = headings(text)
    rows, bad = [], []
    for start, end, body in leaf_tables(text):
        path = heading_path(hs, start)
        if not any(re.search(r"standings?|regular season|final", h, re.I) for h in path): continue
        cap, trs = rows_of(body)
        head = next((c for k, c in trs if k == "h"), None)
        if not head: continue
        names = [clean(re.sub(r"\{\{\s*abbr\s*\|\s*([^|{}]*)\|[^{}]*\}\}", r"\1", re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", x), flags=re.I)).upper().replace("%", "").replace(".", "").strip() for x in head]
        idx = {}
        for i, nm in enumerate(names[1:], 1):
            key = COLS.get(nm)
            if key and key not in idx: idx[key] = i
        if "w" not in idx or "l" not in idx or "gf" not in idx: continue
        ti = max(min(idx.values()) - 1, 0)                          # the club column: one before the first number (a rank column may come first)
        div = (clean(head[0]) or clean(cap) or None) if ti == 0 else (clean(cap) or clean(head[0]) or None)
        if v2 and re.fullmatch(r"(?:east coast hockey league|echl)(?: standings)?", div or "", re.I): div = "Overall"     # one table for the whole league: no division
        conf = group_names(hs, start, text)
        rank = 0
        for k, cells in trs:
            if k != "d" or len(cells) < max(idx.values()) + 1: continue
            name, link, aff = team_of(cells[ti])
            if not name: continue
            aff_links = None
            if v2: aff, aff_links = affiliation_of(cells[ti])
            vals = {key: intof(cells[i]) if re.search(r"\d", cells[i]) else None for key, i in idx.items()}
            if vals.get("w") is None or vals.get("l") is None:
                bad.append(clean(cells[ti])); continue
            rank += 1
            rows.append(dict(team=name, link=link, affiliation=aff, affiliation_links=aff_links, division=div, conference=conf, rank=rank, **vals))
    by_conf = lambda r: bool(r["division"]) and re.search(r"conference$", r["division"], re.I)
    if any(not by_conf(r) for r in rows): rows = [r for r in rows if not by_conf(r)]
    return rows, bad


# ---------------------------------------------------------------------------------------------------------------- templates
def templates(text, name):
    """Brace-matched {{name ...}} blocks -> bodies (without the outer braces)."""
    out, i, n = [], 0, len(text)
    pat = re.compile(r"\{\{\s*" + name, re.I)
    while True:
        m = pat.search(text, i)
        if not m: break
        depth, j = 0, m.start()
        while j < n - 1:
            two = text[j:j + 2]
            if two == "{{": depth += 1; j += 2; continue
            if two == "}}":
                depth -= 1; j += 2
                if depth == 0: out.append(text[m.start() + 2:j - 2]); break
                continue
            j += 1
        i = j if depth == 0 else m.end()
    return out


def kv_of(body):
    """Top-level |key=value pairs of a template body (links and nested templates keep their pipes)."""
    parts, depth, cur = [], 0, ""
    for ch_i, ch in enumerate(body):
        two = body[ch_i:ch_i + 2]
        if two in ("{{", "[["): depth += 1
        elif two in ("}}", "]]"): depth -= 1
        if ch == "|" and depth <= 0:
            parts.append(cur); cur = ""
        else:
            cur += ch
    parts.append(cur)
    kv = {}
    for p in parts[1:]:
        if "=" in p:
            k, v = p.split("=", 1)
            kv[k.strip().lower()] = v.strip()
    return kv


def section_of(text, label):
    """Text between <section begin=label /> and <section end=label /> (what {{#section:Page|label}} shows)."""
    m = re.search(r"<section\s+begin\s*=\s*['\"]?" + re.escape(label) + r"['\"]?\s*/>(.*?)<section\s+end\s*=\s*['\"]?" + re.escape(label) + r"['\"]?\s*/>", text, re.S | re.I)
    return m.group(1) if m else None


def expand_sections(text, pages):
    """Replace each {{#section:Page|label}} by that section of the page's saved text (pages: title -> text)."""
    def one(m):
        t = pages.get(m.group(1).strip().replace("_", " "))
        s = section_of(t, m.group(2).strip()) if t else None
        return s if s is not None else m.group(0)
    return re.sub(r"\{\{\s*#(?:section|lst)\s*:\s*([^|{}]+?)\s*\|\s*([^|{}]+?)\s*\}\}", one, text)


# ---------------------------------------------------------------------------------------------------------------- playoff series
BRACKET_NAME = r"(?:[^{}|\n]*[Bb]racket[^{}|\n]*|#invoke:\s*Build bracket)"


def bracket_series(text):
    """Series from bracket templates ({{8TeamBracket}}, {{AHLBracket 1992-1995}}, {{#invoke:Build bracket}}): per round, the teams listed (slots in order)
    meet two by two; the score is games won, or goals in a total-goals round.
    -> (series, unpaired): series are (round name, team A, link A, score A, team B, link B, score B)."""
    out, odd = [], []
    for body in templates(text, BRACKET_NAME):
        kv = kv_of(body)
        rounds = {}
        for k, v in kv.items():
            m = re.fullmatch(r"rd(\d+)-(team|score)(\d+)", k)
            if m: rounds.setdefault(int(m.group(1)), {}).setdefault(int(m.group(3)), {})[m.group(2)] = v
        for rd in sorted(rounds):
            name = clean(kv.get(f"rd{rd}", "")) or f"Round {rd}"
            slots = [rounds[rd][n] for n in sorted(rounds[rd]) if rounds[rd][n].get("team")]
            if len(slots) % 2:
                odd.append(f"{name}: {len(slots)} teams listed"); slots = slots[:len(slots) - 1]
            for a, b in zip(slots[0::2], slots[1::2]):
                def side(s):
                    mm = re.search(r"\[\[([^\]|#]+)(?:\|([^\]]*))?\]\]", s["team"])
                    return (clean(s["team"]), mm.group(1).strip() if mm else None, intof(clean(s.get("score", ""))))
                (ta, la, sa), (tb, lb, sb) = side(a), side(b)
                if not ta or not tb or sa is None or sb is None: continue
                out.append((name, ta, la, sa, tb, lb, sb))
    return out, odd


PROSE = re.compile(r"^[*:#\s]*(?P<w>.+?)\s+(?:defeated|beat|won (?:over|against)|eliminated)\s+(?P<l>.+?)\s*,?\s*(?:(?P<a>\d+)\s*(?:games?\s*)?(?:to|[-–])\s*(?P<b>\d+)|(?P<ga>\d+)\s*(?:goals?)?\s*to\s*(?P<gb>\d+)\s*goals)", re.I)


def prose_series(text):
    """Series told in a sentence under the playoffs heading: "A defeated B 3 games to 1." -> (round, winner, link, loser, link, winner wins, loser wins, raw)."""
    out, unparsed = [], []
    m = re.search(r"^==\s*Calder Cup[^=\n]*==\s*$(.*?)(?=^==[^=]|\Z)", text, re.M | re.S | re.I)
    if not m: return out, unparsed
    rnd = None
    for ln in m.group(1).splitlines():
        s = ln.strip()
        if not s: continue
        if s.startswith(";") or re.match(r"^={3,}", s):
            rnd = clean(s.strip(";= ")) or rnd; continue
        if not re.match(r"^[*:#]", s): continue
        if re.search(r"bye|earned|hockeydb|list of scores|^\*\s*\[http", s, re.I): continue
        links = [x.strip() for x in re.findall(r"\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]", s)]
        plain = clean(re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", s))
        pm = PROSE.match(plain)
        if not pm or not pm.group("a") or len(links) < 2:
            unparsed.append(s[:300]); continue
        out.append((rnd or "Playoffs", pm.group("w").strip("*: "), links[0], pm.group("l").strip(), links[1], int(pm.group("a")), int(pm.group("b")), s[:300]))
    return out, unparsed


def champion_of(text):
    """-> (name, link) from the infobox's finals_champ."""
    m = re.search(r"^\s*\|\s*finals_champ\s*=\s*(.+)$", text, re.I | re.M)
    if not m: return None, None
    t = m.group(1)
    mm = re.search(r"\[\[([^\]|#]+)(?:\|([^\]]*))?\]\]", t)
    name = clean(t)
    return (name or None), (mm.group(1).strip() if mm else None)


def infobox_value(text, key):
    m = re.search(r"^\s*\|\s*" + key + r"\s*=\s*(.+)$", text, re.I | re.M)
    return clean(m.group(1)) if m and clean(m.group(1)) else None


# ---------------------------------------------------------------------------------------------------------------- playoff games
DATE_RE = re.compile(r"^\W*(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:\s*,?\s*(\d{4}))?", re.I)
SCORE_RE = re.compile(r"(\d{1,2})\s*" + DASH + r"\s*(\d{1,2})")


def playoff_games(text, season):
    """Games from each {{NHLPlayoffs}} block. The two numbers of scoreN read home-visitor, or visitor-home when the block says homeright=yes;
    homeN (1 or 2) names the home team when the block gives it. A block that gives neither homeN nor wonN for a game does not say whose points are whose:
    that game comes back in `bad`, not guessed.
    -> (games, bad): game = dict(team1, team2, date, home, away, home_pts, away_pts, overtime, src)."""
    games, bad = [], []
    for body in templates(text, r"NHLPlayoffs"):
        kv = kv_of(body)
        t1, t2 = clean(kv.get("team1", "")), clean(kv.get("team2", ""))
        if not t1 or not t2: continue
        first_is_home = kv.get("homeright", "").strip().lower() not in ("yes", "y", "1", "true")
        for n in range(1, 9):
            sc, dt = kv.get(f"score{n}"), kv.get(f"date{n}")
            if not sc or not dt: continue
            sc_c = clean(sc.replace("&ndash;", "–").replace("&mdash;", "—"))
            sm, dm = SCORE_RE.search(sc_c), DATE_RE.match(clean(dt))
            if not sm or not dm:
                bad.append(f"{t1} v {t2} game {n}: {dt} / {sc}"); continue
            mon = next(v for k, v in MONTHS.items() if k.startswith(dm.group(1).lower()[:3]))
            yr = int(dm.group(3)) if dm.group(3) else (season if mon >= 8 else season + 1)
            try: d = datetime.date(yr, mon, int(dm.group(2)))
            except ValueError:
                bad.append(f"{t1} v {t2} game {n}: bad date {dt}"); continue
            x, y = int(sm.group(1)), int(sm.group(2))
            hs, won = kv.get(f"home{n}", "").strip(), kv.get(f"won{n}", "").strip()
            if x == y:
                bad.append(f"{t1} v {t2} game {n}: tied score {sc_c}"); continue
            if hs in ("1", "2"):
                first = int(hs) if first_is_home else 3 - int(hs)       # which team's points come first
                if won in ("1", "2") and (first if x > y else 3 - first) != int(won):
                    bad.append(f"{t1} v {t2} game {n}: winner and score disagree {sc_c} won{n}={won} home{n}={hs}"); continue
            elif won in ("1", "2"):
                first = int(won) if x > y else 3 - int(won)
            else:
                bad.append(f"{t1} v {t2} game {n}: home side unknown {dt} / {sc_c}"); continue
            home_team = first if first_is_home else 3 - first
            pts = {first: x, 3 - first: y}
            names = {1: t1, 2: t2}
            ot = bool(re.search(r"\bS?OT\b|overtime|shootout|\bSO\b", sc_c, re.I)) or kv.get(f"ot{n}", "").strip().lower() not in ("", "0", "no", "n")
            games.append(dict(team1=t1, team2=t2, date=d, home=names[home_team], away=names[3 - home_team],
                              home_pts=pts[home_team], away_pts=pts[3 - home_team], overtime=ot,
                              src=f"NHLPlayoffs {t1} v {t2} g{n} {dt} {sc_c}"[:300]))
    return games, bad


# ---------------------------------------------------------------------------------------------------------------- bracket templates by name
def template_body(text):
    """What a template page shows when another page transcludes it: the <includeonly> part if there is one, else the page without its <noinclude> parts."""
    inc = re.findall(r"<includeonly>(.*?)</includeonly>", text, re.S | re.I)
    if inc: return "".join(inc)
    return re.sub(r"<noinclude>.*?</noinclude>", "", text, flags=re.S | re.I)


def expand_named(text, tpls):
    """Replace {{2013 Kelly Cup Playoffs}} by that template's body (tpls: title -> wikitext)."""
    def one(m):
        t = tpls.get(m.group(1).strip())
        return template_body(t) if t else m.group(0)
    return re.sub(r"\{\{\s*(\d{4} (?:Kelly|Riley) Cup [Pp]layoffs)\s*\}\}", one, text)


# ---------------------------------------------------------------------------------------------------------------- series told by game blocks and game tables
SERIES_HEAD = re.compile(r"\s(?:vs\.?|v\.?)\s")
ROOT_HEAD = re.compile(r"^(?:\d{4}\s+)?(?:(?:Kelly|Riley|Calder)\s+Cup\s+)?(?:play-?offs?|postseason)(?:\s+(?:brackets?|format|seeds?|results))?$|^playoff\s+(?:brackets?|format|seeds?)$", re.I)
SIDE_HEAD = re.compile(r"^(?:american|national|eastern|western|northern|southern|north|south|east|west|central|atlantic|pacific|mountain)(?:\s+(?:conference|division))?$", re.I)
WINS_SERIES = re.compile(r"(.+?)\s+(?:wins?|won|defeats?|defeated)\s+(?:the\s+)?(?:best[- ]of[- ]\w+\s+)?series\b[^0-9]*?(\d+)\s*(?:–|—|-|to)\s*(\d+)", re.I)


def templates_at(text, name):
    """Brace-matched {{name ...}} blocks -> (position, body)."""
    out, i, n = [], 0, len(text)
    pat = re.compile(r"\{\{\s*" + name, re.I)
    while True:
        m = pat.search(text, i)
        if not m: break
        depth, j = 0, m.start()
        while j < n - 1:
            two = text[j:j + 2]
            if two == "{{": depth += 1; j += 2; continue
            if two == "}}":
                depth -= 1; j += 2
                if depth == 0: out.append((m.start(), text[m.start() + 2:j - 2])); break
                continue
            j += 1
        i = j if depth == 0 else m.end()
    return out


def round_of(hs, pos):
    """-> (round name, group): the heading a series sits under ("American Conference quarterfinals"), and the outermost round heading it belongs to ("First round")."""
    path = [t for t in heading_path(hs, pos) if not SERIES_HEAD.search(" " + t + " ")]
    body = [t for t in path if not ROOT_HEAD.match(t)]
    if not body: return "Playoffs", "Playoffs"
    name = body[-1]
    if SIDE_HEAD.match(name) and len(body) > 1: name = body[-2]
    return re.sub(r"^\d{4}\s+", "", name), re.sub(r"^\d{4}\s+", "", body[0])


def loose(x):
    return re.sub(r"[^a-z]", "", (x or "").lower())


def which_side(name, a, b):
    """0 or 1: which of the two series teams a (shortened) name stands for, else None."""
    n, la, lb = loose(name), loose(a), loose(b)
    if not n: return None
    ha, hb = n == la or la.startswith(n) or n.startswith(la), n == lb or lb.startswith(n) or n.startswith(lb)
    if ha != hb: return 0 if ha else 1
    ta = {w for w in re.findall(r"[a-z]{4,}", (a or "").lower())}; tb = {w for w in re.findall(r"[a-z]{4,}", (b or "").lower())}
    tn = {w for w in re.findall(r"[a-z]{4,}", (name or "").lower())}
    if (tn & ta) and not (tn & tb): return 0
    if (tn & tb) and not (tn & ta): return 1
    return None


def block_series(text):
    """The series of {{NHLPlayoffs}} blocks (one per series, with the "X wins series 4 – 3" line), each under its round heading.
    -> (series, bad): series = dict(round, group, team1, team2, wins1, wins2, src)."""
    hs = headings(text)
    out, bad = [], []
    for pos, body in templates_at(text, "NHLPlayoffs"):
        kv = kv_of(body)
        t1, t2 = clean(kv.get("team1", "")), clean(kv.get("team2", ""))
        if not t1 or not t2: continue
        rd, grp = round_of(hs, pos)
        st = clean(kv.get("series", "").replace("&ndash;", "–").replace("&mdash;", "—"))
        m = WINS_SERIES.search(st)
        w1 = w2 = None
        if m:
            side = which_side(m.group(1), t1, t2)
            a, b = int(m.group(2)), int(m.group(3))
            if side is not None: w1, w2 = (a, b) if side == 0 else (b, a)
        if w1 is None:
            won = [kv.get(f"won{n}", "").strip() for n in range(1, 10) if kv.get(f"score{n}")]
            if won and all(x in ("1", "2") for x in won): w1, w2 = won.count("1"), won.count("2")
        if w1 is None or w1 == w2:
            bad.append(f"{rd}: {t1} v {t2}: no result ({st[:60]})"); continue
        out.append(dict(round=rd, group=grp, team1=t1, team2=t2, wins1=w1, wins2=w2, src=f"NHLPlayoffs {t1} v {t2}: {st}"[:300]))
    return out, bad


def table_games(text, season):
    """Games and series from the playoff tables of the 1990s and 2000s articles: a table headed "A vs. B" with Date, Away and Home columns ("Charlotte 2", "'''S. Carolina 4'''",
    an OT cell where it went to overtime) and a last row "A wins series 3–0".
    -> (series, games, bad): series as in block_series; game = dict(home, away, date, home_pts, away_pts, overtime, src, team1, team2) with the series' own names for the clubs."""
    hs = headings(text)
    series, games, bad = [], [], []
    for start, end, body in leaf_tables(text):
        cap, trs = rows_of(body)
        hrows = [c for k, c in trs if k == "h"]
        if not hrows or len(hrows[0]) != 1: continue
        title = clean(hrows[0][0])
        pm = re.match(r"^(?P<prefix>.*?\b(?:Quarterfinals?|Semifinals?|Finals?|Wild ?cards?|Round|Playoffs?)\b)?\s*(?P<rest>.*)$", title)
        rest = re.sub(r"\(\s*[A-Za-z]{0,3}\.?\s*\d+\s*\)", "", pm.group("rest")).strip()
        m = re.match(r"^(.+?)\s+vs\.?\s+(.+?)$", rest)
        if not m or len(hrows) < 2 or not re.search(r"date", " ".join(hrows[1]), re.I): continue
        a, b = m.group(1).strip(), m.group(2).strip()
        rd, grp = round_of(hs, start)
        if pm.group("prefix"): rd = re.sub(r"^\d{4}\s+", "", pm.group("prefix").strip())
        elif clean(cap): rd = clean(cap)
        res, g_here = None, []
        for k, cells in trs:
            if k != "d": continue
            if len(cells) == 1:
                mm = WINS_SERIES.search(clean(cells[0]).replace("&ndash;", "–"))
                if mm: res = (mm.group(1), int(mm.group(2)), int(mm.group(3)))
                continue
            dm = DATE_RE.match(clean(cells[0]))
            if not dm or len(cells) < 3: continue
            sides = []
            for c in cells[1:3]:
                cc = clean(c)
                sm = re.match(r"^(.*?)\s+(\d{1,2})\s*(?:\(?\b(?:S?OT|SO)\b\)?)?$", cc) or re.match(r"^(\d{1,2})\s+(.*?)\s*(?:\(?\b(?:S?OT|SO)\b\)?)?$", cc)
                if not sm: sides = []; break
                sides.append((sm.group(1).strip(), int(sm.group(2))) if sm.group(2).isdigit() else (sm.group(2).strip(), int(sm.group(1))))
            if len(sides) != 2:
                bad.append(f"{a} v {b}: {clean(' | '.join(cells))[:80]}"); continue
            sa, sb = which_side(sides[0][0], a, b), which_side(sides[1][0], a, b)
            if sa is None or sb is None or sa == sb:
                bad.append(f"{a} v {b}: clubs not told apart: {sides[0][0]} / {sides[1][0]}"); continue
            mon = next(v for k2, v in MONTHS.items() if k2.startswith(dm.group(1).lower()[:3]))
            yr = int(dm.group(3)) if dm.group(3) else (season if mon >= 8 else season + 1)
            try: d = datetime.date(yr, mon, int(dm.group(2)))
            except ValueError:
                bad.append(f"{a} v {b}: bad date {cells[0]}"); continue
            names = (a, b)
            away, home = names[sa], names[sb]
            ot = bool(re.search(r"\d?\bS?OT\b|\bSO\b|overtime|shootout|\dOT", " ".join(cells[1:]), re.I)) or len(cells) > 3 and bool(re.search(r"OT", clean(cells[3]), re.I))
            g_here.append(dict(team1=a, team2=b, date=d, home=home, away=away, home_pts=sides[1][1], away_pts=sides[0][1], overtime=ot, src=f"game table {a} v {b} {clean(cells[0])}"[:300]))
        games += g_here
        if res:
            side = which_side(res[0], a, b)
            if side is None: bad.append(f"{a} v {b}: winner {res[0]} not told apart"); continue
            w1, w2 = (res[1], res[2]) if side == 0 else (res[2], res[1])
            if w1 != w2: series.append(dict(round=rd, group=grp, team1=a, team2=b, wins1=w1, wins2=w2, src=f"game table {a} v {b}: {res[0]} wins {res[1]}-{res[2]}"[:300]))
    return series, games, bad


def listed_champions(text):
    """The champion column of the league's "List of ... seasons" table -> {start year: (name, link)}."""
    out = {}
    for _s, _e, body in leaf_tables(text):
        _cap, trs = rows_of(body)
        for k, cells in trs:
            if k != "d" or len(cells) < 3: continue
            ym = re.search(r"\[\[(\d{4})[–-]\d{2,4} [^\]|]*season", " ".join(cells[:3]))
            if not ym: continue
            last = cells[-1]
            lm = re.search(r"\[\[([^\]|#]+)(?:\|([^\]]*))?\]\]", last)
            name = clean(last)
            if name: out[int(ym.group(1))] = (name, lm.group(1).strip() if lm else None)
    return out


MONTH_WORDS = r"(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)"


def tidy_round(name):
    """A round as readers name it: no dates ("April 2–8"), no "(Best of 5)", the 1990s spellings made one ("Divisional", "Wildcard", "Semis", "1st Round", "Kelley")."""
    n = clean(name or "")
    n = re.sub(r"\(\s*best of \d+\s*\)", "", n, flags=re.I)
    n = re.sub(r"\s+" + MONTH_WORDS + r"\.?\s+\d{1,2}\s*(?:–|—|-)?\s*(?:" + MONTH_WORDS + r"\.?\s+)?\d{0,2}\s*$", "", n, flags=re.I)
    n = re.sub(r"\bKelley\b", "Kelly", n)
    n = re.sub(r"\bDivisional\b", "Division", n, flags=re.I)
    n = re.sub(r"\bWild-?\s?cards?\b", "Wild Card", n, flags=re.I)
    n = re.sub(r"\bSemis\b", "Semifinals", n, flags=re.I)
    n = re.sub(r"\bQuarters\b", "Quarterfinals", n, flags=re.I)
    n = re.sub(r"\b1st\b", "First", n, flags=re.I)
    n = re.sub(r"\b2nd\b", "Second", n, flags=re.I)
    n = re.sub(r"\s+", " ", n).strip(" -–:")
    return (n[:1].upper() + n[1:]) if n else n


def round_stage(name):
    """How far into the playoffs a round is, from its name (0 wild card ... 6 the final), so the two conferences' brackets, which name their rounds differently, line up; None when it is not told."""
    n = (name or "").lower()
    if re.search(r"wild ?card", n): return 0
    if re.search(r"(kelly|riley) cup", n) and re.search(r"\bfinals?\b", n) or re.fullmatch(r"(?:the )?finals?", n) or re.fullmatch(r"(?:riley|kelly) cup", n): return 6
    if re.search(r"conference final", n): return 5
    if re.search(r"(?:division|regional) final", n): return 4
    if re.search(r"semifinal|second round", n): return 3
    if re.search(r"quarterfinal", n): return 2
    if re.search(r"first round|round 1", n): return 1
    return None
