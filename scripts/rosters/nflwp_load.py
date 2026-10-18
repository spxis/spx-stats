#!/usr/bin/env python3
"""Raw answers (nflwp_fetch.py) -> one SQL file that loads legacy_rosters (migration 092) for the NFL (1920-72), the AFL and the AAFC and archives the raw files.

  nflwp_load.py <raw dir> <out.sql>

The SQL is inline (no server-side file reads), so the coordinator applies it to DS1 with scripts/mac/ds1-apply.sh <out.sql>.
It replaces the wp_article and wp_roster rows of league codes nfl, afl and aafc and the legacy_rosters rows of every Wikidata item it carries;
the NBA's and the CFL's rows are left alone. Each raw file (rosters.json, titles-*, personswp-*, items-*, countries-*) is kept as gzip in
legacy_files.raw_archive under wikidata_rosters/<day>/nflwp/<file>.gz (gunzip returns the file exactly). The club-season articles themselves were
archived by scripts/nfl/season.py (wikipedia-nfl|afl|aafc/<year>/...); rosters.json names each article's cached file.
The roster rows have no revision id (the wikitext came from that archive, not a new request): wp_article.page_title cites the article and revid is null.
core is filled by db/build/179_players_wikidata.sql (leagues nfl, afl, aafc are in its signal table)."""
import gzip, hashlib, importlib.util, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
def load(name, path):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, path))
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m); return m
pl = load("people_load", "../people/load.py")
CLAIM_COLS = pl.CLAIM_COLS
ENTITY_FILES = re.compile(r"^(persons|personswp|items|countries)-\d+\.json$")
ARCHIVE = re.compile(r"^(rosters|titles-\d+|persons-\d+|personswp-\d+|items-\d+|countries-\d+)\.json$")
LEAGUES = ("nfl", "afl", "aafc")

