#!/usr/bin/env python3
"""Fetch resumable, privacy-filtered Wikidata person evidence batches.

Wikidata's wbgetentities endpoint returns every claim on a person item. The full
HTTP body is hashed in memory and discarded; only the reviewed property
allow-list is written. Statements in that allow-list retain their original
rank, snaks, qualifiers, references, time precision, and calendar model.

This is an offline staging tool. It does not connect to Postgres or write the
database. See scripts/people/README-enrichment.md for its data contract.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import hashlib
import json
import os
import re
import ssl
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://www.wikidata.org/w/api.php"
USER_AGENT = "spx-stats/0.1 (https://github.com/spxis/spx-stats)"
BATCH_SIZE = 50
# Public person facts needed for birthday feeds and useful sports biographies.
# P21 and all family, health, political, religion, and ethnicity properties are
# deliberately excluded. References are retained only for these properties.
KEEP = {
    "P19", "P20", "P27", "P54", "P106", "P166", "P413", "P569", "P570",
    "P641", "P735", "P734", "P1477", "P1559", "P2048", "P2067", "P423",
    "P741",
}
QID = re.compile(r"Q[1-9][0-9]*\Z")


def read_qids(path: Path) -> list[str]:
    text = path.read_text(encoding="utf-8")
    if not text.strip():
        raise ValueError("QID input is empty")
    if "\t" in text.splitlines()[0] or text.splitlines()[0].strip() == "qid":
        rows = csv.DictReader(text.splitlines(), delimiter="\t")
        if "qid" not in (rows.fieldnames or []):
            raise ValueError("TSV input needs a qid column")
        ids = [row["qid"].strip() for row in rows]
    else:
        ids = [line.strip() for line in text.splitlines() if line.strip()]
    if any(not QID.fullmatch(q) for q in ids):
        raise ValueError("QID input contains an invalid identifier")
    if len(ids) != len(set(ids)):
        raise ValueError("QID input contains duplicates")
    return sorted(ids, key=lambda q: int(q[1:]))


def _safe_entity(qid: str, entity: dict, requested_properties: set[str]) -> dict:
    """Copy allowed source fields without normalizing the Wikidata statement data."""
    out = {k: entity[k] for k in ("id", "type", "lastrevid", "modified", "missing") if k in entity}
    if entity.get("redirects"):
        out["redirects"] = entity["redirects"]
    claims = entity.get("claims") or {}
    selected = {
        prop: claims[prop]
        for prop in sorted(requested_properties & KEEP)
        if prop in claims
    }
    if selected:
        out["claims"] = selected
    return out


def filtered_payload(
    raw: bytes,
    requested: list[str],
    retrieved_at: str,
    requested_properties: dict[str, list[str]],
) -> tuple[bytes, dict]:
    """Return sanitized JSON bytes and provenance metadata for one API response."""
    body = json.loads(raw)
    if body.get("error"):
        raise RuntimeError("Wikidata API returned an error")
    source_entities = body.get("entities") or {}
    if isinstance(source_entities, list):
        source_entities = {e.get("id"): e for e in source_entities if e.get("id")}
    entities = {}
    for qid, entity in source_entities.items():
        if not isinstance(entity, dict):
            continue
        # Keep redirect/returned identities as sent; matching decisions are a
        # separate review step and are never inferred from display names.
        props = set(requested_properties.get(qid, []))
        entities[qid] = _safe_entity(qid, entity, props)
    result = {
        "schema": "spx.wikidata-person-evidence/v1",
        "requested_qids": requested,
        "entities": entities,
    }
    selected_bytes = (json.dumps(result, ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n").encode("utf-8")
    metadata = {
        "source": "Wikidata",
        "license": "CC0 1.0",
        "api_url": API,
        "request_properties": ["info", "claims"],
        "allowed_claim_properties": sorted(KEEP),
        "retrieved_at_utc": retrieved_at,
        "requested_qids": requested,
        "requested_properties_by_qid": {
            qid: sorted(set(requested_properties[qid])) for qid in requested
        },
        "returned_entities": len(entities),
        "upstream_response_sha256": hashlib.sha256(raw).hexdigest(),
        "filtered_payload_sha256": hashlib.sha256(selected_bytes).hexdigest(),
        "raw_policy": "Full upstream response is hashed in memory then discarded; only allowed properties are saved to avoid retaining disallowed personal claims.",
    }
    return selected_bytes, metadata


def request_batch(qids: list[str], timeout: int = 45) -> bytes:
    params = urllib.parse.urlencode({
        "action": "wbgetentities",
        "ids": "|".join(qids),
        "props": "info|claims",
        "format": "json",
    })
    req = urllib.request.Request(API + "?" + params, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    delay = 5
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req, timeout=timeout, context=ssl.create_default_context()) as response:
                return response.read()
        except urllib.error.HTTPError as exc:
            if exc.code != 429 and exc.code < 500 or attempt == 3:
                raise
            retry_after = exc.headers.get("Retry-After", "")
            time.sleep(min(int(retry_after), 60) if retry_after.isdigit() else delay)
            delay = min(delay * 2, 60)
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            if attempt == 3:
                raise
            time.sleep(delay)
            delay = min(delay * 2, 60)
    raise RuntimeError("Wikidata request failed")


def _atomic_write(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix=path.name + ".", suffix=".part", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(payload)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(name, path)
    finally:
        if os.path.exists(name):
            os.unlink(name)


def read_requests(path: Path) -> dict[str, list[str]]:
    """Read QIDs and explicit missing-property lists from a planner TSV."""
    with path.open(encoding="utf-8", newline="") as stream:
        rows = csv.DictReader(stream, delimiter="\t")
        if not {"qid", "properties"}.issubset(rows.fieldnames or []):
            raise ValueError("request TSV needs qid and properties columns")
        result = {}
        for row in rows:
            qid = (row.get("qid") or "").strip()
            props = sorted(set(filter(None, (row.get("properties") or "").split(","))))
            if not QID.fullmatch(qid):
                raise ValueError("request TSV contains an invalid QID")
            if qid in result:
                raise ValueError("request TSV contains duplicate QIDs")
            if not props or any(prop not in KEEP for prop in props):
                raise ValueError("request TSV has empty or unsupported properties")
            result[qid] = props
    if not result:
        raise ValueError("request TSV contains no rows")
    return dict(sorted(result.items(), key=lambda item: int(item[0][1:])))


def collect(requested_properties: dict[str, list[str]], output: Path, retrieved_at: str | None = None) -> list[dict]:
    output.mkdir(parents=True, exist_ok=True)
    retrieved_at = retrieved_at or dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
    existing = sorted(output.glob("entities-*.json"))
    if existing:
        raise FileExistsError("output already contains entity batches; resume by verifying its manifest, do not refetch")
    qids = list(requested_properties)
    batches = [qids[i:i + BATCH_SIZE] for i in range(0, len(qids), BATCH_SIZE)]
    records = []
    for n, batch in enumerate(batches, 1):
        raw = request_batch(batch)
        per_qid = {qid: requested_properties[qid] for qid in batch}
        payload, meta = filtered_payload(raw, batch, retrieved_at, per_qid)
        filename = f"entities-{n:03d}.json"
        _atomic_write(output / filename, payload)
        meta["file"] = filename
        records.append(meta)
        manifest = {
            "schema": "spx.wikidata-person-batch-manifest/v1",
            "source": "Wikidata",
            "license": "CC0 1.0",
            "retrieved_at_utc": retrieved_at,
            "batches": records,
        }
        _atomic_write(output / "manifest.json", (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode("utf-8"))
        if n < len(batches):
            time.sleep(2.1)
    return records


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("requests", type=Path, help="TSV with qid and explicit missing properties columns")
    parser.add_argument("output", type=Path, help="private staging directory; must not already contain entity batches")
    args = parser.parse_args(argv)
    try:
        requested_properties = read_requests(args.requests)
        records = collect(requested_properties, args.output)
    except (OSError, ValueError, RuntimeError, urllib.error.URLError, TimeoutError) as exc:
        print(f"enrichment batch failed: {exc}", file=sys.stderr)
        return 1
    print(f"saved {sum(r['returned_entities'] for r in records)} entities in {len(records)} batch(es)")
    for record in records:
        print(f"{record['file']}: {len(record['requested_qids'])} requested, upstream sha256 {record['upstream_response_sha256']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
