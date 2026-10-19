#!/usr/bin/env python3
"""The shared rate limiter, queue and short cache for every request to a score source (standard library only).

Every fetch of the scheduled daily job (03:00 and 10:00 Eastern), of an admin's on-demand request (the release runner) and of anything
run by hand goes through ONE limiter whose state lives where all of them can see it: DS1, schema ingest (migration 137). They run in
separate containers on the NAS, so a file lock would not be shared; DS1 already is (the daily lock is an advisory lock on it), and it
adds no service. A read-only run (a dry run, an agent's test) never writes DS1: it uses a lock file in the cache folder, which
protects processes on that machine only (so does a DS1 that cannot be reached, with a warning). SPX_LIMITER=ds1|file|memory forces a choice.

  Token bucket, one per source (sources.py gives spacing and burst): a request needs one token, a token comes back every `spacing`
  seconds, and the bucket starts counting again when the request ENDS (no credit for the time a request was in flight). One request at a
  time per source: the holder has a lease (90 s, longer than the 60 s request timeout) that frees itself if the holder dies.
  Queue: callers wait in order; each poll refreshes its place, a waiter that stops polling (died) is dropped after 30 s. The wait is
  logged with the place in line and an estimate. Nothing runs in parallel against one source.
  Cache: the last answer per source and key (a game, a page, a request URL) is kept 60 s (the source's `ttl`); a second caller, a
  concurrent one included, reuses it and sends nothing. `force` skips the read of the cache but still takes a place in the queue.
  Terms gate: sources.require() runs before a caller is queued; a forbidden, grey or unknown source raises SourceRefused.

    L = limiter.default()
    value, from_cache = L.fetch("balldontlie", key, lambda: one_http_request())      # one fn = ONE request
    values = L.fetch_many("wikipedia", ["rev:A", "rev:B"], lambda missing: {k: ... for k in missing})   # one request for the missing keys
    with L.slot("wikipedia", "page X") as s: ...                                       # a slot for a request the caller makes itself
    L.penalize("balldontlie", 30)                                                     # a 429: nobody asks for 30 s

    python3 -I scripts/daily/limiter.py status        # who is queued and who holds each source (DS1)
"""
import contextlib, copy, json, os, random, subprocess, sys, threading, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import sources as SRC

QUEUE_TTL = 30                  # seconds without a poll after which a waiting caller is taken to be dead
CACHE_KEEP = 3600               # cached answers older than this are deleted
MIGRATION = os.path.join(HERE, "..", "..", "db", "migrations", "137_ingest_source_limiter.sql")


class LimiterTimeout(RuntimeError):
    pass


# ---------------------------------------------------------------------------------------------------- the rule (pure)

def refill(s, now, spec):
    """Tokens come back with time, but not while a request is in flight: the bucket starts counting when the request ENDS."""
    if not s["busy"]:
        s["tokens"] = min(float(spec["burst"]), s["tokens"] + (now - s["stamp"]) / spec["spacing"])
    s["stamp"] = now


def step(state, now, spec, ticket, holder, label):
    """One look at the queue for one caller. -> (new state, ticket, None) when the caller now holds the source, else (new state, ticket, (ahead, eta seconds))."""
    s = copy.deepcopy(state) if state else {}
    s.setdefault("tokens", float(spec["burst"])); s.setdefault("stamp", now); s.setdefault("busy", None); s.setdefault("queue", []); s.setdefault("seq", 0)
    if s["busy"] and s["busy"]["until"] <= now:
        s["busy"] = None
    refill(s, now, spec)
    s["queue"] = [q for q in s["queue"] if q["t"] == ticket or now - q["beat"] <= QUEUE_TTL]
    mine = next((q for q in s["queue"] if q["t"] == ticket), None) if ticket else None
    if mine is None:
        s["seq"] += 1
        ticket = s["seq"]
        mine = dict(t=ticket, h=holder, label=label[:80], at=now, beat=now)
        s["queue"].append(mine)
    mine["beat"] = now
    pos = s["queue"].index(mine)
    if pos == 0 and not s["busy"] and s["tokens"] >= 1 - 1e-9 and now >= s.get("hold_until", 0):
        s["tokens"] -= 1
        s["busy"] = dict(t=ticket, h=holder, label=label[:80], since=now, until=now + spec["lease"])
        s["queue"].pop(0)
        return s, ticket, None
    ahead = pos + (1 if s["busy"] else 0)
    eta = max(0.0, (1 - s["tokens"]) * spec["spacing"], s.get("hold_until", 0) - now) + pos * spec["spacing"]
    return s, ticket, (ahead, eta)


