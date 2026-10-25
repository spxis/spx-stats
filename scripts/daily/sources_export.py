#!/usr/bin/env python3
"""Write the two files that carry the source registry (sources.py) to places that cannot import it.

    python3 -I scripts/daily/sources_export.py            write both files
    python3 -I scripts/daily/sources_export.py --check    exit 1 when a file is not what the registry says

web/src/data/sourceRegistry.ts   what /admin/sources and the run log read (tier, terms notes, evidence link; admin only, no secrets)
db/build/225_source_tier.sql     sets meta.source.tier, terms_note and evidence_url for the sources that already have a meta.source row
Run from the repo root.
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)
import sources as SRC

TS = os.path.join(ROOT, "web", "src", "data", "sourceRegistry.ts")
SQL = os.path.join(ROOT, "db", "build", "225_source_tier.sql")

# meta.source codes that hold a registry source's data (the registry id is the code for sources without a row yet)
META_CODES = {
    "wikipedia": ("wikipedia", "wikipedia_daily", "wikipedia_mls"),
    "wikidata": ("wikidata", "wikidata_rosters", "wikidata_meigen"),
    "retrosheet": ("retrosheet",), "lahman": ("lahman",), "nflverse": ("nflverse",), "osm": ("openstreetmap",), "nhl_api": ("nhl_api",),
}

TS_HEAD = """// Generated from scripts/daily/sources.py by scripts/daily/sources_export.py; do not edit by hand.
// scripts/daily/sources_export.py --check and web/scripts/adminSources.test.ts check that this agrees with the registry.
// Admin only: read by /admin/sources and the run log, which answer 404 to anyone else.
export type SourceTier = "green" | "grey" | "red-confirm" | "red";
export interface SourceEntry {
  id: string;
  name: string;
  tier: SourceTier;
  reason: string;
  notes: string;
  evidence: string | null;
  leagues: string[];
  hosts: string[];
  keyNeeded: boolean;
  spacingSeconds: number | null;
  dailyCap: number | null;
  checkedOn: string | null;
  checkedBy: string | null;
}

export const SOURCE_REGISTRY: SourceEntry[] = """


def entries():
    out = []
    for r in SRC.listing():
        s = SRC.SOURCES[r["id"]]
        t = r["terms"] or {}
        out.append(dict(id=r["id"], name=r["name"], tier=r["tier"], reason=r["reason"], notes=r["notes"], evidence=r["evidence"], leagues=r["leagues"], hosts=list(s["hosts"]),
                        keyNeeded=r["key_needed"], spacingSeconds=r["spacing_seconds"], dailyCap=r["daily_cap"], checkedOn=t.get("checked_on"), checkedBy=t.get("checked_by")))
    return out


def lit(v):
    return "'" + str(v).replace("'", "''") + "'" if v else "null"


def make_ts():
    return TS_HEAD + json.dumps(entries(), indent=2, ensure_ascii=False) + ";\n"


def make_sql():
    rows = []
    for e in SRC.listing():
        note = e["notes"] or (e["terms"] or {}).get("clause") or e["reason"]
        for code in META_CODES.get(e["id"], (e["id"],)):
            rows.append("  (%s, %s, %s, %s)" % (lit(code), lit(e["tier"]), lit(note), lit(e["evidence"])))
    return ("-- Generated from scripts/daily/sources.py by scripts/daily/sources_export.py; do not edit by hand.\n"
            "-- Sets the tier, the terms note and the evidence link on the meta.source rows the registry names (a code with no row yet is skipped:\n"
            "-- the migration that adds a source sets its own tier). Rerunnable; touches nothing else. The grey-area report reads meta.source.tier\n"
            "-- (api.grey_only_rows, db/review/grey_only_rows.sql). meta.source reaches production in a data release.\n"
            "update meta.source s set tier = v.tier, terms_note = v.terms_note, evidence_url = v.evidence_url\n"
            "from (values\n" + ",\n".join(rows) + "\n) as v(code, tier, terms_note, evidence_url)\n"
            "where s.code = v.code\n  and (s.tier is distinct from v.tier or s.terms_note is distinct from v.terms_note or s.evidence_url is distinct from v.evidence_url);\n")


def main(argv):
    want = {TS: make_ts(), SQL: make_sql()}
    if "--check" in argv:
        bad = [p for p, text in want.items() if not os.path.exists(p) or open(p, encoding="utf-8").read() != text]
        for p in bad:
            print("out of date:", os.path.relpath(p, ROOT), "(run python3 -I scripts/daily/sources_export.py)")
        return 1 if bad else 0
    for p, text in want.items():
        with open(p, "w", encoding="utf-8") as f:
            f.write(text)
        print("wrote", os.path.relpath(p, ROOT))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