def main(raw, out):
    raw = os.path.expanduser(raw)
    day = os.path.basename(os.path.normpath(raw))
    if not re.fullmatch(r"\d{4}-\d\d-\d\d", day): sys.exit("the raw directory must be named for the day it was fetched, YYYY-MM-DD")
    files = sorted(f for f in os.listdir(raw) if ARCHIVE.match(f))
    items, redirects, claims = {}, {}, []
    for f in files:
        if not ENTITY_FILES.match(f): continue
        d = json.load(open(f"{raw}/{f}", encoding="utf-8"))
        redirects.update(d.get("redirects") or {})
        for k, e in d["entities"].items():
            if e.get("missing") or not e.get("id"): continue
            qid = e["id"]
            if qid in items: continue
            wt = (e.get("sitelinks") or {}).get("enwiki", {}).get("title")
            # an item with no English label (only a "mul" one, 518 of the first 9,350) is named as its English Wikipedia article is titled, less a "(disambiguation)" tail
            label = (e.get("labels") or {}).get("en", {}).get("value") or (re.sub(r"\s*\([^)]*\)$", "", wt) if wt else None)
            items[qid] = (qid, label, wt, day)
            for prop, lst in (e.get("claims") or {}).items():
                for n, c in enumerate(lst):
                    r = pl.claim_row(qid, prop, n, c)
                    if r: claims.append(r)
    arts, rows, titles = [], [], {}
    for a in json.load(open(f"{raw}/rosters.json", encoding="utf-8"))["articles"]:
        arts.append((a["league"], a["season"], a["club"], a["title"], None, None, bool(a.get("missing")), bool(a["roster"]), False))
        for e in a["players"]:
            rows.append((a["league"], a["season"], a["club"], "roster", e["ord"], e["name"], e["title"], e["num"], e["pos"], None, None, None, None, None))
    for f in files:
        if not f.startswith("titles-"): continue
        d = json.load(open(f"{raw}/{f}", encoding="utf-8"))
        norm = {n["from"]: n["to"] for n in d.get("normalized", [])}
        redir = {n["from"]: n["to"] for n in d.get("redirects", [])}
        pages = {p["title"]: p for p in d["pages"]}
        for t in d["requested"]:
            r = norm.get(t, t); r = redir.get(r, r)
            p = pages.get(r)
            titles[t] = (t, r, p.get("qid") if p else None, bool(p and p.get("disambiguation")), bool(not p or p.get("missing")))

    sql = ["begin;"]
    def copy(table, cols, data):
        sql.append(f"copy {table} ({', '.join(cols)}) from stdin;")
        sql.extend("\t".join(pl.tsv(x) for x in r) for r in data); sql.append("\\.")
    sql.append("create temp table n_item (like legacy_rosters.item) on commit drop;")
    sql.append("create temp table n_claim (like legacy_rosters.claim) on commit drop;")
    copy("n_item", ["qid", "label", "enwiki_title", "fetched_on"], items.values())
    copy("n_claim", CLAIM_COLS, ([r.get(c) for c in CLAIM_COLS] for r in claims))
    sql.append("delete from legacy_rosters.claim where qid in (select qid from n_item);")
    sql.append("insert into legacy_rosters.claim select * from n_claim;")
    sql.append("insert into legacy_rosters.item select * from n_item on conflict (qid) do update set label = excluded.label, enwiki_title = excluded.enwiki_title, fetched_on = excluded.fetched_on;")
    sql.append("create temp table n_redirect (from_qid text, to_qid text) on commit drop;")
    copy("n_redirect", ["from_qid", "to_qid"], redirects.items())
    sql.append("insert into legacy_rosters.redirect select * from n_redirect on conflict (from_qid) do update set to_qid = excluded.to_qid;")
    lg = ", ".join(pl.q(x) for x in LEAGUES)
    sql.append(f"delete from legacy_rosters.wp_roster where league_code in ({lg});")
    sql.append(f"delete from legacy_rosters.wp_article where league_code in ({lg});")
    copy("legacy_rosters.wp_article", ["league_code", "season", "club", "page_title", "revid", "revised_at", "missing", "has_roster", "has_stats"],
         ((*a[:6], "t" if a[6] else "f", "t" if a[7] else "f", "t" if a[8] else "f") for a in arts))
    copy("legacy_rosters.wp_roster", ["league_code", "season", "club", "src", "ord", "name", "link_title", "number", "pos", "dob", "height_in", "weight_lb", "college", "note"], rows)
    if titles:
        sql.append("create temp table n_title (like legacy_rosters.wp_title) on commit drop;")
        copy("n_title", ["title", "resolved_title", "qid", "disambiguation", "missing"], ((t[0], t[1], t[2], "t" if t[3] else "f", "t" if t[4] else "f") for t in titles.values()))
        sql.append("insert into legacy_rosters.wp_title select * from n_title on conflict (title) do update set resolved_title = excluded.resolved_title, qid = excluded.qid, "
                   "disambiguation = excluded.disambiguation, missing = excluded.missing;")
    for f in files:
        b = gzip.compress(open(f"{raw}/{f}", "rb").read(), mtime=0)
        sql.append("insert into legacy_files.raw_archive (name, saved_on, sha256, data) values "
                   f"({pl.q(f'wikidata_rosters/{day}/nflwp/{f}.gz')}, {pl.q(day)}, '{hashlib.sha256(b).hexdigest()}', decode('{b.hex()}', 'hex')) "
                   "on conflict (name) do update set saved_on = excluded.saved_on, sha256 = excluded.sha256, data = excluded.data;")
    sql.append("select league_code, count(*) as articles, count(*) filter (where has_roster) as with_roster, "
               "(select count(*) from legacy_rosters.wp_roster r where r.league_code = a.league_code) as roster_rows "
               f"from legacy_rosters.wp_article a where league_code in ({lg}) group by league_code order by 1;")
    sql.append("commit;")
    open(out, "w", encoding="utf-8").write("\n".join(sql) + "\n")
    print(len(items), "items,", len(claims), "statements,", len(arts), "articles,", len(rows), "roster rows,", len(titles), "titles,", len(files), "files archived ->", out)

if __name__ == "__main__":
    if len(sys.argv) != 3: sys.exit(__doc__)
    main(*sys.argv[1:])
