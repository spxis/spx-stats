#!/usr/bin/env python3
"""Archive files (extract.py) -> legacy_wikipedia_awards, replacing each award's rows.
Usage: load.py <award_code.json> [...]
Connects to the local working copy unless PGHOST is set (then libpq's PG* variables decide)."""
import json, os, subprocess, sys
CONN = [] if os.environ.get("PGHOST") else ["-h", "/tmp", "-p", "55432", "-U", "postgres", "-d", "spx_stats"]
def q(s): return "'" + s.replace("'", "''") + "'"
for path in sys.argv[1:]:
    d = json.load(open(path, encoding="utf-8"))
    code = d["award_code"]
    lines = "\n".join(json.dumps([code, *x], ensure_ascii=False) for x in d["parsed"])
    sql = (f"begin;\ndelete from legacy_wikipedia_awards.winner where award_code = {q(code)};\n"
           f"delete from legacy_wikipedia_awards.article where award_code = {q(code)};\n"
           f"insert into legacy_wikipedia_awards.article values ({q(code)}, {q(d['article'])}, {q(d['url'])}, {q(d['fetched'])}, 'CC BY-SA 4.0', {str(d['winners_are_teams']).lower()});\n"
           "create temp table _j (j jsonb);\ncopy _j from stdin with (format csv, quote e'\\x01', delimiter e'\\x02');\n" + lines + "\n\\.\n"
           "insert into legacy_wikipedia_awards.winner select j->>0, (j->>1)::int, (j->>2)::int, (j->>3)::int, (j->>4)::int, j->>5, j->>6, j->>7, j->>8, j->>9 from _j;\ncommit;\n")
    p = subprocess.run(["psql", *CONN, "-v", "ON_ERROR_STOP=1", "-q"], input=sql, text=True, capture_output=True)
    print(code, len(d["parsed"]), "rows", p.stderr.strip()[:300])
    if p.returncode: sys.exit(1)
