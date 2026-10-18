#!/usr/bin/env python3
"""Players of the NHA, PCHA, WCHL/WHL and WHA club seasons, from the club-season articles club_fetch.py already saved (no request is made here).

  roster_articles.py export <raw root> [LEAGUE ...]     writes <raw root>/<league>/articles-NNN.json, the shape scripts/rosters/wp_fetch.py and load.py read
  roster_articles.py lines <out.sql> [LEAGUE ...]       writes one SQL file that loads legacy_wikipedia_hockey.player_article and player_line (migration 134)
  roster_articles.py report [LEAGUE ...]                what the articles hold, per league and season; nothing is written

The articles are the cache club_fetch.py keeps (HOCKEY_OLD_CACHE, default ~/Projects/backups/spx-stats/raw/wikipedia_hockey_old/<run date>/club_season).
What is read from an article: its player-statistics wikitables only (scripts/rosters/wp_parse.py, hockey_tables / hockey_lines): skaters (GP G A Pts PIM, and
+/- PPG SHG GWG where the table has them) and goaltenders (GP MIN W L T GA SO GAA, shots and saves where given), the regular season and the playoffs. These
articles have no Roster section; a player the statistics list is a player of that club that season (the roster step, db/build/179, reads the same names).
The club's name is the one core.franchise_identity carries that season: db/seed/hockey_club.csv's `display` where it has one (db/build/154 names the
identity the same way), else the club's name in the standings.
Holes are not filled: an article that does not exist (WCHL: none of 24 club seasons has one), has no statistics table, or lists a name with no link stays so.
The raw articles are archived by season.py (archive-first rule); `export` and `lines` read them from the cache.
"""
import csv, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import club_fetch as CF   # noqa: E402
import importlib.util


def _load(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
    return m


WP = _load("wp_parse", os.path.join(HERE, "..", "rosters", "wp_parse.py"))
SEED = os.path.join(HERE, "..", "..", "db", "seed", "hockey_club.csv")
LEAGUES = ("nha", "pcha", "wchl", "wha")


def seed():
    return list(csv.DictReader(open(SEED, encoding="utf-8")))


def identity_name(league, club, season, rows=None):
    """The name core.franchise_identity carries for this standings name and season (the seed's display name, else the name itself)."""
    for r in rows if rows is not None else seed():
        if r["league"] == league and r["club"].lower() == club.lower() and int(r["first_year"]) <= season <= int(r["last_year"]):
            return r["display"] or r["club"]
    return club


def all_articles(leagues):
    rows = seed()
    out = []
    for a in CF.articles(leagues):
        club = identity_name(a["league"], a["club"], a["season"], rows)
        tables = [] if a.get("missing") else WP.hockey_tables(a["content"])
        out.append((a, club, tables))
    return sorted(out, key=lambda x: (x[0]["league"], x[0]["season"], x[1]))


def export(root, leagues):
    for lg in leagues:
        recs = []
        for a, club, tables in all_articles([lg]):
            r = {"season": a["season"], "club": club, "requested": a.get("requested"), "title": a.get("title") or a.get("requested")}
            if a.get("missing"): r["missing"] = True
            else: r.update(revid=a["revid"], timestamp=a["timestamp"], sections={"tables": tables})
            recs.append(r)
        d = os.path.join(root, lg)
        os.makedirs(d, exist_ok=True)
        for f in os.listdir(d):
            if f.startswith("articles-"): os.remove(os.path.join(d, f))
        for i in range(0, len(recs), 10):
            with open(os.path.join(d, f"articles-{i // 10 + 1:03d}.json"), "w", encoding="utf-8") as fh:
                json.dump({"league": lg, "articles": recs[i:i + 10]}, fh, ensure_ascii=False, separators=(",", ":"))
        print(lg, len(recs), "articles,", sum(1 for r in recs if r.get("missing")), "missing ->", d)


def tsv(v):
    if v is None: return "\\N"
    return str(v).replace("\\", "\\\\").replace("\t", " ").replace("\n", " ").replace("\r", " ")


def lines_sql(out, leagues):
    arts, lines = [], []
    for a, club, tables in all_articles(leagues):
        arts.append((a["league"], a["season"], club, a.get("title") or a.get("requested"), a.get("revid"), a.get("timestamp"), "t" if a.get("missing") else "f", len(tables)))
        for ln, _ in [WP.hockey_lines(tables, a["club"])] if tables else []:
            for x in ln:
                lines.append((a["league"], a["season"], club, x["phase"], x["group"], x["tbl"], x["ord"], x["name"], x["title"], x["pos"],
                              json.dumps(x["stats"], separators=(",", ":"))))
    ls = ", ".join("'" + l + "'" for l in leagues)
    sql = ["begin;", f"delete from legacy_wikipedia_hockey.player_line where league in ({ls});", f"delete from legacy_wikipedia_hockey.player_article where league in ({ls});",
           "copy legacy_wikipedia_hockey.player_article (league, season, club, page_title, revid, revised_at, missing, tables) from stdin;"]
    sql += ["\t".join(tsv(v) for v in a) for a in arts] + ["\\.",
           "copy legacy_wikipedia_hockey.player_line (league, season, club, phase, grp, tbl, ord, name, link_title, pos, stats) from stdin;"]
    sql += ["\t".join(tsv(v) for v in l) for l in lines] + ["\\.",
           "select league, count(*) as articles, count(*) filter (where missing) as missing, count(*) filter (where tables > 0) as with_tables, "
           "(select count(*) from legacy_wikipedia_hockey.player_line l where l.league = a.league) as lines, "
           "(select count(*) from legacy_wikipedia_hockey.player_line l where l.league = a.league and link_title is not null) as linked "
           "from legacy_wikipedia_hockey.player_article a group by league order by 1;", "commit;"]
    with open(out, "w", encoding="utf-8") as fh: fh.write("\n".join(sql) + "\n")
    print(len(arts), "articles,", sum(1 for a in arts if a[6] == "f" and a[7] > 0), "with statistics tables,", len(lines), "lines,",
          sum(1 for l in lines if l[8]), "linked ->", out)


def report(leagues):
    import collections
    for lg in leagues:
        print("==", lg)
        per = collections.defaultdict(lambda: collections.Counter())
        for a, club, tables in all_articles([lg]):
            c = per[a["season"]]
            c["clubs"] += 1
            if a.get("missing"): c["no article"] += 1; continue
            ln, other = WP.hockey_lines(tables, a["club"])
            if not ln: c["article, no stats table"] += 1; continue
            c["with stats"] += 1
            for x in ln:
                c[f"{x['phase'][:4]} {x['group']}"] += 1
                c["linked"] += 1 if x["title"] else 0
                c["lines"] += 1
        for s in sorted(per): print(s, dict(per[s]))


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a or a[0] not in ("export", "lines", "report"): sys.exit(__doc__)
    rest = a[1:]
    cmd = a[0]
    arg = rest.pop(0) if cmd in ("export", "lines") and rest else None
    lgs = rest or list(LEAGUES)
    if (cmd in ("export", "lines") and arg is None) or any(x not in LEAGUES for x in lgs): sys.exit(__doc__)
    {"export": lambda: export(arg, lgs), "lines": lambda: lines_sql(arg, lgs), "report": lambda: report(lgs)}[cmd]()
