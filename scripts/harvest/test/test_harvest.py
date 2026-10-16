#!/usr/bin/env python3
"""Tests of the harvest job. Unit tests need nothing; the DS1 tests need the scratch Postgres:

    bash scripts/harvest/test/scratch.sh up
    eval "$(bash scripts/harvest/test/scratch.sh env)"
    python3 -I scripts/harvest/test/test_harvest.py            # all
    python3 -I scripts/harvest/test/test_harvest.py -k Parse   # a part
    bash scripts/harvest/test/scratch.sh down

Without PGHOST the DS1 tests are skipped (and say so). No test sends a request to Wikipedia, Wikidata or anything else: the APIs are fakes that answer from
scripts/harvest/fixtures (small excerpts of English Wikipedia articles, CC BY-SA 4.0, and Wikidata answers, CC0).
"""
import json
import os
import sys
import unittest
from unittest.mock import patch
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))
FIX = os.path.join(HERE, "..", "fixtures")

import db  # noqa: E402
import jobs  # noqa: E402
import netapi  # noqa: E402
import parse  # noqa: E402
import pause  # noqa: E402
import planner  # noqa: E402
import status  # noqa: E402
import tiers  # noqa: E402
import wikidata as WD  # noqa: E402
import wikitext as W  # noqa: E402
import worker  # noqa: E402
from config import Config  # noqa: E402

NOW = datetime(2026, 10, 14, 12, 0, tzinfo=timezone.utc)
HAVE_DB = bool(os.environ.get("HARVEST_PSQL") and os.environ.get("PGHOST"))


def fixture(name):
    with open(os.path.join(FIX, name + ".json"), "rb") as f:
        return f.read()


def wikitext_of(name):
    return json.loads(fixture(name))["query"]["pages"][0]["revisions"][0]["slots"]["main"]["content"]


# ---------------------------------------------------------------- the queue state machine

class StateMachine(unittest.TestCase):
    cfg = Config()

    def job(self, **kw):
        return dict(job_id=1, kind="wp_team_season", season=2023, attempts=0, gap=True, priority=9223, refresh_days=120, last_revision=None, last_sha256=None,
                    last_fetched_at=None, **kw)

    def test_success_drops_below_every_gap_job(self):
        n = jobs.after_success(self.job(), self.cfg, NOW, revision=77, sha256="ab")
        self.assertEqual((n["state"], n["gap"], n["attempts"], n["last_revision"], n["last_sha256"]), ("done", False, 0, 77, "ab"))
        self.assertLessEqual(n["priority"], tiers.REFRESH_TOP)
        self.assertLess(n["priority"], tiers.BIOS - 100)
        self.assertEqual(n["next_check_at"], NOW + timedelta(days=120))
        self.assertEqual(n["last_fetched_at"], NOW)

    def test_unchanged_keeps_the_revision_and_the_last_fetch(self):
        j = self.job(); j.update(last_revision=5, last_fetched_at=NOW - timedelta(days=9), refresh_days=2)
        n = jobs.after_success(j, self.cfg, NOW, changed=False)
        self.assertEqual((n["last_revision"], n["last_fetched_at"], n["next_check_at"]), (5, NOW - timedelta(days=9), NOW + timedelta(days=2)))

    def test_missing_is_gone_and_looked_at_in_90_days(self):
        n = jobs.after_missing(self.job(), self.cfg, NOW)
        self.assertEqual((n["state"], n["gap"], n["error"]), ("gone", False, "missing"))
        self.assertEqual(n["next_check_at"], NOW + timedelta(days=90))

    def test_transient_errors_back_off_then_fail_for_a_day(self):
        j, waits = self.job(), []
        for i in range(self.cfg.max_attempts):
            n = jobs.after_error(j, self.cfg, NOW, "HTTP 503")
            waits.append((n["next_check_at"] - NOW).total_seconds())
            j = dict(j, attempts=n["attempts"], gap=n["gap"], priority=n["priority"])
            if i < self.cfg.max_attempts - 1:
                self.assertEqual((n["state"], n["gap"], n["priority"]), ("queued", True, 9223))     # still a gap, same place in the line
        self.assertEqual(waits[:4], [300.0, 600.0, 1200.0, 2400.0])
        self.assertEqual(n["state"], "failed")
        self.assertEqual(n["next_check_at"], NOW + timedelta(days=1))
        self.assertTrue(n["gap"])

    def test_permanent_error_is_failed_for_a_week(self):
        n = jobs.after_error(self.job(), self.cfg, NOW, "HTTP 400", permanent=True)
        self.assertEqual((n["state"], n["next_check_at"]), ("failed", NOW + timedelta(days=7)))

    def test_maxlag_puts_a_job_back_without_counting_an_attempt(self):
        j = self.job()
        j["attempts"] = 2
        n = jobs.after_lag(j, self.cfg, NOW)
        self.assertEqual((n["state"], n["attempts"], n["gap"], n["priority"], n["next_check_at"]), ("queued", 2, True, 9223, NOW + timedelta(minutes=10)))

    def test_families_batch_wikipedia_kinds_together(self):
        self.assertEqual(jobs.family("wp_draft"), jobs.WP_KINDS)
        self.assertEqual(jobs.family("wd_person"), ("wd_person",))


# ---------------------------------------------------------------- rate limiter and backoff

class FakeClock:
    def __init__(self):
        self.t = 1000.0
        self.slept = []

    def now(self):
        return self.t

    def sleep(self, s):
        self.slept.append(s)
        self.t += s


class Rate(unittest.TestCase):
    def api(self, answers, **kw):
        c = FakeClock()
        calls = []

        def transport(url, headers, timeout):
            calls.append((url, headers))
            a = answers.pop(0)
            if isinstance(a, Exception):
                raise a
            return a
        return netapi.Api("https://example.org/w/api.php", kw.pop("gap", 1.0), "test-agent/1.0 (https://example.org)", transport=transport, clock=c.now,
                          sleep=c.sleep, **kw), c, calls

    def test_backoff_delay_doubles_to_a_cap_and_obeys_retry_after(self):
        self.assertEqual([netapi.backoff_delay(i) for i in range(4)], [5.0, 10.0, 20.0, 40.0])
        self.assertEqual(netapi.backoff_delay(20), 300.0)
        self.assertEqual(netapi.backoff_delay(0, retry_after=120), 120.0)
        self.assertEqual(netapi.backoff_delay(0, retry_after=99999), 3600.0)

    def test_requests_are_a_gap_apart(self):
        a, c, calls = self.api([(200, {}, b"{}")] * 3, gap=2.5)
        for _ in range(3):
            a.get({"a": 1})
        self.assertEqual(sum(1 for s in c.slept if abs(s - 2.5) < 1e-9), 2)      # the first goes at once, the next two wait the full gap
        self.assertEqual(a.requests, 3)

    def test_maxlag_is_sent_and_waited_out(self):
        lag = json.dumps({"error": {"code": "maxlag", "info": "waiting", "lag": 7}}).encode()
        a, c, calls = self.api([(200, {"retry-after": "11"}, lag), (200, {}, b'{"query":{}}')], maxlag=5)
        body = a.get({"action": "query"})
        self.assertEqual(body, b'{"query":{}}')
        self.assertIn("maxlag=5", calls[0][0])
        self.assertTrue(any(s >= 11 for s in c.slept))
        self.assertEqual(a.requests, 2)

    def test_429_and_5xx_wait_retry_after_then_succeed(self):
        a, c, _ = self.api([(429, {"retry-after": "30"}, b""), (503, {}, b""), (200, {}, b"ok")])
        self.assertEqual(a.get({}), b"ok")
        self.assertTrue(any(s >= 30 for s in c.slept))

    def test_maxlag_every_time_is_lagged_not_a_failure(self):
        lag = json.dumps({"error": {"code": "maxlag", "lag": 26.7}}).encode()
        a, c, _ = self.api([(200, {"retry-after": "5"}, lag)] * 4, maxlag=5)
        with self.assertRaises(netapi.Lagged):
            a.get({})
        self.assertTrue(issubclass(netapi.Lagged, netapi.Transient))
        self.assertEqual(a.requests, 4)

    def test_wikidata_maxlag_is_looser_than_wikipedia(self):
        c = Config()
        self.assertEqual(c.maxlag, 5)
        self.assertGreater(c.wd_maxlag, c.maxlag)

    def test_network_errors_then_transient(self):
        a, c, _ = self.api([OSError("reset")] * 3, max_tries=3)
        with self.assertRaises(netapi.Transient):
            a.get({})
        self.assertEqual(a.requests, 3)

    def test_a_4xx_is_permanent_and_not_retried(self):
        a, c, _ = self.api([(400, {}, b"bad"), (200, {}, b"never")])
        with self.assertRaises(netapi.Permanent):
            a.get({})
        self.assertEqual(a.requests, 1)

    def test_user_agent_names_the_project(self):
        a, c, calls = self.api([(200, {}, b"{}")])
        a.get({})
        self.assertIn("https://example.org", calls[0][1]["User-Agent"])
        from config import UA
        self.assertIn("https://spxn.com", UA)
        self.assertNotIn("@", UA)

    def test_wikipedia_gap_cannot_go_below_one_second(self):
        os.environ["HARVEST_WP_GAP"] = "0.1"
        try:
            self.assertEqual(Config().wp_gap, 1.0)
        finally:
            del os.environ["HARVEST_WP_GAP"]


