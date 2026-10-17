#!/usr/bin/env python3
"""Parse PWHL wikitext (English Wikipedia) into games and standings.

The season article holds the whole regular-season log ({{Game log start}} / {{Game log section start}},
Visitor | Score | Home | OT) and a sports-table standings module (style=WL OT). Playoff games are
{{NHLPlayoffs}} on the season article (2023-24) or on '<year> PWHL playoffs'. Rows nothing here can
read come back as unparsed. Recap URLs are not followed.
"""
import datetime, re

MONTHS = {m: i + 1 for i, m in enumerate("january february march april may june july august september october november december".split())}
MON_RE = r"(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?"
DATE_RE = re.compile(r"^\W*" + MON_RE + r"\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:\s*,?\s*(\d{4}))?", re.I)
DASH = r"[–—\-]"
SCORE_RE = re.compile(r"(\d{1,2})\s*" + DASH + r"\s*(\d{1,2})")


def clean(s):
    s = re.sub(r"<ref[^>]*?/>|<ref[^>]*>.*?</ref>", "", s, flags=re.S)
    s = re.sub(r"<br\s*/?>", " ", s)
    s = re.sub(r"<!--.*?-->", "", s, flags=re.S)
    s = s.replace("'''", "").replace("''", "")
    return s.lstrip("| ").strip()


def link_of(cell):
    m = re.search(r"\[\[([^\]|]+)(?:\|([^\]]*))?\]\]", cell)
    plain = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", cell)
    plain = re.sub(r"\{\{[^}]*\}\}|'''|''", "", plain)
    return (m.group(1).strip() if m else None), plain.strip()


def row_cells(lines):
    cells = []
    for ln in lines:
        if cells and ln.startswith("|") and (cells[-1].count("{{") > cells[-1].count("}}") or cells[-1].count("[[") > cells[-1].count("]]")):
            cells[-1] += " " + ln.strip()
        elif ln.startswith("|"):
            for c in ln[1:].split("||"): cells.append(c.strip())
        elif cells:
            cells[-1] += " " + ln.strip()
    return cells


def year_for(season, month):
    """Hockey two-year season: Aug–Dec is the start year, Jan–Jul the next."""
    return season if month >= 8 else season + 1


def club_from_link(link, text):
    """Canonical club name: the '<years> <club> season' title, else the cell's plain text."""
    if link:
        m = re.match(r"^\d{4}(?:[–-]\d{2})? (.+) season$", link)
        if m: return " ".join(m.group(1).replace("\xa0", " ").split())
    t = re.sub(r"\s+", " ", (text or "").replace("\xa0", " ").strip().strip("."))
    return t or None


