#!/usr/bin/env python3
"""Copy the player tables from the local working copy into Supabase without emptying anything.

  SUPABASE_ACCESS_TOKEN=... python3 -I scripts/players/prod_load.py [--ref REF] [--dry-run]

Apply db/migrations/031 and 032 to production first (the check below refuses otherwise). Unlike `load.py --replace` this
never truncates: each table is read from the local database with a filter and inserted `on conflict do nothing`, so a
rerun adds what is new and leaves the rest, and the people already in production are not touched. Run `select api.refresh();`
afterwards."""
import argparse, importlib.util, os, subprocess, sys
HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("load", os.path.join(HERE, "..", "supabase", "load.py"))
L = importlib.util.module_from_spec(spec); spec.loader.exec_module(L)

NEW_SRC = "(select source_id from meta.source where code in ('lahman', 'nhl_api'))"
LOADS = [
    ("meta.source", "code = 'lahman'"),
    ("core.person", f"source_id in {NEW_SRC}"),
    ("core.external_id", f"entity_kind = 'person' and source_id in {NEW_SRC}"),
    ("core.player_season_stat", "true"),
    ("core.person_career", "true"),
]

def load_part(ref, token, table, where):
    cols = L.insertable_columns(table)
    collist = ", ".join(cols)
    proc = subprocess.Popen(L.LOCAL + ["-c", f"select row_to_json(x)::text from (select {collist} from {table} where {where}) x"], stdout=subprocess.PIPE, text=True)
    state = {"sent": 0, "batch": [], "size": 0}
    def flush():
        if not state["batch"]: return
        payload = "[" + ",".join(state["batch"]) + "]"
        L.api(ref, token, f"insert into {table} ({collist}) overriding system value select {collist} from json_populate_recordset(null::{table}, $j${payload}$j$::json) on conflict do nothing")
        state["sent"] += len(state["batch"]); state["batch"], state["size"] = [], 0
    for line in proc.stdout:
        line = line.rstrip("\n")
        if "$j$" in line: raise SystemExit(f"{table}: a row contains the quote marker $j$")
        state["batch"].append(line); state["size"] += len(line)
        if state["size"] >= L.BATCH_BYTES: flush()
    flush()
    if proc.wait() != 0: raise SystemExit(f"{table}: local read failed")
    s_, t_ = table.split(".")
    L.api(ref, token, f"""do $$ declare c text; begin
      for c in select column_name from information_schema.columns where table_schema = '{s_}' and table_name = '{t_}' and is_identity = 'YES' loop
        execute format('select setval(%L, coalesce((select max(%I) from {table}), 0) + 1, false)', pg_get_serial_sequence('{table}', c), c);
      end loop; end $$""")
    print(f"{table}: {state['sent']} rows sent", flush=True)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ref", default="njpvfrceahkvnrduerkk")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    token = os.environ.get("SUPABASE_ACCESS_TOKEN")
    if not token: raise SystemExit("SUPABASE_ACCESS_TOKEN is not set")
    L.preflight(a.ref, token, [t for t, _ in LOADS])
    if a.dry_run:
        for t, w in LOADS: print(t, L.local(f"select count(*) from {t} where {w}").strip())
        return
    L.api(a.ref, token, "update meta.source set notes = " + "$n$" + L.local("select notes from meta.source where code='nhl_api'").strip() + "$n$" + " where code = 'nhl_api'")
    for t, w in LOADS: load_part(a.ref, token, t, w)

if __name__ == "__main__":
    main()
