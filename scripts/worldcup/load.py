#!/usr/bin/env python3
"""Load the raw files of scripts/worldcup/fetch.py into legacy_worldcup (migration 065). DS1 only.
Usage: load.py <raw dir> [--sql-out FILE]     e.g. load.py ~/Projects/backups/spx-stats/raw/worldcup/2026-10-13 --sql-out load.sql
Reads PGHOST/PGPORT/PGUSER/PGDATABASE/PGPASSWORD and runs the SQL, or with --sql-out writes it to FILE (apply it with
scripts/mac/ds1-apply.sh, dry run first). Rerunnable: every legacy_worldcup table is emptied and filled again from the files.
Raw means raw: the jfjelstul CSV lines are stored as jsonb objects with the CSV's own column names and text values; the openfootball
text files are parsed by openfootball.py (a line it cannot read is reported, never guessed)."""
import csv, glob, io, json, os, re, subprocess, sys, urllib.parse

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import openfootball as OF

argv = sys.argv[1:]
sql_out = None
if "--sql-out" in argv:
    i = argv.index("--sql-out"); sql_out = os.path.expanduser(argv[i + 1]); del argv[i:i + 2]
raw = os.path.expanduser(argv[0])
q = lambda v: "null" if v is None else "'" + str(v).replace("'", "''") + "'"
n = lambda v: "null" if v is None else str(v)

out = []


def batches(table, cols, rows, size=400):
    for i in range(0, len(rows), size):
        out.append(f"insert into {table} ({', '.join(cols)}) values\n" + ",\n".join(rows[i:i + size]) + ";")


out.append("delete from legacy_worldcup.of_goal; delete from legacy_worldcup.of_match; delete from legacy_worldcup.of_stadium;")
out.append("delete from legacy_worldcup.csv_row; delete from legacy_worldcup.wikipedia_item;")

# 1. jfjelstul CSVs
counts = {}
for path in sorted(glob.glob(raw + "/jfjelstul/*.csv")):
    ds = os.path.basename(path)[:-4]
    rows = []
    with open(path, encoding="utf-8", newline="") as f:
        for line, r in enumerate(csv.DictReader(f), 1):
            rows.append(f"({q(ds)}, {line}, {q(json.dumps(r, ensure_ascii=False))}::jsonb)")
    counts[ds] = len(rows)
    batches("legacy_worldcup.csv_row", ["dataset", "line", "data"], rows)

# 2. openfootball matches and goals
ofm, ofg, unread_all = [], [], []
for year in range(1930, 2027, 4):
    files = [p for p in (f"{raw}/openfootball/{year}__cup.txt", f"{raw}/openfootball/{year}__cup_finals.txt") if os.path.exists(p)]
    seq = 0
    for p in files:
        matches, unread = OF.parse_file(open(p, encoding="utf-8").read(), year)
        unread_all += [f"{os.path.basename(p)}: {u.strip()}" for u in unread]
        for m in matches:
            seq += 1
            pens = m["pens"] or (None, None)
            ofm.append(f"({year}, {seq}, {q(os.path.basename(p))}, {q(m['stage'])}, {q(m['group'])}, {q(m['date'])}, {q(m['time'])}, {q(m['utc'])}, "
                       f"{n(m['number'])}, {q(m['team1'])}, {q(m['team2'])}, {m['score1']}, {m['score2']}, {str(m['aet']).lower()}, {q(m['ht'])}, "
                       f"{n(pens[0])}, {n(pens[1])}, {q(m['venue'])}, {q(m['comment'])}, {q(m['goal_text'])})")
            for k, (side, name, minute, kind) in enumerate(m["goals"], 1):
                if kind == "unread":
                    unread_all.append(f"{year} goals of match {seq}: {minute}")
                    continue
                ofg.append(f"({year}, {seq}, {k}, {q(side)}, {q(name)}, {q(minute)}, {q(kind)})")
batches("legacy_worldcup.of_match", ["year", "seq", "file", "stage", "group_name", "match_date", "kickoff", "utc_offset", "match_number", "team1", "team2",
                                      "score1", "score2", "aet", "halftime", "pens1", "pens2", "venue", "comment", "goal_text"], ofm)
