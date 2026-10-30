#!/usr/bin/env python3
"""The runner's quiet-on-production rules, with no database and no network (stand-ins for production and the site):

  - the staging tables of a plan are created in ONE request (production's PostgREST reloads its schema cache per DDL transaction)
  - staging inserts are paced, the rehearsal gives up on a lock after a few seconds and is still the apply block plus a final raise
  - the site refresh goes out in small batches with a gap, never more tags per request than asked, and stops at the first failure

    python3 -I scripts/release/test/test_quiet.py

Exit code: 0 all passed, 1 a check failed.
"""
import importlib.util
import json
import os
import sys
import types

os.environ.setdefault("RELEASE_TURSO_TABLES", "none")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, ".."))
sys.path.insert(0, os.path.join(HERE, "..", "..", "sync"))
spec = importlib.util.spec_from_file_location("release", os.path.join(HERE, "..", "release.py"))
R = importlib.util.module_from_spec(spec)
spec.loader.exec_module(R)

FAILED = []


def check(name, cond, detail=""):
    print(("ok    " if cond else "FAIL  ") + name + ("" if cond else "  " + str(detail)))
    if not cond:
        FAILED.append(name)


class Prod:
    """Production as the runner sees it: records every query text."""

    def __init__(self):
        self.texts = []

    def post(self, text, attempts=5, timeout=300):
        self.texts.append(text)
        return []


def table(name, pk, cols):
    return types.SimpleNamespace(fq="core." + name, name=name, pk=pk, insert_cols=cols, types={c: "text" for c in cols})


def test_staging():
    tabs = [table("a", ["id"], ["id", "x"]), table("b", ["id"], ["id", "y"]), table("c", ["id"], ["id"])]
    plan = [{"t": tabs[0], "ups": ["(1,'a')", "(2,'b')"], "dels": [("9",)], "expected": 2},
            {"t": tabs[1], "ups": ["(1,'a')"], "dels": [], "expected": 1},
            {"t": tabs[2], "ups": None, "dels": [("3",), ("4",)], "expected": 0}]
    prod = Prod()
    ctx = types.SimpleNamespace(prod=prod)
    st = R.Stage(prod, 9_000_000_001)
    R.STAGE_PAUSE = 0
    steps = R.stage_plan(ctx, st, plan)
    ddl = [t for t in prod.texts if "create unlogged table" in t]
    check("staging: every table is created in one request", len(ddl) == 1 and ddl[0].count("create unlogged table") == 4, [t[:60] for t in prod.texts])
    check("staging: the DDL comes before any insert", "create unlogged table" in prod.texts[0] and all("create unlogged" not in t for t in prod.texts[1:]))
    check("staging: names are the same as before", [s["up"] for s in steps] == ["meta.rs_9000000001_0", "meta.rs_9000000001_1", None]
          and [s["del"] for s in steps] == ["meta.rd_9000000001_0", None, "meta.rd_9000000001_2"], steps)
    check("staging: each table gets its rows", sum("insert into meta.rs_" in t for t in prod.texts) == 2 and sum("insert into meta.rd_" in t for t in prod.texts) == 2)
    prod.texts.clear()
    st.drop()
    check("staging: dropped in one request", len(prod.texts) == 1 and prod.texts[0].count("drop table if exists") == 4, prod.texts)

    # a failed creation still leaves the names to drop
    class Boom(Prod):
        def post(self, text, attempts=5, timeout=300):
            raise RuntimeError("down")
    st2 = R.Stage(Boom(), 9_000_000_002)
    try:
        R.stage_plan(types.SimpleNamespace(prod=st2.prod), st2, plan)
    except RuntimeError:
        pass
    check("staging: names are remembered before the request, so a failure is cleaned up", len(st2.names) == 4, st2.names)


def test_pacing():
    naps = []
    real_sleep, real_bytes, real_pause = R.time.sleep, R.REQUEST_BYTES, R.STAGE_PAUSE
    R.time.sleep, R.REQUEST_BYTES, R.STAGE_PAUSE = naps.append, 130, 0.5
    try:
        prod = Prod()
        R.send_batches(prod, ["x" * 60] * 5)     # 5 statements, two per request: 3 requests
        check("pacing: a pause between requests, none before the first", len(prod.texts) == 3 and naps == [0.5, 0.5], (prod.texts, naps))
        naps.clear()
        R.send_batches(Prod(), ["x" * 10])
        check("pacing: a single request waits for nothing", naps == [])
    finally:
        R.time.sleep, R.REQUEST_BYTES, R.STAGE_PAUSE = real_sleep, real_bytes, real_pause


