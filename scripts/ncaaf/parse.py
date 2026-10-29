#!/usr/bin/env python3
"""Parse English Wikipedia's NCAA Division I-A / FBS football pages (wikitext, CC BY-SA 4.0) into rows.

Three kinds of page:
  * a season article ("2005 NCAA Division I-A football season"): the infobox (champions, number of teams);
  * its conference standings templates ({{CFB standings start|...}} / {{CFB standings entry|...}}): the teams of the division, their conference,
    division, conference record, overall record and the champion flags;
  * a team-season article ("2005 Texas Longhorns football team"): the infobox (conference, record, bowl) and the {{CFB schedule entry}} rows.
Every game between two teams of the division is told by both teams' articles; pair() puts the two views together. A game against a team outside
the division (FCS and lower) is told by one article only and is kept, the opponent flagged outside.
Links to other websites (the recap and statistics references) are dropped: no address and no value from them is read or kept.
"""
import collections, datetime, re, unicodedata

MONTHS = {m: i for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], 1)}
DASH = "[–—−\\-―‒‑‐]"


# ---------------------------------------------------------------- wikitext helpers
def strip_junk(s):
    s = re.sub(r"<!--.*?-->", "", s, flags=re.S)
    s = re.sub(r"<ref\b[^>/]*/\s*>", "", s)
    s = re.sub(r"<ref\b[^>]*>.*?</ref\s*>", "", s, flags=re.S | re.I)
    return s


def split_args(s):
    """Split on the '|' that are not inside [[ ]], {{ }}."""
    out, cur, i, depth_b, depth_c = [], [], 0, 0, 0
    while i < len(s):
        two = s[i:i + 2]
        if two == "[[": depth_b += 1; cur.append(two); i += 2; continue
        if two == "]]": depth_b = max(0, depth_b - 1); cur.append(two); i += 2; continue
        if two == "{{": depth_c += 1; cur.append(two); i += 2; continue
        if two == "}}": depth_c = max(0, depth_c - 1); cur.append(two); i += 2; continue
        if s[i] == "|" and depth_b == 0 and depth_c == 0: out.append("".join(cur)); cur = []; i += 1; continue
        cur.append(s[i]); i += 1
    out.append("".join(cur))
    return out


def templates(text, name_re):
    """Top-level (not nested in another match) templates whose name matches name_re: -> [(name, inner text)]. Brace-balanced."""
    out, i, n = [], 0, len(text)
    rx = re.compile(r"\{\{\s*(" + name_re + r")\b", re.I)
    while True:
        m = rx.search(text, i)
        if not m: break
        j, depth = m.start(), 0
        k = j
        while k < n:
            if text.startswith("{{", k): depth += 1; k += 2; continue
            if text.startswith("}}", k):
                depth -= 1; k += 2
                if depth == 0: break
                continue
            k += 1
        out.append((m.group(1), text[j + 2:k - 2]))
        i = k
    return out


def args_of(inner):
    """-> (name, positional list, named dict) of a template's inner text."""
    parts = split_args(inner)
    pos, named = [], {}
    for p in parts[1:]:
        m = re.match(r"\s*([A-Za-z_/ .0-9-]+?)\s*=(.*)$", p, re.S)
        if m and not p.lstrip().startswith(("[[", "{{")): named[m.group(1).strip().lower()] = m.group(2).strip()
        else: pos.append(p.strip())
    return parts[0].strip(), pos, named


def clean(s):
    """Plain text of a wikitext fragment: links to their text, formatting and small templates removed."""
    if s is None: return ""
    s = strip_junk(s)
    s = re.sub(r"\{\{\s*(?:ndash|endash|en dash|mdash)\s*\}\}|&ndash;|&mdash;", "–", s, flags=re.I)          # a score written 27{{ndash}}34
    for _ in range(4):
        s = re.sub(r"\{\{\s*(?:nowrap|nobr|no wrap)\s*\|(?:1=)?((?:[^{}]|\{\{[^{}]*\}\})*)\}\}", r"\1", s, flags=re.I)         # the whole content: {{nowrap|[[2025 Sugar Bowl|Sugar Bowl–CFP Quarterfinal]]}}
        s = re.sub(r"\{\{\s*(?:abbr|small|sup|efn)\s*\|([^{}|]*)[^{}]*\}\}", lambda m: m.group(1) if not re.match(r"\s*(?:No\.|Number)\s*$", m.group(1)) else "", s, flags=re.I)
        s = re.sub(r"\{\{[^{}]*\}\}", "", s)
    s = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", s)
    s = re.sub(r"<br\s*/?>", " ", s, flags=re.I)
    s = re.sub(r"<[^>]+>", "", s)
    s = re.sub(r"'{2,}", "", s)
    return re.sub(r"\s+", " ", s.replace("&nbsp;", " ").replace("\xa0", " ")).strip()