def date_of(cell, season, carry):
    c = clean(re.sub(r"rowspan\s*=\s*\d+\s*\|", "", cell, flags=re.I))
    m = DATE_RE.match(re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", c))
    if not m: return carry
    key = m.group(1).lower()
    mon = next(v for k, v in MONTHS.items() if k.startswith(key[:3]))
    day = int(m.group(2))
    yr = int(m.group(3)) if m.lastindex and m.group(3) else year_for(season, mon)
    try:
        return datetime.date(yr, mon, day)
    except ValueError:
        return None


def parse_game_logs(text, season):
    """Regular-season (and playoff log) rows from {{Game log start}} blocks. Pre-season sections are skipped."""
    games, bad = [], []
    lines = text.split("\n")
    i, n = 0, len(lines)
    skip = carry = None
    in_log = False
    phase = "regular"
    while i < n:
        ln = lines[i]
        mh = re.match(r"^(={2,4})\s*(.*?)\s*\1\s*$", ln)
        if mh:
            t = mh.group(2).lower()
            skip = bool(re.search(r"pre-?season|exhibition|preseason", t))
            phase = "playoffs" if re.search(r"playoff|postseason|finals|walter", t) else "regular"
            i += 1
            continue
        ms = re.match(r"\{\{\s*Game log(?: section)? start\s*\|(.*)", ln, re.I)
        if ms:
            args = ms.group(1)
            in_log = True
            title = ""
            tm = re.search(r"title\s*=\s*([^|]+)", args, re.I)
            if tm: title = tm.group(1)
            if re.search(r"pre-?season|exhibition|camp", (title + " " + args), re.I):
                skip = True
            elif re.search(r"playoff|finals|walter", title, re.I):
                skip, phase = False, "playoffs"
            elif re.search(r"regular", title, re.I):
                skip, phase = False, "regular"
            elif title.strip() and re.fullmatch(
                    r"(January|February|March|April|May|June|July|August|September|October|November|December)",
                    title.strip(), re.I):
                skip = False
            i += 1
            continue
        if re.match(r"\{\{\s*Game log end", ln, re.I):
            in_log = False
            i += 1
            continue
        if re.match(r"\{\{\s*Game log section end", ln, re.I):
            i += 1
            continue
        if ln.startswith("|-"):
            j = i + 1
            blk = []
            while j < n and not lines[j].startswith("|-") and not lines[j].startswith("|}") and not lines[j].startswith("{{") \
                    and not re.match(r"^={2,4}", lines[j]):
                blk.append(lines[j]); j += 1
            cells = row_cells(blk)
            if skip or not in_log:
                i = j
                continue
            g = parse_log_row(cells, season, phase, carry)
            if g == "bad":
                bad.append(" | ".join(cells)[:300])
            elif g:
                carry = g["date"]
                games.append(g)
            elif cells:
                d = date_of(cells[0], season, carry) if cells else carry
                if d: carry = d
            i = j
            continue
        i += 1
    return games, bad


def parse_log_row(cells, season, phase, carry):
    """A Game-log row: Date | Time | Visitor | Score | Home | OT | Notes."""
    if len(cells) < 4: return None
    # drop a leading time-only cell when rowspan already consumed the date
    di = next((k for k, c in enumerate(cells[:3]) if DATE_RE.match(clean(re.sub(r"rowspan\s*=\s*\d+\s*\|", "", c, flags=re.I)))), None)
    if di is None:
        d = carry
        rest = cells[:]
        if rest and re.match(r"^\s*\d{1,2}:\d{2}", clean(rest[0])): rest = rest[1:]
    else:
        d = date_of(cells[di], season, carry)
        rest = cells[di + 1:]
        if rest and re.match(r"^\s*\d{1,2}:\d{2}", clean(rest[0])): rest = rest[1:]
    if d is None or len(rest) < 3: return None
    vlink, vtxt = link_of(rest[0])
    slink, stxt = link_of(rest[1])
    hlink, htxt = link_of(rest[2])
    sc = SCORE_RE.search(clean(rest[1]))
    if not sc:
        if re.search(r"TBD|cancelled|canceled|postponed", clean(rest[1]), re.I) or not clean(rest[1]):
            return None
        return "bad"
    away, home = club_from_link(vlink, vtxt), club_from_link(hlink, htxt)
    if not away or not home: return "bad"
    ot_cell = clean(rest[3]) if len(rest) > 3 else ""
    notes = clean(rest[4]) if len(rest) > 4 else ""
    so = bool(re.search(r"\bSO\b", ot_cell))
    ot = so or bool(re.search(r"\bOT\b", ot_cell))
    neutral = bool(re.match(r"^@", notes or ""))
    return dict(phase=phase, round=None, date=d, home=home, away=away,
                home_pts=int(sc.group(2)), away_pts=int(sc.group(1)),
                ot=ot, so=so, neutral=neutral, views=1, conflict=None,
                src=" | ".join(cells)[:400])


def _templates(text, name):
    """Brace-matched `{{name ...}}` blocks: (start, end, body). Nested templates are included."""
    out, i, n = [], 0, len(text)
    pat = re.compile(r"\{\{\s*" + name, re.I)
    while True:
        m = pat.search(text, i)
        if not m: break
        depth, j = 0, m.start()
        while j < n - 1:
            if text[j:j + 2] == "{{":
                depth += 1; j += 2; continue
            if text[j:j + 2] == "}}":
                depth -= 1; j += 2
                if depth == 0:
                    out.append((m.start(), j, text[m.start():j])); break
                continue
            j += 1
        i = j if depth == 0 else m.end()
    return out


CLUB_MARK = re.compile(r"PWHL|Fleet|Frost|Victoire|Sirens|Charge|Sceptres|Torrent|Goldeneyes|Boston|Minnesota|Montreal|New York|Ottawa|Toronto|Seattle|Vancouver", re.I)


def parse_nhl_playoffs(text, season):
    """Games from each {{NHLPlayoffs}} block. Score is visitor–home; homeN is 1 or 2."""
    games, bad = [], []
    for start, end, raw in _templates(text, r"NHLPlayoffs"):
        body = raw[2:]
        kv = {}
        for k, v in re.findall(r"\|\s*([A-Za-z0-9_-]+)\s*=\s*(.*)", body):
            kv[k.strip().lower()] = v.strip()
        t1 = club_from_link(*link_of(kv.get("team1", ""))) or clean(kv.get("team1", ""))
        t2 = club_from_link(*link_of(kv.get("team2", ""))) or clean(kv.get("team2", ""))
        if not t1 or not t2 or not CLUB_MARK.search(t1) or not CLUB_MARK.search(t2):
            continue
        heading = ""
        hs = [h.group(2) for h in re.finditer(r"^(={2,4})\s*(.*?)\s*\1\s*$", text[:start], re.M)]
        for h in reversed(hs):
            if re.search(r"final", h, re.I) and not re.search(r"semi", h, re.I):
                heading = h; break
            if re.search(r"semi", h, re.I):
                heading = h; break
        if not heading and hs: heading = hs[-1]
        if heading and re.search(r"all-?star|showcase", heading, re.I): continue
        rnd = "Semifinals" if re.search(r"semi", heading, re.I) else (
            "Walter Cup Final" if re.search(r"final", heading, re.I) else heading or "Playoffs")
        for n in range(1, 8):
            sc = kv.get(f"score{n}")
            dt = kv.get(f"date{n}")
            if not sc or not dt: continue
            sm = SCORE_RE.search(clean(sc))
            dm = DATE_RE.match(clean(re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", dt)))
            if not sm or not dm:
                bad.append(f"game {n}: {dt} {sc}"); continue
            key = dm.group(1).lower()
            mon = next(v for k2, v in MONTHS.items() if k2.startswith(key[:3]))
            day = int(dm.group(2))
            yr = int(dm.group(3)) if dm.lastindex and dm.group(3) else year_for(season, mon)
            try:
                d = datetime.date(yr, mon, day)
            except ValueError:
                bad.append(f"game {n} date {dt}"); continue
            home_side = kv.get(f"home{n}", "1").strip()
            vis, hm = (int(sm.group(1)), int(sm.group(2)))
            if home_side == "2":
                home, away, hp, ap = t2, t1, hm, vis
            else:
                home, away, hp, ap = t1, t2, hm, vis
            ot_n = kv.get(f"ot{n}", "").strip()
            ot = bool(ot_n and ot_n not in ("0", "no"))
            games.append(dict(phase="playoffs", round=rnd, date=d, home=home, away=away,
                              home_pts=hp, away_pts=ap, ot=ot, so=False, neutral=False,
                              views=1, conflict=None, src=f"NHLPlayoffs {t1} vs {t2} g{n} {dt} {sc}"[:400]))
    return games, bad


def parse_standings_module(text, src_name=""):
    """style=WL OT sports-table: win / OTwin / OTloss / loss / gf / ga. Wins here are regulation+OT."""
    rows = []
    for blk in re.finditer(r"\{\{#invoke:Sports table\|main\|(.*?)\n\}\}", text, re.S | re.I):
        body = blk.group(1)
        kv = {k: v.strip() for k, v in re.findall(r"\|?\s*([A-Za-z_0-9]+)\s*=\s*((?:\[\[[^\]]*\]\]|[^|\n])*)", body)}
        keys = []
        if kv.get("team_order"):
            keys = [x.strip() for x in kv["team_order"].split(",") if x.strip()]
        else:
            keys = [k[4:] for k in kv if re.fullmatch(r"name_.+", k)]
        for key in keys:
            nm = kv.get("name_" + key, key)
            link = re.search(r"\[\[([^\]|#]+)", nm)
            team = club_from_link(link.group(1) if link else None, re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", nm))
            if not team: continue
            rw = _int(kv.get("win_" + key))
            otw = _int(kv.get("OTwin_" + key)) or 0
            otl = _int(kv.get("OTloss_" + key)) or 0
            rl = _int(kv.get("loss_" + key))
            if rw is None or rl is None: continue
            w = rw + otw
            pts = 3 * rw + 2 * otw + otl
            rows.append({"team": team, "w": w, "l": rl, "otl": otl, "pts": pts,
                         "gp": w + rl + otl, "gf": _int(kv.get("gf_" + key)), "ga": _int(kv.get("ga_" + key)),
                         "division": src_name or "PWHL standings", "src": f"{key} {w}-{rl}-{otl} {pts}"})
    return rows


def _int(s):
    if s is None or s == "": return None
    m = re.match(r"^\s*(\d+)", s)
    return int(m.group(1)) if m else None


def champion_of(text):
    m = re.search(r"^\s*\|\s*finals_champ\s*=\s*(.+)$", text, re.I | re.M)
    if not m: return None
    t = m.group(1).strip()
    t = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", t)
    t = re.sub(r"\{\{[^}]*\}\}|<[^>]*>|'''|''", "", t)
    t = re.sub(r"\s+", " ", t).strip(" |")
    return t or None


def check(games, std):
    """Published W-L-OTL against the regular-season games: a regulation loss is L, OT/SO loss is OTL."""
    tot = {}
    for g in games:
        if g["phase"] != "regular": continue
        for side, pf, pa in (("home", g["home_pts"], g["away_pts"]), ("away", g["away_pts"], g["home_pts"])):
            t = tot.setdefault(g[side], [0, 0, 0])  # w, l, otl
            if pf > pa: t[0] += 1
            elif g.get("ot") or g.get("so"): t[2] += 1
            else: t[1] += 1
    out = []
    seen = set()
    for r in std:
        if r["team"] in seen: continue
        seen.add(r["team"])
        t = tot.get(r["team"], [0, 0, 0])
        pub = (r.get("w"), r.get("l"), r.get("otl"))
        if tuple(t) != pub: out.append((r["team"], pub, tuple(t)))
    return out
