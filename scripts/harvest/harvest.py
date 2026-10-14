#!/usr/bin/env python3
"""The harvest job: queue Wikipedia and Wikidata reads for the history DS1 does not have yet, and drain the queue politely, 24/7.

  harvest.py plan [--everything]       one planner run (what DS1 lacks, biggest gaps first); --everything also queues re-reads of what DS1 has
  harvest.py run [--max-seconds N] [--max-batches N] [--once] [--no-plan]
                                       the worker loop (what the Docker job runs, about an hour at a time); --once stops when nothing is due
  harvest.py reparse [--kind K] [--league L] [--all] [--limit N]
                                       read archived pages again with the current parsers (no request); default: pages parsed by an older parser
Exit code 0 ok, 1 DS1 not answering for too long, 2 usage. Standard library and psql only. Docs: harvest/README.md.
"""
import argparse
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import planner  # noqa: E402
import worker  # noqa: E402
from config import Config  # noqa: E402


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("plan")
    p.add_argument("--everything", action="store_true")
    r = sub.add_parser("run")
    r.add_argument("--max-seconds", type=float, default=None)
    r.add_argument("--max-batches", type=int, default=None)
    r.add_argument("--once", action="store_true")
    r.add_argument("--no-plan", action="store_true")
    q = sub.add_parser("reparse")
    q.add_argument("--kind")
    q.add_argument("--league")
    q.add_argument("--all", action="store_true")
    q.add_argument("--limit", type=int)
    a = ap.parse_args(argv)
    cfg = Config()
    if a.cmd == "plan":
        print(json.dumps(planner.plan(cfg, force_everything=a.everything), indent=1))
        return 0
    if a.cmd == "run":
        w = worker.Worker(cfg)
        return w.run(max_seconds=a.max_seconds if a.max_seconds is not None else cfg.cycle_secs, max_jobs=a.max_batches, once=a.once, plan=not a.no_plan)
    if a.cmd == "reparse":
        worker.reparse(cfg, kind=a.kind, league=a.league, only_old=not a.all, limit=a.limit)
        return 0
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