def first_link(s):
    """(target, text) of the first [[wikilink]] in s, or (None, clean(s))."""
    m = re.search(r"\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]", strip_junk(s or ""))
    if not m: return None, clean(s)
    return m.group(1).strip(), clean(m.group(2) or m.group(1))


def team_name_of_title(t, y=None):
    """'2005 Texas Longhorns football team' -> 'Texas Longhorns'; a program article 'Texas Longhorns football' -> 'Texas Longhorns'."""
    t = re.sub(r"^\d{4}[–-]?\d{0,4}\s+", "", t.strip())
    t = re.sub(r"\s+football(?: team)?(?: season)?$", "", t)
    t = re.sub(r"\s*\((?:American football|college football)\)$", "", t)
    return t.strip()


def conf_of_template(title):
    """'2005 Big 12 Conference football standings' -> 'Big 12 Conference'; the independents' records -> 'Independents'."""
    t = re.sub(r"^Template:", "", title).strip()
    if re.search(r"independent", t, re.I): return "Independents"
    t = re.sub(r"^\d{4}\s+", "", t)
    t = re.sub(r"\s+football (?:standings|records)$", "", t)
    return t.strip()


# ---------------------------------------------------------------- season article
def parse_season(text):
    out = {}
    for name, inner in templates(text, r"Infobox NCAA Division I[^|{}]*season"):
        n, pos, named = args_of(inner)
        out["number_of_teams"] = named.get("number_of_teams")
        out["system"] = clean(named.get("championship_system"))
        out["champions"] = clean(named.get("champions"))
        out["champions_link"] = first_link(named.get("champions"))[0]
        out["championship_bowl"] = clean(named.get("championship_bowl"))
        out["bowl_start"] = clean(named.get("bowl_start"))
        out["regular_season"] = clean(named.get("regular_season"))
        break
    return out


# ---------------------------------------------------------------- standings templates
def parse_standings(text, y, tpl_title):
    """-> rows [{team_title, team_text, conference, division, cw, cl, ct, w, l, t, div_champ, conf_champ, natl_champ, ...}]."""
    conf = conf_of_template(tpl_title)
    rows, division, rank = [], None, 0
    for name, inner in templates(text, r"CFB standings (?:start|entry|end)"):
        n, pos, named = args_of(inner)
        kind = n.lower().split()[-1]
        if kind == "start":
            continue
        if kind == "end":
            continue
        if "division-name" in named and not pos:
            division = clean(named["division-name"]) or None
            rank = 0
            continue
        if not pos: continue
        link, text_ = first_link(pos[0])
        text_ = re.sub(r"^[\^*†‡#\s]+|[\^*†‡#\s]+$", "", text_)          # footnote marks
        nums = []
        for p in pos[1:]:
            p = clean(p)
            if p == "": nums.append(None)
            elif re.match(r"\d+\s*[*†‡]*$", p): nums.append(int(re.match(r"\d+", p).group()))      # 0* = wins vacated, footnoted
            else: nums.append(None)
        # conference W L [T]  overall W L [T]; the independents have no conference record; with div-standings the division record comes first
        dw = dl = None
        if (named.get("div-standings", "") or "").lower().startswith("y") and len(nums) >= 6: dw, dl, cw, cl, w, l = nums[:6]; ct = t = None
        elif len(nums) >= 6: cw, cl, ct, w, l, t = nums[:6]
        else:
            # conference W L, overall W L, with blank cells before ("||8|1|12|1", "||||2|10") or after (a blank ties cell): the last two numbers are the overall record
            while nums and nums[-1] is None: nums.pop()
            if len(nums) < 2: continue
            w, l = nums[-2], nums[-1]
            cw, cl = (nums[-4], nums[-3]) if len(nums) >= 4 else (None, None)
            ct = t = None
        if w is None or l is None: continue
        rank += 1
        flag = lambda k: (named.get(k, "") or "").lower().startswith("y")
        rows.append({"team_title": link if link and re.match(r"^%d " % y, link) else None, "team_text": text_,
                     "conference": conf, "division": division, "rank": rank, "dw": dw, "dl": dl, "cw": cw, "cl": cl, "ct": ct, "w": w, "l": l, "t": t,
                     "div_champ": flag("div-champ"), "conf_champ": flag("conf-champ"), "natl_champ": flag("natl-champ"),
                     "co_champ": flag("co-champions")})
    return rows


