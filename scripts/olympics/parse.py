#!/usr/bin/env python3
"""Read the Olympic event articles of English Wikipedia (CC BY-SA 4.0) that fetch.py saved, and write a rerunnable load file for legacy_wikipedia_olympics.

  parse.py <raw dir> <out.sql> [<out.json>]

Every table under the article's "Results" heading is read as the article wrote it: the heading path gives the round and the heat, the header row gives
the columns (rank, lane, athlete, nation, reaction, time, notes, a heat column), every other row is one athlete in one race. Wind comes from the
text above or below a table or from a "Wind:" row. Nothing is guessed: a cell that is empty, "Unknown" or not a number stays text and the number stays null;
a row that does not fit the header, and a table that cannot be read, go to <out.json> (and the unparsed table) with the section they came from.
The athlete's Wikipedia title is kept (link_title) so that titles-NNN.json (fetch.py titles) can give its Wikidata item; the raw cells of every row are kept as written.
Standard library only."""
import html, json, os, re, sys

# ---------------------------------------------------------------------------------------------------------------- wikitext helpers

REF = re.compile(r"<ref\b[^>/]*/>|<ref\b[^>]*>.*?</ref>|<!--.*?-->", re.S | re.I)
TEMPLATE = re.compile(r"\{\{([^{}]*)\}\}")
LINK = re.compile(r"\[\[([^\[\]]*)\]\]")


def strip_refs(t):
    return REF.sub("", t)


def split_args(body):
    """Split a template body at top-level pipes (links are protected)."""
    out, cur, depth = [], "", 0
    i = 0
    while i < len(body):
        two = body[i:i + 2]
        if two == "[[": depth += 1; cur += two; i += 2; continue
        if two == "]]": depth -= 1; cur += two; i += 2; continue
        if body[i] == "|" and depth == 0: out.append(cur); cur = ""; i += 1; continue
        cur += body[i]; i += 1
    out.append(cur)
    return out


def expand(t):
    """Templates the results tables use, turned into their text; any other template disappears."""
    for _ in range(12):
        def sub(m):
            a = [x.strip() for x in split_args(m.group(1))]
            n = a[0].lower()
            if n in ("abbr", "athabbr", "tooltip"): return a[1] if len(a) > 1 else ""
            if n == "sort": return a[2] if len(a) > 2 else ""
            if n in ("strikethrough", "small", "nowrap", "nobr", "big"): return a[1] if len(a) > 1 else ""
            mm = re.fullmatch(r"(gold|silver|bronze)0*([123])", n)
            if mm: return mm.group(2)
            if n == "wr": return "WR"
            if n == "olyr": return "OR"
            if n in ("convert", "cvt"): return " ".join(a[1:3]) if len(a) > 2 else (a[1] if len(a) > 1 else "")
            if n in ("sortname",): return " ".join(x for x in a[1:3] if x and "=" not in x)
            if n in ("flagathlete", "flagiocathlete"): return a[1] if len(a) > 1 else ""
            if n == "frac": return "/".join(a[1:3])
            return ""
        new = TEMPLATE.sub(sub, t)
        if new == t: break
        t = new
    return t


def plain(t):
    t = strip_refs(t)
    t = expand(t)
    t = LINK.sub(lambda m: (m.group(1).split("|")[-1] if not re.match(r"(?i)(file|image|category):", m.group(1)) else ""), t)
    t = re.sub(r"<br\s*/?>", " ", t, flags=re.I)
    t = re.sub(r"<[^>]+>", "", t)
    t = t.replace("&nbsp;", " ").replace("&ndash;", "-").replace("&minus;", "-").replace("−", "-").replace("–", "-")
    t = t.replace("'''", "").replace("''", "")
    return re.sub(r"\s+", " ", t).strip()


def find_link(cell):
    """The first ordinary link of a cell, as (target title, shown text), or (None, None)."""
    for m in LINK.finditer(strip_refs(cell)):
        body = m.group(1)
        if re.match(r"(?i)(file|image|category|wikipedia):", body): continue
        tgt, _, shown = body.partition("|")
        tgt = tgt.split("#")[0].strip().replace("_", " ")
        return tgt, plain("[[" + body + "]]")
    return None, None


