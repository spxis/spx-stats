"""The worker: drains the queue one request at a time.

  loop:  stand still while the daily scores job runs (pause.py)  ->  plan when the planner is due  ->  claim the next due batch (highest priority first)
         ->  ask (one request, rate limited)  ->  archive the answer  ->  parse and load it  ->  settle the jobs (jobs.after_*)  ->  heartbeat.
Resumable: every job is settled in DS1 as soon as it is read, a job that was claimed and not settled comes back when its lease passes.
Idempotent: a page whose revision id is the one last read is only marked checked; a query answer with the same sha256 is not loaded again.
"""
import json
import os
import signal
import socket
import subprocess
import sys
import time
from datetime import datetime, timezone

import db
import jobs
import load
import parse
import planner
import tiers
import wikidata as WD
from config import (PARSER_VERSION, UA, WDQS, WIKIDATA_API, WIKIPEDIA_API, Config)
from netapi import Api, Lagged, Permanent, Transient
from pause import PauseGuard

SPARQL_ACCEPT = "application/sparql-results+json"


def utc():
    return datetime.now(timezone.utc)


def _git_sha():
    try:
        return subprocess.run(["git", "-C", os.path.dirname(os.path.abspath(__file__)), "rev-parse", "--short=10", "HEAD"], capture_output=True, text=True,
                              timeout=10).stdout.strip() or None
    except Exception:
        return None


def resolve_pages(requested, answer):
    """The API answer of a revisions query -> {requested title: {"page": page object, "requested": [titles], "missing": bool}}, following normalised
    titles and redirects (also chains) back to the title that was asked for."""
    q = answer.get("query", {})
    hop = {}
    for x in q.get("normalized", []):
        hop[x["from"]] = x["to"]
    for x in q.get("redirects", []):
        hop[x["from"]] = x["to"]
    pages = {p.get("title"): p for p in q.get("pages", [])}
    out = {}
    for t in requested:
        f = t
        for _ in range(6):
            if f in hop:
                f = hop[f]
        p = pages.get(f)
        missing = p is None or p.get("missing") or p.get("invalid") or not p.get("revisions")
        out[t] = {"page": p, "missing": bool(missing), "resolved": f}
    return out