# ---------------------------------------------------------------- team-season articles
def parse_date(s, y):
    """'September 3' / 'January 4, 2006' / 'Aug. 28' / '{{tooltip|2=Friday|October 13}}' -> datetime.date (a month before July belongs to the next calendar year)."""
    s = strip_junk(s or "").replace("&nbsp;", " ")
    for m in re.finditer(r"\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:\s*,?\s*(\d{4}))?", s):
        mo, d = MONTHS[m.group(1).lower()], int(m.group(2))
        yr = int(m.group(3)) if m.group(3) else (y if mo >= 7 else y + 1)
        try: return datetime.date(yr, mo, d)
        except ValueError: continue
    return None


def parse_score(s):
    """'55–14', '[[2005 Texas vs. Ohio State football game|25–22]]', '27–24 OT' -> (first, second, overtime) or None."""
    raw = re.sub(r"https?://[^\s|}\]]+", "", strip_junk(s or ""))          # a score wrapped in a link to another site: the score is kept, the address dropped
    raw = re.sub(r"\{\{\s*URL\s*\|[^{}|]*?\|\s*2\s*=([^{}]*)\}\}", r"\1", raw, flags=re.I)
    raw = re.sub(r"\{\{\s*(?:ndash|endash|en dash|mdash)\s*\}\}|&ndash;|&mdash;", "–", raw, flags=re.I)
    t = clean(raw)
    m = re.search(r"(\d+)\s*" + DASH + r"\s*(\d+)(.*)$", t)
    if not m: return None
    tail = m.group(3)
    ot = bool(re.search(r"\b\d?OT\b|overtime", tail, re.I)) or bool(re.search(r"\bOT\b", raw))
    return int(m.group(1)), int(m.group(2)), ot


KNOWN_RIVALRY_BOWLS = r"Iron Bowl|Egg Bowl|Palmetto Bowl|Apple Cup|Bayou Bucket|Magnolia Bowl"        # rivalry trophies, played in the regular season (the Magnolia Bowl once on December 19, 2020)
BOWL_RX = re.compile(r"\bBowl\b|\bPlayoff\b|\bCFP\b|Football Classic|National Championship|Bowl Championship|Fiesta|Peach|Citrus|Alamo|Gator|Orange|Sugar|Rose|Cotton|Hula|Humanitarian", re.I)


_GAME_WORD = re.compile(r"Bowl|Playoff|Championship Game|Classic|National Championship|Football Championship", re.I)


def round_name(raw):
    """The name of a bowl, playoff or conference championship game from a schedule row's game-name cell, or None:
    [[2006 Rose Bowl|Rose Bowl]] - [[BCS National Championship Game]]) (College GameDay  ->  'Rose Bowl (National Championship Game)'."""
    raw = strip_junk(raw or "")
    if not raw.strip(): return None
    links = [(m.group(1).strip(), clean(m.group(2) or m.group(1))) for m in re.finditer(r"\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]", raw)]
    title = ""
    for target, text in links:
        t = re.sub(r"^\d{4}[–-]?\d{0,2}\s+", "", target)
        if re.search(r"National Championship", t, re.I) and not re.match(r"^\d{4}", target) and not re.search(r"Bowl$", t): continue         # the suffix, below
        if re.search(r"College GameDay|SEC Nation|rivalry|Trophy|Cup\b", t, re.I): continue
        if _GAME_WORD.search(t) or _GAME_WORD.search(text):
            title = re.sub(r"\s+football(?= Championship Game)", "", t if _GAME_WORD.search(t) else text, flags=re.I).strip(); break
    if not title:
        flat_txt = re.sub(r"(?<=[A-Za-z])\s*[–—]\s*(?=[A-Za-z])", " – ", clean(raw.replace("[[", "").replace("]]", "")))
        for seg in re.split(r"[,/;()]|\s[–-]\s", flat_txt):
            seg = seg.strip()
            if _GAME_WORD.search(seg) and not re.search(r"College GameDay|SEC Nation", seg, re.I): title = seg; break
    if not title: return None
    title = re.sub(r"\s*\((?:December|January|[A-Z][a-z]+ \d{4})\)", "", re.sub(r"\s+", " ", title))
    low = clean(raw)
    suffix = ""
    if re.search(r"semifinal", low, re.I) and "emifinal" not in title: suffix = " (CFP Semifinal)"
    elif re.search(r"quarterfinal", low, re.I) and "uarterfinal" not in title: suffix = " (CFP Quarterfinal)"
    elif re.search(r"first round", low, re.I) and "irst" not in title: suffix = " (CFP First Round)"
    elif re.search(r"National Championship|BCS NCG|BCS Championship", low, re.I) and "National Championship" not in title: suffix = " (National Championship Game)"
    return re.sub(r"^\d{4}\s+", "", re.sub(r"[\[\]]", "", title)) + suffix


