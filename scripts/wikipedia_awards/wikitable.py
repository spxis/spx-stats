"""Minimal MediaWiki table reader: wikitext -> list of tables, each a list of rows of plain-text cells
(rowspan/colspan expanded). Templates are reduced to their text; nothing here invents data."""
import re

def _split0(s, seps):
    """Split s on any separator string in seps, only at bracket/brace depth 0."""
    out, cur, i, d1, d2 = [], "", 0, 0, 0
    while i < len(s):
        if s.startswith("[[", i): d1 += 1; cur += "[["; i += 2; continue
        if s.startswith("]]", i): d1 = max(0, d1 - 1); cur += "]]"; i += 2; continue
        if s.startswith("{{", i): d2 += 1; cur += "{{"; i += 2; continue
        if s.startswith("}}", i): d2 = max(0, d2 - 1); cur += "}}"; i += 2; continue
        if d1 == 0 and d2 == 0:
            m = next((x for x in seps if s.startswith(x, i)), None)
            if m: out.append(cur); cur = ""; i += len(m); continue
        cur += s[i]; i += 1
    out.append(cur); return out

def _tmpl(m):
    parts = [p.strip() for p in _split0(m.group(1), ["|"])]
    n = parts[0].lower().replace("_", " ")
    a = parts[1:]
    pos = [x for x in a if "=" not in x or x.startswith("http")]
    if n == "sortname":
        if len(a) >= 3 and a[2] and "=" not in a[2]: return a[2]
        return " ".join(x for x in pos[:2] if x)
    if n in ("scfy",): return f"{int(pos[0])}" if pos else ""
    if n in ("nhly", "nhl year", "nbay", "nba year") and pos and pos[0].isdigit():
        y = int(pos[0]); return f"{y}–{(y + 1) % 100:02d}"
    if n in ("dagger", "double-dagger", "double dagger", "ddagger", "sup", "efn", "refn", "citation needed", "cn", "clear", "reflist", "legend", "nbsp", "snd", "ndash", "-", "ref", "sfn", "#tag:ref", "cite web", "cite news", "cite book", "ref label", "note label", "notelist", "r", "refn", "harv", "cref", "efn-ua", "sfnp", "note", "cite press release", "cite magazine", "cite journal"): return {"dagger": "†", "double-dagger": "‡", "double dagger": "‡", "ddagger": "‡", "nbsp": " ", "snd": "–", "ndash": "–"}.get(n, "")
    if n in ("sort", "sortkey", "hs", "hidden sort", "sorted"): return pos[1] if len(pos) > 1 and n == "sort" else ""
    if n == "flagicon" or n == "flag": return ""
    if n in ("flagdeco",): return ""
    if n in ("small", "nowrap", "nobold", "smaller", "big", "noitalic", "nw", "nobr", "abbr", "lang", "transl", "tooltip", "bartable", "font"): return (pos[0] if pos else "") if n != "abbr" else (pos[0] if pos else "")
    if n in ("tooltip",): return pos[0] if pos else ""
    if n in ("br", "break"): return " "
    return ("{{" + parts[0] + "|" + "|".join(a) + "}}") if False else (pos[0] if pos else "")

def clean(s, brsep=" "):
    s = re.sub(r"<!--.*?-->", "", s, flags=re.S)
    s = re.sub(r"<ref[^>/]*/>", "", s)
    s = re.sub(r"<ref[^>]*>.*?</ref>", "", s, flags=re.S)
    s = re.sub(r"<br\s*/?>", brsep, s, flags=re.I)
    s = re.sub(r"<sup[^>]*>.*?</sup>", "", s, flags=re.S | re.I)
    for _ in range(6):
        n = re.sub(r"\{\{([^{}]*)\}\}", _tmpl, s)
        if n == s: break
        s = n
    s = re.sub(r"\[\[(?:File|Image):[^\]]*\]\]", "", s)
    s = re.sub(r"\[\[[^\]|]*\|([^\]]*)\]\]", r"\1", s)
    s = re.sub(r"\[\[([^\]]*)\]\]", r"\1", s)
    s = re.sub(r"\[https?://\S+ ([^\]]*)\]", r"\1", s)
    s = re.sub(r"</?[a-zA-Z][^>]*>", "", s)
    s = s.replace("'''", "").replace("''", "").replace("&nbsp;", " ").replace("&ndash;", "–").replace("&amp;", "&")
    return re.sub(r"\s+", " ", s).strip()

def _attr(a, k):
    m = re.search(k + r'\s*=\s*"?(\d+)', a or "")
    return int(m.group(1)) if m else 1

def tables(text, brsep=" "):
    """Yield tables as {'caption':str,'rows':[[(text,isheader),...]],'attrs':str}, nested tables flattened."""
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    text = re.sub(r"<ref[^>]*?/>", "", text)
    text = re.sub(r"<ref[^>]*>.*?</ref>", "", text, flags=re.S)
    lines = text.split("\n")
    stack, done = [], []
    for ln in lines:
        s = ln.strip()
        if s.startswith("{|"):
            stack.append({"attrs": s[2:], "caption": "", "rows": [[]]}); continue
        if not stack: continue
        t = stack[-1]
        if s.startswith("|}"):
            done.append(stack.pop()); continue
        if s.startswith("|+"): t["caption"] = clean(s[2:].split("|")[-1]); continue
        if s.startswith("|-"):
            if t["rows"][-1]: t["rows"].append([])
            continue
        if s and s[0] in "|!":
            hdr = s[0] == "!"
            body = s[1:]
            seps = ["||", "!!"] if hdr else ["||"]
            for cell in _split0(body, seps):
                parts = _split0(cell, ["|"])
                attrs, content = (parts[0], "|".join(parts[1:])) if len(parts) > 1 and "[[" not in parts[0] and "{{" not in parts[0] else ("", cell)
                t["rows"][-1].append([content, hdr, attrs])
            continue
        if t["rows"][-1]: t["rows"][-1][-1][0] += "\n" + ln
    out = []
    for t in done:
        grid, carry = [], {}
        for r in t["rows"]:
            if not r: continue
            row, ci, cells = [], 0, list(r)
            while cells or ci in carry:
                if ci in carry and carry[ci][1] > 0:
                    row.append(carry[ci][0]); carry[ci][1] -= 1; 
                    if carry[ci][1] == 0: del carry[ci]
                    ci += 1; continue
                if not cells: break
                c, hdr, attrs = cells.pop(0)
                txt = clean(c, brsep)
                rs, cs = _attr(attrs, "rowspan"), _attr(attrs, "colspan")
                for k in range(cs):
                    row.append(txt)
                    if rs > 1: carry[ci] = [txt, rs - 1]
                    ci += 1
            grid.append({"hdr": all(x[1] for x in r), "cells": row})
        out.append({"caption": t["caption"], "attrs": t["attrs"], "rows": grid})
    return out