def athlete_of(cell):
    """(name, link title, nation code or None) of an athlete cell. A flagathlete / sortname template names the athlete too."""
    cell = strip_refs(cell)
    code = None
    m = re.search(r"\{\{\s*flag(?:ioc)?athlete\s*\|([^{}]*?)\|\s*([A-Za-z]{3})\s*(?:\||\}\})", cell, re.I)
    if m:
        code = m.group(2).upper()
        rest = cell[m.end():]
        if cell[m.end() - 1] == "|" and "}}" in rest: rest = rest.split("}}", 1)[1]
        cell = m.group(1) + " " + rest
    s = re.search(r"\{\{\s*sortname\s*\|([^{}]*)\}\}", cell, re.I)
    if s:
        args = [x.strip() for x in s.group(1).split("|")]
        pos = [x for x in args if "=" not in x]
        dab = next((x.split("=", 1)[1].strip() for x in args if x.lower().startswith("dab=")), "")
        first, last, art = (pos + ["", "", ""])[:3]
        name = (first + " " + last).strip()
        return name, (art or (name + (" (" + dab + ")" if dab else ""))).strip(), code
    tgt, shown = find_link(cell)
    if tgt: return shown, tgt, code
    return plain(cell), None, code


def nation_of(cell):
    cell = strip_refs(cell)
    m = re.search(r"\{\{\s*flag(?:ioc\d?|ioc(?:team|athlete)?|icon|country)\s*\|\s*([A-Za-z]{3})\s*(?:\||\}\})", cell, re.I)
    if m: return m.group(1).upper()
    return None


# ---------------------------------------------------------------------------------------------------------------- tables

def attr_split(cell):
    """Cell text without its leading attributes (align=left| ...), and the rowspan / colspan they carried."""
    if cell.startswith("|"): return cell[1:], 1, 1
    depth, i = 0, 0
    while i < len(cell):
        two = cell[i:i + 2]
        if two in ("[[", "{{"): depth += 1; i += 2; continue
        if two in ("]]", "}}"): depth -= 1; i += 2; continue
        if cell[i] == "|" and depth == 0:
            left = cell[:i]
            if re.fullmatch(r"\s*(?:[\w:-]+\s*=\s*(?:\"[^\"]*\"|'[^']*'|[^\s|\"']*)\s*)+", left):
                rs = re.search(r"rowspan\s*=\s*\"?(\d+)", left, re.I)
                cs = re.search(r"colspan\s*=\s*\"?(\d+)", left, re.I)
                return cell[i + 1:], int(rs.group(1)) if rs else 1, int(cs.group(1)) if cs else 1
            break
        i += 1
    return cell, 1, 1


def split_cells(line, sep):
    out, depth, cur, i = [], 0, "", 0
    while i < len(line):
        two = line[i:i + 2]
        if two in ("[[", "{{"): depth += 1; cur += two; i += 2; continue
        if two in ("]]", "}}"): depth -= 1; cur += two; i += 2; continue
        if depth == 0 and line[i:i + 2] in ("||", "!!"):
            out.append(cur); cur = ""; i += 2; continue
        cur += line[i]; i += 1
    out.append(cur)
    return out


def table_rows(lines):
    """[(is_header_row, [cell text, ...])] of one table (the lines between {| and |}); rowspan and colspan are expanded."""
    rows, cur, carry = [], None, {}

    def finish():
        nonlocal cur
        if cur is not None and cur["cells"]:
            while len(cur["cells"]) in carry and carry[len(cur["cells"])][1] > 0:
                c = carry[len(cur["cells"])]
                cur["cells"].append(c[0]); carry[len(cur["cells"]) - 1] = (c[0], c[1] - 1)
            rows.append(cur)
        cur = None

    def start():
        nonlocal cur
        finish()
        cur = {"hdr": None, "cells": []}

    def add(text, header):
        nonlocal cur
        if cur is None: start()
        text, rs, cs = attr_split(text)
        text = text.strip()
        for _ in range(cs):
            # a column carried down from an earlier row's rowspan comes first
            while len(cur["cells"]) in carry and carry[len(cur["cells"])][1] > 0:
                c = carry[len(cur["cells"])]
                cur["cells"].append(c[0]); carry[len(cur["cells"]) - 1] = (c[0], c[1] - 1)
            cur["cells"].append(text)
            if rs > 1: carry[len(cur["cells"]) - 1] = (text, rs - 1)
        cur["hdr"] = header if cur["hdr"] is None else (cur["hdr"] and header)

    for ln in lines:
        s = ln.rstrip()
        if s.startswith("|-"):
            start(); continue
        if s.startswith("|+"): continue
        if s.startswith("!"):
            for c in split_cells(s[1:], "!!"): add(c, True)
        elif s.startswith("|"):
            for c in split_cells(s[1:], "||"): add(c, False)
        elif cur is not None and cur["cells"]:
            cur["cells"][-1] += "\n" + s
    finish()
    # carried cells that sit after the last cell the row wrote (a rowspan in the last column)
    return [(r["hdr"], r["cells"]) for r in rows]