def classify_phase(gamename_raw, date, y, bowl_info, my_pts, opp_pts, opp_text):
    """'playoffs' for a bowl or a Playoff game, 'regular' for the rest (a conference championship game counts in the regular season)."""
    link, text_ = first_link(gamename_raw or "")
    name = text_ or ""
    if re.search(KNOWN_RIVALRY_BOWLS, name, re.I) and not re.search(r"\b\d{4}\b", link or ""): return "regular"
    if link and re.match(r"^\d{4} .*?(Bowl|Playoff|National Championship|Bowl Championship Series|Championship Game \(.*\))", link) \
       and not re.search(r"Conference|Big 12|Big Ten|SEC|ACC|Pac|MAC|Mountain West|Sun Belt|American|WAC|C-USA|Big East", link, re.I): return "playoffs"
    if date and (date.month == 1 or (date.month == 12 and date.day >= 14) or date.month == 2) and (BOWL_RX.search(name) or BOWL_RX.search(re.sub(r"^\d{4}[–-]?\d{0,2}\s+", "", link or ""))) \
       and "Championship Game" not in name.replace("National Championship Game", ""):
        return "playoffs"          # the College Football Playoff's first round links "2024–25 College Football Playoff" and names itself "CFP First Round"
    if bowl_info and date and date.month in (12, 1, 2) and bowl_info.get("score") == (my_pts, opp_pts) and date >= datetime.date(y, 12, 1):
        return "playoffs"
    return "regular"


def opponent_of(oraw, y):
    """(link target, text) of an opponent cell; {{cfb link|year=2000|team=Southern Utah Thunderbirds|title=Southern Utah}} is a link to that team's season."""
    cl = re.search(r"\{\{\s*cfb link\s*\|([^{}]*)\}\}", oraw, re.I)
    if cl:
        _, _, kw = args_of("x|" + cl.group(1))
        return f"{kw.get('year', y)} {kw.get('team', '')} football team", clean(kw.get("title") or kw.get("team"))
    # "([[Football Championship Subdivision|FCS]]) [[2009 Furman Paladins football team|Furman]]": the opponent is the link to a team's season, not the first link
    m = re.search(r"\[\[(\d{4} [^\]|#]*football team)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]", strip_junk(oraw or ""))
    if m: return m.group(1).strip(), clean(m.group(2) or m.group(1))
    return first_link(oraw)


def parse_team(text, y, my_title):
    """-> (infobox dict, [view dict], [unparsed strings]) of a team-season article."""
    info, views, bad = {}, [], []
    for name, inner in templates(text, r"Infobox college sports team season"):
        n, pos, named = args_of(inner)
        for k in ("team", "conference", "division", "short_conf", "record", "conf_record", "champion", "bowl", "conf_champ", "head_coach", "year"):
            info[k] = clean(named.get(k))
        info["bowl_result"] = clean(named.get("bowl_result"))
        break
    bowl_info = None
    m = re.match(r"\s*([WLT])\s+(\d+)\s*" + DASH + r"\s*(\d+)", info.get("bowl_result") or "")
    if m:
        a, b = int(m.group(2)), int(m.group(3))
        bowl_info = {"score": (a, b) if m.group(1) != "L" or a < b else (b, a)}
        if m.group(1) == "L": bowl_info["score"] = (min(a, b), max(a, b))
    for name, inner in templates(text, r"CFB schedule entry"):
        n, pos, named = args_of(inner)
        d = parse_date(named.get("date", ""), y)
        sc = parse_score(named.get("score"))
        oraw = named.get("opponent", "")
        if not clean(oraw) and "football team" in named.get("opprank", ""): oraw = named["opprank"]          # an editor put the opponent into the ranking cell (TCU 2016)
        link, otext = opponent_of(oraw, y)
        opp_title = link if link and re.match(r"^\d{4} ", link) else None
        wl_raw = clean(named.get("w/l", "")).lower()
        wl = wl_raw[:1] or None
        if wl_raw.startswith("cancel") or wl_raw.startswith("postpone") or re.search(r"cancel|postpone|no contest", clean(named.get("score")), re.I): continue          # never played
        vacated = wl == "v"
        if vacated: wl = None
        if sc is None and not clean(named.get("score")): continue            # scheduled, never played (no score)
        if d is None or sc is None or not otext:
            bad.append(f"{my_title}: {clean(named.get('date'))} / {otext} / {clean(named.get('score'))}")
            continue
        a, b = sc[0], sc[1]
        # the score is the team's own points first in these articles; the w/l letter says which way it reads when it does not
        if wl == "w" and a < b or wl == "l" and a > b: a, b = b, a
        if wl is None and a == b: wl = "t"
        flag = lambda k: (named.get(k, "") or "").strip().lower().startswith(("y", "t", "1"))
        ot = sc[2] or flag("overtime") or flag("ot")
        loc = "away" if flag("away") else "neutral" if flag("neutral") else "home"
        gn_raw = named.get("gamename", "")
        views.append({"date": d, "opp_title": opp_title, "opp_text": otext, "opp_link": link, "pts": a, "opp_pts": b, "wl": wl, "ot": ot, "loc": loc,
                      "gamename_raw": gn_raw, "gamename": round_name(gn_raw), "stadium": clean(named.get("site_stadium")) or None,
                      "attend": (lambda t: int(t.replace(",", "")) if re.fullmatch(r"[\d,]+", t) else None)(clean(named.get("attend"))),
                      "nonconf": flag("nonconf"), "vacated": vacated, "phase": classify_phase(gn_raw, d, y, bowl_info, a, b, otext)})
    cv, cb = parse_compact(text, y, my_title)          # some articles tell the season in the compact layout and one game (the bowl) as an entry: both are read
    for v in cv: v["phase"] = classify_phase(v["gamename_raw"], v["date"], y, bowl_info, v["pts"], v["opp_pts"], v["opp_text"])
    if not views: views, bad = cv, bad + cb
    elif cv:
        have = {v["date"] for v in views}
        views += [v for v in cv if v["date"] not in have]
    return info, views, bad