def finish(state, now, spec, ticket, used=True, penalty=0.0):
    """The holder is done (or a waiter gives up). `used` False hands the token back (a cache hit after waiting); `penalty` seconds nobody may ask (a 429, a Retry-After)."""
    s = copy.deepcopy(state) if state else {}
    s.setdefault("tokens", float(spec["burst"])); s.setdefault("stamp", now); s.setdefault("busy", None); s.setdefault("queue", [])
    refill(s, now, spec)
    s["queue"] = [q for q in s["queue"] if q["t"] != ticket]
    if s["busy"] and s["busy"]["t"] == ticket:
        s["busy"] = None
        if not used:
            s["tokens"] = min(float(spec["burst"]), s["tokens"] + 1)
    if penalty:
        s["hold_until"] = max(s.get("hold_until", 0), now + penalty)
    s["stamp"] = now
    return s


# ---------------------------------------------------------------------------------------------------- where the state lives

class Store:
    """read(source) -> (state, version, now); cas(source, state, version) -> bool; cache_get/cache_put. update() is the read-modify-write loop."""

    def update(self, source, fn, sleep=time.sleep):
        for _ in range(60):
            state, version, now = self.read(source)
            new, res = fn(state, now)
            if self.cas(source, new, version):
                return res
            sleep(random.uniform(0.01, 0.1))
        raise RuntimeError("limiter: the state of %s kept changing" % source)

    def now(self): return time.time()


class MemoryStore(Store):
    """One process (tests, or SPX_LIMITER=memory). `clock` can be a fake."""

    def __init__(self, clock=time.time):
        self.clock, self.st, self.ver, self.cache = clock, {}, {}, {}

    def now(self): return self.clock()

    def read(self, source): return copy.deepcopy(self.st.get(source, {})), self.ver.get(source, 0), self.clock()

    def cas(self, source, state, version):
        if self.ver.get(source, 0) != version: return False
        self.st[source], self.ver[source] = copy.deepcopy(state), version + 1
        return True

    def cache_get(self, source, key):
        e = self.cache.get((source, key))
        return (self.clock() - e[0], copy.deepcopy(e[1])) if e else None

    def cache_put(self, source, key, value):
        self.cache[(source, key)] = (self.clock(), copy.deepcopy(value))
        for k in [k for k, e in self.cache.items() if self.clock() - e[0] > CACHE_KEEP]: del self.cache[k]


