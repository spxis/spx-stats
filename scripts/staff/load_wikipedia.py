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
    """The first template of the page head named like an infobox or a season box (Infobox NBA season, NBA season, ...)."""
    i, depth, start = 0, 0, 0
    while i < len(text):
        if text.startswith("{{", i):
            if depth == 0: start = i
            depth += 1; i += 2
        elif text.startswith("}}", i):
            depth -= 1; i += 2
            if depth == 0:
                box = text[start + 2:i - 2]
                if re.match(r"\s*(infobox|[A-Za-z ]*season)\s*(\||\n)", box, re.I): return box
            if depth < 0: depth = 0
        else:
            i += 1
        if depth == 0 and i > 6000: return None
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
    for k in sorted(stats): print(k, stats[k])
    print(len(page_rows), "pages,", len(staff_rows), "names")
    if a.dry_run: return
    def csvtext(rows):
        b = io.StringIO(); csv.writer(b, lineterminator="\n").writerows([["\\N" if c is None else c for c in r] for r in rows]); return b.getvalue()
    sql = ("begin;\ntruncate legacy_staff.wikipedia_page, legacy_staff.wikipedia_staff;\n"
           "\\copy legacy_staff.wikipedia_page from stdin with (format csv, null '\\N')\n" + csvtext(page_rows) + "\\.\n"
           "\\copy legacy_staff.wikipedia_staff from stdin with (format csv, null '\\N')\n" + csvtext(staff_rows) + "\\.\ncommit;\n")
    p = subprocess.run(["psql", "-X", "-q", "-v", "ON_ERROR_STOP=1", "-f", "-"], input=sql, text=True, capture_output=True)
    if p.returncode: sys.exit(p.stderr)

if __name__ == "__main__":
    main()