# ---------------------------------------------------------------- compact schedules ({{CFB schedule | date | time | at | opponent | site | city | tv | W 1-0 | attendance ...}})
_DATE_CELL = re.compile(r"^\W*(?:<s>)?\s*(?:\{\{\s*[Tt]ooltip\s*\|(?:\d=)?)?\s*(?:\{\{[^|}]*\|)?\s*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}")
_RESULT = re.compile(r"^\W*([WLT])\s+(\d+)\s*" + DASH + r"\s*(\d+)", re.I)
_TIME = re.compile(r"^\W*(?:\d{1,2}(?::\d\d)?\s*[ap]\.?\s*m\.?|noon|tba|tbd|\d{1,2}:\d\d)", re.I)


def parse_compact(text, y, my_title):
    """The positional layout of {{CFB schedule}} some articles use: every cell is an argument of the template, a row starts at its date cell."""
    views, bad = [], []
    for name, inner in templates(text, r"CFB schedule(?!\s*entry)"):
        cells = [c for c in split_args(inner)[1:]]
        cells = [c for c in cells if not re.match(r"\s*[A-Za-z_/ ]+=", c) or _DATE_CELL.match(c)]
        starts = [i for i, c in enumerate(cells) if _DATE_CELL.match(strip_junk(c).strip())]
        for a, b in zip(starts, starts[1:] + [len(cells)]):
            row = [strip_junk(c).strip() for c in cells[a:b]]
            raw_row = [c.strip() for c in cells[a:b]]
            d = parse_date(row[0], y)
            res = next((i for i, c in enumerate(row) if _RESULT.match(clean(c))), None)
            if res is None:
                if not any(re.search(r"cancel|postpone|no contest|withdr", clean(c), re.I) for c in row): bad.append(f"{my_title}: {clean(row[0])} / no result")
                continue
            m = _RESULT.match(clean(row[res]))
            wl, a_, b_ = m.group(1).lower(), int(m.group(2)), int(m.group(3))
            if wl == "w" and a_ < b_ or wl == "l" and a_ > b_: a_, b_ = b_, a_
            ot = bool(re.search(r"\bOT\b|overtime", clean(row[res]), re.I))
            loc, opp_i = "home", None
            for i in range(1, res):
                c = clean(row[i])
                if re.search(r"\{\{\s*cfb link\s*\|", row[i], re.I): opp_i = i; break
                if c == "" or _TIME.match(c) or re.fullmatch(r"\d{1,2}", c): continue
                if c.lower() in ("at", "@"): loc = "away"; continue
                if c.lower() in ("vs.", "vs", "v", "v."): loc = "neutral"; continue
                opp_i = i; break
            lk = next((i for i in range(1, res) if re.search(r"\[\[\d{4} [^\]|]*football team|\{\{\s*cfb link\s*\|", row[i], re.I)), None)
            if lk is not None and (opp_i is None or lk != opp_i): opp_i = lk          # "No. 15 (FCS)" in a cell of its own comes before the opponent's link
            if opp_i is None or d is None: bad.append(f"{my_title}: {clean(row[0])} / no opponent"); continue
            oraw = row[opp_i]
            if re.match(r"\s*(?:<s>)?\s*(?:vs\.?|v\.)\s", oraw, re.I): loc = "neutral"
            if re.match(r"\s*(?:<s>)?\s*(?:at|@)\s", oraw, re.I): loc = "away"
            oraw = re.sub(r"^\s*(?:<s>)?\s*(?:vs\.?|v\.|at|@)\s+", "", oraw, flags=re.I)
            oraw = re.sub(r"<small>.*?</small>|<ncg>|<hc>|\bNo\.?\s*\d+\b|\{\{\s*abbr\s*\|No\.[^}]*\}\}\s*\d*", "", oraw)
            ogn = None
            mm = re.search(r"\(([^()]*(?:Bowl|Championship|Playoff|Classic|Kickoff|Trophy)[^()]*)\)", oraw)
            if mm:          # "Northern Illinois ([[2021 MAC Championship Game|MAC Championship Game]])": the game's name rides in the opponent's cell, and is not the opponent
                ogn = mm.group(1).strip(); oraw = (oraw[:mm.start()] + oraw[mm.end():]).strip()
            link, otext = opponent_of(oraw, y)
            otext = re.sub(r"[*†‡]+$", "", otext).strip()
            if not otext: bad.append(f"{my_title}: {clean(row[0])} / empty opponent"); continue
            opp_title = link if link and re.match(r"^\d{4} ", link) else None
            after = row[opp_i + 1:res]
            raw_after = raw_row[opp_i + 1:res]
            gn = ogn
            for c in ([] if gn else raw_after):
                mm = re.search(r"\(([^()]*(?:Bowl|Championship|Playoff|Classic|Kickoff|Trophy)[^()]*)\)", c)
                if mm: gn = mm.group(1); break
                lk = re.search(r"\[\[(\d{4} [^\]|]*(?:Bowl|Playoff|Championship Game|National Championship)[^\]|]*)(?:\|([^\]]*))?\]\]", c)
                if lk: gn = "[[" + lk.group(1) + ("|" + lk.group(2) if lk.group(2) else "") + "]]"; break
            stadium = clean(after[0]) if after else None
            att = None
            for c in row[res + 1:res + 3]:
                t = clean(c).replace(",", "")
                if re.fullmatch(r"\d{3,6}", t): att = int(t); break
            views.append({"date": d, "opp_title": opp_title, "opp_text": otext, "opp_link": link, "pts": a_, "opp_pts": b_, "wl": wl, "ot": ot, "loc": loc,
                          "gamename_raw": gn or "", "gamename": round_name(gn), "stadium": stadium or None, "attend": att, "nonconf": False, "vacated": False,
                          "phase": "regular"})
    return views, bad


