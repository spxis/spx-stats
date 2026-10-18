"""Match boxes of English Wikipedia club-season articles (wikitext), read as they are written.
boxes(wikitext, year=None) -> [box], one per {{football box collapsible}} / {{Football box}} / {{footballbox}}, in page order. A box is
  {path: [headings above it], round, date (ISO or None), time, team1, team2 (each {text, link}), score (raw text), score1, score2,
   aet, golden, so (the old MLS shootout), pens1, pens2, result (W/L/D/None: the article club's), stadium {text, link}, location, attendance, referee}
Nothing is guessed: a value it cannot read is None and the raw text stays in `score_raw` / `date_raw`."""
import re
from datetime import date

MONTHS = {m.lower(): i for i, m in enumerate(["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
                                              "November", "December"], 1)}
MONTHS.update({k[:3]: v for k, v in list(MONTHS.items())})
BOX = re.compile(r"\{\{\s*(?:football\s*box(?:\s*collapsible)?|footballbox(?:[ _]collapsible)?|football_box(?:_collapsible)?)\s*(?:<!--.*?-->\s*)?(?=\||\n)", re.I)
HEADING = re.compile(r"^(={2,6})\s*(.+?)\s*\1\s*$", re.M)


def strip_markup(s):
    s = re.sub(r"<ref[^>]*?/>|<ref[^>]*>.*?</ref>", "", s or "", flags=re.S)
    s = re.sub(r"<!--.*?-->", "", s, flags=re.S)
    s = re.sub(r"<br\s*/?>", " ", s, flags=re.I)
    s = re.sub(r"</?(?:small|span|sup|nowrap)[^>]*>", "", s, flags=re.I)
    s = re.sub(r"\{\{\s*(?:nowrap|small)\s*\|([^{}]*)\}\}", r"\1", s, flags=re.I)
    return s.strip()


def first_link(s):
    m = re.search(r"\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]", s or "")
    return (m.group(1).strip(), (m.group(2) or m.group(1)).strip()) if m else (None, None)


def plain(s):
    s = strip_markup(s)
    s = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", s)
    s = re.sub(r"\{\{[^{}]*\}\}", "", s)
    s = re.sub(r"'''?", "", s)
    return re.sub(r"\s+", " ", s.replace("&nbsp;", " ")).strip()


def params(body):
    """Top-level |name=value pairs of a template body (nested {{ }} and [[ ]] kept whole)."""
    out, depth, cur, parts = {}, 0, [], []
    i = 0
    while i < len(body):
        two = body[i:i + 2]
        if two in ("{{", "[["):
            depth += 1; cur.append(two); i += 2; continue
        if two in ("}}", "]]"):
            depth -= 1; cur.append(two); i += 2; continue
        if body[i] == "|" and depth == 0:
            parts.append("".join(cur)); cur = []; i += 1; continue
        cur.append(body[i]); i += 1
    parts.append("".join(cur))
    for p in parts[1:] if parts else []:
        k, eq, v = p.partition("=")
        if eq:
            out[k.strip().lower()] = v.strip()
    return out


def parse_date(raw, default_year=None):
    try:
        return _parse_date(raw, default_year)
    except ValueError:      # 29 February of a year that has none, a day 31 of a short month: the box is wrong, not read
        return None


def _parse_date(raw, default_year=None):
    s = strip_markup(raw or "")
    m = re.search(r"\{\{\s*(?:start[ _]date|dts|date)\s*\|\s*(?:df=\w+\|)?(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})", s, re.I)
    if m:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3))).isoformat()
    m = re.search(r"\{\{\s*start[ _]date\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})\s*\|\s*df\s*=\s*y", s, re.I)
    if m and default_year:      # {{Start date|25|02|df=y}}: day, month, no year (the article's season)
        return date(default_year, int(m.group(2)), int(m.group(1))).isoformat()
    m = re.search(r"\{\{\s*dts\s*\|\s*(?:df=\w+\|)?\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})", s, re.I)
    if m and default_year:      # {{dts||4|26}}: the year left empty is the article's season
        return date(default_year, int(m.group(1)), int(m.group(2))).isoformat()
    s = re.sub(r"\[\[([^\]|]*\|)?([^\]]*)\]\]", r"\2", s)
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        return date(int(m.group(1)), int(m.group(2)), int(m.group(3))).isoformat()
    m = re.search(r"([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})", s)
    if m and m.group(1).lower() in MONTHS:
        return date(int(m.group(3)), MONTHS[m.group(1).lower()], int(m.group(2))).isoformat()
    m = re.search(r"(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})", s)
    if m and m.group(2).lower() in MONTHS:
        return date(int(m.group(3)), MONTHS[m.group(2).lower()], int(m.group(1))).isoformat()
    if default_year:       # "April 13", "Sat Mar 25", "15 May", "Sat 24 March", "April 23, 6:00 pm CDT": the article's season
        s = re.sub(r"^\W*(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\.?,?\s+(?=[A-Za-z0-9])", "", s)
        s = re.sub(r",?\s+(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\.?\W*$", "", s)
        s = re.sub(r",?\s+\d{1,2}(?::\d{2})?\s*(?:[ap]\.?m\.?|noon)\b.*$", "", s, flags=re.I)
        m = re.fullmatch(r"\W*([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?\W*", s)
        day_first = re.fullmatch(r"\W*(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?\W*", s)
        if day_first: m = day_first; mon, day = day_first.group(2), day_first.group(1)
        elif m: mon, day = m.group(1), m.group(2)
        if m and (mon.lower() in MONTHS or mon.lower()[:3] in MONTHS):
            return date(default_year, MONTHS.get(mon.lower()) or MONTHS[mon.lower()[:3]], int(day)).isoformat()
    return None