def test_rehearsal_block():
    steps = [{"t": types.SimpleNamespace(fq="core.a", name="a", pk=["id"], insert_cols=["id", "x"], identity_cols=[], neutral=[]),
              "up": "meta.rs_1_0", "del": None, "expected": 3, "fresh": False}]
    block = R.rehearsal_block(steps)
    check("rehearsal: starts with a lock timeout, then the apply, and ends with the raise",
          block.startswith("do $apply$ begin\nset local lock_timeout = '%s';" % R.REHEARSAL_LOCK_TIMEOUT) and block.endswith("using errcode = 'RH001';\nend $apply$")
          and R.apply_block(steps, rehearsal=True).split("begin", 1)[1][:60] in block, block[:120])
    check("rehearsal: still no sequence reset", "setval" not in block)


def test_batches():
    tags = ["data-version"] + ["api:v%d:nhl" % i for i in range(20)]
    b, gap = R.revalidate_batches(tags, size=6, gap=5, spread=45)
    check("batches: data-version alone first, then at most 6 tags", b[0] == ["data-version"] and all(len(x) <= 6 for x in b) and sum(len(x) for x in b) == 21, b)
    check("batches: order and content kept", [t for x in b for t in x] == tags and gap == 5)
    big = ["data-version"] + ["api:v%d" % i for i in range(90)]
    b, gap = R.revalidate_batches(big, size=6, gap=5, spread=45)
    check("batches: a big refresh grows the batches, not the wait", (len(b) - 1) * gap <= 45 and sum(len(x) for x in b) == 91, (len(b), gap))
    b, gap = R.revalidate_batches(["data-version", "api"], size=6, gap=5, spread=45)
    check("batches: the wide api tag goes alone", b == [["data-version"], ["api"]], b)
    b, gap = R.revalidate_batches(tags, size=6, gap=0, spread=45)
    check("batches: a gap of 0 means one request", b == [tags] and gap == 0, b)
    b, gap = R.revalidate_batches(["turso:x"], size=6, gap=5, spread=45)
    check("batches: a single tag is a single request", b == [["turso:x"]], b)


def site(tags, fail_at=None):
    """Runs revalidate_site with stand-ins for the views, the clock and the site. Returns (result, requests, naps)."""
    calls, naps = [], []

    def post(url, secret, batch):
        if fail_at is not None and len(calls) == fail_at:
            raise RuntimeError("HTTP 500")
        calls.append(list(batch))

    R.revalidate_tags = lambda ctx, tables, leagues: tags
    os.environ["REVALIDATE_URL"], os.environ["REVALIDATE_SECRET"] = "http://127.0.0.1:1/api/revalidate", "s" * 40
    res = R.revalidate_site(None, ["core.game"], None, sleep=naps.append, post=post)
    return res, calls, naps


def test_site():
    tags = ["data-version"] + ["api:v%d" % i for i in range(15)]
    res, calls, naps = site(tags)
    check("site: 16 tags go out in a few requests with a gap between each", len(calls) == 4 and [len(c) for c in calls] == [1, 6, 6, 3] and naps == [R.REVALIDATE_GAP] * 3, (calls, naps))
    check("site: every tag is sent once", [t for c in calls for t in c] == tags)
    check("site: the result says so", res == "ok (16 tags, 4 requests)", res)
    res, calls, naps = site(["data-version", "api:v1"])
    check("site: a small release is two requests", len(calls) == 2 and res == "ok (2 tags, 2 requests)", (res, calls))
    res, calls, naps = site(tags, fail_at=1)
    check("site: a failed request stops the rest and is reported", res.startswith("failed") and len(calls) == 1, (res, calls))
    os.environ["REVALIDATE_URL"] = "http://example.com/api/revalidate"
    check("site: plain http to another host is refused", R.revalidate_site(None, [], None, sleep=lambda s: None).startswith("failed"))
    del os.environ["REVALIDATE_URL"]
    check("site: nothing set is off", R.revalidate_site(None, [], None) == "off")


if __name__ == "__main__":
    test_staging()
    test_pacing()
    test_rehearsal_block()
    test_batches()
    test_site()
    print("\n%s" % ("all passed" if not FAILED else "FAILED: " + ", ".join(FAILED)))
    sys.exit(1 if FAILED else 0)