# ---------------------------------------------------------------- the pause

class Pause(unittest.TestCase):
    def test_window(self):
        # 10:00 in Toronto on 2026-10-14 is 14:00 UTC (EDT)
        at = lambda h, m: datetime(2026, 10, 14, h, m, tzinfo=timezone.utc)
        self.assertTrue(pause.in_window(at(14, 0), "09:50-10:30", "America/Toronto"))
        self.assertTrue(pause.in_window(at(13, 50), "09:50-10:30", "America/Toronto"))
        self.assertFalse(pause.in_window(at(13, 49), "09:50-10:30", "America/Toronto"))
        self.assertFalse(pause.in_window(at(14, 30), "09:50-10:30", "America/Toronto"))
        self.assertTrue(pause.in_window(at(3, 30), "23:00-04:00", "UTC"))
        self.assertFalse(pause.in_window(at(14, 0), "", "America/Toronto"))

    def test_guard_reasons_and_caching(self):
        c, probes = FakeClock(), {"lock": False, "running": False, "n": 0}

        def lock():
            probes["n"] += 1
            return probes["lock"]
        g = pause.PauseGuard(Config(), lock_probe=lock, running_probe=lambda: probes["running"], switch_probe=lambda: probes.get("switch"), clock=c.now,
                             utcnow=lambda: datetime(2026, 10, 14, 18, 0, tzinfo=timezone.utc))
        self.assertIsNone(g.check())
        probes["lock"] = True
        self.assertIsNone(g.check())                  # cached for pause_check_secs
        c.t += 16
        self.assertIn("lock", g.check())
        probes["lock"], probes["running"] = False, True
        c.t += 16
        self.assertIn("in progress", g.check())
        self.assertEqual(probes["n"], 3)

    def test_guard_stands_still_in_the_window_without_asking_ds1(self):
        def boom():
            raise AssertionError("no probe in the window")
        g = pause.PauseGuard(Config(), lock_probe=boom, running_probe=boom, switch_probe=boom, utcnow=lambda: datetime(2026, 10, 14, 14, 5, tzinfo=timezone.utc))
        self.assertIn("window", g.check())

    def test_guard_pauses_when_ds1_does_not_answer(self):
        def boom():
            raise RuntimeError("no route to host")
        g = pause.PauseGuard(Config(), lock_probe=boom, switch_probe=lambda: None, utcnow=lambda: datetime(2026, 10, 14, 18, 0, tzinfo=timezone.utc))
        self.assertIn("DS1 not answering", g.check())

    def test_guard_obeys_the_admin_switch_first_and_resumes(self):
        c, sw = FakeClock(), {"v": {"by": "john@example.test", "at": "2026-10-14T18:00:00Z"}}

        def lock():
            raise AssertionError("the admin switch is checked before the lock")
        g = pause.PauseGuard(Config(), lock_probe=lock, running_probe=lambda: False, switch_probe=lambda: sw["v"], clock=c.now,
                             utcnow=lambda: datetime(2026, 10, 14, 18, 0, tzinfo=timezone.utc))
        why = g.check()
        self.assertIn("/admin/ops", why)
        self.assertIn("john@example.test", why)
        sw["v"] = None                                 # Resume harvester: the runner deleted the flag
        c.t += 16
        g.lock_probe = lambda: False
        self.assertIsNone(g.check())


# ---------------------------------------------------------------- parsers on saved answers