class Worker:
    def __init__(self, cfg=None, wp=None, wd=None, wdqs=None, guard=None, sleep=time.sleep, clock=time.monotonic, utcnow=utc, log=None):
        self.cfg = cfg or Config()
        self.wp = wp or Api(WIKIPEDIA_API, self.cfg.wp_gap, UA, maxlag=self.cfg.maxlag)
        self.wd = wd or Api(WIKIDATA_API, self.cfg.wd_gap, UA, maxlag=self.cfg.wd_maxlag)
        self.wdqs = wdqs or Api(WDQS, self.cfg.wdqs_gap, UA, accept=SPARQL_ACCEPT)
        self.guard = guard or PauseGuard(self.cfg)
        self.sleep, self.clock, self.utcnow = sleep, clock, utcnow
        self.log = log or (lambda m: print("%s harvest: %s" % (self.utcnow().strftime("%Y-%m-%d %H:%M:%S"), m), flush=True))
        self.stats = {}
        self.run_id = None
        self.paused_secs = 0.0
        self._settled = set()
        self._beat_at = 0.0

    # ---------------------------------------------------------------- bookkeeping

    def count(self, kind, what, n=1):
        s = self.stats.setdefault(kind, {})
        s[what] = s.get(what, 0) + n

    def settle(self, job, new, what):
        db.run(jobs.update_sql(job["job_id"], new), transaction=False)
        self._settled.add(job["job_id"])
        self.count(job["kind"], what)

    def fetch_log(self, kind, items, api, nbytes, new_items, note=None):
        try:
            db.run("insert into ingest.harvest_fetch (run_id, kind, items, http, bytes, new_items, note) values (%s, %s, %d, %s, %d, %d, %s);"
                   % (db.lit(self.run_id), db.lit(kind), items, db.lit(api.last_status), nbytes, new_items, db.lit(note)), transaction=False)
        except db.DbError as e:
            self.log("could not log a request (%s)" % e)

    def beat(self, outcome=None, force=False):
        if not force and self.clock() - self._beat_at < 30:
            return
        self._beat_at = self.clock()
        s = {"kinds": self.stats, "requests": {"wikipedia": self.wp.requests, "wikidata": self.wd.requests, "wdqs": self.wdqs.requests},
             "paused_secs": int(self.paused_secs)}
        if self.run_id is None:
            return
        try:
            db.run("update ingest.harvest_run set last_beat_at = now(), summary = %s%s where run_id = %d;"
                   % (db.lit(s), (", finished_at = now(), outcome = %s" % db.lit(outcome)) if outcome else "", self.run_id), transaction=False)
        except db.DbError as e:
            self.log("heartbeat failed (%s)" % e)

    def start(self):
        try:
            self.run_id = db.query_json("with i as (insert into ingest.harvest_run (host, git_sha) values (%s, %s) returning run_id) select to_jsonb(run_id) from i"
                                        % (db.lit(socket.gethostname()), db.lit(_git_sha())))
        except db.DbError as e:
            self.log("could not write the heartbeat row (%s)" % e)

    # ---------------------------------------------------------------- loop

    def size_for(self, head):
        if head["kind"] in jobs.WP_KINDS:
            return 50 if head.get("last_revision") else self.cfg.wp_batch
        if head["kind"] in ("wd_person", "wd_label", "wd_person_title"):
            return self.cfg.wd_batch
        return 1

    def run(self, max_seconds=None, max_jobs=None, once=False, plan=True):
        """Work until max_seconds have passed, max_jobs batches were done, or (once) the queue has nothing due. -> exit code"""
        t0 = self.clock()
        self.start()
        self.log("started (run %s, wikipedia %.1fs/request, wikidata %.1fs, queries %.1fs apart)" % (self.run_id, self.cfg.wp_gap, self.cfg.wd_gap, self.cfg.wdqs_gap))
        batches, db_fail, outcome = 0, 0, "ok"

        def stop(signum, frame):            # docker stop: finish the heartbeat row, leave the rest to the lease
            raise KeyboardInterrupt
        signal.signal(signal.SIGTERM, stop)
        try:
            while True:
                if max_seconds is not None and self.clock() - t0 >= max_seconds:
                    break
                if max_jobs is not None and batches >= max_jobs:
                    break
                why = self.guard.check()
                if why:
                    self.log("standing still: %s" % why)
                    self.sleep(60)
                    self.paused_secs += 60
                    self.beat()
                    continue
                try:
                    if plan and planner.plan_due(self.cfg):
                        self.log("planner: %s" % json.dumps(planner.plan(self.cfg)))
                    batch = jobs.claim(self.cfg, self.size_for)
                    db_fail = 0
                except db.DbError as e:
                    db_fail += 1
                    self.log("DS1 error (%s); try %d" % (e, db_fail))
                    if db_fail >= 20:
                        outcome = "failed"
                        return 1
                    self.sleep(60)
                    continue
                if not batch:
                    if once:
                        break
                    self.beat()
                    self.sleep(self.cfg.idle_sleep)
                    continue
                self.process(batch)
                batches += 1
                self.beat()
                if self.utcnow().hour == 3 and self.utcnow().minute < 2:
                    self.prune_log()
        except KeyboardInterrupt:
            self.log("interrupted")
        finally:
            self.beat(outcome=outcome, force=True)
        self.log("finished: %s" % json.dumps(self.stats))
        return 0 if outcome == "ok" else 1

    def prune_log(self):
        try:
            db.run("delete from ingest.harvest_fetch where at < now() - interval '%d days';" % self.cfg.fetch_log_days, transaction=False)
        except db.DbError:
            pass

    def process(self, batch):
        kind = batch[0]["kind"]
        self._settled = set()
        try:
            if kind in jobs.WP_KINDS:
                self.do_wp(batch)
            elif kind == "wd_team_members":
                self.do_team(batch[0])
            elif kind == "wd_person_title":
                self.do_person_titles(batch)
            elif kind in ("wd_person", "wd_label"):
                self.do_entities(batch)
            else:
                for j in batch:
                    self.settle(j, jobs.after_error(j, self.cfg, self.utcnow(), "unknown kind " + kind, permanent=True), "errors")
        except Permanent as e:
            self.log("%s refused: %s" % (kind, e))
            self.fail_rest(batch, e, permanent=True)
        except Lagged as e:
            self.log("%s: %s; put back for 10 minutes" % (kind, e))
            self.fail_rest(batch, e, lag=True)
        except (Transient, db.DbError) as e:
            self.log("%s: %s; will try again" % (kind, e))
            self.fail_rest(batch, e)
        except Exception as e:      # a bug in a handler must not stop the loop or lose the claim
            self.log("%s: unexpected %s: %s" % (kind, type(e).__name__, e))
            self.fail_rest(batch, "%s: %s" % (type(e).__name__, e))

    def fail_rest(self, batch, err, permanent=False, lag=False):
        for j in batch:
            if j["job_id"] not in self._settled:
                try:
                    new = jobs.after_lag(j, self.cfg, self.utcnow()) if lag else jobs.after_error(j, self.cfg, self.utcnow(), err, permanent=permanent)
                    self.settle(j, new, "lagged" if lag else "errors")
                except db.DbError:
                    pass       # the lease passes and the job comes back by itself

    # ---------------------------------------------------------------- English Wikipedia

    def wp_query(self, titles, content):
        body = self.wp.get({"action": "query", "prop": "revisions", "rvprop": "ids|timestamp|content" if content else "ids|timestamp", "rvslots": "main",
                            "redirects": "1", "format": "json", "formatversion": "2", "titles": "|".join(titles)})
        self._last_bytes = len(body)
        return resolve_pages(titles, json.loads(body)), len(body)

    def do_wp(self, batch):
        cfg, now = self.cfg, self.utcnow()
        todo = [j for j in batch if not j.get("last_revision")]
        checks = [j for j in batch if j.get("last_revision")]
        if checks:
            titles = [j["target"] for j in checks]
            res, nb = self.wp_query(titles, content=False)
            versions = {r["title"]: int(r["parser_version"]) for r in db.rows(
                "select title, max(parser_version) as parser_version from legacy_wikipedia_harvest.page where title in (%s) group by title"
                % ",".join(db.lit(t) for t in titles))}
            self.fetch_log("wp_check", len(checks), self.wp, nb, 0)
            for j in checks:
                r = res[j["target"]]
                if r["missing"]:
                    self.settle(j, jobs.after_missing(j, cfg, now), "gone")
                elif int(r["page"]["revisions"][0]["revid"]) == int(j["last_revision"]):
                    if versions.get(j["target"], 0) < PARSER_VERSION:
                        todo.append(j)                  # same source revision, but the parser has new semantics
                    else:
                        self.settle(j, jobs.after_success(j, cfg, now, changed=False), "unchanged")
                else:
                    todo.append(j)
        for i in range(0, len(todo), cfg.wp_batch):
            part = todo[i:i + cfg.wp_batch]
            res, nb = self.wp_query([j["target"] for j in part], content=True)
            new = 0
            for j in part:
                r = res[j["target"]]
                if r["missing"]:
                    self.settle(j, jobs.after_missing(j, cfg, now), "gone")
                    continue
                new += self.store_page(j, r)
            self.fetch_log("wp_content", len(part), self.wp, nb, new)

    def store_page(self, job, r):
        """Archive the page object, then parse and load it. -> 1 if the revision was new to DS1, else 0."""
        page = r["page"]
        rev = page["revisions"][0]
        revid, revat = int(rev["revid"]), rev.get("timestamp")
        now = self.utcnow()
        # the same revision always gives the same bytes (no fetch time inside: that is legacy_wikipedia_harvest.page.fetched_at), so a re-read never conflicts
        payload = json.dumps({"page": page}, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        have = db.rows("select parser_version from legacy_wikipedia_harvest.page where title = %s and revision = %d" % (db.lit(job["target"]), revid))
        if have and have[0]["parser_version"] >= PARSER_VERSION:
            self.settle(job, jobs.after_success(job, self.cfg, now, revision=revid, sha256=load.sha256(payload), changed=False), "unchanged")
            return 0
        name = "harvest/wikipedia/%s/%s@%d.json" % (now.date().isoformat(), load.safe(r["resolved"]), revid)
        db.run(load.archive_sql(name, now.date(), payload), transaction=False)                      # archive first, on its own
        text = rev.get("slots", {}).get("main", {}).get("content") or rev.get("content") or ""
        parsed = parse.parse_page(job["kind"], text, job["league"])
        db.run(load.page_sql(job["kind"], job["league"], job["season"], job["target"], r["resolved"], revid, revat, payload, name, now.isoformat(), parsed))
        if job["kind"] == "wp_team_season":
            titles = sorted({row.get("link") for row in parsed["roster"] if row.get("link")})
            db.run(self.discover_titles_sql(titles, job.get("league")))
        self.settle(job, jobs.after_success(job, self.cfg, now, revision=revid, sha256=load.sha256(payload)), "done")
        if parsed["status"] == "error":
            self.count(job["kind"], "parse_errors")
        return 1

    def discover_titles_sql(self, titles, league):
        """Queue exact Wikipedia roster article titles for Wikidata sitelink resolution."""
        if not titles:
            return ""
        rows = ",\n".join("(%s, %s, %d, true, 365)" % (db.lit(t), db.lit(league), tiers.BIOS) for t in titles)
        return ("insert into ingest.harvest_job (kind, target, league, priority, gap, refresh_days) "
                "select 'wd_person_title', v.title, v.league, v.priority, v.gap, v.refresh_days from (values %s) v(title, league, priority, gap, refresh_days) "
                "on conflict (kind, target) do update set priority = greatest(ingest.harvest_job.priority, excluded.priority), "
                "gap = ingest.harvest_job.gap or excluded.gap, updated_at = now() where ingest.harvest_job.state = 'queued';\n" % rows)

    def do_person_titles(self, batch):
        """Resolve roster article sitelinks in batches; only Q5 entities enter wd_person."""
        cfg, now = self.cfg, self.utcnow()
        titles = [j["target"] for j in batch]
        wp_body = self.wp.get({"action": "query", "prop": "pageprops", "ppprop": "wikibase_item", "redirects": "1",
                               "format": "json", "formatversion": "2", "titles": "|".join(titles)})
        candidates = WD.resolve_title_pages(wp_body, titles)
        qids = sorted({candidate["qid"] for candidate in candidates.values()})
        wd_body = (self.wd.get({"action": "wbgetentities", "ids": "|".join(qids), "props": "info|claims|sitelinks",
                                "sitefilter": "enwiki", "format": "json"}) if qids else b'{"entities":{}}')
        people = WD.title_people(wd_body, candidates)
        pruned = WD.prune_title_lookup(wp_body, wd_body, titles, candidates, people)
        payload = json.dumps(pruned, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
        sha = load.sha256(payload)
        name = "harvest/wikidata/%s/roster-titles-%s.json" % (now.date().isoformat(), sha[:16])
        db.run(load.archive_sql(name, now.date(), payload), transaction=False)
        sql = ""
        for job in batch:
            match = people.get(job["target"])
            if match:
                sql += self.discover_sql("wd_person", [match["qid"]], job.get("league"), True)
        db.run(sql)
        for job in batch:
            match = people.get(job["target"])
            self.settle(job, jobs.after_success(job, cfg, now, sha256=sha, changed=bool(match)), "done" if match else "not_person")
        self.fetch_log("wp_person_title_pages", len(titles), self.wp, len(wp_body), len(candidates),
                       note="exact pageprops wikibase_item via canonical title/redirects")
        if qids:
            self.fetch_log("wd_person_title_verify", len(qids), self.wd, len(wd_body), len(people),
                           note="canonical enwiki sitelink + non-deprecated P31=Q5 required")
        self.count("wd_person_title", "human_items", len(people))

    # ---------------------------------------------------------------- Wikidata

    def do_team(self, job):
        cfg, now, qid = self.cfg, self.utcnow(), job["target"]
        if not WD.is_qid(qid):
            return self.settle(job, jobs.after_error(job, cfg, now, "not a Q-number", permanent=True), "errors")
        body = self.wdqs.get({"query": WD.TEAM_QUERY % qid, "format": "json"})
        sha = load.sha256(body)
        if sha == job.get("last_sha256"):
            self.fetch_log("wd_team_members", 1, self.wdqs, len(body), 0)
            return self.settle(job, jobs.after_success(job, cfg, now, sha256=sha, changed=False), "unchanged")
        rows = WD.members(body, qid)
        name = "harvest/wikidata/%s/team-%s-%s.json" % (now.date().isoformat(), qid, sha[:10])
        db.run(load.archive_sql(name, now.date(), body), transaction=False)
        sql = load.team_members_sql(qid, rows, name, now.isoformat()) + self.discover_sql("wd_person", sorted({r["person_qid"] for r in rows}), job["league"], True)
        db.run(sql)
        self.fetch_log("wd_team_members", 1, self.wdqs, len(body), 1)
        self.settle(job, jobs.after_success(job, cfg, now, sha256=sha), "done")
        self.count("wd_team_members", "members", len(rows))

    def discover_sql(self, kind, qids, league, only_unknown_people):
        """Enqueue items found in an answer that DS1 holds nothing for: people not in core, places and countries not yet labelled."""
        if not qids:
            return ""
        arr = "array[%s]" % ",".join(db.lit(q) for q in qids)
        if only_unknown_people:
            cond = ("not exists (select 1 from core.external_id x where x.entity_kind = 'person' and x.external_key = q "
                    "and x.source_id = (select source_id from meta.source where code = 'wikidata'))")
            prio, refresh = tiers.BIOS, 365
        else:
            cond = "not exists (select 1 from legacy_wikidata_harvest.item i where i.qid = q)"
            prio, refresh = tiers.LABELS, 365
        return ("insert into ingest.harvest_job (kind, target, league, priority, gap, refresh_days) select %s, q, %s, %d, true, %d from unnest(%s) q where %s "
                "on conflict (kind, target) do nothing;\n" % (db.lit(kind), db.lit(league), prio, refresh, arr, cond))

    def do_entities(self, batch):
        cfg, now = self.cfg, self.utcnow()
        kind = batch[0]["kind"]
        keep = WD.PERSON_PROPS if kind == "wd_person" else WD.LABEL_PROPS
        ids = [j["target"] for j in batch if WD.is_qid(j["target"])]
        for j in batch:
            if not WD.is_qid(j["target"]):
                self.settle(j, jobs.after_error(j, cfg, now, "not a Q-number", permanent=True), "errors")
        if not ids:
            return
        body = self.wd.get({"action": "wbgetentities", "ids": "|".join(ids), "props": "info|claims|labels|sitelinks", "languages": "en",
                            "sitefilter": "enwiki", "format": "json"})
        pruned = WD.prune_response(body, {q: keep for q in ids})["entities"]
        date_issues = WD.invalid_time_claims(pruned)
        payload = json.dumps({"entities": pruned}, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
        name = "harvest/wikidata/%s/%s-%s-%d-%s.json" % (now.date().isoformat(), "people" if kind == "wd_person" else "labels", ids[0], len(ids), load.sha256(payload)[:10])
        store, claims, refs = {}, {}, set()
        for j in batch:
            if j["job_id"] in self._settled:
                continue
            e = pruned.get(j["target"])
            if e is None or e.get("missing"):
                self.settle(j, jobs.after_missing(j, cfg, now), "gone")
                continue
            if j.get("last_revision") and e.get("lastrevid") == int(j["last_revision"]):
                self.settle(j, jobs.after_success(j, cfg, now, changed=False), "unchanged")
                continue
            store[j["target"]] = e
            claims[j["target"]] = WD.claim_rows(j["target"], e.get("claims"))
            for c in claims[j["target"]]:
                if c["value_qid"] and ((kind == "wd_person" and c["prop"] in ("P19", "P27", "P413")) or (kind == "wd_label" and c["prop"] == "P17")):
                    refs.add(c["value_qid"])
        if store:
            db.run(load.archive_sql(name, now.date(), payload), transaction=False)
            sql = load.items_sql(store, claims, name, now.isoformat()) + self.discover_sql("wd_label", sorted(refs), None, False)
            db.run(sql)
            for j in batch:
                if j["target"] in store:
                    self.settle(j, jobs.after_success(j, cfg, now, revision=store[j["target"]].get("lastrevid"), sha256=load.sha256(payload)), "done")
        note = ("invalid or unsupported Wikidata dates stored unknown: " + ", ".join(date_issues))[:500] if date_issues else None
        self.fetch_log(kind, len(ids), self.wd, len(body), len(store), note=note)


def reparse(cfg, kind=None, league=None, only_old=True, limit=None, log=print):
    """Read the archived answers of pages again with the current parsers (after a parser was improved). No request is sent."""
    where = ["1=1"]
    if only_old:
        where.append("parser_version < %d" % PARSER_VERSION)
    if kind:
        where.append("kind = %s" % db.lit(kind))
    if league:
        where.append("league = %s" % db.lit(league))
    pages = db.rows("select kind, league, season, title, resolved_title, revision, revision_at, archive_name, fetched_at from legacy_wikipedia_harvest.page "
                    "where %s order by page_id%s" % (" and ".join(where), (" limit %d" % limit) if limit else ""))
    n = 0
    for p in pages:
        h = db.value("select encode(data, 'hex') from legacy_files.raw_archive where name = %s" % db.lit(p["archive_name"]))
        if h is None:
            log("archive row missing: %s" % p["archive_name"])
            continue
        data = bytes.fromhex(h)
        page, text = parse.page_from_archive(data)
        parsed = parse.parse_page(p["kind"], text, p["league"])
        db.run(load.page_sql(p["kind"], p["league"], p["season"], p["title"], p["resolved_title"], p["revision"], p["revision_at"], data,
                             p["archive_name"], p["fetched_at"], parsed))
        n += 1
    log("reparsed %d pages" % n)
    return n
