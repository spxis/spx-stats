#!/usr/bin/env python3
"""Load db/seed/wikidata_meigen_athlete.csv into legacy_wikidata_meigen.athlete.

One command from the repo root (after migration 121):

  python3 -I scripts/wikidata_meigen/load.py

Uses libpq env (PGHOST, PGPORT, PGUSER, PGDATABASE, PGPASSWORD). Never prints
a password. Replaces only this table's rows (the step owns them). Then
db/build/215_meigen_people.sql maps QIDs onto core.person and fills empty
country codes from db/seed/wikidata_meigen_claim.csv (P27 / P19).
"""
from __future__ import annotations

import csv
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
CSV = REPO / "db/seed/wikidata_meigen_athlete.csv"
COLS = ("qid", "label", "sport", "birth_on", "birth_prec", "death_on",
        "death_prec", "birth_place", "sitelinks", "batch")


def valid_day(v: str | None) -> str:
    if not v:
        return ""
    parts = v.split("-")
    if len(parts) != 3 or not all(p.isdigit() for p in parts):
        return ""
    y, m, d = int(parts[0]), int(parts[1]), int(parts[2])
    if not (1800 <= y <= 2100 and 1 <= m <= 12 and 1 <= d <= 31):
        return ""
    return f"{y:04d}-{m:02d}-{d:02d}"


def tsv(v: str | None) -> str:
    if v is None or v == "":
        return r"\N"
    return str(v).replace("\\", "\\\\").replace("\t", " ").replace("\n", " ").replace("\r", " ")


def main() -> int:
    if not CSV.is_file():
        print(f"missing {CSV.relative_to(REPO)}", file=sys.stderr)
        return 2
    rows = []
    with CSV.open(encoding="utf-8", newline="") as fh:
        for rec in csv.DictReader(fh):
            qid, label, sport = rec.get("qid", ""), rec.get("label", ""), rec.get("sport", "")
            if not qid.startswith("Q") or not label.strip() or not sport:
                continue
            rec["birth_on"] = valid_day(rec.get("birth_on"))
            rec["death_on"] = valid_day(rec.get("death_on"))
            if not rec["birth_on"]:
                rec["birth_prec"] = ""
            if not rec["death_on"]:
                rec["death_prec"] = ""
            rows.append([tsv(rec.get(c, "")) for c in COLS])
    body = "\n".join("\t".join(r) for r in rows) + "\n"
    sql = (
        "\\set ON_ERROR_STOP on\n"
        "delete from legacy_wikidata_meigen.athlete;\n"
        "copy legacy_wikidata_meigen.athlete "
        "(qid, label, sport, birth_on, birth_prec, death_on, death_prec, birth_place, sitelinks, batch) "
        "from stdin with (format text, null '\\N');\n"
        f"{body}\\.\n"
        "select count(*) as athletes, count(distinct qid) as people "
        "from legacy_wikidata_meigen.athlete;\n"
    )
    cmd = ["psql", "-X", "-q", "-v", "ON_ERROR_STOP=1"]
    r = subprocess.run(cmd, input=sql, text=True, cwd=str(REPO))
    if r.returncode == 0:
        print(f"loaded {len(rows)} rows from {CSV.relative_to(REPO)}")
    return r.returncode


if __name__ == "__main__":
    sys.exit(main())