# ---------------------------------------------------------------- opponents and pairing
def flat(s):
    s = unicodedata.normalize("NFKD", s or "")
    return re.sub(r"[^a-z0-9]", "", "".join(c for c in s if not unicodedata.combining(c)).lower().replace("&", "and"))


def slug(name):
    """The program key of a name that no seed row renames: lower case, accents and punctuation dropped, as db/build/230 does."""
    n = unicodedata.normalize("NFKD", name or "")
    return re.sub(r"[^a-z0-9]+", "-", "".join(c for c in n if not unicodedata.combining(c)).lower()).strip("-")


def load_program_seed(path=None):
    """db/seed/ncaaf_program.csv -> [(club lower, first year, last year, program)]."""
    import csv, os
    path = path or os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "db", "seed", "ncaaf_program.csv")
    with open(path, newline="", encoding="utf-8") as f:
        return [(r["club"].lower(), int(r["first_year"]), int(r["last_year"]), r["program"]) for r in csv.DictReader(f)]


_SEED = []


def program_of(name, y):
    global _SEED
    if not _SEED: _SEED = load_program_seed()
    for club, a, b, prog in _SEED:
        if club == (name or "").lower() and a <= y <= b: return prog
    return slug(name)


NOT_A_TEAM = re.compile(r"stadium$|spring game|^fcs$|^ncaa division|championship game$|scrimmage|alumni|exhibition|\b(?:tbd|tba)\b|^bye$", re.I)


