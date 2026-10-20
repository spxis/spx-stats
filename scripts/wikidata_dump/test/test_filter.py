#!/usr/bin/env python3
"""Tests for scripts/wikidata_dump/filter.py on the committed fixture (no network, no database).

  python3 -I scripts/wikidata_dump/test/test_filter.py

Every case runs the real command line in a subprocess (so exit codes, --workers and both decompressors are the real ones).
"""
from __future__ import annotations

import gzip
import importlib.util
import json
import re
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
TOOL = HERE.parent / "filter.py"
FIXTURE = HERE / "fixture-dump.json.gz"


def _load(name: str, path: Path):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[name] = mod
    spec.loader.exec_module(mod)
    return mod


fixture = _load("wd_build_fixture", HERE / "build_fixture.py")
fl = _load("wd_filter", TOOL)


def cli(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    p = subprocess.run([sys.executable, "-I", str(TOOL), *args], capture_output=True, text=True)
    if check and p.returncode != 0:
        raise AssertionError(f"exit {p.returncode}: {p.stderr}")
    return p


def read(path: Path) -> list[dict]:
    with gzip.open(path, "rt", encoding="utf-8") as f:
        return [json.loads(x) for x in f if x.strip()]


def ids(path: Path) -> list[str]:
    return [d["id"] for d in read(path)]


class Base(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = Path(tempfile.mkdtemp(prefix="wd-filter-test-"))
        self.out = self.tmp / "out"

    def tearDown(self) -> None:
        shutil.rmtree(self.tmp, ignore_errors=True)

    def extract(self, *extra: str, dump: Path = FIXTURE) -> subprocess.CompletedProcess:
        return cli("extract", str(dump), str(self.out), "--fresh", *extra)

    def summary(self) -> dict:
        return json.loads((self.out / "summary.json").read_text(encoding="utf-8"))


class FixtureTests(Base):
    def test_committed_fixture_is_what_the_builder_makes(self) -> None:
        self.assertEqual(FIXTURE.read_bytes(), fixture.dump_bytes())

    def test_strict_rule(self) -> None:
        self.extract()
        self.assertEqual(ids(self.out / "people.jsonl.gz"), ["Q1001", "Q1005", "Q1006", "Q1008"])
        self.assertEqual(ids(self.out / "events.jsonl.gz"), ["Q2001", "Q2003", "Q2006"])
        self.assertEqual(ids(self.out / "items.jsonl.gz"), ["Q2002", "Q2004", "Q2005", "Q3001", "Q3002", "Q3003"])
        s = self.summary()
        self.assertEqual(s["counts"], {"people": 4, "events": 3, "items": 6})
        self.assertTrue(s["complete"])
        self.assertEqual(s["by_sport"]["people"], {"Q847": 2, "Q41466": 1, "Q5372": 1})

    def test_rules(self) -> None:
        self.extract("--rule", "occupation")
        self.assertIn("Q1002", ids(self.out / "people.jsonl.gz"))  # tennis player with no sport
        self.assertNotIn("Q1003", ids(self.out / "people.jsonl.gz"))
        self.extract("--rule", "sport")
        got = ids(self.out / "people.jsonl.gz")
        self.assertIn("Q1003", got)  # an actor with a sport
        self.assertIn("Q1004", got)
        self.assertNotIn("Q1002", got)
        self.assertNotIn("Q1007", got)  # a deprecated sport does not count
        self.assertNotIn("Q1009", got)  # P641 only as a qualifier

    def test_sensitive_properties_never_copied(self) -> None:
        self.extract("--rule", "sport")
        text = ""
        for name in ("people", "events", "items"):
            text += gzip.open(self.out / f"{name}.jsonl.gz", "rt", encoding="utf-8").read()
        for qid in fixture.SENSITIVE_QIDS:
            self.assertNotIn(qid, text, qid)
        keys: set[str] = set()

        def walk(o) -> None:
            if isinstance(o, dict):
                keys.update(o)
                for v in o.values():
                    walk(v)
            elif isinstance(o, list):
                for v in o:
                    walk(v)
        for name in ("people", "events", "items"):
            for d in read(self.out / f"{name}.jsonl.gz"):
                walk(d)
        self.assertEqual(keys & fl.FORBIDDEN, set())
        self.assertNotIn("P21", keys)
        self.assertNotIn("P735", keys)  # a given name proxies for origin: not kept

    def test_sensitive_occupation_and_description(self) -> None:
        self.extract()
        by = {d["id"]: d for d in read(self.out / "people.jsonl.gz")}
        self.assertEqual(by["Q1001"]["P106"], ["Q11774891"])  # "female athlete" Q106037372 removed
        self.assertEqual(by["Q1001"]["d"], "Canadian ice hockey player")
        self.assertNotIn("d", by["Q1005"])  # "... brother of Eve"
        self.assertNotIn("Q1004", by)  # only a sex-marking occupation: no match
        self.assertEqual(self.summary()["dropped"]["occupation_values_dropped"], 1)
        self.assertEqual(self.summary()["dropped"]["description_dropped_sensitive"], 1)
        self.extract("--no-descriptions")
        self.assertTrue(all("d" not in d for d in read(self.out / "people.jsonl.gz")))

    def test_description_regex(self) -> None:
        for bad in ("Canadian female ice hockey player", "Dutch footballer, brother of X", "American gay rights activist", "Catholic priest and coach"):
            self.assertTrue(fl.DESC_SENSITIVE_RE.search(bad), bad)
        for ok in ("Canadian ice hockey player", "American baseball player (born 1990)", "Spanish referee"):
            self.assertIsNone(fl.DESC_SENSITIVE_RE.search(ok), ok)

    def test_precision_and_calendar(self) -> None:
        self.extract()
        by = {d["id"]: d for d in read(self.out / "people.jsonl.gz")}
        a = by["Q1001"]
        self.assertEqual(a["P569"], [{"t": "+1961-01-26T00:00:00Z", "p": 11, "c": "Q1985727"}])  # the deprecated 1960 date is gone
        self.assertEqual(a["P570"], [{"t": "+1999-00-00T00:00:00Z", "p": 9, "c": "Q1985727"}])  # year only: precision says so
        e = by["Q1005"]
        self.assertEqual(e["P569"], [{"t": "+1900-01-13T00:00:00Z", "p": 11, "c": "Q1985786"}])  # preferred beats normal; Julian kept
        self.assertEqual(by["Q1006"]["P569"], [{"t": "-0490-00-00T00:00:00Z", "p": 9, "c": "Q1985786"}])  # BCE kept as text
        self.assertNotIn("P570", by["Q1006"])  # a time with no precision is skipped
        q = {s["v"]: s.get("q", {}) for s in a["P54"]}
        self.assertEqual(q["Q3001"]["P582"], [{"nv": 1}])  # no end: still there
        self.assertEqual(q["Q3003"]["P580"], [{"sv": 1}])  # start unknown
        self.assertEqual(q["Q3001"]["P1350"], [{"a": "+120"}])
        self.assertEqual(a["P2048"], [{"a": "+183", "u": "Q11573"}])

    def test_day_precision_rules_for_events(self) -> None:
        d = {"t": "+2022-07-10T00:00:00Z", "p": 11, "c": "Q1985727"}
        self.assertTrue(fl.day_time(d))
        self.assertTrue(fl.day_time({**d, "p": 12}))
        self.assertFalse(fl.day_time({**d, "p": 10}))
        self.assertFalse(fl.day_time({"t": "+2022-00-00T00:00:00Z", "p": 11, "c": "Q1985727"}))
        self.assertFalse(fl.day_time({"t": "+2022-07-00T00:00:00Z", "p": 11, "c": "Q1985727"}))
        self.assertFalse(fl.day_time({"t": "-0776-07-01T00:00:00Z", "p": 11, "c": "Q1985786"}))
        self.assertFalse(fl.day_time({"t": "+0000-07-01T00:00:00Z", "p": 11, "c": "Q1985727"}))
        self.assertFalse(fl.day_time(None))
        self.extract()
        ev = {d["id"]: d for d in read(self.out / "events.jsonl.gz")}
        self.assertEqual(sorted(ev), ["Q2001", "Q2003", "Q2006"])  # day date, winner without a date, day-precision end
        self.assertEqual(ev["Q2001"]["P1346"], ["Q1001"])
        self.assertEqual(ev["Q2006"]["P582"][0]["p"], 11)
        items = {d["id"]: d for d in read(self.out / "items.jsonl.gz")}
        self.assertEqual(items["Q2002"]["P580"][0]["p"], 9)  # a season keeps its dates

    def test_malformed_lines(self) -> None:
        p = self.extract()
        s = self.summary()
        self.assertEqual(p.returncode, 0)
        self.assertEqual(s["malformed_lines"], 2)  # a cut-off entity, a stray text line
        self.assertEqual(sorted(s["malformed_examples"]), [5, 11])
        self.assertEqual(s["dropped"]["not_an_item"], 1)  # the property entity P641

    def test_cap_on_long_lists(self) -> None:
        self.extract()
        g = {d["id"]: d for d in read(self.out / "people.jsonl.gz")}["Q1008"]
        self.assertEqual(len(g["P166"]), fl.MAX_VALUES)
        self.assertEqual(g["x"], {"P166": 1005})

    def test_external_ids(self) -> None:
        self.extract()
        self.assertTrue(all("P214" not in d for d in read(self.out / "people.jsonl.gz")))
        self.extract("--ext-ids", "P214")
        self.assertEqual({d["id"]: d for d in read(self.out / "people.jsonl.gz")}["Q1001"]["P214"], ["12345"])
        p = cli("extract", str(FIXTURE), str(self.out), "--fresh", "--ext-ids", "P21", check=False)
        self.assertEqual(p.returncode, 2)  # a forbidden property cannot be requested

    def test_outputs_option(self) -> None:
        self.extract("--outputs", "events")
        self.assertTrue((self.out / "events.jsonl.gz").exists())
        self.assertFalse((self.out / "people.jsonl.gz").exists())
        self.assertEqual(self.summary()["counts"], {"events": 3})


class EngineTests(Base):
    def contents(self) -> dict:
        return {n: gzip.open(self.out / f"{n}.jsonl.gz", "rt", encoding="utf-8").read() for n in ("people", "events", "items")}

    def test_decompressors_and_workers_agree(self) -> None:
        self.extract("--decompress", "python")
        base = self.contents()
        for extra in (["--decompress", "gzip"], ["--workers", "2", "--batch-lines", "4"], ["--workers", "3", "--decompress", "python", "--batch-lines", "3"]):
            self.extract(*extra)
            self.assertEqual(self.contents(), base, extra)

    def test_refuses_to_overwrite_and_resume_noop(self) -> None:
        self.extract()
        p = cli("extract", str(FIXTURE), str(self.out), check=False)
        self.assertEqual(p.returncode, 2)
        p = cli("extract", str(FIXTURE), str(self.out), "--resume")
        self.assertIn("already complete", p.stdout)

    def test_limit(self) -> None:
        self.extract("--limit", "6")
        s = self.summary()
        self.assertFalse(s["complete"])
        self.assertEqual(s["limit"], 6)
        self.assertEqual(s["lines"], 6)
        self.assertLess(sum(s["counts"].values()), 13)

    def test_resume_after_stop_and_partial_write(self) -> None:
        self.extract()
        full = self.contents()
        full_summary = self.summary()
        for decompress in ("python", "gzip"):
            self.extract("--limit", "14", "--batch-lines", "3", "--checkpoint-every", "3", "--decompress", decompress)
            state = json.loads((self.out / "extract.state.json").read_text(encoding="utf-8"))
            self.assertFalse(state["done"])
            self.assertEqual(state["lines"], 14)
            with open(self.out / "people.jsonl.gz", "ab") as f:  # a crash left half a member behind the checkpoint
                f.write(b"\x1f\x8b\x08partial garbage")
            (self.out / "summary.json").unlink()
            cli("extract", str(FIXTURE), str(self.out), "--resume", "--batch-lines", "5", "--decompress", decompress)
            self.assertEqual(self.contents(), full, decompress)
            s = self.summary()
            self.assertEqual(s["counts"], full_summary["counts"])
            self.assertEqual(s["malformed_lines"], full_summary["malformed_lines"])
            self.assertEqual(s["by_sport"], full_summary["by_sport"])
            self.assertEqual(s["lines"], full_summary["lines"])

    def test_resume_refuses_changed_options(self) -> None:
        self.extract("--limit", "10")
        p = cli("extract", str(FIXTURE), str(self.out), "--resume", "--rule", "sport", check=False)
        self.assertEqual(p.returncode, 2)

    def test_truncated_dump_is_exit_3(self) -> None:
        cut = self.tmp / "cut.json.gz"
        data = FIXTURE.read_bytes()
        cut.write_bytes(data[: len(data) - 40])
        for decompress in ("python", "gzip"):
            p = cli("extract", str(cut), str(self.out), "--fresh", "--decompress", decompress, check=False)
            self.assertEqual(p.returncode, 3, (decompress, p.stderr))

    def test_plain_json_dump(self) -> None:
        plain = self.tmp / "plain.json"
        plain.write_bytes(gzip.decompress(FIXTURE.read_bytes()))
        self.extract(dump=plain)
        self.assertEqual(self.summary()["counts"], {"people": 4, "events": 3, "items": 6})

    def test_summary_provenance_fields(self) -> None:
        self.extract("--dump-md5", "abc", "--dump-sha256", "def", "--dump-path", "spx-wikidata-dump/x.json.gz")
        s = self.summary()
        self.assertEqual((s["dump"]["md5"], s["dump"]["sha256"], s["dump"]["path"]), ("abc", "def", "spx-wikidata-dump/x.json.gz"))
        self.assertEqual(s["dump"]["bytes"], FIXTURE.stat().st_size)
        for name, f in s["files"].items():
            self.assertEqual(f["bytes"], (self.out / name).stat().st_size)
            self.assertEqual(len(f["sha256"]), 64)


class RefsAndLabelsTests(Base):
    def test_refs_then_labels(self) -> None:
        self.extract()
        cli("refs", str(self.out))
        with gzip.open(self.out / "refs.txt.gz", "rt") as f:
            refs = set(f.read().split())
        # points at: places, countries, clubs' leagues, awards, positions ... not at what the outputs hold (people, events, items)
        for want in ("Q4001", "Q4002", "Q8001", "Q5001", "Q9001", "Q41466", "Q847", "Q4498974"):
            self.assertIn(want, refs, want)
        for own in ("Q1001", "Q2001", "Q3001", "Q3002"):
            self.assertNotIn(own, refs, own)
        self.assertNotIn("Q11573", refs)  # a unit is not a reference
        self.assertNotIn("Q1985727", refs)  # nor a calendar
        for sens in fixture.SENSITIVE_QIDS:
            self.assertNotIn(sens, refs)
        cli("labels", str(FIXTURE), str(self.out), "--fresh")
        lab = {d["id"]: d for d in read(self.out / "labels.jsonl.gz")}
        # only what the outputs point at and the dump holds: Q1002 (an event's participant), the country and the city; the city's region
        # Q4003 is one step further (the labels themselves are not scanned)
        self.assertEqual(sorted(lab), ["Q1002", "Q4001", "Q4002"])
        self.assertEqual(lab["Q4001"]["l"], {"en": "Canada", "fr": "Canada", "ja": "カナダ"})
        self.assertEqual(lab["Q4001"]["P297"], ["CA"])
        self.assertEqual(lab["Q4001"]["P298"], ["CAN"])
        self.assertEqual(lab["Q4002"]["P131"], ["Q4003"])
        self.assertEqual(lab["Q4002"]["P17"], ["Q4001"])
        self.assertNotIn("d", lab["Q4002"])
        s = json.loads((self.out / "labels-summary.json").read_text(encoding="utf-8"))
        self.assertEqual(s["counts"], {"labels": 3})
        self.assertEqual(lab["Q1002"]["l"], {"en": "Bob Nosport"})

    def test_labels_workers(self) -> None:
        self.extract()
        cli("refs", str(self.out))
        cli("labels", str(FIXTURE), str(self.out), "--fresh", "--workers", "2", "--batch-lines", "4")
        self.assertEqual(sorted(ids(self.out / "labels.jsonl.gz")), ["Q1002", "Q4001", "Q4002"])


class UnitTests(unittest.TestCase):
    def test_forbidden_never_kept(self) -> None:
        self.assertEqual(fl._all_kept() & fl.FORBIDDEN, set())
        for p in ("P21", "P172", "P140", "P102", "P26", "P40", "P22", "P25", "P509", "P1050", "P91"):
            self.assertIn(p, fl.FORBIDDEN)

    def test_bitmap(self) -> None:
        bm = fl.Bitmap()
        for n in (1, 7, 8, 1000, 150_000_000):
            bm.add(n)
        self.assertTrue(all(bm.has(n) for n in (1, 7, 8, 1000, 150_000_000)))
        self.assertFalse(bm.has(2) or bm.has(999) or bm.has(10 ** 9))
        other = fl.Bitmap()
        other.add(8)
        self.assertEqual(list(bm.minus(other).numbers()), [1, 7, 1000, 150_000_000])

    def test_val(self) -> None:
        self.assertIsNone(fl.val({"snaktype": "somevalue"}))
        self.assertIsNone(fl.val({"snaktype": "value", "datavalue": {"type": "wikibase-entityid", "value": {"id": "P31"}}}))
        self.assertIsNone(fl.val({"snaktype": "value", "datavalue": {"type": "time", "value": {"time": "garbage", "precision": 11}}}))
        self.assertIsNone(fl.val({"snaktype": "value", "datavalue": {"type": "time", "value": {"time": "+2000-01-01T00:00:00Z", "precision": True}}}))
        self.assertIsNone(fl.val({"snaktype": "value", "datavalue": {"type": "quantity", "value": {"amount": "lots"}}}))
        self.assertEqual(fl.val({"snaktype": "value", "datavalue": {"type": "quantity", "value": {"amount": "+1.5", "unit": "1"}}}), {"a": "+1.5"})

    def test_occupations_file(self) -> None:
        use, drop = fl.read_occupations(HERE.parent / "occupations.tsv")
        self.assertIn("Q2066131", use)  # athlete
        self.assertIn("Q41583", use)    # coach
        self.assertIn("Q202648", use)   # referee
        self.assertIn("Q106037372", drop)  # female athlete
        self.assertTrue(len(use) > 1000)
        self.assertEqual(use & drop, frozenset())

    def test_no_real_hosts_in_this_folder(self) -> None:
        pat = re.compile(r"/Users/|/volume[0-9]|10\.0\.0\.|192\.168\.")
        for p in HERE.parent.rglob("*"):
            if p.is_file() and p.suffix in (".py", ".md", ".sql", ".sh", ".tsv") and p != Path(__file__):
                self.assertIsNone(pat.search(p.read_text(encoding="utf-8")), str(p))


if __name__ == "__main__":
    unittest.main(verbosity=2)