def header_map(cells):
    """Column index of each field the loader knows, from the header cells (a field may have several columns)."""
    m = {}
    for i, c in enumerate(cells):
        raw = strip_refs(c)
        t = plain(raw).lower()
        t = re.sub(r"\s+", " ", t)
        if re.fullmatch(r"(rank|place|pos\.?|position|pl\.?)", t): m.setdefault("place", i)
        elif t.startswith("lane"): m.setdefault("lane", i)
        elif t in ("athlete", "name", "competitor", "runner", "sprinter", "athletes", "player", "swimmer", "swimmers"): m.setdefault("name", i)
        elif t in ("nation", "country", "noc", "team", "nationality"): m.setdefault("nation", i)
        elif t.startswith("reaction") or t in ("react", "rt", "reac."): m.setdefault("reaction", i)
        elif t == "heat": m.setdefault("heat", i)
        elif t.startswith("time") or t == "result":
            if re.search(r"\(h\)|hand|manual", t + " " + raw.lower()): m.setdefault("time_hand", i)
            elif re.search(r"\(a\)|auto|electronic", t + " " + raw.lower()): m.setdefault("time", i)
            else: m.setdefault("time", i)
        elif t in ("notes", "note", "qual.", "qual", "qualification", "record", "records", "remarks", "comments", "notes."): m.setdefault("notes", []).append(i)
    return m


# ---------------------------------------------------------------------------------------------------------------- sections

HEAD = re.compile(r"^(={2,6})\s*(.*?)\s*\1\s*$")


def classify(title):
    t = re.sub(r"[-–\s]+", " ", plain(title).lower()).strip()
    if re.match(r"^semi ?finals?\b", t) or t.startswith("semifinal"): return "semifinals"
    if re.match(r"^quarter ?finals?\b", t): return "quarterfinals"
    if t.startswith("preliminar"): return "prelim"
    if t.startswith("repechage"): return "repechage"
    if t.startswith("final"): return "final"
    if t in ("heats", "first round", "round 1", "round one", "round 1 heats") or re.match(r"^(first )?round( 1)?$", t): return "heats"
    if re.match(r"^(second round|round 2)$", t): return "round2"
    if re.match(r"^(third round|round 3)$", t): return "round3"
    return None


ROUND_ORD = {"prelim": 1, "heats": 2, "round2": 3, "repechage": 4, "quarterfinals": 5, "round3": 6, "semifinals": 7, "final": 8}


def trailing_int(title):
    m = re.search(r"(\d+)\s*$", plain(title))
    return int(m.group(1)) if m else None


def readings_of(text):
    """{heat: (text, value)} from a sentence such as 'Wind readings- Heat 1: -0.1 m/s; Heat 2: +0.1 m/s'."""
    t = text.replace("\u2212", "-").replace("&minus;", "-").replace("\u2013", "-").replace("&nbsp;", " ")
    m = re.search(r"[Ww]ind readings?[^\n]*", t)
    out = {}
    if m:
        for h, v in re.findall(r"(?:Heat|Race)\s*(\d+)\s*:\s*([+\-]?\d+(?:\.\d+)?)", m.group(0)): out[int(h)] = (v, float(v))
    return out


def wind_of(text):
    t = text.replace("\u2212", "-").replace("&minus;", "-").replace("\u2013", "-").replace("&nbsp;", " ")
    m = re.search(r"\b(tail|head)wind of\s*(\d+(?:\.\d+)?)\s*m\s*/\s*s", t, re.I)
    if m:
        v = ("+" if m.group(1).lower() == "tail" else "-") + m.group(2)
        return v, float(v)
    if re.search(r"[Ww]ind readings?[^\n]*(?:Heat|Race)\s*\d+\s*:", t): return None, None
    m = re.search(r"[Ww]ind[^0-9+\-\n]{0,30}?(?:\{\{\s*convert\s*\|)?\s*([+\-]?\s*\d+(?:\.\d+)?)\s*(?:\||\s)*m\s*/\s*s", t)
    if not m: return None, None
    v = m.group(1).replace(" ", "")
    try: return v, float(v)
    except ValueError: return v, None