def parse_score(raw):
    """(score1, score2, flags) from a box's score text. flags: aet, golden (sudden death), so (old MLS shootout), series (a series score, not a match)."""
    s = strip_markup(raw or "")
    s = re.sub(r"\{\{\s*(?:endash|ndash|en dash)\s*\}\}", "–", s, flags=re.I)
    s = re.sub(r"\[\[([^\]|]*\|)?([^\]]*)\]\]", r"\2", s)
    flags = {"aet": False, "golden": False, "so": False, "series": False}
    low = s.lower()
    if "series" in low:
        flags["series"] = True
    if re.search(r"\(\s*so\s*\)|shoot-?out", low):
        flags["so"] = True
    if re.search(r"\(\s*(?:ot|gg|golden|sudden|asdet|a\.?s\.?d\.?e\.?t)|sudden death|golden", low):
        flags["golden"] = True
    if re.search(r"a\.?e\.?t|extra time|\(\s*et\s*\)|\(ot\)|overtime", low):
        flags["aet"] = True
    m = re.search(r"(\d+)\s*(?:–|-|&ndash;|—)\s*(\d+)", s.replace("&ndash;", "–"))
    return (int(m.group(1)), int(m.group(2)), flags) if m else (None, None, flags)


def parse_pens(p):
    s = plain(p.get("penaltyscore", "")) or plain(p.get("penalties", ""))
    m = re.search(r"(\d+)\s*(?:–|-|&ndash;)\s*(\d+)", s)
    if m:
        return int(m.group(1)), int(m.group(2))
    # {{Football box}} lists the kicks of each side, a {{pengoal}} for each one scored
    k1, k2 = p.get("penalties1", ""), p.get("penalties2", "")
    n1, n2 = len(re.findall(r"\{\{\s*pengoal", k1, re.I)), len(re.findall(r"\{\{\s*pengoal", k2, re.I))
    miss = len(re.findall(r"\{\{\s*pengmiss", k1 + k2, re.I))
    return (n1, n2) if (n1 or n2 or miss) else (None, None)


def boxes(wikitext, year=None):
    heads = [(m.start(), len(m.group(1)), plain(m.group(2))) for m in HEADING.finditer(wikitext)]
    out = []
    for m in BOX.finditer(wikitext):
        # find the end of this template: matching braces
        depth, i = 0, m.start()
        while i < len(wikitext):
            two = wikitext[i:i + 2]
            if two == "{{":
                depth += 1; i += 2; continue
            if two == "}}":
                depth -= 1; i += 2
                if depth == 0:
                    break
                continue
            i += 1
        body = wikitext[m.start() + 2:i - 2]
        p = params(body)
        # headings above: the chain of the latest heading at each level
        chain = {}
        for pos, lvl, text in heads:
            if pos > m.start():
                break
            chain = {k: v for k, v in chain.items() if k < lvl}
            chain[lvl] = text
        t1l, t1t = first_link(p.get("team1", ""))
        t2l, t2t = first_link(p.get("team2", ""))
        s1, s2, flags = parse_score(p.get("score", ""))
        if s1 is None and re.fullmatch(r"\d+", plain(p.get("score1", ""))) and re.fullmatch(r"\d+", plain(p.get("score2", ""))):
            s1, s2 = int(plain(p["score1"])), int(plain(p["score2"]))           # {{Football box}}: score1 and score2 apart
            if re.search(r"a\.?e\.?t|extra|yes", plain(p.get("aet", "")), re.I):
                flags["aet"] = True
        pens = parse_pens(p)
        sl, st = first_link(p.get("stadium", ""))
        res = plain(p.get("result", "")).upper()[:1] or None
        location = plain(p.get("location", "")) or None
        raw_stadium = p.get("stadium", "")
        stadium_text = plain(raw_stadium)
        att = re.sub(r"[^\d]", "", plain(p.get("attendance", "")).split("(")[0]) if p.get("attendance") else ""
        inline = re.search(r"attendance:?\s*([\d,]+)", stadium_text, re.I)      # "...Stadium, Washington, D.C. Attendance: 39,159" in the one field
        if inline:
            att = att or re.sub(r"\D", "", inline.group(1))
            stadium_text = stadium_text[:inline.start()].strip(" ,;")
        link = re.search(r"\[\[[^\]]+\]\]", raw_stadium)
        if not location and link:                     # "[[Robert F. Kennedy Memorial Stadium]], Washington, D.C.": the link is the stadium, the rest the place
            rest = re.sub(r"(?i)attendance:?.*$", "", plain(raw_stadium[link.end():])).strip(" ,;")
            stadium_text, location = plain(link.group(0)), rest or None
        elif not location and "," in stadium_text:      # "Robert F. Kennedy Memorial Stadium, Washington, D.C." with no link
            stadium_text, _, rest = stadium_text.partition(",")
            stadium_text, location = stadium_text.strip(), rest.strip() or None
        out.append({
            "path": [chain[k] for k in sorted(chain)], "round": plain(p.get("round", "")), "date": parse_date(p.get("date", ""), year),
            "date_raw": strip_markup(p.get("date", "")), "time": plain(p.get("time", "")) or None,
            "team1": {"text": plain(p.get("team1", "")), "link": t1l}, "team2": {"text": plain(p.get("team2", "")), "link": t2l},
            "score_raw": strip_markup(p.get("score", "")), "score1": s1, "score2": s2, **flags, "pens1": pens[0], "pens2": pens[1],
            "result": res if res in ("W", "L", "D") else None,
            "stadium": {"text": stadium_text, "link": sl}, "location": location,
            "attendance": int(att) if att else None,
        })
    return out
