# One-time Wikidata person enrichment

`audit_missing.sql` is a read-only coordinator export, and `missing_only.py` turns its newline-delimited JSON into a request list containing only absent Wikidata properties. The export joins a stable Wikidata QID to the existing person, the current core fields, archived claim ranks/values/precision, the harvested item revision/archive hash, and roster membership. It does not write to the database. Only the coordinating session runs that SQL; never connect to DS1 from a worker.

```sh
psql -X -qAt -f scripts/people/audit_missing.sql > "$PRIVATE_DIR/person-audit.jsonl"
python3 scripts/people/missing_only.py "$PRIVATE_DIR/person-audit.jsonl" "$PRIVATE_DIR/missing-properties.tsv" --summary "$PRIVATE_DIR/audit-summary.json"
python3 scripts/people/enrichment_batch.py "$PRIVATE_DIR/missing-properties.tsv" "$PRIVATE_DIR/batch"
python3 scripts/people/test_enrichment_batch.py
```

The planner classifies properties as `held` (the corresponding core field is already populated), `usable` (an active claim has a usable value), `reviewneeded` (deprecated-only, conflicting, unsupported, or coarse evidence), `absent` (a complete archived snapshot covered the property and had no claim), or `not_queried` (there is no complete archived item snapshot). Only `not_queried` properties enter the request TSV; a known absence is never fetched repeatedly. The snapshot coverage list matches the existing harvester's person-property set: P19, P27, P413, P569, P570, P2048 and P2067. A year-only or month-only birth date is never treated as an annual birthday; it stays `reviewneeded` and is not fetched again automatically. Conflicts and unsupported date conversions are reported for review, not used to trigger duplicate requests. Birthplace (P19) and citizenship (P27) are separate fields; `core.person.birth_country_code` is not a citizenship mapping. Redirected or missing Wikidata items are skipped. No name-based identity guesses are made.

Each batch keeps the upstream entity revision and only the requested property statements. Statement objects preserve rank, snaks, qualifiers, references, date precision, and calendar model. Labels, aliases, sitelinks, and all unrequested properties are omitted. The allow-list excludes sex/gender, ethnicity, religion, health, family and political claims. Birthplace (P19) remains distinct from citizenship (P27). `wbgetentities` itself returns all claims for each requested QID; the collector hashes that response in memory and persists only the audited missing properties.

The batch manifest records the upstream-response hash, filtered-payload hash, per-QID requested properties, retrieval time, and QIDs. The full upstream body is hashed in memory then discarded. The archived file is a filtered evidence subset, not the byte-for-byte upstream response.

The tool accepts up to 50 QIDs per request, waits between batches, writes files atomically, and refuses to overwrite a batch directory. Input TSV requires `qid` and an explicit comma-separated `properties` column; unsupported or empty property lists are rejected. Keep the private audit, request list, output, manifest, hashes, and batch status together. A failed or stopped batch can be resumed by verifying its manifest and planning a new request file containing only uncompleted QID/property pairs. Do not write any records to DS1 or production until the approved database mapping is reviewed.