class FileStore(Store):
    """Several processes on one machine: a JSON file under an exclusive flock for each read and each write."""

    def __init__(self, path):
        self.path = path
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)

    @contextlib.contextmanager
    def _locked(self):
        import fcntl
        with open(self.path + ".lock", "a") as lk:
            fcntl.flock(lk, fcntl.LOCK_EX)
            try:
                try:
                    with open(self.path, encoding="utf-8") as f: d = json.load(f)
                except (OSError, ValueError):
                    d = {}
                d.setdefault("sources", {}); d.setdefault("cache", {})
                box = [d, False]
                yield box
                if box[1]:
                    tmp = self.path + ".tmp"
                    with open(tmp, "w", encoding="utf-8") as f: json.dump(d, f)
                    os.replace(tmp, self.path)
            finally:
                fcntl.flock(lk, fcntl.LOCK_UN)

    def read(self, source):
        with self._locked() as (d, _):
            e = d["sources"].get(source) or {"state": {}, "version": 0}
            return e["state"], e["version"], time.time()

    def cas(self, source, state, version):
        with self._locked() as box:
            d = box[0]
            e = d["sources"].get(source) or {"state": {}, "version": 0}
            if e["version"] != version: return False
            d["sources"][source] = {"state": state, "version": version + 1}
            box[1] = True
            return True

    def cache_get(self, source, key):
        with self._locked() as (d, _):
            e = d["cache"].get(source + "\x00" + key)
            return (time.time() - e["at"], e["value"]) if e else None

    def cache_put(self, source, key, value):
        with self._locked() as box:
            d = box[0]
            d["cache"][source + "\x00" + key] = {"at": time.time(), "value": value}
            for k in [k for k, e in d["cache"].items() if time.time() - e["at"] > CACHE_KEEP]: del d["cache"][k]
            box[1] = True


def _lit(s): return "'" + str(s).replace("'", "''") + "'"


class Ds1Store(Store):
    """DS1, schema ingest (migration 137). `run(sql)` -> stdout text; the default is scripts/daily/ds1.sh with the SQL on stdin
    (a cached answer can be 100 KB, more than one command-line argument may hold)."""

    def __init__(self, run=None):
        self.run = run or self._ds1

    @staticmethod
    def _ds1(sql):
        p = subprocess.run([os.path.join(HERE, "ds1.sh"), "-X", "-q", "-At", "-f", "-"], input=sql, capture_output=True, text=True, timeout=60)
        if p.returncode: raise RuntimeError("DS1: " + ((p.stderr.strip().splitlines() or ["query failed"])[-1])[:200])
        return p.stdout

    def ensure(self):
        """Create the two tables if DS1 lacks them (the migration is rerunnable, like the heartbeat's 048)."""
        try:
            self.run("select 1 from ingest.source_limiter limit 0; select 1 from ingest.source_cache limit 0;")
        except RuntimeError:
            sql = "".join(ln for ln in open(MIGRATION, encoding="utf-8").read().splitlines(True) if ln.strip().lower() not in ("begin;", "commit;"))
            self.run("begin;\n" + sql + "\ncommit;")

    def now(self):
        return float(self.run("select extract(epoch from now())::float8;").strip().splitlines()[-1])

    def read(self, source):
        out = self.run("insert into ingest.source_limiter (source) values (%s) on conflict do nothing;\n"
                       "select 'R|' || version || '|' || extract(epoch from now())::float8 || '|' || state::text from ingest.source_limiter where source = %s;" % (_lit(source), _lit(source)))
        line = next(l for l in out.splitlines() if l.startswith("R|"))
        _, version, now, state = line.split("|", 3)
        return json.loads(state), int(version), float(now)

    def cas(self, source, state, version):
        out = self.run("update ingest.source_limiter set state = %s::jsonb, version = version + 1, updated_at = now() where source = %s and version = %d returning 'U';"
                       % (_lit(json.dumps(state)), _lit(source), version))
        return "U" in out

    def cache_get(self, source, key):
        out = self.run("select 'C|' || extract(epoch from now() - fetched_at)::float8 || '|' || value::text from ingest.source_cache where source = %s and key = %s;" % (_lit(source), _lit(key)))
        line = next((l for l in out.splitlines() if l.startswith("C|")), None)
        if not line: return None
        _, age, value = line.split("|", 2)
        return float(age), json.loads(value)

    def cache_put(self, source, key, value):
        self.run("insert into ingest.source_cache (source, key, value) values (%s, %s, %s::jsonb) on conflict (source, key) do update set value = excluded.value, fetched_at = now();\n"
                 "delete from ingest.source_cache where fetched_at < now() - interval '%d seconds';" % (_lit(source), _lit(key), _lit(json.dumps(value)), CACHE_KEEP))

    def status(self):
        out = self.run("select coalesce(json_agg(json_build_object('source', source, 'state', state, 'version', version, 'now', extract(epoch from now()))), '[]'::json)::text from ingest.source_limiter;")
        return json.loads(out.strip().splitlines()[-1])


