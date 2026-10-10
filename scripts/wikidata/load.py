"""Saved Wikidata answers (from sparql.py) -> legacy_wikidata.result, replacing
the rows of each query loaded. Usage: load.py <name>=<answer.json> [...]
Connects to the local working copy unless PGHOST is set (then libpq's PG* variables decide)."""
import json, os, subprocess, sys
CONN = [] if os.environ.get("PGHOST") else ["-h", "/tmp", "-p", "55432", "-U", "postgres", "-d", "spx_stats"]
for arg in sys.argv[1:]:
    name, path = arg.split("=", 1)
    rows = json.load(open(path))
    lines = "\n".join(json.dumps([name, i, r]) for i, r in enumerate(rows))
    p = subprocess.run(["psql", *CONN, "-v", "ON_ERROR_STOP=1", "-q"],
                       input=f"begin;\ndelete from legacy_wikidata.result where query_name = '{name}';\ncreate temp table _j (j jsonb);\n"
                             "copy _j from stdin with (format csv, quote e'\\x01', delimiter e'\\x02');\n" + lines + "\n\\.\n"
                             "insert into legacy_wikidata.result (query_name, row_number, row) select j->>0, (j->>1)::int, j->2 from _j;\ncommit;\n",
                       text=True, capture_output=True)
    print(name, len(rows), "rows", p.stderr.strip()[:300])