class Parse(unittest.TestCase):
    def test_nba_roster_template(self):
        rows, how = W.parse_roster(wikitext_of("nba_team"), "nba")
        self.assertEqual(how, "player2")
        self.assertEqual(len(rows), 17)
        brown = [r for r in rows if r["name"] == "Jaylen Brown"][0]
        self.assertEqual((brown["number"], brown["position"], brown["height_in"], brown["weight_lb"], brown["born"], brown["school"]),
                         ("7", "GF", 78, 223, "1996-10-24", "California"))
        self.assertEqual([r for r in rows if r["name"] == "Kristaps Porziņģis"][0]["nationality"], "Latvia")
        self.assertEqual([r for r in rows if r["name"] == "Drew Peterson"][0]["link"], "Drew Peterson (basketball)")
        self.assertEqual([r for r in rows if r["name"] == "JD Davison"][0]["note"], "TW")

    def test_nfl_final_roster_template(self):
        rows, how = W.parse_roster(wikitext_of("nfl_team"), "nfl")
        self.assertEqual(how, "NFL final roster")
        m = [r for r in rows if r["name"] == "Patrick Mahomes"][0]
        self.assertEqual((m["number"], m["group"]), ("15", "Quarterbacks"))
        self.assertEqual({r["group"] for r in rows}, {"Quarterbacks", "Running Backs", "Wide Receivers", "Tight Ends", "Offensive Linemen"})
        self.assertEqual([r for r in rows if r["name"] == "Rashee Rice"][0]["note"], "rookie")
        self.assertEqual([r for r in rows if r["name"] == "Justin Watson"][0]["link"], "Justin Watson (wide receiver)")
        self.assertEqual([r for r in rows if r["name"] == "Creed Humphrey"][0]["position"], "C")

    def test_cfl_roster_bullets(self):
        rows, how = W.parse_roster(wikitext_of("cfl_team"), "cfl")
        self.assertEqual(how, "CFL player")
        k = [r for r in rows if r["name"] == "Chad Kelly"][0]
        self.assertEqual((k["number"], k["group"], k["note"]), ("12", "Quarterbacks", "import"))
        self.assertEqual([r for r in rows if r["name"] == "Bryan Scott"][0]["link"], "Bryan Scott (quarterback)")
        self.assertEqual([r for r in rows if r["name"] == "Brandon Calver"][0]["note"], "national")
        self.assertEqual({r["group"] for r in rows}, {"Quarterbacks", "Running backs", "Receivers"})

    def test_nba_draft_table(self):
        rows = W.parse_draft(wikitext_of("nba_draft"))
        self.assertEqual(len(rows), 5)
        w = rows[0]
        self.assertEqual((w["round"], w["overall"], w["player"], w["team"], w["position"], w["nationality"]), (1, 1, "Victor Wembanyama", "San Antonio Spurs", "C", "France"))
        self.assertEqual(rows[1]["link"], "Brandon Miller (basketball, born 2002)")
        self.assertEqual(rows[4]["overall"], 5)

    def test_nfl_draft_templates(self):
        rows = W.parse_draft(wikitext_of("nfl_draft"))
        self.assertEqual(len(rows), 5)
        self.assertEqual((rows[0]["player"], rows[0]["team"], rows[0]["position"], rows[0]["school"], rows[0]["year"], rows[0]["note"]),
                         ("Bryce Young", "Carolina Panthers", "QB", "Alabama", 2023, "from Chicago"))
        self.assertEqual(rows[3]["link"], "Anthony Richardson (American football)")

    def test_cfl_draft_round_from_the_section(self):
        rows = W.parse_draft(wikitext_of("cfl_draft"))
        self.assertEqual(len(rows), 4)
        self.assertEqual((rows[0]["round"], rows[0]["overall"], rows[0]["player"], rows[0]["team"], rows[0]["school"]), (1, 1, "Dontae Bull", "Ottawa Redblacks", "Fresno State"))

    def test_infobox_and_tables_of_a_league_season(self):
        text = wikitext_of("nba_season")
        ib = {f["field"]: f for f in W.infobox(text)}
        self.assertEqual(ib["title"]["value"], "2023–24 NBA season")
        self.assertEqual(ib["season_champs"]["value"], "Boston Celtics")
        self.assertEqual(ib["season_champs"]["links"], ["2023–24 Boston Celtics season"])
        tabs = W.parse_tables(text)
        aw = [t for t in tabs if t.header and t.header[0] == "Award"][0]
        self.assertIn("Yearly awards", aw.section)
        self.assertTrue(any("Jokić" in c["t"] for r in aw.rows for c in r))

    def test_agrees_with_the_rosters_pipeline_parser(self):
        """scripts/rosters/wp_parse.py reads the same NBA and CFL articles for its loader (legacy_rosters); the two must name the same players."""
        wp = W._wp_parse()
        self.assertIsNotNone(wp)
        for name, lg in (("nba_team", "nba"), ("nba_team_old", "nba"), ("cfl_team", "cfl")):
            text = wikitext_of(name)
            theirs = [e for e in wp.entries(lg, wp.sections(text)) if e["src"] == "roster"]
            mine, _ = W.parse_roster(text, lg)
            self.assertEqual([(e["name"], e["num"]) for e in theirs], [(r["name"], r["number"]) for r in mine], name)
            self.assertEqual([e["title"] for e in theirs], [r["link"] for r in mine], name)
            if lg == "nba":
                self.assertEqual([e["dob"] for e in theirs], [r["born"] for r in mine])
                self.assertEqual([int(e["lbs"]) for e in theirs], [r["weight_lb"] for r in mine])

    def test_a_season_with_only_a_statistics_table_is_read_through_the_rosters_parser(self):
        text = wikitext_of("nba_team_old").split("==Roster==")[0]
        rows, how = W.parse_roster(text, "nba")
        self.assertEqual(how, "statistics table")
        self.assertEqual(len(rows), 13)
        self.assertTrue(all(r["src"] == "stats" for r in rows))
        self.assertEqual(W.parse_roster(text, "nhl")[0], [])        # only for the leagues that parser reads

    def test_parse_page_by_kind_and_status(self):
        p = parse.parse_page("wp_team_season", wikitext_of("nba_team"), "nba")
        self.assertEqual((p["status"], len(p["roster"]), p["how"]), ("ok", 17, "player2"))
        old = parse.parse_page("wp_team_season", wikitext_of("nba_team_old"), "nba")
        st = [t for t in old["tables"] if t.section == "Player stats"][0]
        self.assertEqual(st.header[:4], ["Player", "GP", "REB", "AST"])
        self.assertEqual((old["status"], len(old["roster"])), ("ok", 13))
        self.assertFalse(any(t.section and "Roster" in t.section for t in p["tables"]))
        self.assertEqual(parse.parse_page("wp_draft", wikitext_of("cfl_draft"))["status"], "ok")
        self.assertEqual(parse.parse_page("wp_team_season", "just a redirect line")["status"], "no_data")

    def test_team_season_exposes_coach_and_captain_as_named_fields(self):
        text = "{{Infobox basketball club season|coach=[[Coach One]]|captain=[[Player One]]|MVP=[[Player Two]]}}"
        fields = {f["field"]: f for f in parse.parse_page("wp_team_season", text, "nba")["infobox"]}
        self.assertEqual(fields["staff_head_coach"]["value"], "Coach One")
        self.assertEqual(fields["staff_head_coach"]["links"], ["Coach One"])
        self.assertEqual(fields["staff_captain"]["value"], "Player One")
        self.assertEqual(fields["staff_captain"]["links"], ["Player One"])
        self.assertNotIn("staff_head_coach", {f["field"] for f in parse.parse_page("wp_league_season", text)["infobox"]})

    def test_clean_and_links(self):
        t = "[[Foo (bar)|Foo]] {{small|(x)}}<ref>cite</ref> {{flag|France}} '''bold''' <!-- c -->"
        self.assertEqual(W.clean(t), "Foo (x) France bold")
        self.assertEqual(W.links("[[A#sec|a]] [[File:x.jpg|thumb]] [[B]]"), ["A", "B"])

    def test_multiline_template_in_a_cell_is_not_split(self):
        text = "{|\n! H1 !! H2\n|-\n|{{refn|a\n|b}} || x\n|-\n| y || z\n|}"
        t = W.parse_tables(text)[0]
        self.assertEqual(t.header, ["H1", "H2"])
        self.assertEqual([[c["t"] for c in r] for r in t.rows], [["", "x"], ["y", "z"]])