batches("legacy_worldcup.of_goal", ["year", "seq", "n", "side", "scorer", "minute", "kind"], ofg)

# 3. openfootball stadiums.csv (header: name, city, cc  or  city, timezone, cc, name, capacity, wikipedia, wikidata, coords)
ofs = []
for path in sorted(glob.glob(raw + "/openfootball/*__stadiums.csv")):
    year = int(os.path.basename(path)[:4])
    header = None
    seen = set()
    for line in open(path, encoding="utf-8"):
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        cells = next(csv.reader([s], skipinitialspace=True))
        cells = [c.strip() for c in cells]
        if header is None:
            header = [c.lower() for c in cells]
            continue
        r = dict(zip(header, cells))
        if not r.get("name") or r["name"] in seen:
            continue
        seen.add(r["name"])
        cap = re.sub(r"\D", "", r.get("capacity", "") or "")
        ofs.append(f"({year}, {q(r.get('city'))}, {q((r.get('cc') or '').lower() or None)}, {q(r['name'])}, {n(int(cap) if cap else None)}, "
                   f"{q(r.get('wikipedia') or None)}, {q(r.get('wikidata') or None)}, {q(s)})")
batches("legacy_worldcup.of_stadium", ["year", "city", "cc", "name", "capacity", "wikipedia", "wikidata", "line"], ofs)

# 4. Wikipedia page -> Wikidata item (the links are the ones fetch.py asked about)
links = {}
for ds, cols in (("stadiums", ["stadium_wikipedia_link"]), ("teams", ["mens_team_wikipedia_link", "womens_team_wikipedia_link"]),
                 ("players", ["player_wikipedia_link"]), ("managers", ["manager_wikipedia_link"]), ("referees", ["referee_wikipedia_link"])):
    with open(f"{raw}/jfjelstul/{ds}.csv", encoding="utf-8", newline="") as f:
        for r in csv.DictReader(f):
            for c in cols:
                if r[c].startswith("https://en.wikipedia.org/wiki/"):
                    links[r[c]] = urllib.parse.unquote(r[c][len("https://en.wikipedia.org/wiki/"):]).split("#")[0].replace("_", " ")
norm, redir, pages = {}, {}, {}
for path in sorted(glob.glob(raw + "/wikidata/pageprops-*.json")):
    d = json.load(open(path, encoding="utf-8"))["query"]
    norm.update({x["from"]: x["to"] for x in d.get("normalized", [])})
    redir.update({x["from"]: x["to"] for x in d.get("redirects", [])})
    pages.update({p["title"]: p for p in d["pages"].values()})
items = {}
for url, t in sorted(links.items()):
    t2 = redir.get(norm.get(t, t), norm.get(t, t))
    pg = pages.get(t2)
    items[url] = (t, pg.get("pageprops", {}).get("wikibase_item") if pg else None, t2)
rows = [f"({q(u)}, {q(v[0])}, {q(v[1])}, {q(v[2])})" for u, v in sorted(items.items())]
batches("legacy_worldcup.wikipedia_item", ["url", "title", "qid", "page"], rows)

sql = "\n".join(out) + "\n"
print("csv lines:", sum(counts.values()), "in", len(counts), "files;", "openfootball matches:", len(ofm), "goals:", len(ofg), "stadiums:", len(ofs),
      "wikipedia links:", len(items), "(with an item:", sum(1 for v in items.values() if v[1]), ")", file=sys.stderr)
for u in unread_all:
    print("not read:", u[:140], file=sys.stderr)
if sql_out:
    open(sql_out, "w", encoding="utf-8").write(sql)
    print("wrote", sql_out, len(sql), "bytes", file=sys.stderr)
else:
    p = subprocess.run(["psql", "-v", "ON_ERROR_STOP=1", "-q", "-1", "-f", "-"], input=sql, text=True, capture_output=True)
    if p.returncode:
        raise SystemExit(p.stderr[-800:])
    print("loaded", file=sys.stderr)
