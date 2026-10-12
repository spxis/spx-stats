#!/usr/bin/env python3
"""Read the club-season articles saved by fetch_wikipedia.py and load the infobox head coach, captain and alternate
captains into legacy_staff.wikipedia_page and legacy_staff.wikipedia_staff (replaced whole, so it can be rerun).

Usage: load_wikipedia.py [--raw DIR] [--dry-run]     (connection from the PG* variables; migration 039 first)
"""
import argparse, csv, glob, hashlib, io, json, os, re, subprocess, sys

FIELDS = {
    "coach": {"coach", "headcoach", "coaches", "headcoaches", "manager"},
    "captain": {"captain", "captains", "cocaptains"},
    "alt_captain": {"altcaptain", "altcaptains", "alternatecaptain", "alternatecaptains", "assistantcaptain", "assistantcaptains"},
}
NOT_A_NAME = re.compile(r"^(interim|acting|fired|resigned|'+$|vacant|none|no |rotat|n/?a$|tbd|unknown|committee|by committee|—|–|-|\?)", re.I)

def infobox(text):
    """The first template of the page head named like an infobox or a season box (Infobox NBA season, Infobox NFL_season, NBA season, ...)
    that carries a coach or captain field."""
    i, depth, start = 0, 0, 0
    wanted = set().union(*FIELDS.values())
    while i < min(len(text), 30000):
        if text.startswith("{{", i):
            if depth == 0: start = i
            depth += 1; i += 2
        elif text.startswith("}}", i):
            depth -= 1; i += 2
            if depth == 0:
                box = text[start + 2:i - 2]
                if re.match(r"\s*(infobox\b|[\w ]*season\s*(\||\n))", box, re.I) and wanted & set(params(box)): return box
            if depth < 0: depth = 0
        else:
            i += 1
    return None

def params(box):
    out, cur, depth, i = [], "", 0, 0
    while i < len(box):
        two = box[i:i + 2]
        if two in ("{{", "[["): depth += 1; cur += two; i += 2
        elif two in ("}}", "]]"): depth -= 1; cur += two; i += 2
        elif box[i] == "|" and depth == 0: out.append(cur); cur = ""; i += 1
        else: cur += box[i]; i += 1
    out.append(cur)
    res = {}
    for p in out[1:]:
        if "=" in p:
            k, v = p.split("=", 1)
            res.setdefault(re.sub(r"[^a-z]", "", k.lower()), v.strip())
    return res

LISTS = r"(?:plainlist|ubl|unbulleted list|flatlist|hlist|plain list)"
def clean(v):
    v = re.sub(r"<!--.*?-->", "", v, flags=re.S)
    v = re.sub(r"<ref[^>/]*/>", "", v)
    v = re.sub(r"<ref[^>]*>.*?</ref>", "", v, flags=re.S)
    for _ in range(4):
        v = re.sub(r"\{\{\s*(?:nowrap|small|nobold|noitalic)\s*\|([^{}]*)\}\}", r"\1", v, flags=re.I)
        v = re.sub(r"\{\{\s*" + LISTS + r"\s*\|([^{}]*)\}\}", lambda m: m.group(1).replace("|", "\n"), v, flags=re.I)
    v = re.sub(r"\{\{[^{}]*\}\}", "", v)
    v = re.sub(r"<br\s*/?>|</?[a-z][^>]*>", "\n", v, flags=re.I)
    return v

LINK = re.compile(r"\[\[([^\[\]|]+)(?:\|([^\[\]]*))?\]\]")
def names(value):
    out = []
    for seg in re.split(r"\n|^\s*\*|\n\s*\*", clean(value)):
        seg = seg.strip(" *\t;,")
        if not seg: continue
        note = re.search(r"\(([^()]*)\)", LINK.sub("", seg))
        note = note.group(1).strip() if note else None
        links = [(t.strip(), (d or t).strip()) for t, d in LINK.findall(seg)]
        if links:
            for t, d in links:
                if t.lower().startswith(("file:", "image:", "category:")): continue
                out.append((re.sub(r"\s*\([^)]*\)$", "", d.replace("'''", "").replace("''", "")).strip(), t.split("#")[0], note))
        else:
            plain = re.sub(r"\([^()]*\)", "", seg).replace("'''", "").replace("''", "").replace("[[", "").replace("]]", "")
            plain = re.sub(r"[\s:]+[\d–-]+(?:[\s:–-]+\d+)*\s*$", "", plain).strip(" ,;.")
            if plain: out.append((plain, None, note))
    return [(n, t, nt) for n, t, nt in out if n and not NOT_A_NAME.match(n) and len(n) < 60]