class WikidataParse(unittest.TestCase):
    def test_roster_title_resolution_requires_canonical_human_sitelink(self):
        wp = json.dumps({"query": {
            "normalized": [{"from": "Player_Name", "to": "Player Name"}, {"from": "Player_Nom", "to": "Player Name"}],
            "redirects": [{"from": "Player Name", "to": "Player Name (athlete)"}],
            "pages": [{"pageid": 101, "title": "Player Name (athlete)", "pageprops": {"wikibase_item": "Q1"}},
                      {"pageid": 202, "title": "Club One", "pageprops": {"wikibase_item": "Q2"}}],
        }}).encode()
        candidates = WD.resolve_title_pages(wp, ["Player_Name", "Player_Nom", "Club One"])
        self.assertEqual(candidates["Player_Name"], {"qid": "Q1", "title": "Player Name (athlete)", "pageid": 101})
        self.assertEqual(candidates["Player_Nom"], candidates["Player_Name"])
        wd = json.dumps({"entities": {
            "Q1": {"lastrevid": 12, "sitelinks": {"enwiki": {"title": "Player Name (athlete)"}},
                   "claims": {"P31": [{"rank": "normal", "mainsnak": {"datavalue": {"value": {"id": "Q5"}}}}]}},
            "Q2": {"lastrevid": 13, "sitelinks": {"enwiki": {"title": "Club One"}},
                   "claims": {"P31": [{"rank": "normal", "mainsnak": {"datavalue": {"value": {"id": "Q515"}}}}]}},
        }}).encode()
        people = WD.title_people(wd, candidates)
        self.assertEqual(set(people), {"Player_Name", "Player_Nom"})
        archived = WD.prune_title_lookup(wp, wd, ["Player_Name", "Player_Nom", "Club One"], candidates, people)
        self.assertEqual(archived["wikipedia_pageprops_raw"], wp.decode())
        self.assertEqual(set(archived["entities"]["Q1"]["claims"]), {"P31"})
        self.assertEqual(archived["entities"]["Q1"]["requested_titles"], ["Player_Name", "Player_Nom"])
        self.assertNotIn("Q2", archived["entities"])

    def test_worker_title_resolution_archives_and_queues_only_verified_humans(self):
        wp_body = json.dumps({"query": {"pages": [
            {"title": "Player One", "pageprops": {"wikibase_item": "Q1"}},
            {"title": "Club One", "pageprops": {"wikibase_item": "Q2"}},
        ]}}).encode()
        wd_body = json.dumps({"entities": {
            "Q1": {"lastrevid": 21, "sitelinks": {"enwiki": {"title": "Player One"}},
                   "claims": {"P31": [{"rank": "normal", "mainsnak": {"datavalue": {"value": {"id": "Q5"}}}}]}},
            "Q2": {"lastrevid": 22, "sitelinks": {"enwiki": {"title": "Club One"}},
                   "claims": {"P31": [{"rank": "normal", "mainsnak": {"datavalue": {"value": {"id": "Q476028"}}}}]}},
        }}).encode()

        class FakeWP:
            last_status = 200
            def get(self, params):
                self.params = params
                return wp_body

        class FakeWD:
            last_status = 200
            def get(self, params):
                self.params = params
                return wd_body

        fake_wp, fake_wd = FakeWP(), FakeWD()
        w = worker.Worker(cfg=Config(), wp=fake_wp, wd=fake_wd, wdqs=object(), utcnow=lambda: NOW)
        resolved = []
        settled = []
        archived_payloads = []
        w.discover_sql = lambda kind, qids, league, unknown: resolved.append((kind, qids, league, unknown)) or "enqueue verified QID"
        w.settle = lambda job, new, what: settled.append((job["target"], new["state"], what))
        archive = lambda _name, _date, data: archived_payloads.append(json.loads(data)) or "archive raw-safe payload"
        with patch.object(worker.db, "run") as run, patch.object(worker.load, "archive_sql", side_effect=archive), \
             patch.object(w, "fetch_log"):
            w.do_person_titles([{"job_id": 1, "target": "Player One", "league": "nba", "season": 2023},
                                {"job_id": 2, "target": "Club One", "league": "nba", "season": 2023}])
        self.assertEqual(fake_wp.params["prop"], "pageprops")
        self.assertEqual(fake_wp.params["redirects"], "1")
        self.assertEqual(fake_wd.params["ids"], "Q1|Q2")
        self.assertEqual(resolved, [("wd_person", ["Q1"], "nba", True)])
        self.assertEqual([x[0] for x in settled], ["Player One", "Club One"])
        self.assertEqual(run.call_count, 2)
        self.assertEqual(set(archived_payloads[0]["entities"]), {"Q1"})
        self.assertEqual(set(archived_payloads[0]["entities"]["Q1"]["claims"]), {"P31"})
        self.assertEqual([p["missing"] for p in archived_payloads[0]["pages"]], [False, False])

    def test_worker_keeps_invalid_date_raw_and_logs_unknown_conversion(self):
        raw = json.dumps({"entities": {"Q1": {
            "id": "Q1", "lastrevid": 33,
            "labels": {"en": {"value": "Test Person"}},
            "claims": {"P569": [{"rank": "normal", "mainsnak": {"snaktype": "value", "datavalue": {
                "type": "time", "value": {"time": "+1962-02-29T00:00:00Z", "precision": 11,
                                        "calendarmodel": WD.GREGORIAN}}}}]},
        }}}).encode()

        class FakeWD:
            last_status = 200
            def get(self, _params):
                return raw

        w = worker.Worker(cfg=Config(), wp=object(), wd=FakeWD(), wdqs=object(), utcnow=lambda: NOW)
        settlements, fetches, archives, inserts = [], [], [], []
        w.settle = lambda job, new, what: settlements.append((job["target"], new["state"], what))
        w.discover_sql = lambda *_args: ""
        archive = lambda _name, _date, data: archives.append(json.loads(data)) or "archive invalid date"
        item_insert = lambda entities, claims, _name, _fetched: inserts.append((entities, claims)) or "insert unknown date"
        with patch.object(worker.db, "run"), patch.object(worker.load, "archive_sql", side_effect=archive), \
             patch.object(worker.load, "items_sql", side_effect=item_insert), \
             patch.object(w, "fetch_log", side_effect=lambda *args, **kwargs: fetches.append(kwargs)):
            w.do_entities([{"job_id": 1, "kind": "wd_person", "target": "Q1", "last_revision": None}])
        archived_claim = archives[0]["entities"]["Q1"]["claims"]["P569"][0]["value"]
        self.assertEqual(archived_claim["time"], "+1962-02-29T00:00:00Z")
        self.assertEqual(archived_claim["calendarmodel"], WD.GREGORIAN)
        claim = inserts[0][1]["Q1"][0]
        self.assertEqual((claim["value_on"], claim["value_prec"]), (None, 11))
        self.assertIn("Q1/P569 value=+1962-02-29T00:00:00Z precision=11", fetches[0]["note"])
        self.assertEqual(settlements, [("Q1", "done", "done")])

    def test_worker_fetches_content_for_same_revision_when_parser_is_stale(self):
        w = worker.Worker(cfg=Config(), wp=object(), wd=object(), wdqs=object(), utcnow=lambda: NOW)
        job = {"job_id": 9, "kind": "wp_team_season", "target": "2023–24 Example Team season", "league": "nba",
               "season": 2023, "last_revision": 77, "last_sha256": "same"}
        revision = {"missing": False, "page": {"revisions": [{"revid": 77}]}}
        calls, stored, settled = [], [], []
        w.wp_query = lambda titles, content: calls.append((titles, content)) or ({job["target"]: revision}, 10)
        w.store_page = lambda _job, _page: stored.append(True) or 1
        w.settle = lambda _job, _new, result: settled.append(result)
        with patch.object(worker.db, "rows", return_value=[{"title": job["target"], "parser_version": 1}]), \
             patch.object(w, "fetch_log"):
            w.do_wp([job])
        self.assertEqual(calls, [([job["target"]], False), ([job["target"]], True)])
        self.assertEqual(stored, [True])
        self.assertEqual(settled, [])

    def test_team_members(self):
        rows = WD.members(fixture("wdqs_team"), "Q131371")
        self.assertEqual(len(rows), 8)
        dated = [r for r in rows if r["start_on"]][0]
        self.assertTrue(dated["person_qid"].startswith("Q"))
        self.assertEqual((dated["start_prec"] in (9, 10, 11), dated["end_prec"] in (None, 9, 10, 11), dated["rank"]), (True, True, "normal"))
        self.assertTrue(any(r["start_on"] is None for r in rows) or len(rows) == 8)

    def test_prune_drops_everything_that_is_not_on_the_list(self):
        raw = json.dumps(json.load(open(os.path.join(FIX, "wd_entities.json")))).encode()
        out = WD.prune_response(raw, {"Q71127": WD.PERSON_PROPS, "Q41421": WD.PERSON_PROPS})["entities"]
        for q in ("Q71127", "Q41421"):
            props = set(out[q].get("claims", {}))
            self.assertTrue(props <= WD.PERSON_PROPS, props)
            for banned in ("P21", "P172", "P140", "P106", "P54"):         # sex or gender, ethnic group, religion, occupation, teams
                self.assertNotIn(banned, props)
        self.assertEqual(out["Q71127"]["label"], "John Havlicek")
        self.assertEqual(out["Q71127"]["enwiki"], "John Havlicek")
        self.assertEqual(out["Q71127"]["lastrevid"], 2000001)
        self.assertTrue(out["Q99999999999"]["missing"])

    def test_claim_rows(self):
        raw = json.dumps(json.load(open(os.path.join(FIX, "wd_entities.json")))).encode()
        e = WD.prune_response(raw, {"Q41421": WD.PERSON_PROPS})["entities"]["Q41421"]
        rows = WD.claim_rows("Q41421", e["claims"])
        by = {}
        for r in rows:
            by.setdefault(r["prop"], []).append(r)
        self.assertEqual((by["P569"][0]["value_on"], by["P569"][0]["value_prec"]), ("1963-02-17", 11))
        self.assertTrue(by["P19"][0]["value_qid"].startswith("Q"))
        self.assertIn(by["P2048"][0]["unit_qid"], ("Q174728", "Q11573", "Q3710"))
        self.assertGreater(by["P2048"][0]["value_num"], 1)

    def test_times(self):
        self.assertEqual(WD.parse_time("+1956-12-07T00:00:00Z"), "1956-12-07")
        self.assertEqual(WD.parse_time("+1956-00-00T00:00:00Z"), "1956-01-01")
        self.assertEqual(WD.parse_time("+1960-02-29T00:00:00Z"), "1960-02-29")
        self.assertIsNone(WD.parse_time("+1962-02-29T00:00:00Z"))
        self.assertIsNone(WD.parse_time("+1962-02-28T00:00:00Z", "http://www.wikidata.org/entity/Q1985786"))
        self.assertIsNone(WD.parse_time("-0500-01-01T00:00:00Z"))
        self.assertIsNone(WD.parse_time(None))

    def test_invalid_wikidata_birth_dates_stay_unknown_and_are_reportable(self):
        entities = {"Q1": {"claims": {"P569": [{"snaktype": "value", "type": "time", "rank": "normal",
                                                      "value": {"time": "+1962-02-29T00:00:00Z", "precision": 11,
                                                                "calendarmodel": WD.GREGORIAN}}]}}}
        rows = WD.claim_rows("Q1", entities["Q1"]["claims"])
        self.assertEqual((rows[0]["value_on"], rows[0]["value_prec"]), (None, 11))
        issue = WD.invalid_time_claims(entities)[0]
        self.assertIn("Q1/P569", issue)
        self.assertIn("value=+1962-02-29T00:00:00Z", issue)
        self.assertIn("precision=11", issue)
        self.assertIn("calendar=Q1985727", issue)