NUM = re.compile(r"^\d{1,2}(?:\.\d{1,3})?$")
CLOCK = re.compile(r"^(\d{1,2}):(\d{2}(?:\.\d+)?)$")
STATUS = re.compile(r"\b(DNS|DNF|DQ|DSQ|NM|DNQ|ND)\b|disqualif", re.I)
MARK = re.compile(r"(?<![A-Za-z])(Q|q|qR|QR|qB|WR|OR|NR|AR|CR|PB|SB|WL|EL|NU20R|TR|ER|AF|SA|OC|AS|WJ|QSO|WD|QS|qs|QF|qf|AM)(?![A-Za-z])")


def to_seconds(s):
    s = s.strip()
    m0 = re.match(r"^(\d{1,2}(?:\.\d{1,3})?)\s*(?:[,;]\s*\S|\()", s)
    if m0: return float(m0.group(1))
    m1 = re.match(r"^(?:(\d{1,2}):)?(\d{1,2}(?:\.\d{1,3})?)\s+(?!DSQ|DQ|DNS|DNF|DNQ)[A-Za-z]", s)
    if m1: return int(m1.group(1) or 0) * 60 + float(m1.group(2))
    if NUM.match(s): return float(s)
    m = CLOCK.match(s)
    if m: return int(m.group(1)) * 60 + float(m.group(2))
    return None


def marks_of(raw):
    raw = strip_refs(raw)
    found = []
    for m in TEMPLATE.finditer(raw):
        a = [x.strip() for x in split_args(m.group(1))]
        n = a[0].lower()
        if n in ("abbr", "athabbr") and len(a) > 1: found.append(a[1])
        elif n == "wr": found.append("WR")
        elif n == "olyr": found.append("OR")
        elif n == "strikethrough" and len(a) > 1: found += re.findall(r"[A-Za-z]+", a[1])
    rest = expand(TEMPLATE.sub("", raw))
    rest = LINK.sub(lambda m: m.group(1).split("|")[-1], rest)
    found += MARK.findall(plain(rest))
    out = []
    for x in found:
        x = x.strip()
        if x and x not in out: out.append(x)
    return out


def row_fields(cells, hm, year):
    """Fields of one data row by the header map, or None when the row has too few cells."""
    def cell(k):
        i = hm.get(k)
        return cells[i] if isinstance(i, int) and i < len(cells) else None
    out = {"cells": {}, "splits": None}
    name_c, nat_c = cell("name"), cell("nation")
    if name_c is None: return None
    nm, link, code = athlete_of(name_c)
    nat = nation_of(nat_c) if nat_c is not None else None
    nat = nat or code or nation_of(name_c)
    out.update(name=nm, link_title=link, nation=nat, nation_text=plain(nat_c) if nat_c is not None else None)
    pc = cell("place")
    pt = plain(pc) if pc is not None else None
    if pc is not None and not pt:
        mi = re.search(r"\b(gold|silver|bronze)\s+medal", pc, re.I)
        if mi: pt = {"gold": "1", "silver": "2", "bronze": "3"}[mi.group(1).lower()]
    out["place_text"] = pt or None
    pm = re.match(r"^=?\s*(\d{1,3})\s*(?:=|st|nd|rd|th)?\b", pt or "")
    out["place"] = int(pm.group(1)) if pm else None
    lc = cell("lane")
    lt = plain(lc) if lc is not None else ""
    out["lane"] = int(lt) if re.fullmatch(r"\d{1,2}", lt) else None
    rc = cell("reaction")
    rt = plain(rc) if rc is not None else ""
    out["reaction_s"] = float(rt) if re.fullmatch(r"\d?\.\d{2,3}", rt) else None
    tc, th = cell("time"), cell("time_hand")
    tt = plain(tc) if tc is not None else ""
    out["time_text"] = tt or None
    out["time_s"] = to_seconds(tt)
    tht = plain(th) if th is not None else ""
    out["time_hand_text"] = tht or None
    out["time_hand_s"] = to_seconds(tht)
    notes_raw = " ; ".join(cells[i] for i in hm.get("notes", []) if i < len(cells))
    out["notes"] = plain(notes_raw) or None
    out["marks"] = marks_of(notes_raw)
    for extra in (tc, th):
        if extra is not None and re.match(r"^\s*(?:\d{1,2}:)?\d{1,2}(?:\.\d{1,3})?\s*(?:[,;]|\s(?=(?!DSQ|DQ|DNS|DNF|DNQ)[A-Za-z]))", plain(extra)):
            for mk in marks_of(re.sub(r"^\s*[\d.:]+\s*[,;]?", "", extra)):
                if mk not in out["marks"]: out["marks"].append(mk)
    st = None
    for src in (pt or "", tt, tht, plain(notes_raw), plain(strip_refs(name_c))):
        m = STATUS.search(src)
        if m: st = (m.group(1) or "DQ").upper(); break
    out["status"] = {"DSQ": "DQ"}.get(st, st)
    hc = cell("heat")
    ht = plain(hc) if hc is not None else ""
    out["heat_col"] = int(ht) if re.fullmatch(r"\d{1,2}", ht) else None
    out["cells"] = {str(i): c.strip() for i, c in enumerate(cells)}
    return out


