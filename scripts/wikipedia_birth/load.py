#!/usr/bin/env python3
"""Raw answers (fetch.py) -> legacy_wikipedia_birth.infobox (upsert by title). Only the birth_place line of the infobox is kept.

  load.py <raw dir> <YYYY-MM-DD>

Reads PG* variables (psql) for the database. The raw files themselves are archived with
  python3 -I scripts/archive_raw.py wikipedia-nhl-birthplace <raw dir> <date>"""
import json, os, re, subprocess, sys

def value_of(text, param="birth_place"):
    """The raw value of an infobox parameter: from `| param =` to the next `|` or `}}` of the infobox's own depth."""
    m = re.search(r"\|\s*" + param + r"\s*=", text)
    if not m: return None
    i, depth, out = m.end(), 0, []
    while i < len(text):
        two = text[i:i + 2]
        if two in ("{{", "[["): depth += 1; out.append(two); i += 2; continue
        if two in ("}}", "]]"):
            if depth == 0: break
            depth -= 1; out.append(two); i += 2; continue
        c = text[i]
        if c == "|" and depth == 0: break
        out.append(c); i += 1
    return "".join(out).strip()

def clean(v):
    if v is None: return None
    v = re.sub(r"<!--.*?-->", "", v, flags=re.S)
    v = re.sub(r"<ref[^>]*?/>", "", v)
    v = re.sub(r"<ref[^>]*>.*?</ref>", "", v, flags=re.S)
    v = re.sub(r"<br\s*/?>", ", ", v, flags=re.I)
    v = re.sub(r"<[^>]+>", "", v)
    for _ in range(4):
        v = re.sub(r"\{\{\s*(?:nowrap|nobr|small|smaller)\s*\|([^{}]*)\}\}", r"\1", v, flags=re.I)
        v = re.sub(r"\{\{\s*(?:flagicon|flag|flagdeco|flagcountry)[^{}]*\}\}", "", v, flags=re.I)
        v = re.sub(r"\{\{\s*(?:citation needed|cn|efn|refn)[^{}]*\}\}", "", v, flags=re.I)
    v = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", v)
    v = re.sub(r"'{2,}", "", v)
    v = re.sub(r"\{\{[^{}]*\}\}", "", v)
    v = re.sub(r"\s+", " ", v).strip(" ,;")
    return v or None

def q(s): return "NULL" if s is None else "'" + s.replace("'", "''") + "'"

def main(raw, day):
    rows = {}
    for f in sorted(os.listdir(raw)):
        if not f.endswith(".json"): continue
        d = json.load(open(f"{raw}/{f}", encoding="utf-8"))
        qy = d["query"]
        norm = {n["from"]: n["to"] for n in qy.get("normalized", [])}
        redir = {r["from"]: r["to"] for r in qy.get("redirects", [])}
        pages = {p["title"]: p for p in qy.get("pages", [])}
        for t in d["requested"]:
            to = redir.get(norm.get(t, t), norm.get(t, t))
            p = pages.get(to)
            if not p or p.get("missing") or not p.get("revisions"):
                rows[t] = (t, None, None, False, None, None); continue
            rev = p["revisions"][0]
            text = (rev.get("slots", {}).get("main") or {}).get("content") or rev.get("content") or ""
            raw_v = value_of(text)
            rows[t] = (t, p["title"], rev.get("revid"), True, clean(raw_v), raw_v)
    sql = ["begin;"]
    for t, pt, rid, found, bp, rv in rows.values():
        sql.append(f"insert into legacy_wikipedia_birth.infobox (title, page_title, revision_id, found, birth_place, raw_value, fetched_on) values "
                   f"({q(t)}, {q(pt)}, {rid if rid else 'NULL'}, {'true' if found else 'false'}, {q(bp)}, {q(rv)}, {q(day)}) "
                   "on conflict (title) do update set page_title = excluded.page_title, revision_id = excluded.revision_id, found = excluded.found, "
                   "birth_place = excluded.birth_place, raw_value = excluded.raw_value, fetched_on = excluded.fetched_on;")
    sql.append("commit;")
    p = subprocess.run(["psql", "-X", "-q", "-v", "ON_ERROR_STOP=1"], input="\n".join(sql) + "\n", text=True, capture_output=True)
    print(len(rows), "articles,", sum(1 for r in rows.values() if r[3]), "found,", sum(1 for r in rows.values() if r[4]), "with a birth place", p.stderr.strip()[:500])
    if p.returncode: sys.exit(1)

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
