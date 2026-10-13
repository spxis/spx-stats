#!/usr/bin/env python3
"""Turn db/seed/person_review.csv into web/src/data/personReview.ts (the data of the admin page /admin/people).

Run from the repo root: python3 -I scripts/people/review_to_ts.py
The CSV is made by db/review/person_review.sql; web/scripts/personReview.test.ts checks the two files agree.
"""
import csv
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
SRC = ROOT / "db" / "seed" / "person_review.csv"
DEST = ROOT / "web" / "src" / "data" / "personReview.ts"

HEADER = """// Generated from db/seed/person_review.csv by scripts/people/review_to_ts.py; do not edit by hand.
// web/scripts/personReview.test.ts checks that the two agree.
// Admin only: it is read by /admin/people, which answers 404 to anyone else, and is part of no public page or API.
export interface ReviewSide {
  id: number;
  name: string;
  kind: string;
  sources: string;
  league: string;
  born: string | null;
  from: number | null;
  to: number | null;
  clubs: string | null;
}

export interface ReviewPair {
  lean: "possibly one person" | "unknown" | "probably two people";
  why: string;
  a: ReviewSide;
  b: ReviewSide;
}

export const PERSON_REVIEW: readonly ReviewPair[] = """


def side(row: dict, s: str) -> dict:
    year = lambda v: int(v) if v else None
    return {
        "id": int(row["person_id_" + s]),
        "name": row["name_" + s],
        "kind": row["kind_" + s],
        "sources": row["sources_" + s],
        "league": row["league_" + s],
        "born": row["born_" + s] or None,
        "from": year(row["from_" + s]),
        "to": year(row["to_" + s]),
        "clubs": row["clubs_" + s] or None,
    }


def main() -> None:
    with SRC.open(newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    data = [{"lean": r["lean"], "why": r["why_unsure"], "a": side(r, "a"), "b": side(r, "b")} for r in rows]
    DEST.parent.mkdir(parents=True, exist_ok=True)
    DEST.write_text(HEADER + json.dumps(data, ensure_ascii=False, indent=1) + ";\n", encoding="utf-8")
    print(f"{len(data)} pairs -> {DEST.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