class Season:
    """The division's teams of one season, to resolve the opponent a schedule row names."""

    def __init__(self, y, standings, resolved=None):
        """resolved: {title a standings link names: the title the article is at now} (a redirect followed when fetched)."""
        self.y = y
        resolved = resolved or {}
        self.by_title, self.by_school, self.by_full = {}, collections.defaultdict(set), {}
        for r in standings:
            if not r["team_title"]: continue
            final = resolved.get(r["team_title"]) or r["team_title"]
            nm = team_name_of_title(final)
            r["team_name"] = nm
            self.by_title[r["team_title"]] = nm
            self.by_title[final] = nm
            self.by_full[flat(nm)] = nm
            self.by_school[flat(r["team_text"])].add(nm)
        self.programs = {program_of(nm, y): nm for nm in self.by_full.values()}      # program key -> the division team's name this season
        self.outside = {}                      # flat school text -> name with nickname, learned from linked opponents
        self.outside_school = {}               # name with nickname -> the school as the schedules write it

    def learn(self, views):
        for v in views:
            if v["opp_title"] and v["opp_title"] not in self.by_title:
                nm = team_name_of_title(v["opp_title"])
                self.outside_school.setdefault(nm, v["opp_text"])
                self.outside.setdefault(flat(v["opp_text"]), nm)
                self.outside.setdefault(flat(nm), nm)

    def resolve(self, v):
        """-> (name, in the division?)"""
        nm, inside = self._resolve(v)
        if not inside:
            pk = program_of(nm, self.y)
            if pk in self.programs: return self.programs[pk], True            # a team of the division under another name (a rename not yet in the standings)
        return nm, inside

    def _resolve(self, v):
        if v["opp_title"] in self.by_title: return self.by_title[v["opp_title"]], True
        f = flat(v["opp_text"])
        s = self.by_school.get(f)
        if s and len(s) == 1: return next(iter(s)), True
        if f in self.by_full: return self.by_full[f], True
        if v["opp_title"]:
            nm = team_name_of_title(v["opp_title"])
            # a link to a season article of a team the standings do not list: outside the division, named as linked
            return nm, False
        return team_name_of_title(self.outside.get(f, v["opp_text"])) if re.match(r"^\d{4} ", self.outside.get(f, v["opp_text"])) else self.outside.get(f, v["opp_text"]), False


def pair(season, views_by_team):
    """views_by_team: {team name: [view]} for the division's teams. -> (games, unmatched notes).
    A game both teams tell is merged (conflicts noted); a game against a team outside the division, or one the other team's article
    lacks, stands on one view. A neutral-site game lists its two teams in name order (away first)."""
    fbs = set(views_by_team)
    games, notes = [], []
    pend = collections.defaultdict(lambda: ([], []))           # (a, b) with a < b -> views of a, views of b
    single = []
    for me, vs in views_by_team.items():
        season.learn(vs)
    for me, vs in views_by_team.items():
        for v in vs:
            if NOT_A_TEAM.search(v["opp_text"] or "") and not v["opp_title"]:
                notes.append(f"{me}: {v['date']} {v['opp_text']} is not a team; left out"); continue
            opp, inside = season.resolve(v)
            v = dict(v, me=me, opp=opp, inside=inside)
            if opp == me: notes.append(f"{me}: a game against itself on {v['date']}"); continue
            if inside and opp in fbs:
                a, b = (me, opp) if me < opp else (opp, me)
                pend[(a, b)][0 if me == a else 1].append(v)
            else: single.append(v)
    for (a, b), (la, lb) in pend.items():
        la.sort(key=lambda v: v["date"]); lb.sort(key=lambda v: v["date"])
        used, done_a = set(), set()
        for ia, va in enumerate(la):
            best = None
            for j, vb in enumerate(lb):
                if j in used: continue
                dd = abs((va["date"] - vb["date"]).days)
                if dd <= 1 and (best is None or dd < best[0]): best = (dd, j)
            if best is None: continue
            used.add(best[1]); done_a.add(ia); games.append(_merge(va, lb[best[1]], season.y))
        # what is left: the same game dated apart by the two articles (a typo of the day, the month or the year), when each side has just one such
        # game left and the two scores are the same score: one game told twice, not two games (Alabama 2005 had Utah State twice)
        left_a = [va for i, va in enumerate(la) if i not in done_a]
        left_b = [vb for j, vb in enumerate(lb) if j not in used]
        if len(left_a) == 1 and len(left_b) == 1 and left_a[0]["pts"] == left_b[0]["opp_pts"] and left_a[0]["opp_pts"] == left_b[0]["pts"] \
           and (abs((left_a[0]["date"] - left_b[0]["date"]).days) <= 7 or left_a[0]["phase"] == left_b[0]["phase"]):
            games.append(_merge(left_a[0], left_b[0], season.y)); continue
        games += [_one(v, 1) for v in left_a + left_b]
    for v in single: games.append(_one(v, 1))
    games.sort(key=lambda g: (g["date"], g["home"], g["away"]))
    seq = collections.Counter()
    for g in games:
        k = (g["phase"], g["date"], g["home"], g["away"]); seq[k] += 1; g["seq"] = seq[k]
    return games, notes