def parse_infobox(text):
    m = re.search(r"\{\{\s*Infobox Olympic event(.*?)\n\}\}", text, re.S | re.I)
    if not m: return {}
    d = {}
    for ln in re.split(r"\n\s*\|", "\n" + m.group(1)):
        k, eq, v = ln.partition("=")
        k = k.strip().lower()
        if eq and k and k not in ("image", "image_size", "caption", "longnames", "prev", "next"):
            d[k] = strip_refs(v).strip()
    return d


def parse_article(text, key, year):
    text = strip_refs(text)
    lines = text.split("\n")
    races, unparsed = {}, []
    path = []          # [(level, title)]
    in_results, seen_results, last_round = False, False, None
    has_results = any(HEAD.match(x) and len(HEAD.match(x).group(1)) == 2 and plain(HEAD.match(x).group(2)).lower() == "results" for x in lines)
    i = 0
    last_head_i = 0
    pending_wind_text = ""
    tbl_seq = {}
    while i < len(lines):
        ln = lines[i]
        m = HEAD.match(ln)
        if m:
            lvl, title = len(m.group(1)), m.group(2)
            path = [p for p in path if p[0] < lvl] + [(lvl, title)]
            if lvl == 2:
                if plain(title).lower() == "results": in_results, seen_results, last_round = True, True, None
                elif (seen_results or not has_results) and classify(title): in_results = True
                else: in_results = False
            if classify(title): last_round = classify(title)
            last_head_i = i + 1
            i += 1
            continue
        if ln.startswith("{|"):
            j, depth = i + 1, 1
            while j < len(lines) and depth:
                if lines[j].startswith("{|"): depth += 1
                elif lines[j].startswith("|}"): depth -= 1
                j += 1
            body = lines[i + 1:j - 1]
            above = "\n".join(lines[last_head_i:i])
            below_lines = []
            k = j
            while k < len(lines) and len(below_lines) < 4 and not HEAD.match(lines[k]) and not lines[k].startswith("{|"):
                below_lines.append(lines[k]); k += 1
            below = "\n".join(below_lines)
            section = " > ".join(plain(p[1]) for p in path)
            skip = (not in_results) or any(re.search(r"summary|overall|record|schedule", plain(p[1]), re.I) for p in path)
            if not skip:
                handle_table(body, above, below, path, section, key, year, races, unparsed, tbl_seq, last_round)
            i = j
            last_head_i = j
            continue
        i += 1
    for sp in tbl_seq.get("splits", []):
        hit = 0
        for r in races.values():
            if r["round_code"] != sp["rcode"]: continue
            for f in r["rows"]:
                if (sp["link"] and f["link_title"] == sp["link"]) or (not sp["link"] and f["name"] == sp["name"]):
                    f["splits"] = sp["splits"]; hit += 1
        if hit != 1:
            unparsed.append({"event": key, "year": year, "section": sp["section"], "note": f"splits of {sp['name']} matched {hit} athlete lines"})
    for (tag, rc), rd in [(k, v) for k, v in tbl_seq.items() if isinstance(k, tuple)]:
        for r in races.values():
            if r["round_code"] == rc and r["wind_ms"] is None and r["race_no"] in rd and r["place_scope"] == "race":
                r["wind_text"], r["wind_ms"] = rd[r["race_no"]]
    return races, unparsed