# ---------------------------------------------------------------- the planner (pure part)

class Planner(unittest.TestCase):
    def test_historical_league_seasons_exist_without_core_season_rows(self):
        rows = planner.historic_season_rows()
        by_title = {row["title"]: row for row in rows}
        self.assertEqual(by_title["1920 APFA season"]["league"], "nfl")
        self.assertEqual(by_title["1960 American Football League season"]["league"], "afl")
        self.assertEqual(by_title["1946 AAFC season"]["league"], "aafc")
        self.assertEqual(by_title["1937–38 National Basketball League (United States) season"]["league"], "nbl")
        self.assertEqual(by_title["1974 World Football League season"]["league"], "wfl")
        self.assertEqual(by_title["1983 USFL season"]["league"], "usfl")
        self.assertEqual(by_title["1910 NHA season"]["league"], "nha")
        self.assertEqual(by_title["1910–11 NHA season"]["season"], 1910)
        self.assertEqual(by_title["1972–73 WHA season"]["league"], "wha")
        self.assertNotIn("1920 NFL season", by_title)
        self.assertEqual(len(rows), sum(end - start + 1 for start, end in planner.HISTORIC_LEAGUE_RANGES.values()) + 2)
        drafts = {(r["league"], r["year"]): r["title"] for r in planner.historic_draft_rows()}
        self.assertEqual(drafts[("afl", 1960)], "1960 American Football League draft")
        self.assertEqual(drafts[("wha", 1972)], "WHA general player draft")

    def test_historic_team_leagues_are_measured_and_missing_articles_are_targeted(self):
        self.assertTrue(set(planner.HISTORIC_LEAGUE_RANGES).issubset(planner.TEAM_LEAGUES))
        sql = planner.team_seasons_sql(False)
        for league in ("afl", "aafc", "nha", "pcha", "wchl", "wha", "aba", "nbl", "wfl", "usfl"):
            self.assertIn("'%s'" % league, sql)
        rows = [
            dict(league="afl", season=1960, name="Boston Patriots", no_roster=False, no_stat=False),
            dict(league="nha", season=1910, name="Montreal Canadiens", no_roster=False, no_stat=False),
            dict(league="nfl", season=2020, name="Kansas City Chiefs", no_roster=False, no_stat=False),
        ]
        pending = {(t["league"], t["season"]): t for t in planner.build_targets(Config(), NOW, rows, [], [], [])
                   if t["kind"] == "wp_team_season"}
        self.assertIn(("afl", 1960), pending)
        self.assertIn(("nha", 1910), pending)
        self.assertNotIn(("nfl", 2020), pending)

    def test_harvested_team_page_state_prevents_duplicates_and_requeues_parser_stale_done(self):
        rows = [dict(league="nfl", season=1950, name="Los Angeles Rams", no_roster=False, no_stat=False)]
        title = "1950 Los Angeles Rams season"
        current = planner.build_targets(Config(), NOW, rows, [], [], [], team_pages={title: planner.PARSER_VERSION})
        self.assertFalse(any(t["kind"] == "wp_team_season" for t in current))
        stale = planner.build_targets(Config(), NOW, rows, [], [], [], team_pages={title: planner.PARSER_VERSION - 1})
        target = next(t for t in stale if t["kind"] == "wp_team_season")
        self.assertTrue(target["reparse"])
        sql = jobs.enqueue_sql(stale)
        self.assertIn("j.state = 'done';", sql)
        self.assertIn("state = 'queued', attempts = 0, gap = true", sql)

    def test_status_explains_current_stale_and_missing_page_queue_states(self):
        self.assertEqual(status.team_page_state(planner.PARSER_VERSION, "done", True), "current_archive")
        self.assertEqual(status.team_page_state(planner.PARSER_VERSION - 1, "done", True), "stale_done")
        self.assertEqual(status.team_page_state(planner.PARSER_VERSION - 1, "failed", True), "stale_failed")
        self.assertEqual(status.team_page_state(None, "done", True), "no_archive_done")
        self.assertEqual(status.team_page_state(None, "gone", True), "no_archive_gone")
        self.assertEqual(status.team_page_state(None, None, True), "new_target")
        self.assertEqual(status.team_page_state(None, None, False), "not_a_gap")

    def test_nhl_and_mlb_pre_spx_stats_targets_ignore_existing_roster_and_stat_rows(self):
        rows = [dict(league="nhl", season=1996, team_season_id=1, name="Montreal Canadiens", no_roster=False,
                     no_stat=False, held_wp=False),
                dict(league="mlb", season=2014, team_season_id=2, name="Toronto Blue Jays", no_roster=False,
                     no_stat=False, held_wp=False),
                dict(league="nhl", season=2000, team_season_id=3, name="Montreal Canadiens", no_roster=False,
                     no_stat=False, held_wp=False)]
        got = {(t["league"], t["season"]): t for t in planner.build_targets(Config(), NOW, rows, [], [], [])
               if t["kind"] == "wp_team_season"}
        self.assertIn(("nhl", 1996), got)
        self.assertIn(("mlb", 2014), got)
        self.assertNotIn(("nhl", 2000), got)

    def test_pre_spx_player_stats_requeue_when_page_is_absent_but_not_when_current(self):
        rows = [dict(league="nhl", season=1996, name="Montreal Canadiens", no_roster=False, no_stat=False),
                dict(league="mlb", season=2014, name="Toronto Blue Jays", no_roster=False, no_stat=False)]
        absent = planner.build_targets(Config(), NOW, rows, [], [], [])
        self.assertEqual({t["target"] for t in absent if t["kind"] == "wp_team_season"},
                         {"1996–97 Montreal Canadiens season", "2014 Toronto Blue Jays season"})
        pages = {t["target"]: planner.PARSER_VERSION for t in absent}
        present = planner.build_targets(Config(), NOW, rows, [], [], [], team_pages=pages)
        self.assertFalse(any(t["kind"] == "wp_team_season" for t in present))

    cfg = Config()
    ts = [dict(league="nba", season=2023, name="Boston Celtics", no_roster=True, no_stat=True),
          dict(league="nfl", season=2023, name="Kansas City Chiefs", no_roster=True, no_stat=True),
          dict(league="cfl", season=2023, name="Toronto Argonauts", no_roster=True, no_stat=True),
          dict(league="nba", season=1995, name="Boston Celtics", no_roster=True, no_stat=True),
          dict(league="nhl", season=2023, name="Montréal Canadiens", no_roster=False, no_stat=True),
          dict(league="mlb", season=2023, name="Sacramento Athletics", no_roster=False, no_stat=False)]
    se = [dict(league="nba", season=2023, no_awards=True), dict(league="nba", season=2022, no_awards=False)]
    dr = [dict(league="nba", year=2023, no_draft=True), dict(league="nba", year=1930, no_draft=True), dict(league="nfl", year=2023, no_draft=False)]
    ti = [dict(league="nba", qid="Q131371", season=2023, no_roster=True), dict(league="nhl", qid="Q183144", season=None, no_roster=False)]

    def targets(self, everything=False):
        return planner.build_targets(self.cfg, NOW, self.ts, self.se, self.dr, self.ti, everything=everything)

    def test_pass_one_has_only_gaps_and_biggest_first(self):
        t = self.targets()
        self.assertTrue(all(x["gap"] for x in t))
        order = [(x["kind"], x["league"], x["season"]) for x in t if x["kind"] == "wp_team_season"]
        self.assertEqual(order, [("wp_team_season", "nba", 2023), ("wp_team_season", "nba", 1995), ("wp_team_season", "nfl", 2023),
                                 ("wp_team_season", "cfl", 2023), ("wp_team_season", "nhl", 2023), ("wp_team_season", "mlb", 2023)])
        self.assertEqual(t[0]["priority"], max(x["priority"] for x in t))
        titles = {x["target"] for x in t}
        self.assertIn("2023 Athletics season", titles)                                                # MLB player stats are targeted outside 1997–2013 even when core holds a stat row
        self.assertNotIn("2022–23 NBA season", titles)                                             # awards held
        self.assertNotIn("2023 NFL draft", titles)                                                      # picks held
        self.assertNotIn("1930 NBA draft", titles)                                                      # before the first draft
        self.assertNotIn("Q183144", titles)                                                             # the Canadiens have rosters

    def test_ranks_rosters_then_team_stats_then_awards_and_drafts(self):
        t = {(x["kind"], x["target"]): x["priority"] for x in self.targets()}
        roster_cfl = t[("wp_team_season", "2023 Toronto Argonauts season")]
        nhl_stat = t.get(("wp_team_season", "2023–24 Montreal Canadiens season"))
        award = t[("wp_league_season", "2023–24 NBA season")]
        self.assertGreater(roster_cfl, award)
        self.assertGreater(award, tiers.BIOS)
        self.assertIsNotNone(nhl_stat)
        self.assertGreater(roster_cfl, nhl_stat)

    def test_titles(self):
        self.assertEqual(planner.team_title("nba", 2023, "Boston Celtics"), "2023–24 Boston Celtics season")
        self.assertEqual(planner.team_title("nhl", 1999, "Montréal Canadiens"), "1999–2000 Montreal Canadiens season")
        self.assertEqual(planner.team_title("mlb", 2023, "Sacramento Athletics"), "2023 Athletics season")
        self.assertEqual(planner.league_title("mlb", 2023), "2023 Major League Baseball season")
        self.assertEqual(planner.league_title("nba", 1946), "1946–47 BAA season")
        self.assertEqual(planner.draft_title("nhl", 1970), "1970 NHL amateur draft")
        self.assertEqual(planner.draft_title("nhl", 2023), "2023 NHL entry draft")
        self.assertEqual(planner.draft_title("cfl", 2023), "2023 CFL draft")

    def test_everything_adds_rereads_below_every_gap(self):
        t = self.targets(everything=True)
        rest = [x for x in t if not x["gap"]]
        self.assertTrue(rest)
        self.assertLess(max(x["priority"] for x in rest), min(x["priority"] for x in t if x["gap"]))
        self.assertLessEqual(max(x["priority"] for x in rest), tiers.REFRESH_TOP)

    def test_current_season_is_reread_sooner(self):
        t = {x["target"]: x for x in self.targets()}
        self.assertEqual(t["2023–24 Boston Celtics season"]["refresh_days"], self.cfg.old_refresh_days)      # 2023 is not within a year of 2026
        self.assertEqual(planner.refresh_days(self.cfg, 2026, NOW), self.cfg.recent_refresh_days)
        self.assertEqual(planner.refresh_days(self.cfg, 1990, NOW), self.cfg.old_refresh_days)


