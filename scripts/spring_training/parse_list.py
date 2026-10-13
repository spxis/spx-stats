"""Parse the wikitext of English Wikipedia's "List of Major League Baseball spring training ballparks" (CC BY-SA 4.0).
Imported by fetch.py and load.py (they add this folder to sys.path); reads nothing but the text it is given.

parks(text) -> list of dicts, one per table row of the "Current ballparks" and "Formerly used ballparks" tables:
  status        'current' | 'former'
  name          the stadium cell as shown (links resolved to their text, "(a.k.a. ...)" kept)
  link          the title of the first link in the stadium cell (the article), or None
  opened, last_used   years as shown (ints or None); last_used only in the former table
  city_text     the city cell as shown, state_name the state word at its end ('Florida', 'Arizona', ...) or None
  city_link     the title the city links to
  capacity      int or None ("unknown", blank, "4,721 (in 1984)" -> 4721)
  occupants     [{'club_text', 'club_link', 'years': [(from, to|None)], 'years_text', 'raw'}]  to None = still there ("present")
  occupants_former  the same for the "Former occupants" column of the current table (else [])
  status_text   the Status cell of the former table
  cells         the raw cells, for the archive row
"""
import re

PRESENT = None


def strip_markup(t):
    t = re.sub(r"<ref[^>]*/>", "", t)
    t = re.sub(r"<ref[^>]*>.*?</ref>", "", t, flags=re.S)
    t = re.sub(r"\{\{efn(?:[^{}]|\{\{[^{}]*\}\})*\}\}", "", t)
    t = re.sub(r"<!--.*?-->", "", t, flags=re.S)
    return t


def text_of(cell):
    """A cell as plain text: links shown as their text, bold marks and line breaks dropped."""
    t = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", cell)
    t = re.sub(r"<br\s*/?>", " ", t)
    t = t.replace("'''", "").replace("&nbsp;", " ").replace("&amp;", "&")
    return re.sub(r"\s+", " ", t).strip()


def first_link(cell):
    m = re.search(r"\[\[([^\]|#]+)", cell)
    return m.group(1).strip().replace("&nbsp;", " ") if m else None


def to_int(s):
    m = re.search(r"\d[\d,]*", s or "")
    return int(m.group(0).replace(",", "")) if m else None


def parse_years(s):
    """'1947-50, 1952-61' -> [(1947, 1950), (1952, 1961)]; '2004-present' -> [(2004, None)]; '1918' -> [(1918, 1918)]. None when unreadable."""
    out = []
    for part in re.split(r"\s*,\s*", s.strip()):
        part = part.replace("\u2013", "-").replace("\u2014", "-")
        r = re.fullmatch(r"(\d{4})\s*-\s*(\d{4}|\d{2}|present)", part)
        if r:
            a, b = int(r.group(1)), r.group(2)
            if b == "present":
                out.append((a, PRESENT))
            else:
                bb = int(b) if len(b) == 4 else int(str(a)[:2] + b)
                out.append((a, bb))
            continue
        r = re.fullmatch(r"(\d{4})", part)
        if r:
            out.append((int(r.group(1)), int(r.group(1))))
            continue
        return None
    return out


def occupants(cell):
    """The clubs of a cell: one per <br />, with the years in the brackets after the club. A club name split by '/<br />' is rejoined."""
    cell = re.sub(r"/\s*<br\s*/?>", "/", cell)
    res = []
    for piece in re.split(r"<br\s*/?>", cell):
        piece = piece.strip()
        if not piece:
            continue
        tt = text_of(piece)
        m = re.search(r"\(([^()]*)\)\s*$", tt)
        years = parse_years(m.group(1)) if m else None
        res.append({"club_text": (tt[:m.start()] if m else tt).strip(), "club_link": first_link(piece),
                    "years": years or [], "years_text": m.group(1) if m else None, "raw": piece})
    return res


def row_cells(rows_text):
    cells = []
    for line in rows_text.split("\n"):
        if line.startswith("|}") or line.startswith("|{") or line.startswith("{|"):
            continue
        if line.startswith("!"):
            continue
        if line.startswith("|"):
            s = line[1:]
            if s.startswith("|"):
                s = s[1:]
            s = re.sub(r"^\s*(?:rowspan|colspan|style|scope)[^|\[]*\|(?!\|)", "", s)
            cells.append(s.strip())
        elif cells and line.strip():
            cells[-1] += " " + line.strip()
    return cells


def parks(text):
    body = strip_markup(text)
    body = body.split("==Current cities==")[0]
    cur_part = body.split("==Formerly used ballparks==")[0]
    old_part = body.split("==Formerly used ballparks==")[1] if "==Formerly used ballparks==" in body else ""
    res = []
    gf, cactus = cur_part.split("===Cactus League (Arizona)===") if "===Cactus League (Arizona)===" in cur_part else (cur_part, "")
    for status, part, ncols, section in (("current", gf, 6, "grapefruit"), ("current", cactus, 6, "cactus"), ("former", old_part, 7, None)):
        for row in re.split(r"\n\|-+[^\n]*", part):
            cells = row_cells(row)
            if len(cells) < ncols - 1 or not cells[0].strip():
                continue
            if status == "current":
                name, opened, city, cap, cur, form = (cells + [""])[:6]
                last = status_text = None
            else:
                name, opened, last, city, cap, occ, status_text = (cells + [""])[:7]
                cur, form = occ, ""
            cityt = text_of(city)
            cl = first_link(city)
            res.append({"status": status, "name": text_of(name), "link": first_link(name), "opened": to_int(opened),
                        "last_used": to_int(last) if last else None, "city_text": cityt,
                        "state_name": ((cl or cityt).rsplit(",", 1)[1].strip().replace("\xa0", " ") if "," in (cl or cityt) else None), "city_link": cl, "section": section,
                        "capacity": to_int(cap) if "unknown" not in cap.lower() else None,
                        "occupants": occupants(cur), "occupants_former": occupants(form), "status_text": text_of(status_text) if status_text else None,
                        "cells": cells})
    return res
