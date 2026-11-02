#!/usr/bin/env python3
"""Load meigen-sports priority bio CSVs into legacy_wikidata_meigen.

One command from the repo root (after migrations 121 and 190):

  python3 -I scripts/wikidata_meigen/load_bio.py

Uses libpq env. Never prints a password. Replaces only the bio / wiki_page /
team_stint / honour rows this loader owns. Then db/build/239_meigen_person_bio.sql
maps QIDs onto core.person.
"""
from __future__ import annotations

import csv
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SEED = REPO / "db/seed"


DATE_COLS = {"birth_on", "death_on", "debut_on", "final_on"}


def valid_day(v: str | None) -> str:
    """A calendar day as text, or empty: Wikidata's year-only dates arrive as 2001-00-00."""
    parts = (v or "").split("-")
    if len(parts) != 3 or not all(p.isdigit() for p in parts):
        return ""
    y, m, d = (int(p) for p in parts)
    if not (1800 <= y <= 2100 and 1 <= m <= 12 and 1 <= d <= 31):
        return ""
    return f"{y:04d}-{m:02d}-{d:02d}"


def tsv(v: str | None) -> str:
    if v is None or v == "":
        return r"\N"
    return str(v).replace("\\", "\\\\").replace("\t", " ").replace("\n", " ").replace("\r", " ")


def rows_of(name: str, cols: tuple[str, ...], required: tuple[str, ...]) -> list[list[str]]:
    path = SEED / name
    if not path.is_file():
        raise SystemExit(f"missing {path.relative_to(REPO)}")
    out = []
    with path.open(encoding="utf-8", newline="") as fh:
        for rec in csv.DictReader(fh):
            if any(not (rec.get(c) or "").strip() for c in required):
                continue
            out.append([tsv(valid_day(rec.get(c)) if c in DATE_COLS else rec.get(c, "")) for c in cols])
    return out


def copy_sql(table: str, cols: tuple[str, ...], rows: list[list[str]]) -> str:
    body = "\n".join("\t".join(r) for r in rows) + ("\n" if rows else "")
    colsql = ", ".join(cols)
    return (
        f"delete from {table};\n"
        f"copy {table} ({colsql}) from stdin with (format text, null '\\N');\n"
        f"{body}\\.\n"
    )


def main() -> int:
    pages = rows_of("wikidata_meigen_wiki_page.csv",
                    ("qid", "title", "revid", "url", "short_description", "lead_text",
                     "bytes", "sha256", "file_name"),
                    ("qid", "title", "url", "file_name"))
    bios = rows_of("wikidata_meigen_bio.csv",
                   ("qid", "label", "description_en", "sport", "birth_on", "birth_prec",
                    "death_on", "death_prec", "birth_place_qid", "birth_place_label",
                    "death_place_qid", "death_place_label", "citizen_qid", "height_cm",
                    "image_file", "image_url", "sitelinks", "enwiki_title",
                    "debut_on", "debut_prec", "final_on", "final_prec", "hof_year"),
                   ("qid", "label"))
    stints = rows_of("wikidata_meigen_team_stint.csv",
                     ("qid", "n", "club_qid", "club_name", "start_year", "end_year",
                      "source", "source_key"),
                     ("qid", "source", "source_key"))
    honours = rows_of("wikidata_meigen_honour.csv",
                      ("qid", "n", "kind", "item_qid", "name", "year", "detail",
                       "source", "source_key"),
                      ("qid", "kind", "source", "source_key"))
    sql = (
        "\\set ON_ERROR_STOP on\n"
        + copy_sql("legacy_wikidata_meigen.wiki_page",
                   ("qid", "title", "revid", "url", "short_description", "lead_text",
                    "bytes", "sha256", "file_name"), pages)
        + copy_sql("legacy_wikidata_meigen.bio",
                   ("qid", "label", "description_en", "sport", "birth_on", "birth_prec",
                    "death_on", "death_prec", "birth_place_qid", "birth_place_label",
                    "death_place_qid", "death_place_label", "citizen_qid", "height_cm",
                    "image_file", "image_url", "sitelinks", "enwiki_title",
                    "debut_on", "debut_prec", "final_on", "final_prec", "hof_year"), bios)
        + copy_sql("legacy_wikidata_meigen.team_stint",
                   ("qid", "n", "club_qid", "club_name", "start_year", "end_year",
                    "source", "source_key"), stints)
        + copy_sql("legacy_wikidata_meigen.honour",
                   ("qid", "n", "kind", "item_qid", "name", "year", "detail",
                    "source", "source_key"), honours)
        + "select (select count(*) from legacy_wikidata_meigen.wiki_page) as wiki_pages,\n"
          "       (select count(*) from legacy_wikidata_meigen.bio) as bios,\n"
          "       (select count(*) from legacy_wikidata_meigen.team_stint) as stints,\n"
          "       (select count(*) from legacy_wikidata_meigen.honour) as honours;\n"
    )
    r = subprocess.run(["psql", "-X", "-q", "-v", "ON_ERROR_STOP=1"], input=sql, text=True, cwd=str(REPO))
    if r.returncode == 0:
        print(f"loaded pages={len(pages)} bios={len(bios)} stints={len(stints)} honours={len(honours)}")
    return r.returncode


if __name__ == "__main__":
    sys.exit(main())
