#!/usr/bin/env python3
"""Plan only absent Wikidata person properties from a coordinator audit export.

Input is newline-delimited JSON from audit_missing.sql. This program is offline:
it does not connect to a database or fetch source data. It treats existing
non-deprecated source claims as present even when their value is coarse,
unsupported by the local calendar conversion, or in conflict; those conditions
are surfaced for review instead of causing a duplicate source request.
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

from enrichment_batch import KEEP, QID

AUDIT_SCHEMA = "spx.wikidata-person-audit/v1"
CORE_FIELDS = {
    "P569": "birth_date",
    "P570": "death_date",
    "P19": "birth_place",
    "P2048": "height_cm",
}
TARGET_PROPERTIES = {"P569", "P570", "P19", "P27", "P413", "P2048", "P2067"}


def read_audit(path: Path) -> list[dict]:
    rows = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError as exc:
            raise ValueError(f"invalid JSON on audit line {line_number}") from exc
        if row.get("schema") != AUDIT_SCHEMA:
            raise ValueError(f"unsupported audit schema on line {line_number}")
        qid = row.get("qid")
        if not isinstance(qid, str) or not QID.fullmatch(qid):
            raise ValueError(f"invalid stable Wikidata QID on audit line {line_number}")
        if not isinstance(row.get("person_id"), int) or row["person_id"] <= 0:
            raise ValueError(f"invalid person_id on audit line {line_number}")
        if not isinstance(row.get("core"), dict) or not isinstance(row.get("item"), dict):
            raise ValueError(f"invalid core or item object on audit line {line_number}")
        if not isinstance(row.get("claims"), list) or any(not isinstance(claim, dict) for claim in row["claims"]):
            raise ValueError(f"invalid claims list on audit line {line_number}")
        rows.append(row)
    person_ids = [row["person_id"] for row in rows]
    qids = [row["qid"] for row in rows]
    if len(person_ids) != len(set(person_ids)) or len(qids) != len(set(qids)):
        raise ValueError("audit has duplicate person_id or QID mappings")
    return rows


def _active(claim: dict) -> bool:
    return claim.get("rank") in ("normal", "preferred")


def _conflicting_values(claims: list[dict]) -> bool:
    active = [claim for claim in claims if _active(claim)]
    if not active:
        return False
    top_rank = "preferred" if any(c.get("rank") == "preferred" for c in active) else "normal"
    values = {
        (c.get("value_qid"), c.get("value_on"), c.get("value_prec"), c.get("value_num"), c.get("value_text"))
        for c in active if c.get("rank") == top_rank
    }
    return len(values) > 1


def classify_property(prop: str, claims: list[dict], core: dict) -> tuple[str, str | None]:
    """Return held, usable, reviewneeded, or absent without guessing identity."""
    active = [claim for claim in claims if _active(claim)]
    if active:
        if _conflicting_values(active):
            return "reviewneeded", "conflicting_active_claims"
        if prop == "P569":
            if any(c.get("value_on") and c.get("value_prec") == 11 for c in active):
                return "usable", None
            return "reviewneeded", "birth_date_not_exact_gregorian_day"
        if prop in ("P570",) and not any(c.get("value_on") for c in active):
            return "reviewneeded", "date_claim_not_convertible"
        has_value = any(any(c.get(k) is not None for k in ("value_qid", "value_on", "value_num", "value_text")) for c in active)
        return ("usable", None) if has_value else ("reviewneeded", "claim_has_no_usable_value")
    if claims:
        return "reviewneeded", "deprecated_only_claims"
    core_field = CORE_FIELDS.get(prop)
    if core_field and core.get(core_field) not in (None, ""):
        return "held", "core_field_already_populated"
    return "absent", None


def plan_requests(rows: list[dict]) -> tuple[list[dict], dict]:
    requests = []
    skipped = {"redirect": 0, "missing_or_invalid_item": 0, "no_missing_properties": 0}
    reviews = []
    property_status_counts = {prop: {status: 0 for status in ("held", "usable", "reviewneeded", "absent", "not_queried")} for prop in sorted(TARGET_PROPERTIES)}
    for row in rows:
        item = row.get("item") or {}
        if item.get("redirect_to"):
            skipped["redirect"] += 1
            continue
        if item.get("missing"):
            skipped["missing_or_invalid_item"] += 1
            continue
        by_prop: dict[str, list[dict]] = {}
        for claim in row.get("claims") or []:
            prop = claim.get("prop")
            if prop in KEEP:
                by_prop.setdefault(prop, []).append(claim)
        missing = []
        coverage = set(row.get("coverage_properties") or [])
        for prop in sorted(TARGET_PROPERTIES):
            claims = by_prop.get(prop, [])
            status, issue = classify_property(prop, claims, row.get("core") or {})
            if status == "absent":
                if prop in coverage:
                    # A completed archive asked for this property and stored no claim.
                    # Preserve known absence; don't repeat the same source request.
                    pass
                else:
                    status = "not_queried"
            property_status_counts[prop][status] += 1
            if status == "not_queried":
                missing.append(prop)
            elif status == "reviewneeded":
                reviews.append({"person_id": row["person_id"], "qid": row["qid"], "property": prop, "issue": issue})
        if missing:
            requests.append({"person_id": row["person_id"], "qid": row["qid"], "properties": missing})
        else:
            skipped["no_missing_properties"] += 1
    summary = {
        "audited_people": len(rows),
        "request_qids": len(requests),
        "request_property_slots": sum(len(row["properties"]) for row in requests),
        "skipped": skipped,
        "review_issues": len(reviews),
        "property_status_counts": property_status_counts,
        "reviews": reviews,
    }
    return requests, summary


def write_requests(requests: list[dict], output: Path) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    with output.open("w", encoding="utf-8", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=("qid", "properties"), delimiter="\t", lineterminator="\n")
        writer.writeheader()
        for row in requests:
            writer.writerow({"qid": row["qid"], "properties": ",".join(row["properties"])})


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("audit", type=Path, help="newline-delimited output of audit_missing.sql")
    parser.add_argument("requests", type=Path, help="private TSV destination for missing-property requests")
    parser.add_argument("--summary", type=Path, help="optional private JSON summary and review issues")
    args = parser.parse_args(argv)
    try:
        requests, summary = plan_requests(read_audit(args.audit))
        write_requests(requests, args.requests)
        if args.summary:
            args.summary.parent.mkdir(parents=True, exist_ok=True)
            args.summary.write_text(json.dumps(summary, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(json.dumps({k: v for k, v in summary.items() if k != "reviews"}, sort_keys=True))
    except (OSError, ValueError) as exc:
        print(f"missing-property planning failed: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