# ---------------------------------------------------------------- the worker against the scratch DS1 with fake APIs

class FakeWikipedia:
    """Answers revisions queries from the fixtures. rvprop without content gives ids and timestamps only."""
    PAGES = {"2023–24 Boston Celtics season": "nba_team", "2023 Kansas City Chiefs season": "nfl_team", "2023 Toronto Argonauts season": "cfl_team",
             "2023 NBA draft": "nba_draft", "2023 NFL draft": "nfl_draft", "2023 CFL draft": "cfl_draft", "2023–24 NBA season": "nba_season"}

    def __init__(self):
        self.requests, self.last_status, self.bytes = 0, 200, 0
        self.calls = []
        self.revid_add = {}
        self.fail = None

    def get(self, params):
        self.requests += 1
        if self.fail:
            raise self.fail
        titles = params["titles"].split("|")
        self.calls.append((titles, "content" in params["rvprop"]))
        pages = []
        for t in titles:
            fx = self.PAGES.get(t)
            if fx is None:
                pages.append({"title": t, "missing": True})
                continue
            p = json.loads(fixture(fx))["query"]["pages"][0]
            p["title"] = t
            p["revisions"][0]["revid"] += self.revid_add.get(t, 0)
            if "content" not in params["rvprop"]:
                p["revisions"][0].pop("slots")
            pages.append(p)
        return json.dumps({"batchcomplete": True, "query": {"pages": pages}}, ensure_ascii=False).encode()


class FakeWikidata:
    def __init__(self, body):
        self.body, self.requests, self.last_status, self.bytes, self.calls = body, 0, 200, 0, []

    def get(self, params):
        self.requests += 1
        self.calls.append(params)
        return self.body


EXPECT_ROSTER_ROWS = sum(len(W.parse_roster(wikitext_of(n), lg)[0]) for n, lg in (("nba_team", "nba"), ("nfl_team", "nfl"), ("cfl_team", "cfl")))


def reset_db():
    db.run("""truncate ingest.harvest_job, ingest.harvest_fetch, ingest.harvest_state restart identity;
              delete from ingest.harvest_run;
              delete from legacy_wikipedia_harvest.page; delete from legacy_wikidata_harvest.team_member; delete from legacy_wikidata_harvest.claim;
              delete from legacy_wikidata_harvest.item; delete from legacy_files.raw_archive where name like 'harvest/%';""")


def seed_jobs():
    t = lambda kind, target, lg, y, prio, gap=True: dict(kind=kind, target=target, league=lg, season=y, priority=prio, gap=gap, refresh_days=120)
    db.run(jobs.enqueue_sql([
        t("wp_team_season", "2023–24 Boston Celtics season", "nba", 2023, tiers.gap_priority(tiers.ROSTER["nba"], 2023)),
        t("wp_team_season", "2023 Kansas City Chiefs season", "nfl", 2023, tiers.gap_priority(tiers.ROSTER["nfl"], 2023)),
        t("wp_team_season", "2023 Toronto Argonauts season", "cfl", 2023, tiers.gap_priority(tiers.ROSTER["cfl"], 2023)),
        t("wp_team_season", "2023 Nonexistent Team season", "nba", 2023, tiers.gap_priority(tiers.ROSTER["nba"], 2023) - 5),
        t("wp_draft", "2023 NBA draft", "nba", 2023, tiers.gap_priority(tiers.SEASON["nba"], 2023)),
        t("wp_draft", "2023 NFL draft", "nfl", 2023, tiers.gap_priority(tiers.SEASON["nfl"], 2023)),
        t("wp_draft", "2023 CFL draft", "cfl", 2023, tiers.gap_priority(tiers.SEASON["cfl"], 2023)),
        t("wp_league_season", "2023–24 NBA season", "nba", 2023, tiers.gap_priority(tiers.SEASON["nba"], 2023)),
        t("wd_team_members", "Q131371", "nba", 2023, tiers.gap_priority(tiers.ROSTER["nba"], 2023)),
        t("wd_person", "Q71127", None, None, tiers.BIOS), t("wd_person", "Q41421", None, None, tiers.BIOS),
        t("wd_person", "Q99999999999", None, None, tiers.BIOS),
    ]))


def make_worker(wp=None, wd=None, wdqs=None, guard=None, clock=None, **cfgkw):
    c = clock or FakeClock()
    cfg = Config(wp_gap=0, wd_gap=0, wdqs_gap=0, idle_sleep=1, **cfgkw)
    w = worker.Worker(cfg, wp=wp or FakeWikipedia(), wd=wd or FakeWikidata(fixture("wd_entities")), wdqs=wdqs or FakeWikidata(fixture("wdqs_team")),
                      guard=guard or pause.PauseGuard(cfg, lock_probe=lambda: False, running_probe=lambda: False,
                                                      utcnow=lambda: datetime(2026, 10, 14, 18, 0, tzinfo=timezone.utc)),
                      sleep=c.sleep, clock=c.now, log=lambda m: None)
    return w, c


def one(sql):
    return db.value(sql)


