#!/usr/bin/env python3
"""Behavior tests for the privacy-filtered Wikidata evidence batch."""
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

import enrichment_batch as batch
import missing_only


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
        payload, manifest = batch.filtered_payload(self.raw, ["Q42"], "2026-10-15T01:00:00+00:00", {"Q42": ["P569", "P19"]})
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
        self.assertEqual(manifest["requested_properties_by_qid"], {"Q42": ["P19", "P569"]})
        self.assertNotIn("labels", entity)
        self.assertNotIn("sitelinks", entity)

    def test_sensitive_and_unapproved_properties_are_not_saved(self):
        payload, _ = batch.filtered_payload(self.raw, ["Q42"], "2026-10-15T01:00:00+00:00", {"Q42": ["P569"]})
        claims = json.loads(payload)["entities"]["Q42"]["claims"]
        self.assertEqual(set(claims), {"P569"})
        self.assertNotIn("P21", claims)

    def test_tsv_inputs_are_stably_deduplicated_and_validated(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "ids.tsv"
            path.write_text("qid\tlabel\nQ100\tA\nQ42\tB\n")
            self.assertEqual(batch.read_qids(path), ["Q42", "Q100"])
            path.write_text("qid\tproperties\nQ42\tP569\nQ42\tP19\n")
            with self.assertRaisesRegex(ValueError, "duplicate"):
                batch.read_requests(path)

    def test_atomic_collection_refuses_to_overwrite_existing_batches(self):
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "batch"
            out.mkdir()
            (out / "entities-001.json").write_text("already staged")
            with self.assertRaisesRegex(FileExistsError, "resume"):
                batch.collect({"Q42": ["P569"]}, out, "2026-10-15T01:00:00+00:00")

    def test_request_tsv_requires_explicit_allowed_missing_properties(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "requests.tsv"
            path.write_text("qid\tproperties\nQ42\tP569,P19\n")
            self.assertEqual(batch.read_requests(path), {"Q42": ["P19", "P569"]})
            path.write_text("qid\tproperties\nQ42\tP21\n")
            with self.assertRaisesRegex(ValueError, "unsupported"):
                batch.read_requests(path)

    def test_missing_only_planner_respects_existing_coarse_conflicting_and_core_facts(self):
        rows = [
            {
                "schema": missing_only.AUDIT_SCHEMA, "person_id": 1, "qid": "Q42",
                "core": {"birth_date": None, "death_date": None, "birth_place": "Existing place", "birth_country_code": "CA", "height_cm": 180},
                "item": {"lastrevid": 10, "archive_name": "harvest/people.json", "archive_sha256": "a" * 64},
                "coverage_properties": sorted(missing_only.TARGET_PROPERTIES),
                "team_membership_count": 2,
                "claims": [
                    {"prop": "P569", "n": 0, "rank": "normal", "value_on": "1980-01-01", "value_prec": 9},
                    {"prop": "P19", "n": 0, "rank": "normal", "value_qid": "Q1"},
                    {"prop": "P19", "n": 1, "rank": "normal", "value_qid": "Q2"},
                    {"prop": "P27", "n": 0, "rank": "deprecated", "value_qid": "Q3"},
                ],
            },
            {
                "schema": missing_only.AUDIT_SCHEMA, "person_id": 2, "qid": "Q43",
                "core": {"birth_date": "1991-02-03", "birth_place": "Another known place", "birth_country_code": "US"},
                "item": {"lastrevid": 11, "archive_name": "harvest/people2.json"},
                "claims": [
                    {"prop": "P19", "n": 0, "rank": "normal", "value_qid": "Q2"},
                    {"prop": "P27", "n": 0, "rank": "normal", "value_qid": "Q3"},
                    {"prop": "P413", "n": 0, "rank": "normal", "value_qid": "Q7"},
                    {"prop": "P569", "n": 0, "rank": "normal", "value_on": "1991-02-03", "value_prec": 11},
                    {"prop": "P570", "n": 0, "rank": "normal", "value_on": "2020-01-01", "value_prec": 11},
                    {"prop": "P2048", "n": 0, "rank": "normal", "value_num": 180},
                    {"prop": "P2067", "n": 0, "rank": "normal", "value_num": 80},
                ],
            },
            {
                "schema": missing_only.AUDIT_SCHEMA, "person_id": 3, "qid": "Q44",
                "core": {}, "item": {"redirect_to": "Q45"}, "claims": [],
            },
            {
                "schema": missing_only.AUDIT_SCHEMA, "person_id": 4, "qid": "Q45",
                "core": {}, "item": {}, "claims": [], "coverage_properties": [],
            },
            {
                "schema": missing_only.AUDIT_SCHEMA, "person_id": 5, "qid": "Q46",
                "core": {"birth_date": "1981-03-04", "birth_place": "Known place"},
                "item": {}, "claims": [], "coverage_properties": [],
            },
        ]
        requests, summary = missing_only.plan_requests(rows)
        self.assertEqual(requests[0]["qid"], "Q45")
        self.assertEqual(set(requests[0]["properties"]), missing_only.TARGET_PROPERTIES)
        self.assertEqual(requests[1]["qid"], "Q46")
        self.assertNotIn("P569", requests[1]["properties"])
        self.assertNotIn("P19", requests[1]["properties"])
        self.assertEqual(summary["skipped"]["redirect"], 1)
        self.assertEqual(summary["review_issues"], 3)
        self.assertEqual(summary["property_status_counts"]["P569"]["reviewneeded"], 1)
        self.assertEqual(summary["property_status_counts"]["P19"]["reviewneeded"], 1)
        self.assertEqual(summary["property_status_counts"]["P27"]["reviewneeded"], 1)
        self.assertEqual(summary["property_status_counts"]["P27"]["not_queried"], 2)
        self.assertEqual(summary["property_status_counts"]["P570"]["absent"], 1)
        self.assertEqual(summary["property_status_counts"]["P569"]["held"], 1)
        self.assertEqual(summary["property_status_counts"]["P19"]["held"], 1)
        self.assertEqual(summary["property_status_counts"]["P413"]["usable"], 1)
        self.assertEqual(summary["request_qids"], 2)
        self.assertEqual(summary["request_property_slots"], len(missing_only.TARGET_PROPERTIES) * 2 - 2)

    def test_deprecated_only_and_coarse_birth_dates_are_reviewed_not_requested(self):
        coarse = {"prop": "P569", "rank": "normal", "value_on": "1980-01-01", "value_prec": 9}
        deprecated = {"prop": "P166", "rank": "deprecated", "value_qid": "Q9"}
        self.assertEqual(missing_only.classify_property("P569", [coarse], {}), ("reviewneeded", "birth_date_not_exact_gregorian_day"))
        self.assertEqual(missing_only.classify_property("P166", [deprecated], {}), ("reviewneeded", "deprecated_only_claims"))
        self.assertEqual(missing_only.classify_property("P569", [], {"birth_date": "1980-02-03"}), ("held", "core_field_already_populated"))

    def test_audit_rejects_duplicate_qids_and_person_mappings(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "audit.jsonl"
            row = {"schema": missing_only.AUDIT_SCHEMA, "person_id": 1, "qid": "Q42", "core": {}, "item": {}, "claims": []}
            path.write_text(json.dumps(row) + "\n" + json.dumps({**row, "person_id": 2, "qid": "Q42"}) + "\n")
            with self.assertRaisesRegex(ValueError, "duplicate"):
                missing_only.read_audit(path)
            path.write_text(json.dumps(row) + "\n" + json.dumps({**row, "person_id": 1, "qid": "Q43"}) + "\n")
            with self.assertRaisesRegex(ValueError, "duplicate"):
                missing_only.read_audit(path)


if __name__ == "__main__":
    unittest.main()