# ---------------------------------------------------------------------------------------------------- the limiter

class Slot:
    def __init__(self, waited, position):
        self.waited, self.position, self.used, self.retry_after = waited, position, True, 0.0

    def unused(self):
        """Nothing was sent: hand the token back."""
        self.used = False


class Limiter:
    def __init__(self, store, registry=None, sleep=time.sleep, log=None, poll=2.0, max_wait=3600, holder=None):
        self.store, self.reg, self.sleep, self.poll, self.max_wait = store, registry, sleep, poll, max_wait
        self.log = log or (lambda m: print("limiter: " + m, flush=True))
        self.holder = holder or "%s:%d" % (os.environ.get("HOSTNAME", "host"), os.getpid())
        self.force = os.environ.get("SPX_FORCE_FETCH") == "1"       # an admin's "force": skip the cache, keep the queue
        self.stats = dict(hits=0, fetched=0, waited=0.0)
        self._held = threading.local()                  # sources this thread holds: a fetch() wraps a caller that takes its own slot per attempt

    def _spec(self, source):
        return SRC.require(source, self.reg)

    @contextlib.contextmanager
    def slot(self, source, label=""):
        spec = self._spec(source)                        # the terms gate: before anyone is queued
        held = self._held.__dict__.setdefault("s", set())
        if source in held:                               # already ours (fetch/fetch_many hold it): wait only for a penalty, take no second place
            while True:
                st, _, now = self.store.read(source)
                w = st.get("hold_until", 0) - now
                if w <= 0: break
                self.sleep(min(w, self.poll))
            yield Slot(0.0, 0)
            return
        ticket, clock, noted = [None], [None, None], [-1e9]       # clock: the store's time at the first look and at the latest
        me = self.holder

        def look(state, now):
            if clock[0] is None: clock[0] = now
            clock[1] = now
            new, ticket[0], res = step(state, now, spec, ticket[0], me, label or source)
            return new, res

        position = None
        try:
            while True:
                res = self.store.update(source, look, self.sleep)
                if res is None:
                    break
                ahead, eta = res
                if position is None: position = ahead
                now = clock[1]
                if now - clock[0] > self.max_wait:
                    raise LimiterTimeout("waited %d s for %s" % (now - clock[0], source))
                if now - noted[0] >= 15:
                    noted[0] = now
                    self.log("%s is busy: %d in line ahead of %s, about %d s" % (source, ahead, label or "this request", round(eta)))
                self.sleep(min(max(eta, 0.25), self.poll))
        except BaseException:
            if ticket[0] is not None:
                try: self.store.update(source, lambda st, now: (finish(st, now, spec, ticket[0]), None), self.sleep)
                except Exception: pass
            raise
        waited = clock[1] - clock[0]
        self.stats["waited"] += waited
        s = Slot(waited, position)
        held.add(source)
        try:
            yield s
        finally:
            held.discard(source)
            self.store.update(source, lambda st, now: (finish(st, now, spec, ticket[0], s.used, s.retry_after), None), self.sleep)

    def penalize(self, source, seconds):
        """A 429 or a Retry-After: nobody (any process) asks `source` for `seconds` seconds."""
        spec = self._spec(source)
        self.store.update(source, lambda st, now: (finish(st, now, spec, None, True, seconds), None), self.sleep)

    def _fresh(self, source, key, ttl):
        hit = self.store.cache_get(source, key)
        return hit[1] if hit is not None and hit[0] <= ttl else None

    def fetch(self, source, key, fn, ttl=None, force=None):
        """-> (value, from_cache). `fn()` makes ONE request and returns a JSON-able value; it runs inside the source's slot."""
        spec = self._spec(source)
        ttl = spec["ttl"] if ttl is None else ttl
        force = self.force if force is None else force
        if not force:
            v = self._fresh(source, key, ttl)
            if v is not None:
                self.stats["hits"] += 1
                return v, True
        with self.slot(source, key) as s:
            if not force:                                 # somebody fetched it while this caller waited
                v = self._fresh(source, key, ttl)
                if v is not None:
                    s.unused(); self.stats["hits"] += 1
                    return v, True
            v = fn()
            self.stats["fetched"] += 1
            self.store.cache_put(source, key, v)
            return v, False

    def fetch_many(self, source, keys, fn, ttl=None, force=None):
        """-> {key: value}. The keys the cache lacks are fetched together by ONE call `fn(missing_keys) -> {key: value}` (one request)."""
        spec = self._spec(source)
        ttl = spec["ttl"] if ttl is None else ttl
        force = self.force if force is None else force
        out, missing = {}, []
        for k in keys:
            v = None if force else self._fresh(source, k, ttl)
            if v is None: missing.append(k)
            else: out[k] = v; self.stats["hits"] += 1
        if not missing:
            return out
        with self.slot(source, "%d item(s), first %s" % (len(missing), missing[0])) as s:
            if not force:
                still = []
                for k in missing:
                    v = self._fresh(source, k, ttl)
                    if v is None: still.append(k)
                    else: out[k] = v; self.stats["hits"] += 1
                missing = still
                if not missing:
                    s.unused()
                    return out
            got = fn(missing)
            self.stats["fetched"] += 1
            for k in missing:
                if k in got:
                    self.store.cache_put(source, k, got[k]); out[k] = got[k]
        return out


