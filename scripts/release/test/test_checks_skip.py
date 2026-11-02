#!/usr/bin/env python3
"""run_checks (release.py) and a table the database lacks. No database: a fake DS1 stands in.

    python3 -I scripts/release/test/test_checks_skip.py

On DS1 and production a check that cannot read its table is an error. Only with RELEASE_CHECKS_SKIP_MISSING=1 (the release tests, whose template may be a copy older than DS1)
is it skipped, and then only for 'does not exist' errors: any other error still stops the run."""
import importlib.util
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "sync"))
spec = importlib.util.spec_from_file_location("release", os.path.join(HERE, "..", "release.py"))
R = importlib.util.module_from_spec(spec)
spec.loader.exec_module(R)
failures = []


def ok(name, cond, detail=""):
    print("%s  %s%s" % ("PASS" if cond else "FAIL", name, ("  -> " + str(detail)) if (detail and not cond) else ""))
    if not cond:
        failures.append(name)


class Ds1:
    def __init__(self, error):
        self.error, self.calls = error, 0

    def run(self, sql):
        self.calls += 1
        if self.error:
            raise RuntimeError(self.error)
        return [{"n": 0, "sample": []}]


def attempt(error, skip):
    if skip:
        os.environ["RELEASE_CHECKS_SKIP_MISSING"] = "1"
    else:
        os.environ.pop("RELEASE_CHECKS_SKIP_MISSING", None)
    try:
        return R.run_checks(Ds1(error)), None
    except RuntimeError as e:
        return None, str(e)
    finally:
        os.environ.pop("RELEASE_CHECKS_SKIP_MISSING", None)


MISSING = 'psql failed: ERROR:  relation "ref.city" does not exist\nLINE 3: select slug as problem from ref.city'
n_files = len([f for f in os.listdir(os.path.join(HERE, "..", "..", "..", "db", "checks")) if f.endswith(".sql")])

out, err = attempt(None, False)
ok("a healthy database runs every check", out is not None and len(out) == n_files and all(c["ok"] for c in out), err)
out, err = attempt(MISSING, False)
ok("without the switch a missing table is an error", out is None and "does not exist" in (err or ""), err)
out, err = attempt(MISSING, True)
ok("with the switch every check of a missing table is skipped and says so", out is not None and len(out) == n_files and all(c["ok"] and c["what"].startswith("skipped: ") for c in out), err)
out, err = attempt("psql failed: ERROR:  syntax error at or near \"selec\"", True)
ok("with the switch any other error still stops the run", out is None and "syntax error" in (err or ""), err)
print("\n%s" % ("all passed" if not failures else "FAILED: " + "; ".join(failures)))
sys.exit(1 if failures else 0)
