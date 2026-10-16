# One-time Wikidata person enrichment

`enrichment_batch.py` creates resumable offline evidence batches from stable Wikidata QIDs. It writes no database. Input is a plain QID list or a TSV with a `qid` column:

```sh
python3 scripts/people/enrichment_batch.py /private/path/candidates.tsv /private/path/batch
python3 scripts/people/test_enrichment_batch.py
```

Each batch keeps the upstream revision, English label/aliases, English Wikipedia title, and selected person facts. Statement objects are preserved for the allow-listed properties, including rank, snaks, qualifiers, references, date precision, and calendar model. The allow-list is intentionally limited to names and public sports biography facts; it excludes sex/gender, ethnicity, religion, health, family and political claims. Birthplace (P19) remains distinct from citizenship (P27).

`wbgetentities` returns all claims for an entity. The tool hashes the exact upstream response bytes in memory, then discards that body; only the reviewed allow-list is written. The batch manifest records the upstream-response hash, filtered-payload hash, request, retrieval time, and QIDs. This obeys the repository's privacy rule but means the archived file is the exact safe property subset, not the unfiltered response. Never describe the filtered file as the byte-for-byte upstream response.

The tool accepts up to 50 QIDs per request, waits between batches, writes files atomically, and refuses to overwrite a batch directory. Keep the private input list, output, manifest, hashes, and batch status together. A failed or stopped batch can be resumed by verifying the existing manifest and moving only the uncompleted QIDs to a new batch directory. Do not write any records to DS1 or production until the approved database mapping is reviewed.
