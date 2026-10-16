#!/usr/bin/env python3
"""Behavior tests for the privacy-filtered Wikidata evidence batch."""
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

import enrichment_batch as batch


class EnrichmentBatchTests(unittest.TestCase):
    def setUp(self):
        self.source = {
            "entities": {
                "Q42": {
                    "id": "Q42",
                    "type": "item",
                    "lastrevid": 987654,
                    "modified": "2026-10-15T01:23:45Z",
                    "labels": {"en": {"language": "en", "value": "Test athlete"}, "fr": {"language": "fr", "value": "Athlète test"}},
                    "aliases": {"en": [{"language": "en", "value": "The Test"}]},
                    "sitelinks": {"enwiki": {"site": "enwiki", "title": "Test athlete"}},
                    "claims": {
                        "P569": [{"id": "Q42$birth", "rank": "normal", "mainsnak": {"snaktype": "value", "datavalue": {"type": "time", "value": {"time": "+1980-02-03T00:00:00Z", "precision": 11, "calendarmodel": "http://www.wikidata.org/entity/Q1985727"}}}, "references": [{"hash": "abc", "snaks": {"P248": [{"snaktype": "value", "datavalue": {"type": "wikibase-entityid", "value": {"id": "Q36578"}}}], "P854": [{"snaktype": "value", "datavalue": {"type": "string", "value": "https://example.test/source"}}]}}]}],
                        "P19": [{"id": "Q42$birthplace", "rank": "preferred", "mainsnak": {"snaktype": "value", "datavalue": {"type": "wikibase-entityid", "value": {"id": "Q60"}}}}],
                        "P21": [{"id": "Q42$gender", "rank": "normal", "mainsnak": {"snaktype": "value", "datavalue": {"type": "wikibase-entityid", "value": {"id": "Q6581097"}}}}],
                    },
                }
            }
        }
        self.raw = json.dumps(self.source, separators=(",", ":")).encode()

    def test_keeps_exact_date_precision_calendar_rank_and_references(self):
        payload, manifest = batch.filtered_payload(self.raw, ["Q42"], "2026-10-15T01:00:00+00:00")
        doc = json.loads(payload)
        entity = doc["entities"]["Q42"]
        claim = entity["claims"]["P569"][0]
        time_value = claim["mainsnak"]["datavalue"]["value"]
        self.assertEqual(entity["lastrevid"], 987654)
        self.assertEqual(claim["rank"], "normal")
        self.assertEqual(time_value["precision"], 11)
        self.assertEqual(time_value["calendarmodel"], "http://www.wikidata.org/entity/Q1985727")
        self.assertEqual(claim["references"], self.source["entities"]["Q42"]["claims"]["P569"][0]["references"])
        self.assertEqual(manifest["upstream_response_sha256"], hashlib.sha256(self.raw).hexdigest())

    def test_sensitive_and_unapproved_properties_are_not_saved(self):
        payload, _ = batch.filtered_payload(self.raw, ["Q42"], "2026-10-15T01:00:00+00:00")
        claims = json.loads(payload)["entities"]["Q42"]["claims"]
        self.assertEqual(set(claims), {"P569", "P19"})
        self.assertNotIn("P21", claims)

    def test_tsv_inputs_are_stably_deduplicated_and_validated(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "ids.tsv"
            path.write_text("qid\tlabel\nQ100\tA\nQ42\tB\n")
            self.assertEqual(batch.read_qids(path), ["Q42", "Q100"])
            path.write_text("qid\nQ42\nQ42\n")
            with self.assertRaisesRegex(ValueError, "duplicates"):
                batch.read_qids(path)

    def test_atomic_collection_refuses_to_overwrite_existing_batches(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "batch"
            out.mkdir()
            (out / "entities-001.json").write_text("already staged")
            with self.assertRaisesRegex(FileExistsError, "resume"):
                batch.collect(["Q42"], out, "2026-10-15T01:00:00+00:00")


if __name__ == "__main__":
    unittest.main()
