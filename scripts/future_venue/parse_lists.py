"""Parse the "future" tables of English Wikipedia's venue lists of the five leagues (CC BY-SA 4.0).
Imported by fetch.py and load.py (they add this folder to sys.path); reads nothing but the text it is given.

LISTS: the five list articles and the league of each.
future_rows(league, text) -> one dict per table row of the "Under construction", "Proposed" and "Potential future" tables:
  table        the table's caption ('Under construction', 'Proposed'; the CFL table has none, its Status column is used)
  name         the venue cell as shown (links resolved to their text, footnote marks dropped)
  link         the title of the first link in the venue cell (its article), or None when the list gives no article
  clubs        [{'text', 'link'}] one per club in the Team cell ('TBD' gives none)
  location     the location cell as shown, location_link its first link
  capacity     int or None ('TBD' -> None)
  opening_text the Opening cell as shown ('2029', 'TBD'), opening_year an int or None
  status_text  the CFL list's Status column ('Planned', 'Stalled'), else None
  roof, surface  as shown, else None
  cells        the raw cells, for the archive row
"""
import re

LISTS = [
    ("nfl", "List of current National Football League stadiums"),
    ("mlb", "List of Major League Baseball stadiums"),
    ("nba", "List of National Basketball Association arenas"),
    ("nhl", "List of National Hockey League arenas"),
    ("cfl", "List of Canadian Football League stadiums"),
]
# the section holding the future tables, per article (the heading text up to the next heading of the same or a higher level)
SECTIONS = {"nfl": "===Future===", "mlb": "===Future ballparks===", "nba": "==Future or proposed arenas==",
            "nhl": "==Future and proposed arenas==", "cfl": "==Potential future stadiums=="}


def strip_markup(t):
    t = re.sub(r"<ref[^>]*/>", "", t)
    t = re.sub(r"<ref[^>]*>.*?</ref>", "", t, flags=re.S)
    t = re.sub(r"<!--.*?-->", "", t, flags=re.S)
    for _ in range(4):
        t = re.sub(r"\{\{[^{}]*\}\}", "", t)
    return t


def text_of(cell):
    t = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", cell)
    t = re.sub(r"<br\s*/?>", " ", t)
    t = t.replace("'''", "").replace("''", "").replace("&nbsp;", " ").replace("&amp;", "&")
    return re.sub(r"\s+", " ", t).strip()


def links(cell):
    return [m.strip().replace("&nbsp;", " ") for m in re.findall(r"\[\[([^\]|#]+)", cell)]


def to_int(s):
    m = re.search(r"\d[\d,]*", s or "")
    return int(m.group(0).replace(",", "")) if m else None


def cells_of(rows_text):
    cells = []
    for line in rows_text.split("\n"):
        if line.startswith(("|}", "{|", "|+", "|-")):
            continue
        if line.startswith(("!", "|")):
            for piece in re.split(r"\|\||!!", line[1:]):
                piece = re.sub(r"^\s*[A-Za-z\-]+\s*=\s*(?:\"[^\"]*\"|[^|\[\]{}\s]*)(?:\s+[A-Za-z\-]+\s*=\s*(?:\"[^\"]*\"|[^|\[\]{}\s]*))*\s*\|(?!\|)", "", piece)
                cells.append(piece.strip())
        elif cells and line.strip():
            cells[-1] += " " + line.strip()
    return cells