def _orient(v):
    """One view -> a game dict with home/away."""
    me, opp = v["me"], v["opp"]
    if v["loc"] == "away": h, a, hp, ap = opp, me, v["opp_pts"], v["pts"]
    elif v["loc"] == "home": h, a, hp, ap = me, opp, v["pts"], v["opp_pts"]
    else:
        if me > opp: h, a, hp, ap = me, opp, v["pts"], v["opp_pts"]
        else: h, a, hp, ap = opp, me, v["opp_pts"], v["pts"]
    return h, a, hp, ap


def _one(v, views):
    h, a, hp, ap = _orient(v)
    rnd = v["gamename"] if v["phase"] == "playoffs" or re.search(r"Championship Game", v["gamename"] or "") else None
    return {"date": v["date"], "phase": v["phase"], "round": rnd, "home": h, "away": a, "home_pts": hp, "away_pts": ap, "ot": v["ot"],
            "neutral": v["loc"] == "neutral", "venue": v["stadium"], "attend": v["attend"], "views": views, "conflict": None,
            "src": v["me"], "inside": v["inside"], "outside_team": None if v["inside"] else v["opp"], "nonconf": v["nonconf"]}


def _in_season(d, y):
    """A game of the season that starts in year y is played between August of y and February of the next year."""
    return datetime.date(y, 8, 1) <= d <= datetime.date(y + 1, 2, 28)


def _ok(v):
    """Does the view's score agree with its own w/l letter?"""
    return v["wl"] is None or (v["wl"] == "w") == (v["pts"] > v["opp_pts"]) and (v["wl"] == "t") == (v["pts"] == v["opp_pts"])


def _merge(va, vb, y):
    """Two views of one game. Agreement is silent; a disagreement keeps the view that agrees with its own w/l letter, else the home team's."""
    note = []
    pa, pb = (va["pts"], va["opp_pts"]), (vb["opp_pts"], vb["pts"])        # (a's points, b's points) as each view tells it
    if pa != pb: note.append(f"scores {va['me']} {pa[0]}-{pa[1]} / {vb['me']} {pb[0]}-{pb[1]}")
    if abs((va["date"] - vb["date"]).days): note.append(f"dates {va['date']} / {vb['date']}")
    if va["loc"] == "home" and vb["loc"] == "home" or va["loc"] == "away" and vb["loc"] == "away":
        note.append(f"both articles say {va['loc']}")
    elif {va["loc"], vb["loc"]} & {"neutral"} and not (va["loc"] == vb["loc"] == "neutral"):
        note.append(f"site: {va['me']} {va['loc']} / {vb['me']} {vb['loc']}")
    # which view to keep
    keep = va
    if not _ok(va) and _ok(vb): keep = vb
    elif _ok(va) == _ok(vb):
        keep = va if va["loc"] == "home" else vb if vb["loc"] == "home" else va
    other = vb if keep is va else va
    if not _in_season(keep["date"], y) and _in_season(other["date"], y): keep, other = other, keep
    g = _one(keep, 2)
    if keep["loc"] != "neutral" and other["loc"] == "neutral" and (keep["loc"] in ("home", "away")):
        pass
    if not g["round"] and (other["phase"] == "playoffs" or re.search(r"Championship Game", other["gamename"] or "")): g["round"] = other["gamename"]
    elif g["round"] and other["gamename"] and other["gamename"] != g["round"] and re.search(r"\(CFP ", other["gamename"]) and not re.search(r"\(CFP ", g["round"]):
        g["round"] = other["gamename"]          # one article tags the bowl as a Playoff game, the other does not
    if keep["phase"] != other["phase"]:
        note.append(f"phase {va['phase']} / {vb['phase']}")
        if "playoffs" in (keep["phase"], other["phase"]): g["phase"] = "playoffs"
    g["venue"] = g["venue"] or other["stadium"]
    g["attend"] = g["attend"] or other["attend"]
    g["ot"] = g["ot"] or other["ot"]
    g["inside"] = True
    if note: g["conflict"] = "; ".join(note) + f" | kept: {keep['me']}"
    return g
