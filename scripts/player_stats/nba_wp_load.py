#!/usr/bin/env python3
"""Raw statistics pages (nba_wp_fetch.py) -> one SQL file that loads legacy_wikipedia_stats (migration 100) and archives the raw files.

  nba_wp_load.py <raw dir> <out.sql> [YYYY-MM-DD]

The SQL is inline, so the coordinator applies it to DS1 with scripts/mac/ds1-apply.sh <out.sql> --force (the file is outside db/). It replaces every row of
legacy_wikipedia_stats.nba_article and nba_line. Each raw file is kept as gzip in legacy_files.raw_archive, named wikipedia_nba_stats/<day>/<file>.gz
(`gunzip` returns the file exactly as it was saved; an article is cited by its title and revision id in statpages-NNN.json). <day> is the third argument,
else the raw dir's name. Prints what was read: articles with a statistics section, tables, rows, rows whose name links to an article."""
import gzip, hashlib, importlib.util, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("nba_wp_parse", os.path.join(HERE, "nba_wp_parse.py"))
P = importlib.util.module_from_spec(spec); spec.loader.exec_module(P)

def tsv(v):
    if v is None: return "\\N"
    return str(v).replace("\\", "\\\\").replace("\t", " ").replace("\n", " ").replace("\r", " ")

def main(raw, out, day):
    files = sorted(f for f in os.listdir(raw) if re.fullmatch(r"statpages-\d{3}\.json", f))
    arts, lines = [], []
    n_html = n_tables = n_linked = 0
    for f in files:
        for a in json.load(open(f"{raw}/{f}", encoding="utf-8"))["articles"]:
            ts = P.tables(a["html"]) if a.get("html") else []
            if a.get("html"): n_html += 1
            arts.append((a["season"], a["club"], a["title"], a["revid"], a.get("heading"), len(ts)))
            n_tables += len(ts)
            for t in ts:
                for i, r in enumerate(t["rows"], 1):
                    lines.append((a["season"], a["club"], t["phase"], t["tbl"], i, r["name"], r["title"], json.dumps(r["cells"], ensure_ascii=False, separators=(",", ":"))))
                    if r["title"]: n_linked += 1
    sql = ["begin;", "delete from legacy_wikipedia_stats.nba_line;", "delete from legacy_wikipedia_stats.nba_article;",
           "copy legacy_wikipedia_stats.nba_article (season, club, page_title, revid, heading, tables) from stdin;"]
    sql += ["\t".join(tsv(v) for v in a) for a in arts] + ["\\.",
           "copy legacy_wikipedia_stats.nba_line (season, club, phase, tbl, ord, name, link_title, cells) from stdin;"]
    sql += ["\t".join(tsv(v) for v in l) for l in lines] + ["\\."]
    for f in files:
        b = gzip.compress(open(f"{raw}/{f}", "rb").read(), mtime=0)
        sql.append("insert into legacy_files.raw_archive (name, saved_on, sha256, data) values "
                   f"('wikipedia_nba_stats/{day}/{f}.gz', '{day}', '{hashlib.sha256(b).hexdigest()}', decode('{b.hex()}', 'hex')) "
                   "on conflict (name) do update set saved_on = excluded.saved_on, sha256 = excluded.sha256, data = excluded.data;")
    sql.append("select (select count(*) from legacy_wikipedia_stats.nba_article) as articles, (select count(*) from legacy_wikipedia_stats.nba_article where tables > 0) as with_tables, "
               "(select count(*) from legacy_wikipedia_stats.nba_line) as rows, (select count(*) from legacy_wikipedia_stats.nba_line where link_title is not null) as linked_rows;")
    sql.append("commit;")
    open(out, "w", encoding="utf-8").write("\n".join(sql) + "\n")
    print(len(arts), "articles,", n_html, "with a statistics section,", n_tables, "tables,", len(lines), "rows,", n_linked, "linked,", len(files), "files archived ->", out)

if __name__ == "__main__":
    a = sys.argv[1:]
    if len(a) < 2: sys.exit(__doc__)
    main(a[0].rstrip("/"), a[1], a[2] if len(a) > 2 else os.path.basename(a[0].rstrip("/")))
