"""DS1 access through psql only (standard library). On a Mac scripts/daily/ds1.sh finds DS1 and reads the keychain; in the Docker job it uses
PGHOST/PGPASSWORD. HARVEST_PSQL (a command line, e.g. "psql" with PG* set) replaces ds1.sh: the tests point it at a scratch Postgres."""
import json
import os
import shlex
import subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
DS1 = os.path.join(HERE, "..", "daily", "ds1.sh")


class DbError(RuntimeError):
    pass


def _err(p):
    """psql's complaint in one line: the ERROR line (and its detail), not the caret line under the statement."""
    lines = [x for x in p.stderr.strip().splitlines() if x.strip()]
    keep = [x for x in lines if x.lstrip().startswith(("ERROR", "FATAL", "DETAIL", "psql:")) or "ERROR:" in x]
    return " ".join((keep or lines or ["psql failed"])[:2])[:400]


def _base():
    c = os.environ.get("HARVEST_PSQL")
    return shlex.split(c) if c else [DS1]


def lit(v):
    """A SQL literal for None, bool, int, float, str, list/tuple of str (text[]), dict (jsonb) or bytes (bytea)."""
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(v)
    if isinstance(v, bytes):
        return "decode('%s', 'hex')" % v.hex()
    if isinstance(v, dict):
        return lit(json.dumps(v, ensure_ascii=False, separators=(",", ":"))) + "::jsonb"
    if isinstance(v, (list, tuple)):
        return ("array[%s]::text[]" % ",".join(lit(x) for x in v)) if v else "'{}'::text[]"
    return "'" + str(v).replace("'", "''").replace("\x00", "") + "'"


def run(sql, transaction=True, timeout=600):
    """Run a script (several statements). One transaction unless told otherwise. Raises DbError with psql's last error line."""
    args = _base() + ["-X", "-q", "-v", "ON_ERROR_STOP=1"] + (["-1"] if transaction else []) + ["-f", "-"]
    p = subprocess.run(args, input=sql, capture_output=True, text=True, timeout=timeout)
    if p.returncode:
        raise DbError(_err(p))
    return p.stdout


def rows(sql, timeout=300):
    """A select as a list of dicts. `sql` has no trailing semicolon."""
    q = "select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) from (%s) q" % sql.strip().rstrip(";")
    p = subprocess.run(_base() + ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", q], capture_output=True, text=True, timeout=timeout)
    if p.returncode:
        raise DbError(_err(p))
    return json.loads(p.stdout.strip() or "[]")


def query_json(sql, timeout=300):
    """Run one statement that prints one jsonb value (for a data-modifying WITH, which cannot sit inside rows()) and return it parsed."""
    p = subprocess.run(_base() + ["-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", sql], capture_output=True, text=True, timeout=timeout)
    if p.returncode:
        raise DbError(_err(p))
    return json.loads(p.stdout.strip().splitlines()[0]) if p.stdout.strip() else None


def value(sql):
    r = rows(sql)
    if not r:
        return None
    return next(iter(r[0].values()))