def handle_table(body, above, below, path, section, key, year, races, unparsed, tbl_seq, last_round):
    rows = table_rows(body)
    hdr_i = next((n for n, (h, c) in enumerate(rows) if h and len(c) >= 2), None)
    if hdr_i is None:
        unparsed.append({"event": key, "year": year, "section": section, "note": "table without a header row"}); return
    hdr_cells = []
    n = hdr_i
    while n < len(rows) and rows[n][0]:
        hdr_cells += rows[n][1]; n += 1
    hm = header_map(hdr_cells)
    split_cols = []
    for i, c in enumerate(hdr_cells):
        m = re.match(r"^(\d+)(?:\s*-\s*(\d+))?\s*(?:metres?|meters?|m)\b.*split", plain(c), re.I)
        if m: split_cols.append((i, int(m.group(1)), int(m.group(2)) if m.group(2) else None))
    if split_cols and "name" in hm:
        rcode = next((classify(t) for l, t in reversed(path) if classify(t)), last_round)
        for hdr, cells in rows[n:]:
            if hdr or len(cells) <= max(i for i, a, b in split_cols): continue
            nm, link, _ = athlete_of(cells[hm["name"]])
            sl = []
            for i, a, b in split_cols:
                v = plain(cells[i])
                if re.fullmatch(r"\d{1,2}(?:\.\d{1,3})?", v):
                    sl.append({"m": a, "s": float(v)} if b is None else {"m": b, "from": a, "s": float(v), "interval": True})
            if sl: tbl_seq.setdefault("splits", []).append({"rcode": rcode, "name": nm, "link": link, "splits": sl, "section": section})
        return
    if "name" not in hm or "time" not in hm and "time_hand" not in hm and "place" not in hm:
        unparsed.append({"event": key, "year": year, "section": section, "note": "no athlete or time column: " + " | ".join(plain(c) for c in hdr_cells)[:120]}); return
    rcode, heat_no = None, None
    for lvl, title in reversed(path):
        c = classify(title)
        if c: rcode = c; break
    rcode = rcode or last_round
    forced_final = rcode is None and len(path) == 1 and plain(path[0][1]).lower() == "results"
    if forced_final: rcode = "final"
    if rcode is None:
        unparsed.append({"event": key, "year": year, "section": section, "note": "round not recognised"}); return
    inner_title = path[-1][1]
    heat_no = trailing_int(inner_title) if re.search(r"(heat|final|round)\s*\d+\s*$", plain(inner_title), re.I) else None
    dl = re.findall(r"^;\s*(.+?)\s*$", above, re.M)
    dl_label = plain(dl[-1]) if dl else None
    swimoff = bool(re.search(r"swim-?off", (dl_label or "") + " " + plain(inner_title), re.I))
    letter = re.search(r"\bfinal\s+([A-D])\b", (dl_label or "") + " " + plain(inner_title), re.I)
    round_label = next((plain(t) for l, t in reversed(path) if classify(t) == rcode and trailing_int(t) is None), plain(path[-1][1]))
    if forced_final: round_label = "Final"
    wind_row = None
    data = []
    for hdr, cells in rows[n:]:
        if hdr and not any(plain(c) for c in cells): continue
        joined = " ".join(cells)
        if re.search(r"\bwind\b", joined, re.I) and not re.search(r"\[\[", cells[0] if cells else ""):
            wind_row = wind_of(plain_keep_nbsp(joined)); continue
        if not any(plain(c) for c in cells): continue
        f = row_fields(cells, hm, year)
        if f is None or len(cells) < len(hdr_cells) - 1:
            unparsed.append({"event": key, "year": year, "section": section, "note": "row does not fit the header: " + plain(joined)[:120]}); continue
        data.append(f)
    if not data: return
    wt = wind_row if wind_row and wind_row[0] else wind_of(above[-500:])
    if not wt[0]: wt = wind_of(below)
    ord_ = ROUND_ORD[rcode]
    for chunk in (above, below):
        for h, v in readings_of(chunk).items(): tbl_seq.setdefault(("readings", rcode), {})[h] = v
    groups = {}
    if "heat" in hm and all(f["heat_col"] for f in data):
        for f in data: groups.setdefault(f["heat_col"], []).append(f)
        scope = "round"
    else:
        if swimoff:
            tbl_seq["so:" + rcode] = tbl_seq.get("so:" + rcode, 0) + 1
            groups[90 + tbl_seq["so:" + rcode]] = data
        elif letter:
            groups[ord(letter.group(1).upper()) - 64] = data
        else:
            tbl_seq[rcode] = tbl_seq.get(rcode, 0) + 1
            groups[heat_no or tbl_seq[rcode]] = data
        scope = "race"
    for no, fs in groups.items():
        rk = (ord_, no)
        if rk in races:
            unparsed.append({"event": key, "year": year, "section": section, "note": f"race {rcode} {no} read twice; the second table is dropped"}); continue
        races[rk] = {"round_ord": ord_, "round_code": rcode, "round_label": round_label, "race_no": no, "heat_label": dl_label if (swimoff or letter) and dl_label else ("Final" if forced_final else plain(path[-1][1])),
                     "wind_text": wt[0] if scope == "race" else None, "wind_ms": wt[1] if scope == "race" else None, "section": section, "place_scope": scope, "rows": fs}