@unittest.skipUnless(HAVE_DB, "DS1 tests skipped: start scripts/harvest/test/scratch.sh and eval its env")
class Ds1(unittest.TestCase):
    def setUp(self):
        reset_db()

    def test_gap_queue_is_read_biggest_first_and_loaded(self):
        seed_jobs()
        w, c = make_worker()
        self.assertEqual(w.run(once=True, plan=False), 0)
        # order: the first Wikipedia request holds the NBA roster page before the CFL one and before the drafts
        first = w.wp.calls[0][0]
        self.assertEqual(first[0], "2023–24 Boston Celtics season")
        self.assertLess(first.index("2023 Kansas City Chiefs season"), first.index("2023 Toronto Argonauts season"))
        self.assertLess(first.index("2023 Toronto Argonauts season"), first.index("2023 NBA draft"))
        states = {r["target"]: r["state"] for r in db.rows("select target, state from ingest.harvest_job")}
        self.assertEqual(states["2023 Nonexistent Team season"], "gone")
        self.assertEqual(states["Q99999999999"], "gone")
        for t in ("2023–24 Boston Celtics season", "2023 NFL draft", "Q131371", "Q71127", "Q41421", "2023–24 NBA season"):
            self.assertEqual(states[t], "done", t)
        # a read job is no longer a gap, drops below the gap priorities, and comes due after its refresh interval
        j = db.rows("select * from ingest.harvest_job where target = '2023 NFL draft'")[0]
        self.assertFalse(j["gap"])
        self.assertLessEqual(j["priority"], tiers.REFRESH_TOP)
        self.assertIsNotNone(j["last_revision"])
        # archive first: every page and answer is a raw_archive row, byte for byte what was parsed
        self.assertEqual(one("select count(*) from legacy_files.raw_archive where name like 'harvest/wikipedia/%'"), 7)
        self.assertEqual(one("select count(*) from legacy_files.raw_archive where name like 'harvest/wikidata/%'"), 2)
        self.assertEqual(one("select count(*) from legacy_wikipedia_harvest.page p join legacy_files.raw_archive a on a.name = p.archive_name and a.sha256 = p.sha256"), 7)
        # parsed rows
        self.assertEqual(one("select count(*) from legacy_wikipedia_harvest.roster_row r join legacy_wikipedia_harvest.page p using (page_id) where p.league = 'nba'"), 17)
        self.assertEqual(one("select count(*) from legacy_wikipedia_harvest.roster_row r join legacy_wikipedia_harvest.page p using (page_id) where p.league = 'cfl'"), 14)
        self.assertEqual(one("select count(*) from legacy_wikipedia_harvest.roster_row"), EXPECT_ROSTER_ROWS)
        self.assertEqual(one("select count(*) from legacy_wikipedia_harvest.roster_row where src = 'roster'"), EXPECT_ROSTER_ROWS)
        self.assertEqual(one("select count(*) from legacy_wikipedia_harvest.draft_pick"), 14)
        self.assertEqual(one("select height_in || '/' || born || '/' || school from legacy_wikipedia_harvest.roster_row where name = 'Jaylen Brown'"), "78/1996-10-24/California")
        self.assertEqual(one("select count(*) from legacy_wikipedia_harvest.infobox_field i join legacy_wikipedia_harvest.page p using (page_id) where p.kind = 'wp_league_season'"), len(W.infobox(wikitext_of("nba_season"))))
        self.assertGreater(one("select count(*) from legacy_wikipedia_harvest.wikitable_row"), 2)
        self.assertEqual(one("select count(*) from legacy_wikipedia_harvest.page where parse_status = 'ok'"), 7)
        # Wikidata
        self.assertEqual(one("select count(*) from legacy_wikidata_harvest.team_member where team_qid = 'Q131371'"), 8)
        self.assertEqual(one("select value_on::text from legacy_wikidata_harvest.claim where qid = 'Q71127' and prop = 'P569'") is not None, True)
        self.assertEqual(one("select count(*) from legacy_wikidata_harvest.claim where prop in ('P21', 'P172', 'P140', 'P106', 'P54')"), 0)
        self.assertEqual(one("select count(*) from legacy_wikidata_harvest.item where qid in ('Q71127', 'Q41421') and enwiki_title is not null"), 2)
        # what was found is queued: members DS1 does not hold become bios, places and countries named become labels
        self.assertGreater(one("select count(*) from ingest.harvest_job where kind = 'wd_person' and target not in ('Q71127', 'Q41421', 'Q99999999999')"), 2)
        self.assertGreater(one("select count(*) from ingest.harvest_job where kind = 'wd_label'"), 0)
        # heartbeat and log
        r = db.rows("select outcome, summary from ingest.harvest_run order by run_id desc limit 1")[0]
        self.assertEqual(r["outcome"], "ok")
        self.assertEqual(r["summary"]["kinds"]["wp_team_season"]["done"], 3)
        self.assertGreater(one("select sum(bytes) from ingest.harvest_fetch"), 1000)

    def test_second_pass_reads_nothing_new(self):
        seed_jobs()
        w, c = make_worker()
        w.run(once=True, plan=False)
        archived = one("select count(*) from legacy_files.raw_archive")
        pages = one("select count(*) from legacy_wikipedia_harvest.page")
        db.run("update ingest.harvest_job set next_check_at = now() - interval '1 minute' where state = 'done';")
        w2, c2 = make_worker()
        w2.run(once=True, plan=False)
        self.assertEqual(one("select count(*) from legacy_files.raw_archive"), archived)
        self.assertEqual(one("select count(*) from legacy_wikipedia_harvest.page"), pages)
        # the pages were asked for by revision only (no content), the query answer and the items were found unchanged
        self.assertTrue(w2.wp.calls and all(not content for _, content in w2.wp.calls))
        k = w2.stats
        self.assertEqual(k["wp_team_season"].get("unchanged"), 3)
        self.assertEqual(k["wd_team_members"].get("unchanged"), 1)
        self.assertEqual(k["wd_person"].get("unchanged"), 2)

    def test_a_new_revision_is_archived_and_parsed_again(self):
        seed_jobs()
        w, c = make_worker()
        w.run(once=True, plan=False)
        db.run("update ingest.harvest_job set next_check_at = now() - interval '1 minute' where state = 'done';")
        wp = FakeWikipedia()
        wp.revid_add["2023–24 Boston Celtics season"] = 5
        w2, _ = make_worker(wp=wp)
        w2.run(once=True, plan=False)
        self.assertEqual(one("select count(*) from legacy_wikipedia_harvest.page where title = '2023–24 Boston Celtics season'"), 2)
        self.assertEqual(one("select count(*) from legacy_files.raw_archive where name like 'harvest/wikipedia/%Celtics%'"), 2)
        self.assertTrue(any(content for _, content in wp.calls))            # now the content was fetched, for that one page only

    def test_transient_failure_backs_off_and_keeps_the_gap(self):
        seed_jobs()
        wp = FakeWikipedia()
        wp.fail = netapi.Transient("HTTP 503 (en.wikipedia.org)")
        w, c = make_worker(wp=wp)
        w.run(once=True, plan=False, max_jobs=1)
        j = db.rows("select * from ingest.harvest_job where target = '2023–24 Boston Celtics season'")[0]
        self.assertEqual((j["state"], j["attempts"], j["gap"]), ("queued", 1, True))
        self.assertIn("503", j["error"])
        w2, _ = make_worker()
        w2.run(once=True, plan=False)                                         # the backed-off jobs are not due: only the Wikidata ones ran
        self.assertEqual(one("select state from ingest.harvest_job where target = '2023–24 Boston Celtics season'"), "queued")
        self.assertEqual(one("select state from ingest.harvest_job where target = 'Q131371'"), "done")

    def test_a_crash_loses_nothing(self):
        seed_jobs()
        got = jobs.claim(Config(lease_secs=900), lambda head: 3)
        self.assertEqual(len(got), 3)
        self.assertEqual(one("select count(*) from ingest.harvest_job where state = 'running'"), 3)
        rest = []
        while True:                                                                            # one family at a time, until nothing is due
            part = jobs.claim(Config(), lambda head: 100)
            if not part:
                break
            rest += part
        self.assertEqual(len(rest), 12 - 3)                                                    # leased jobs are not given out twice
        self.assertEqual(len({j["job_id"] for j in got + rest}), 12)
        db.run("update ingest.harvest_job set state = 'running', lease_until = now() - interval '1 second';")   # the worker died
        again = []
        while True:
            part = jobs.claim(Config(), lambda head: 100)
            if not part:
                break
            again += part
        self.assertEqual(len(again), 12)                                                       # every lease passed: all come back

    def test_stands_still_while_the_daily_job_runs(self):
        seed_jobs()
        c = FakeClock()
        cfg = Config(wp_gap=0, wd_gap=0, wdqs_gap=0)
        stand = pause.PauseGuard(cfg, lock_probe=lambda: True, running_probe=lambda: False, clock=c.now,
                                 utcnow=lambda: datetime(2026, 10, 14, 18, 0, tzinfo=timezone.utc))
        w, c = make_worker(guard=stand, clock=c)
        w.run(max_seconds=300, plan=False)
        self.assertEqual((w.wp.requests, w.wd.requests, w.wdqs.requests), (0, 0, 0))
        self.assertGreaterEqual(w.paused_secs, 300)
        self.assertEqual(one("select count(*) from ingest.harvest_job where state <> 'queued'"), 0)

    def test_the_admin_switch_in_ds1_stops_and_resumes_the_worker(self):
        seed_jobs()
        self.assertIsNone(pause.ops_pause())
        db.run("insert into ingest.harvest_state (key, value) values ('ops_pause', %s) on conflict (key) do update set value = excluded.value;"
               % db.lit({"by": "john@example.test", "at": "2026-10-14T18:00:00Z"}))
        try:
            self.assertEqual(pause.ops_pause()["by"], "john@example.test")
            c = FakeClock()
            cfg = Config(wp_gap=0, wd_gap=0, wdqs_gap=0)
            w, c = make_worker(guard=pause.PauseGuard(cfg, lock_probe=lambda: False, running_probe=lambda: False, clock=c.now,
                                                      utcnow=lambda: datetime(2026, 10, 14, 18, 0, tzinfo=timezone.utc)), clock=c)
            w.run(max_seconds=300, plan=False)
            self.assertEqual((w.wp.requests, w.wd.requests, w.wdqs.requests), (0, 0, 0))
            self.assertEqual(one("select count(*) from ingest.harvest_job where state <> 'queued'"), 0)
        finally:
            db.run("delete from ingest.harvest_state where key = 'ops_pause';")
        self.assertIsNone(pause.ops_pause())

    def test_the_real_lock_is_seen(self):
        spec = __import__("importlib.util").util.spec_from_file_location("daily_lock", pause.LOCK_PATH)
        mod = __import__("importlib.util").util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        self.assertFalse(pause.lock_is_held())
        holder = mod.Lock()
        self.assertTrue(holder.try_acquire())
        try:
            self.assertTrue(pause.lock_is_held())
        finally:
            holder.release()
        self.assertFalse(pause.lock_is_held())
        db.run("insert into ingest.daily_run (outcome) values ('running');")
        self.assertTrue(pause.daily_running())

    def test_planner_adapts_to_the_counts_in_ds1(self):
        before = planner.plan(Config(), NOW)
        self.assertEqual(before["pass"], 1)
        order = [r["target"] for r in db.rows("select target from ingest.harvest_job where kind = 'wp_team_season' order by priority desc, job_id")]
        self.assertEqual({r["league"] for r in db.rows("select league from ingest.harvest_job where kind = 'wp_team_season' order by priority desc limit 3")}, {"nba"})
        self.assertNotIn("2023–24 Montreal Canadiens season", order)                      # has a roster and team statistics in the seed
        # fill a gap in core: the Celtics 2023 roster appears
        db.run("insert into core.roster_stint (person_id, team_season_id, role) select 1, ts.team_season_id, 'player' from core.team_season ts "
               "join core.season s using (season_id) where ts.franchise_id = 1 and s.start_year = 2023;")
        try:
            rows = db.rows(planner.team_seasons_sql(False))
            celtics = [r for r in rows if r["name"] == "Boston Celtics" and r["season"] == 2023][0]
            self.assertFalse(celtics["no_roster"])
            t = planner.build_targets(Config(), NOW, rows, db.rows(planner.SEASONS), db.rows(planner.DRAFTS), db.rows(planner.team_items_sql(False)))
            mine = [x for x in t if x["target"] == "2023–24 Boston Celtics season"][0]
            self.assertEqual(mine["priority"], tiers.gap_priority(tiers.SEASON["nba"], 2023))      # still a team statistics gap, one tier lower
        finally:
            db.run("delete from core.roster_stint where team_season_id in (select ts.team_season_id from core.team_season ts join core.season s using (season_id) "
                   "where ts.franchise_id = 1 and s.start_year = 2023);")
        # pass 2 only when the gap queue is drained
        self.assertGreater(planner.gap_jobs_left(), 0)
        db.run("update ingest.harvest_job set state = 'done', gap = false, priority = 150;")
        after = planner.plan(Config(), NOW)
        self.assertEqual(after["pass"], 2)
        self.assertGreater(one("select count(*) from ingest.harvest_job where not gap and state = 'queued'"), 0)
        self.assertEqual(one("select count(*) from ingest.harvest_job where gap and state = 'queued' and priority <= %d" % tiers.REFRESH_TOP), 0)

    def test_what_the_rosters_pipeline_holds_is_not_asked_for_again(self):
        self.assertTrue(planner.have_rosters())
        db.run("insert into legacy_rosters.wp_article (league_code, season, club, page_title, revid, has_roster) values ('nba', 2023, 'Boston Celtics', 'x', 1, true);"
               "insert into legacy_rosters.league_team (league_code, team_qid, label) values ('nba', 'Q131371', 'Boston Celtics');")
        try:
            planner.plan(Config(), NOW)
            got = {r["target"]: r["priority"] for r in db.rows("select target, priority from ingest.harvest_job")}
            self.assertNotIn("Q131371", got)                                                       # the club's Wikidata members are in legacy_rosters
            # the Celtics 2023 article is held, so it is not a roster gap; it is still a team statistics gap, one tier lower
            self.assertEqual(got["2023–24 Boston Celtics season"], tiers.gap_priority(tiers.SEASON["nba"], 2023))
            self.assertEqual(got["2023–24 Charlotte Hornets season"], tiers.gap_priority(tiers.ROSTER["nba"], 2023))   # not held: a roster gap
            self.assertIn("Q121783", got)
        finally:
            db.run("delete from legacy_rosters.wp_article; delete from legacy_rosters.league_team;")

    def test_status_reports_the_queue_and_gaps(self):
        seed_jobs()
        w, c = make_worker()
        w.run(once=True, plan=False, max_jobs=0)                           # only the heartbeat row
        prog = db.value("select ingest.harvest_progress()")
        text = status.render(prog, status.measure())
        for want in ("queue depth", "wp_team_season", "gap targets left", "nba", "today:", "growth:", "last error", "gaps in core now"):
            self.assertIn(want, text)
        left = {(g["kind"], g["league"]): g["n"] for g in prog["gap_left"]}
        self.assertIn(("wp_team_season", "cfl"), left)
        self.assertEqual(status.measure()["nba"]["no_roster"], 3)          # the seed: 3 NBA team seasons, none with a roster

    def test_reparse_reads_the_archive_without_a_request(self):
        seed_jobs()
        w, c = make_worker()
        w.run(once=True, plan=False)
        db.run("update legacy_wikipedia_harvest.page set parser_version = 0; delete from legacy_wikipedia_harvest.roster_row;")
        n = worker.reparse(Config(), log=lambda m: None)
        self.assertEqual(n, 7)
        self.assertEqual(one("select count(*) from legacy_wikipedia_harvest.roster_row"), EXPECT_ROSTER_ROWS)
        self.assertEqual(one("select count(*) from legacy_wikipedia_harvest.page where parser_version = 2"), 7)


if __name__ == "__main__":
    unittest.main(argv=[sys.argv[0]] + [a for a in sys.argv[1:]], verbosity=1)