_DEFAULT = [None]
USE_DS1 = [False]       # run.py sets it for --apply and --rehearse (the NAS jobs). A read-only run never writes DS1, not even this operational state.


def default(cache_dir=None, log=None):
    """The process's limiter: DS1 (jobs that write DS1: --apply, --rehearse) when it answers, else a lock file in the cache folder, else memory.
    SPX_LIMITER=ds1|file|memory forces one; a read-only run (a dry run, an agent's test) uses the lock file and never writes DS1."""
    if _DEFAULT[0] is not None:
        return _DEFAULT[0]
    log = log or (lambda m: print("limiter: " + m, flush=True))
    want = os.environ.get("SPX_LIMITER", "auto")
    store = None
    if want == "ds1" or (want == "auto" and USE_DS1[0]):
        try:
            store = Ds1Store(); store.ensure()
        except Exception as e:
            if want == "ds1": raise
            log("DS1 not reachable (%s): using a lock file, which only protects this machine" % str(e)[:120])
            store = None
    if store is None and want in ("auto", "file"):
        cache = cache_dir or os.path.expanduser(os.environ.get("SPX_DAILY_CACHE", "~/Library/Caches/spx-stats-daily"))
        store = FileStore(os.path.join(cache, "limiter.json"))
    if store is None:
        store = MemoryStore()
    _DEFAULT[0] = Limiter(store, log=log)
    return _DEFAULT[0]


def set_default(limiter):
    _DEFAULT[0] = limiter


def main(argv):
    if argv[:1] == ["status"]:
        for r in Ds1Store().status():
            st, now = r["state"], r["now"]
            q = st.get("queue") or []
            b = st.get("busy")
            print("%-12s busy: %s | queue: %d%s" % (r["source"], ("%s (%s) for %ds" % (b["h"], b["label"], now - b["since"])) if b and b["until"] > now else "no", len(q),
                                                    "".join("\n    %d. %s (%s) waiting %ds" % (i + 1, x["h"], x["label"], now - x["at"]) for i, x in enumerate(q))))
        return 0
    print(__doc__.strip().split("\n")[0]); return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
