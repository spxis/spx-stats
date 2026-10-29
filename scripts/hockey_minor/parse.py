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


def group_names(hs, pos):
    """The enclosing conference heading of a table ('Eastern Conference'), else None."""
    for t in reversed(heading_path(hs, pos)):
        if re.search(r"conference|league$", t, re.I) and not re.search(r"standings|playoff", t, re.I): return t
    return None


def parse_standings(text):
    """-> (rows, unparsed). A row: team, link, affiliation, division (the table's first header cell), conference, rank_in_table and the numbers."""
    hs = headings(text)
    rows, bad = [], []
    for start, end, body in wikitables(text):
        path = heading_path(hs, start)
        if not any(re.search(r"standings?|regular season|final", h, re.I) for h in path): continue
        _cap, trs = rows_of(body)
        head = next((c for k, c in trs if k == "h"), None)
        if not head: continue
        names = [clean(re.sub(r"\{\{\s*abbr\s*\|\s*([^|{}]*)\|[^{}]*\}\}", r"\1", x, flags=re.I)).upper().replace("%", "").replace(".", "").strip() for x in head]
        idx = {}
        for i, nm in enumerate(names[1:], 1):
            key = COLS.get(nm)
            if key and key not in idx: idx[key] = i
        if "w" not in idx or "l" not in idx or "gf" not in idx: continue
        div = clean(head[0]) or None
        conf = group_names(hs, start)
        rank = 0
        for k, cells in trs:
            if k != "d" or len(cells) < max(idx.values()) + 1: continue
            name, link, aff = team_of(cells[0])
            if not name: continue
            vals = {key: intof(cells[i]) if re.search(r"\d", cells[i]) else None for key, i in idx.items()}
            if vals.get("w") is None or vals.get("l") is None:
                bad.append(clean(cells[0])); continue
            rank += 1
            rows.append(dict(team=name, link=link, affiliation=aff, division=div, conference=conf, rank=rank, **vals))
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