LISTS_OF = ["List of Edmonton Elks head coaches", "List of Hamilton Tiger-Cats head coaches", "List of Montreal Alouettes head coaches",
            "List of Saskatchewan Roughriders head coaches", "List of Winnipeg Blue Bombers head coaches", "List of Calgary Stampeders head coaches",
            "List of BC Lions head coaches", "List of Toronto Argonauts head coaches", "List of Ottawa Redblacks head coaches"]

LATEST = 2026

def years_of(cell):
    cell = re.sub(r"<ref[^>/]*/>|<ref[^>]*>.*?</ref>", "", cell, flags=re.S)
    cell = re.sub(r"\{\{\s*cfly\s*\|\s*(\d{4})[^{}]*\}\}", r"\1", cell)
    out = set()
    cell = re.sub(r"(\d{4})\s*(?:[–—-]|&ndash;|to)\s*(?:present|current|now)\b", lambda m: f"{m.group(1)}–{LATEST}", cell, flags=re.I)
    for a, b in re.findall(r"(\d{4})(?:\s*(?:[–—-]|&ndash;|to)\s*(\d{4}|\d{2}))?", cell):
        a = int(a)
        if not 1850 < a < 2100: continue
        e = a if not b else (int(b) if len(b) == 4 else a // 100 * 100 + int(b))
        out |= set(range(a, e + 1)) if a <= e < a + 60 else {a}
    return sorted(out)

def list_rows(text):
    """(name, link title, years) of each row of the head-coach tables of a franchise list."""
    out = []
    for table in re.findall(r"\{\|.*?\n\|\}", text, re.S):
        for row in table.split("\n|-")[1:]:
            cells = [c.strip() for line in row.split("\n") if line.startswith("|") for c in line[1:].split("||")]
            name = link = None
            for i, c in enumerate(cells):
                m = re.search(r"\{\{\s*sortname\s*\|\s*([^|{}]*)\|\s*([^|{}]*)(?:\|\s*([^|{}]*))?", c, re.I)
                if m:
                    name, link = f"{m.group(1).strip()} {m.group(2).strip()}".strip(), (m.group(3) or "").strip() or None
                else:
                    m = LINK.search(c)
                    if m:
                        name, link = (m.group(2) or m.group(1)).strip(), m.group(1).split("#")[0].strip()
                if name:
                    yrs = next((y for y in (years_of(x) for x in cells[i + 1:]) if y), [])
                    if yrs: out.append((name, link, yrs))
                    break
    return out

MLB_CAPTAINS = ["Baltimore Orioles", "Boston Red Sox", "Chicago White Sox", "Cincinnati Reds", "Detroit Tigers", "Houston Astros", "Kansas City Royals",
                "Los Angeles Dodgers", "Minnesota Twins", "Milwaukee Brewers", "New York Mets", "New York Yankees", "Oakland Athletics",
                "Philadelphia Phillies", "Pittsburgh Pirates", "San Francisco Giants", "St. Louis Cardinals", "Texas Rangers"]

def _who(cell):
    m = re.search(r"\{\{\s*sortname\s*\|\s*([^|{}]*)\|\s*([^|{}]*)(?:\|\s*([^|{}]*))?", cell, re.I)
    if m:
        name = f"{m.group(1).strip()} {m.group(2).strip()}".strip()
        return name, (m.group(3) or "").strip() or name
    m = LINK.search(cell)
    return ((m.group(2) or m.group(1)).strip(), m.group(1).split("#")[0].strip()) if m else (None, None)

def captain_rows(text):
    """(name, link title, years) of a club's captains: the tables with a tenure or "Years as captain" column and the bullet lines
    "[[Name]], 1987-1989", in a captains list or the Team captains section of the club's article."""
    m = re.search(r"^(=+)\s*(?:Team )?[Cc]aptains\s*\1\s*$", text, re.M)
    if m:
        rest = text[m.end():]
        n = re.search(r"^={1,%d}[^=\n].*$" % len(m.group(1)), rest, re.M)
        text = rest[:n.start()] if n else rest
    out = []
    for table in re.findall(r"\{\|.*?\n\|\}", text, re.S):
        segs = table.split("\n|-")
        hi = next((k for k, seg in enumerate(segs) if any(l.startswith("!") for l in seg.split("\n"))
                   and not any(l[:1] == "|" and not l.startswith("|+") and not l.startswith("|}") for l in seg.split("\n"))), None)
        if hi is None: continue
        heads = [re.sub(r"<[^>]+>|\[\[|\]\]|'{2,3}", "", h).split("|")[-1].strip().lower() for line in segs[hi].split("\n") if line.startswith("!") for h in line[1:].split("!!")]
        ci = next((i for i, h in enumerate(heads) if "tenure" in h or ("captain" in h and ("year" in h or "season" in h))), None)
        if ci is None: continue
        for row in segs[hi + 1:]:
            cells = [c.strip() for line in row.split("\n") if line[:1] and line[:1] in "|!" and line.strip() not in ("|", "|}") for c in re.split(r"\|\||!!", line[1:])]
            cells = [c.split("|", 1)[1].strip() if re.match(r"[\w-]+\s*=", c) and "|" in c else c for c in cells]
            if len(cells) <= ci: continue
            name, link = next(((n, l) for n, l in map(_who, cells) if n), (None, None))
            yrs = years_of(cells[ci])
            if name and yrs: out.append((name, link, yrs))
    if not out:
        for line in text.split("\n"):
            if not line.startswith("*"): continue
            name, link = _who(line)
            yrs = years_of(re.sub(r"\[\[.*?\]\]", "", line))
            if name and yrs: out.append((name, link, yrs))
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--raw", default=os.path.expanduser("~/spx-raw/wikipedia_staff/2026-10-12"))
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    pages, redirect = {}, {}
    for f in sorted(glob.glob(a.raw + "/batch/*.json")):
        body = open(f, "rb").read()
        sha = hashlib.sha256(body).hexdigest()
        q = json.loads(body)["query"]
        for r in q.get("normalized", []) + q.get("redirects", []): redirect[r["from"]] = r["to"]
        for p in q["pages"]:
            rev = (p.get("revisions") or [None])[0]
            pages[p["title"]] = (rev["revid"], rev["slots"]["main"]["content"], sha) if rev and not p.get("missing") else None
    def resolve(t):
        for _ in range(4): t = redirect.get(t, t)
        return t
    page_rows, staff_rows, stats = [], [], {}
    for line in open(a.raw + "/targets.tsv"):
        lg, tsid, yr, title = line.rstrip("\n").split("\t")
        final = resolve(title)
        pg = pages.get(final)
        if pg is None: status, revid, sha, got = "missing", None, None, {}
        else:
            revid, text, sha = pg
            box = infobox(text)
            if box is None: status, got = "no_infobox", {}
            else:
                pr = params(box)
                got = {f: names(v) for f, ks in FIELDS.items() for k, v in pr.items() if k in ks for f in [f]}
                status = "ok" if any(got.values()) else "no_staff"
        page_rows.append([tsid, lg, yr, title, final if pg else None, revid, sha, status])
        for f, ns in got.items():
            for i, (n, t, nt) in enumerate(ns, 1): staff_rows.append([tsid, f, i, n, t, nt])
        stats[(lg, status)] = stats.get((lg, status), 0) + 1
    list_out = []
    for lt in LISTS_OF:
        pg = pages.get(resolve(lt))
        for i, (n, t, yrs) in enumerate(list_rows(pg[1]) if pg else [], 1):
            list_out.append([resolve(lt), i, n, t, "{" + ",".join(map(str, yrs)) + "}"])
    for club in MLB_CAPTAINS:
        lt = f"List of {club} captains"
        pg = pages.get(resolve(lt))
        for i, (n, t, yrs) in enumerate(captain_rows(pg[1]) if pg else [], 1):
            list_out.append([lt, i, n, t, "{" + ",".join(map(str, yrs)) + "}"])
    print(len(list_out), "list rows")
    for k in sorted(stats): print(k, stats[k])
    print(len(page_rows), "pages,", len(staff_rows), "names")
    if a.dry_run: return
    def csvtext(rows):
        b = io.StringIO(); csv.writer(b, lineterminator="\n").writerows([["\\N" if c is None else c for c in r] for r in rows]); return b.getvalue()
    sql = ("begin;\ntruncate legacy_staff.wikipedia_page, legacy_staff.wikipedia_staff, legacy_staff.wikipedia_list;\n"
           "\\copy legacy_staff.wikipedia_page from stdin with (format csv, null '\\N')\n" + csvtext(page_rows) + "\\.\n"
           "\\copy legacy_staff.wikipedia_staff from stdin with (format csv, null '\\N')\n" + csvtext(staff_rows) + "\\.\n"
           "\\copy legacy_staff.wikipedia_list from stdin with (format csv, null '\\N')\n" + csvtext(list_out) + "\\.\ncommit;\n")
    p = subprocess.run(["psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", "-"], input=sql, text=True, capture_output=True)
    if p.returncode: sys.exit(p.stderr)

if __name__ == "__main__":
    main()