def plain_keep_nbsp(t):
    return strip_refs(t)


# ---------------------------------------------------------------------------------------------------------------- the load file

def q(v):
    if v is None: return "null"
    if isinstance(v, bool): return "true" if v else "false"
    if isinstance(v, (int, float)): return repr(v)
    return "'" + str(v).replace("'", "''") + "'"


def qa(lst):
    return "array[" + ",".join(q(x) for x in lst) + "]::text[]" if lst else "'{}'::text[]"


def read_raw(raw):
    meta = json.load(open(os.path.join(raw, "fetched.json"), encoding="utf-8"))
    for a in meta["articles"]:
        if not a.get("missing"):
            a["text"] = open(os.path.join(raw, a["file"]), encoding="utf-8").read()
    return meta


def read_titles(raw):
    out = {}
    for f in sorted(os.listdir(raw)):
        if not f.startswith("titles-"): continue
        d = json.load(open(os.path.join(raw, f), encoding="utf-8"))
        hop = {x["from"]: x["to"] for x in d.get("normalized", [])}
        hop.update({x["from"]: x["to"] for x in d.get("redirects", [])})
        pages = {p["title"]: p for p in d["pages"]}
        for t in d["requested"]:
            r = t
            for _ in range(5):
                if r in hop: r = hop[r]
            p = pages.get(r)
            out[t] = {"resolved_title": r, "qid": p["qid"] if p else None, "disambiguation": bool(p and p["disambiguation"]),
                      "missing": bool(p and p["missing"]) if p else True}
    return out


def linked_titles(text, key="x", year=0):
    races, _ = parse_article(text, key, year)
    return {f["link_title"] for r in races.values() for f in r["rows"] if f["link_title"]}


def batches(lst, n=150):
    for i in range(0, len(lst), n): yield lst[i:i + n]