def future_rows(league, text):
    body = strip_markup(text)
    head = SECTIONS[league]
    if head not in body:
        raise SystemExit(f"{league}: section {head} not found")
    section = body.split(head, 1)[1]
    level = len(head) - len(head.lstrip("="))
    m = re.search(r"\n={2,%d}[^=\n][^\n]*=\n" % level, section)
    if m:
        section = section[:m.start()]
    res = []
    for table in re.split(r"\n(?=\{\|)", "\n" + section):
        if not table.strip().startswith("{|"):
            continue
        cap = re.search(r"^\|\+\s*(.*)$", table, re.M)
        caption = text_of(cap.group(1)) if cap else None
        header, rows = None, re.split(r"\n\|-+[^\n]*", table)
        for row in rows:
            cs = cells_of(row)
            if not cs:
                continue
            low = [text_of(c).lower() for c in cs]
            if header is None and any(x in ("team", "club") for x in low):
                header = low
                continue
            if header is None or len(cs) < len(header) - 1:
                continue
            d = dict(zip(header, cs))
            name_key = next((k for k in header if k in ("stadium", "arena", "ballpark", "name")), header[0])
            team = d.get("team", "")
            clubs = []
            tl = links(team)
            tt = text_of(team)
            if tt and tt.upper() != "TBD":
                if len(tl) == 1:
                    clubs = [{"text": tt, "link": tl[0]}]      # a piped link: the shown text is the club, the link may be an article about it
                elif tl:
                    clubs = [{"text": x, "link": x} for x in tl]
                else:
                    clubs = [{"text": tt, "link": None}]
            cap_t = text_of(d.get("capacity", ""))
            op_t = text_of(d.get("opening", ""))
            ym = re.search(r"\b(20\d{2}|19\d{2})\b", op_t)
            res.append({
                "table": caption, "name": text_of(d[name_key]), "link": (links(d[name_key]) or [None])[0], "clubs": clubs,
                "location": text_of(d.get("location", "")), "location_link": (links(d.get("location", "")) or [None])[0],
                "capacity": to_int(cap_t) if cap_t.upper() != "TBD" else None,
                "opening_text": op_t or None, "opening_year": int(ym.group(1)) if ym else None,
                "status_text": text_of(d["status"]) if "status" in d else None,
                "roof": (text_of(d.get("roof", "")) or text_of(d.get("roof type", "")) or None), "surface": text_of(d.get("surface", "")) or None,
                "cells": cs})
    return res


# ---------------------------------------------------------------- a venue's own article
def balanced_end(t, i):
    depth, n = 0, len(t)
    while i < n:
        if t.startswith("{{", i):
            depth += 1
            i += 2
        elif t.startswith("}}", i):
            depth -= 1
            i += 2
            if depth == 0:
                return i
        else:
            i += 1
    return n


def infobox(text):
    """The first infobox of an article as {field: raw value} (field names lower case)."""
    m = re.search(r"\{\{\s*Infobox", text, re.I)
    if not m:
        return {}
    body = text[m.start() + 2:balanced_end(text, m.start()) - 2]
    parts, depth, cur, i = [], 0, "", 0
    while i < len(body):
        two = body[i:i + 2]
        if two in ("{{", "[["):
            depth += 1; cur += two; i += 2
        elif two in ("}}", "]]"):
            depth -= 1; cur += two; i += 2
        elif body[i] == "|" and depth == 0:
            parts.append(cur); cur = ""; i += 1
        else:
            cur += body[i]; i += 1
    parts.append(cur)
    res = {}
    for p in parts[1:]:
        if "=" in p:
            k, v = p.split("=", 1)
            res[k.strip().lower()] = v.strip()
    return res


def plain(v):
    """An infobox value as plain text: references, templates and link markup dropped."""
    v = re.sub(r"\{\{\s*start date and age\s*\|\s*([^|}]*)[^}]*\}\}", r"\1", v or "", flags=re.I)
    return text_of(strip_markup(v))


def coord(v):
    """{{Coord|51|02|23|N|114|03|08|W|...}} or {{Coord|45.41|N|75.71|W|...}} -> (lat, lon) rounded to 6 places, or None."""
    m = re.search(r"\{\{\s*coord\s*\|([^}]*)\}\}", v or "", re.I)
    if not m:
        return None
    toks = [t.strip() for t in m.group(1).split("|")]
    nums, out = [], []
    for t in toks:
        if re.fullmatch(r"-?\d+(?:\.\d+)?", t):
            nums.append(float(t))
        elif t in ("N", "S", "E", "W"):
            val = sum(n / (60 ** i) for i, n in enumerate(nums[:3])) if nums else None
            if val is None:
                return None
            out.append(-val if t in ("S", "W") else val)
            nums = []
            if len(out) == 2:
                return round(out[0], 6), round(out[1], 6)
    return None


def year_of(s):
    m = re.search(r"\b(19|20)\d{2}\b", s or "")
    return int(m.group(0)) if m else None


def lead_replaces(text):
    """The article a lead says the venue replaces ('It will replace the [[Scotiabank Saddledome]]', 'succeeding [[Kauffman Stadium]]',
    'a replacement for [[Xfinity Mobile Arena]]'), else None. Only the text before the first heading is read; the past tense is not matched."""
    lead = strip_markup(text)
    h = re.search(r"\n==", lead)
    lead = lead[:h.start()] if h else lead
    lead = lead[lead.find("'''"):] if "'''" in lead else lead
    m = re.search(r"\b(?:replac(?:e|ing)|replacement for|succeed(?:s|ing)?)\s+(?:the\s+)?(?:existing\s+)?(?:\w+\s+)?\[\[([^\]|#]+)", lead, re.I)
    return m.group(1).strip() if m else None
