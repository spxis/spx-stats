#!/usr/bin/env python3
"""Load the outputs of filter.py into DS1 (schema legacy_wikidata_dump, migration 141). Python 3 stdlib plus the psql program.

  python3 -I scripts/wikidata_dump/load.py OUTDIR [options]

OUTDIR holds summary.json and people/events/items.jsonl.gz (filter.py extract) and, when it was run, labels-summary.json and
labels.jsonl.gz (filter.py labels). Reads PGHOST, PGPORT, PGUSER, PGDATABASE and PGPASSWORD from the environment like the other loaders, or with --ds1 goes through
scripts/daily/ds1.sh (see README.md); a password is never printed.

  --tables person,event,item,label   which tables (default: every one that has an output)
  --min-sitelinks N                  person only: skip people with fewer than N sitelinks (a smaller load; recorded in the run)
  --batch-rows N                     rows per transaction (default 5000)
  --replace-old                      after a clean load delete the rows of earlier runs from the loaded tables (one snapshot)
  --dump-name, --dump-date, --dump-path, --dump-md5, --dump-sha256, --note   provenance of the raw dump, stored in load_run
                                     (md5 and sha256 default to what filter.py recorded in summary.json)
  --allow-incomplete                 load the output of a --limit test run
  --no-verify                        skip the sha256 check of the output files against summary.json
  --ds1                              reach DS1 through scripts/daily/ds1.sh (a Mac: finds DS1, password from the keychain, PG* ignored)
  --dry-run                          read and count everything, touch no database

Rerunnable: rows are upserts by Q id, a rerun of the same filter run reuses its load_run row (run_key). A failed batch stops the load, marks
the run failed, and a rerun starts over from the first batch (no half batches: each is one transaction).
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

TABLES = {  # table -> (output file stem, summary file, kind)
    "person": ("people", "summary.json", "extract"),
    "event": ("events", "summary.json", "extract"),
    "item": ("items", "summary.json", "extract"),
    "label": ("labels", "labels-summary.json", "labels"),
}
SCHEMA = "legacy_wikidata_dump"


def sql_str(s: object) -> str:
    return "null" if s is None else "'" + str(s).replace("'", "''") + "'"


def sql_json(o: object) -> str:
    return sql_str(json.dumps(o, ensure_ascii=False, separators=(",", ":"))) + "::jsonb"


def sql_num(n: object) -> str:
    return "null" if n is None else str(int(n))


def psql_path() -> str:
    for d in ("/opt/homebrew/opt/libpq/bin", "/opt/homebrew/bin", "/usr/local/bin"):
        if os.path.isdir(d) and d not in os.environ["PATH"].split(os.pathsep):
            os.environ["PATH"] += os.pathsep + d
    p = shutil.which("psql")
    if not p:
        raise SystemExit("psql not found (libpq client)")
    return p


USE_DS1 = False
DS1_SH = Path(__file__).resolve().parents[1] / "daily" / "ds1.sh"


def psql(sql: str) -> str:
    """Run SQL through psql: the PG* environment, or with --ds1 through scripts/daily/ds1.sh (finds DS1 and reads the keychain on a Mac)."""
    cmd = [str(DS1_SH) if USE_DS1 else psql_path(), "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-f", "-"]
    p = subprocess.run(cmd, input=sql, text=True, capture_output=True)
    if p.returncode != 0:
        raise RuntimeError(p.stderr.strip()[-800:] or f"psql exit {p.returncode}")
    return p.stdout.strip()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def strip_nul(o):
    if isinstance(o, str):
        return o.replace("\x00", "")
    if isinstance(o, list):
        return [strip_nul(x) for x in o]
    if isinstance(o, dict):
        return {k: strip_nul(v) for k, v in o.items()}
    return o


def copy_text(line: str) -> str:
    """One row for COPY ... (format text): backslash doubled (a compact JSON line has no tab, newline or CR)."""
    return line.replace("\\", "\\\\")


def docs(path: Path, min_sitelinks: int, stats: dict):
    """(qid, json text) for each line of an output file."""
    with gzip.open(path, "rt", encoding="utf-8") as f:
        for raw in f:
            raw = raw.strip()
            if not raw:
                continue
            d = json.loads(raw)
            qid = d.get("id")
            if not isinstance(qid, str) or not re.fullmatch(r"Q[0-9]+", qid):
                stats["bad"] += 1
                continue
            if min_sitelinks and (d.get("sl") or {}).get("n", 0) < min_sitelinks:
                stats["skipped"] += 1
                continue
            if "\\u0000" in raw:
                d = strip_nul(d)
                raw = json.dumps(d, ensure_ascii=False, separators=(",", ":"))
                stats["nul_stripped"] += 1
            yield qid, raw


def batch_sql(table: str, run_id: int, rows: list[str]) -> str:
    body = "\n".join(copy_text(r) for r in rows)
    return (
        "begin;\n"
        "create temp table _s (doc jsonb) on commit drop;\n"
        "copy _s (doc) from stdin;\n"
        f"{body}\n\\.\n"
        f"insert into {SCHEMA}.{table} (qid, run_id, doc)\n"
        f"select distinct on (doc->>'id') doc->>'id', {run_id}, doc from _s order by doc->>'id'\n"
        "on conflict (qid) do update set run_id = excluded.run_id, doc = excluded.doc;\n"
        "commit;\n"
    )


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("outdir", type=Path)
    ap.add_argument("--tables", default="")
    ap.add_argument("--min-sitelinks", type=int, default=0)
    ap.add_argument("--batch-rows", type=int, default=5000)
    ap.add_argument("--replace-old", action="store_true")
    ap.add_argument("--dump-name")
    ap.add_argument("--dump-date")
    ap.add_argument("--dump-path")
    ap.add_argument("--dump-md5")
    ap.add_argument("--dump-sha256")
    ap.add_argument("--note")
    ap.add_argument("--allow-incomplete", action="store_true")
    ap.add_argument("--no-verify", action="store_true")
    ap.add_argument("--ds1", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args(sys.argv[1:] if argv is None else argv)
    global USE_DS1
    USE_DS1 = args.ds1

    want = [t for t in args.tables.split(",") if t] or list(TABLES)
    bad = [t for t in want if t not in TABLES]
    if bad:
        print(f"unknown table(s): {bad}; choose from {list(TABLES)}", file=sys.stderr)
        return 2
    if args.dump_date and not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", args.dump_date):
        print("--dump-date must be YYYY-MM-DD", file=sys.stderr)
        return 2
    summaries: dict[str, dict] = {}
    plan: list[tuple[str, Path, str]] = []  # table, file, summary file
    for t in want:
        stem, sfile, _ = TABLES[t]
        f = args.outdir / f"{stem}.jsonl.gz"
        if not f.is_file():
            if args.tables:
                print(f"missing {f}", file=sys.stderr)
                return 2
            continue
        if sfile not in summaries:
            sp = args.outdir / sfile
            if not sp.is_file():
                print(f"missing {sp}: the filter run did not finish (rerun filter.py with --resume)", file=sys.stderr)
                return 2
            summaries[sfile] = json.loads(sp.read_text(encoding="utf-8"))
        plan.append((t, f, sfile))
    if not plan:
        print("nothing to load", file=sys.stderr)
        return 2
    for sfile, s in summaries.items():
        if not s.get("complete") and not args.allow_incomplete:
            print(f"{sfile}: the filter did not reach the end of the dump (a --limit run?); --allow-incomplete to load it anyway", file=sys.stderr)
            return 2
        if s.get("limit") and not args.allow_incomplete:
            print(f"{sfile}: a --limit run; --allow-incomplete to load it anyway", file=sys.stderr)
            return 2
    if not args.no_verify:
        for t, f, sfile in plan:
            want_sha = summaries[sfile]["files"].get(f.name, {}).get("sha256")
            if not want_sha or sha256_file(f) != want_sha:
                print(f"{f.name}: sha256 does not match {sfile} (file changed or cut short)", file=sys.stderr)
                return 2

    run_ids: dict[str, int] = {}
    if not args.dry_run:
        for sfile, s in summaries.items():
            dump = s["dump"]
            md5 = args.dump_md5 or dump.get("md5")
            sha = args.dump_sha256 or dump.get("sha256")
            run_id = int(psql(
                f"insert into {SCHEMA}.load_run (run_key, kind, dump_name, dump_date, dump_path, dump_bytes, dump_md5, dump_sha256, filter_version, "
                "filter_options, filter_lines, malformed_lines, complete, files, counts, summary, status, note) values ("
                f"{sql_str(s['run_key'])}, {sql_str(s['mode'])}, {sql_str(args.dump_name or dump['name'])}, {sql_str(args.dump_date)}, "
                f"{sql_str(args.dump_path or dump.get('path'))}, {sql_num(dump.get('bytes'))}, {sql_str(md5)}, {sql_str(sha)}, {sql_str(s['version'])}, "
                f"{sql_json(s['options'])}, {sql_num(s.get('lines'))}, {sql_num(s.get('malformed_lines'))}, {'true' if s.get('complete') else 'false'}, "
                f"{sql_json(s['files'])}, {sql_json(s['counts'])}, {sql_json(s)}, 'loading', {sql_str(args.note)}) "
                "on conflict (run_key) do update set status = 'loading', finished_at = null, loaded = '{}'::jsonb, "
                f"dump_name = excluded.dump_name, dump_date = coalesce(excluded.dump_date, {SCHEMA}.load_run.dump_date), "
                f"dump_path = coalesce(excluded.dump_path, {SCHEMA}.load_run.dump_path), dump_md5 = coalesce(excluded.dump_md5, {SCHEMA}.load_run.dump_md5), "
                f"dump_sha256 = coalesce(excluded.dump_sha256, {SCHEMA}.load_run.dump_sha256), "
                f"note = coalesce(excluded.note, {SCHEMA}.load_run.note) returning run_id;"
            ).splitlines()[-1])
            run_ids[sfile] = run_id
            print(f"load_run {run_id} ({s['mode']}, run_key {s['run_key'][:8]})", flush=True)

    loaded: dict[str, dict[str, dict]] = {sf: {} for sf in summaries}
    t0 = time.time()
    try:
        for t, f, sfile in plan:
            stats = {"bad": 0, "skipped": 0, "nul_stripped": 0}
            sent, batch = 0, []
            ms = args.min_sitelinks if t == "person" else 0
            for _qid, raw in docs(f, ms, stats):
                batch.append(raw)
                if len(batch) >= args.batch_rows:
                    if not args.dry_run:
                        psql(batch_sql(t, run_ids[sfile], batch))
                    sent += len(batch)
                    batch = []
                    print(f"  {t}: {sent:,} rows ({int(time.time() - t0)} s)", flush=True)
            if batch:
                if not args.dry_run:
                    psql(batch_sql(t, run_ids[sfile], batch))
                sent += len(batch)
            loaded[sfile][t] = {"rows_sent": sent, **stats}
            wrote = summaries[sfile]["counts"].get(TABLES[t][0])
            print(f"{t}: {sent:,} rows{' (dry run)' if args.dry_run else ''}; filter wrote {wrote:,}; skipped {stats['skipped']:,}; bad {stats['bad']:,}; "
                  f"NUL stripped {stats['nul_stripped']:,}", flush=True)
            if not args.dry_run:
                in_db = int(psql(f"select count(*) from {SCHEMA}.{t} where run_id = {run_ids[sfile]};"))
                loaded[sfile][t]["rows_in_table_for_run"] = in_db
                if in_db != sent:
                    raise RuntimeError(f"{t}: sent {sent} rows, the table holds {in_db} for this run (duplicate Q ids in the output?)")
                if not ms and wrote is not None and sent + stats["bad"] != wrote:
                    raise RuntimeError(f"{t}: loaded {sent} rows but the filter wrote {wrote}")
    except Exception as e:  # noqa: BLE001
        if not args.dry_run:
            for sfile, rid in run_ids.items():
                try:
                    psql(f"update {SCHEMA}.load_run set status = 'failed', loaded = {sql_json(loaded[sfile])}, "
                         f"note = coalesce(note || E'\\n', '') || {sql_str('load.py: ' + str(e)[:400])}, finished_at = now() where run_id = {rid};")
                except Exception:  # noqa: BLE001
                    pass
        print(f"failed: {e}", file=sys.stderr)
        return 1

    if args.dry_run:
        print("dry run: nothing written")
        return 0
    for sfile, rid in run_ids.items():
        psql(f"update {SCHEMA}.load_run set status = 'done', loaded = {sql_json(loaded[sfile])}, finished_at = now() where run_id = {rid};")
        if args.replace_old:
            for t, _f, sf in plan:
                if sf == sfile:
                    n = psql(f"with d as (delete from {SCHEMA}.{t} where run_id <> {rid} returning 1) select count(*) from d;")
                    print(f"{t}: {n} rows of earlier runs removed")
    print("done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