def main(raw, out_sql, out_json=None):
    meta = read_raw(raw)
    titles = read_titles(raw)
    sql = ["-- Generated by scripts/olympics/parse.py from " + os.path.basename(os.path.normpath(raw)) + "; do not edit by hand. Rerunnable: the articles it names are deleted and written again.",
           "begin;"]
    unparsed_all, counts = [], {}
    keys = []
    body = []
    for a in meta["articles"]:
        if a.get("missing"):
            unparsed_all.append({"event": a["event"], "year": a["year"], "section": "", "note": "article missing: " + a["requested"]}); continue
        races, unp = parse_article(a["text"], a["event"], a["year"])
        unparsed_all += unp
        keys.append((a["event"], a["year"]))
        ib = parse_infobox(a["text"])
        body.append("insert into legacy_wikipedia_olympics.article (event_key, games_year, page_title, revid, revised_at, fetched_on, qid, infobox) values (%s, %d, %s, %d, %s, %s, %s, %s::jsonb);"
                    % (q(a["event"]), a["year"], q(a["title"]), a["revid"], q(a["timestamp"]), q(meta["fetched_on"]), q(a.get("qid")), q(json.dumps(ib, ensure_ascii=False))))
        rs = sorted(races.values(), key=lambda r: (r["round_ord"], r["race_no"]))
        rv = ["(%s,%d,%d,%s,%s,%d,%s,%s,%s,%s,%s)" % (q(a["event"]), a["year"], r["round_ord"], q(r["round_code"]), q(r["round_label"]), r["race_no"], q(r["heat_label"]),
                                                    q(r["wind_text"]), q(r["wind_ms"]), q(r["section"]), q(r["place_scope"])) for r in rs]
        for b in batches(rv):
            body.append("insert into legacy_wikipedia_olympics.race (event_key, games_year, round_ord, round_code, round_label, race_no, heat_label, wind_text, wind_ms, section, place_scope) values\n" + ",\n".join(b) + ";")
        lv = []
        for r in rs:
            for n, f in enumerate(r["rows"], 1):
                lv.append("(%s,%d,%d,%d,%d,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)" % (
                    q(a["event"]), a["year"], r["round_ord"], r["race_no"], n, q(f["lane"]), q(f["place"]), q(f["place_text"]), q(f["name"]), q(f["link_title"]),
                    q(f["nation"]), q(f["nation_text"]), q(f["reaction_s"]), q(f["time_text"]), q(f["time_s"]), q(f["time_hand_text"]), q(f["time_hand_s"]),
                    q(f["notes"]), qa(f["marks"]), q(f["status"]), q(json.dumps(f["cells"], ensure_ascii=False)) + "::jsonb",
                    "null" if f["splits"] is None else q(json.dumps(f["splits"])) + "::jsonb"))
        for b in batches(lv):
            body.append("insert into legacy_wikipedia_olympics.line (event_key, games_year, round_ord, race_no, row_ord, lane, place, place_text, name, link_title, nation, nation_text, reaction_s, time_text, time_s, time_hand_text, time_hand_s, notes, marks, status, cells, splits) values\n" + ",\n".join(b) + ";")
        counts[(a["event"], a["year"])] = {r["round_code"]: 0 for r in rs}
        for r in rs: counts[(a["event"], a["year"])][r["round_code"]] += len(r["rows"])
    sql.append("delete from legacy_wikipedia_olympics.article where (event_key, games_year) in (%s);" % ", ".join("(%s,%d)" % (q(k), y) for k, y in keys))
    sql += body
    # the Wikidata item of each linked article, as fetch.py titles found it
    used = set()
    for a in meta["articles"]:
        if a.get("missing"): continue
        used |= linked_titles(a["text"])
    tv = []
    for t in sorted(used):
        x = titles.get(t)
        if x: tv.append("(%s,%s,%s,%s,%s,true)" % (q(t), q(x["resolved_title"]), q(x["qid"]), q(x["disambiguation"]), q(x["missing"])))
        else: tv.append("(%s,null,null,false,false,false)" % q(t))
    for b in batches(sorted(used), 300):
        sql.append("delete from legacy_wikipedia_olympics.link_title where title in (%s);" % ",".join(q(t) for t in b))
    for b in batches(tv, 300):
        sql.append("insert into legacy_wikipedia_olympics.link_title (title, resolved_title, qid, disambiguation, missing, looked_up) values\n" + ",\n".join(b) + ";")
    sql.append("delete from legacy_wikipedia_olympics.unparsed where (event_key, games_year) in (%s);" % ", ".join("(%s,%d)" % (q(k), y) for k, y in keys))
    uv = ["(%s,%s,%s,%s)" % (q(u["event"]), u["year"], q(u["section"]), q(u["note"])) for u in unparsed_all]
    for b in batches(uv):
        sql.append("insert into legacy_wikipedia_olympics.unparsed (event_key, games_year, section, note) values\n" + ",\n".join(b) + ";")
    sql.append("commit;")
    open(out_sql, "w", encoding="utf-8").write("\n".join(sql) + "\n")
    if out_json:
        json.dump({"unparsed": unparsed_all, "counts": {f"{k}:{y}": v for (k, y), v in counts.items()}}, open(out_json, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    for (k, y), v in sorted(counts.items()):
        print(k, y, sum(v.values()), v)
    print(len(unparsed_all), "unparsed items", file=sys.stderr)


if __name__ == "__main__":
    a = sys.argv[1:]
    if len(a) < 2: sys.exit(__doc__)
    main(os.path.expanduser(a[0]), a[1], a[2] if len(a) > 2 else None)
