#!/usr/bin/env python3
"""Filter the full Wikidata JSON dump down to sport people, sport events and sport items (Python 3 stdlib only).

The dump (latest-all.json.gz, about 150 GB gzipped) is one JSON array with one entity per line. It is streamed, never loaded whole,
and read-only. Wikidata is CC0. Nothing here writes to DS1 or production; load.py does that later, from the outputs.

  python3 -I filter.py extract DUMP OUTDIR [options]     people.jsonl.gz, events.jsonl.gz, items.jsonl.gz, summary.json
  python3 -I filter.py refs OUTDIR                       refs.txt.gz: every Q id the outputs point at (places, clubs, awards, sports)
  python3 -I filter.py labels DUMP OUTDIR [options]      second pass: labels.jsonl.gz for the ids in refs.txt.gz

What extract keeps (README.md has the full field list):
  people  a human (P31 = Q5) whose P106 is one of occupations.tsv AND who has P641 (sport). --rule occupation drops the P641 test,
          --rule sport drops the occupation test. Allow-list of properties only; sex or gender, ethnicity, religion, politics, health, family
          and every other property are never copied (FORBIDDEN below is checked at import, and by the tests on every output line).
  events  not a human, has P641 (sport) and either a date at day precision (P585, P580 or P582) or a winner (P1346).
  items   not a human, has P641, and not an event: clubs, leagues, venues, competitions, seasons (with their dates).

Restartable: outputs are gzip members appended in batches; every --checkpoint-every lines a state file records how many lines were read and
the size of each output. --resume truncates the outputs to those sizes and skips that many lines of the (gzip) stream, which costs
decompression time but no parsing. SIGINT and SIGTERM finish the batch, write the state and stop (exit 130).

Exit codes: 0 done (or stopped by --limit), 2 usage or refused to overwrite, 3 corrupt or truncated dump, 130 stopped by a signal.
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import multiprocessing
import os
import re
import shutil
import signal
import subprocess
import sys
import time
import uuid
from collections import Counter, deque
from dataclasses import dataclass, field
from itertools import islice
from pathlib import Path

VERSION = "1"  # bump when the output format or a rule changes
HERE = Path(__file__).resolve().parent
LANGS = ("en", "fr", "ja", "mul")
WIKIS = ("enwiki", "frwiki", "jawiki")
MAX_VALUES = 1000  # values kept per property; "x" in a document says how many there were when more
GREGORIAN = "Q1985727"

# ---- what is kept ------------------------------------------------------------------------------------------------------------------
# (property, qualifiers kept or None, single-valued: keep only the preferred statements when there are some)
PERSON_PROPS = (
    ("P569", None, True),                                      # date of birth
    ("P570", None, True),                                      # date of death
    ("P19", None, True),                                       # place of birth
    ("P20", None, True),                                       # place of death
    ("P27", None, False),                                      # country of citizenship
    ("P106", None, False),                                     # occupation (sensitive ones removed)
    ("P641", None, False),                                     # sport
    ("P54", ("P580", "P582", "P1350", "P1351"), False),        # member of sports team: start, end, matches played, goals
    ("P413", None, False),                                     # position played
    ("P166", ("P585", "P1346", "P805"), False),                # award received: when, winner, edition
    ("P1344", ("P1352",), False),                              # participant in: ranking
    ("P1000", None, False),                                    # record held
    ("P18", None, True),                                       # image (a Commons file name)
    ("P2048", None, True),                                     # height
    ("P2067", None, True),                                     # mass
    ("P742", None, False),                                     # pseudonym
    ("P1449", None, False),                                    # nickname
    ("P1532", None, False),                                    # country for sport
    ("P2416", None, False),                                    # sports discipline competed in
)
EVENT_PROPS = (
    ("P31", None, False), ("P641", None, False),
    ("P585", None, False), ("P580", None, False), ("P582", None, False),
    ("P1346", None, False), ("P710", None, False), ("P276", None, False), ("P17", None, False),
    ("P361", None, False), ("P3450", None, False), ("P1923", None, False),
)
ITEM_PROPS = (
    ("P31", None, False), ("P641", None, False), ("P17", None, False), ("P118", None, False), ("P361", None, False),
    ("P115", None, False), ("P571", None, True), ("P576", None, True),
    ("P3450", None, False), ("P585", None, False), ("P580", None, False), ("P582", None, False),  # a season: its league and its dates
)
LABEL_PROPS = (  # second pass: places, countries, teams and the rest that a person or an event points at
    ("P31", None, False), ("P17", None, False), ("P131", None, False),
    ("P297", None, True), ("P298", None, True), ("P300", None, False),
)
# external ids kept only with --ext-ids: this default is authority files, none of them a sports source. Never add ESPN or a
# Sports Reference id (AGENTS.md section 3), whatever the property says.
DEFAULT_EXT_IDS: tuple[str, ...] = ()
KNOWN_SAFE_EXT_IDS = ("P213", "P214", "P227", "P244")  # ISNI, VIAF, GND, Library of Congress

# sex or gender, ethnicity, religion, politics, health, sexuality, family: never copied. The kept lists above are an allow-list; this set
# is the second lock (import-time assertion, --ext-ids check, and the tests).
FORBIDDEN = frozenset({
    "P21", "P172", "P140", "P102", "P1038", "P26", "P40", "P22", "P25", "P3373", "P451", "P1290", "P1196", "P509", "P1050",
    "P91", "P1142", "P3342", "P1477", "P735", "P734", "P2650", "P1412", "P551", "P119", "P2632", "P69",
})


def _all_kept() -> set[str]:
    out: set[str] = set()
    for spec in (PERSON_PROPS, EVENT_PROPS, ITEM_PROPS, LABEL_PROPS):
        for p, quals, _ in spec:
            out.add(p)
            out.update(quals or ())
    return out


assert not (_all_kept() & FORBIDDEN), "a forbidden property is in the allow-list: " + str(_all_kept() & FORBIDDEN)

# free text can say what the properties may not (a description such as "Canadian female ice hockey player"); such a description is dropped
DESC_SENSITIVE_RE = re.compile(
    r"\b(male|female|men|women|man|woman|boy|boys|girl|girls|gay|lesbian|bisexual|transgender|trans|queer|lgbt\w*|non-?binary|intersex|"
    r"christian|catholic|muslim|jewish|islamic|buddhist|hindu|sikh|atheist|religious|pastor|priest|activist|husband|wife|spouse|"
    r"(son|daughter|father|mother|brother|sister|nephew|niece|cousin|grandson|granddaughter|grandfather|grandmother) of|brother|sister|"
    r"cancer|disease|suicide|murdered|illness|depression|disabled|hiv|aids|ethnic)\b",
    re.I,
)
QID_FIRST = b'{"type":"item","id":"Q'
HUMAN_TAG = b'"id":"Q5"'
P641_TAG = b'"P641"'
P106_TAG = b'"P106"'
TIME_RE = re.compile(r"^[+-][0-9]{1,16}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$")
DAY_RE = re.compile(r"^\+([0-9]{4,16})-([0-9]{2})-([0-9]{2})T")
AMOUNT_RE = re.compile(r"^[+-]?[0-9]+(\.[0-9]+)?$")
ID_RE = re.compile(rb'"id":"Q([0-9]+)"')


# ---- small helpers ------------------------------------------------------------------------------------------------------------------
def is_qid(s: object) -> bool:
    return isinstance(s, str) and len(s) > 1 and s[0] == "Q" and s[1:].isdigit()


def live(claims: dict, prop: str) -> list[dict]:
    out = claims.get(prop)
    if not isinstance(out, list):
        return []
    return [c for c in out if isinstance(c, dict) and c.get("rank") != "deprecated"]


def best(stmts: list[dict]) -> list[dict]:
    pref = [c for c in stmts if c.get("rank") == "preferred"]
    return pref or stmts


def val(snak: object):
    """The compact value of a snak, or None (unknown value, no value, a type we do not keep)."""
    if not isinstance(snak, dict) or snak.get("snaktype") != "value":
        return None
    dv = snak.get("datavalue")
    if not isinstance(dv, dict):
        return None
    v, t = dv.get("value"), dv.get("type")
    if t == "wikibase-entityid":
        i = v.get("id") if isinstance(v, dict) else None
        return i if is_qid(i) else None
    if t == "string":
        return v[:500] if isinstance(v, str) and v else None
    if t == "monolingualtext":
        x = v.get("text") if isinstance(v, dict) else None
        return x[:500] if isinstance(x, str) and x else None
    if t == "time":
        if not isinstance(v, dict):
            return None
        tm, p = v.get("time"), v.get("precision")
        if not isinstance(tm, str) or not TIME_RE.match(tm) or not isinstance(p, int) or isinstance(p, bool) or not 0 <= p <= 14:
            return None
        cal = v.get("calendarmodel")
        cal = cal.rsplit("/", 1)[-1] if isinstance(cal, str) else ""
        return {"t": tm, "p": p, "c": cal if is_qid(cal) else GREGORIAN}
    if t == "quantity":
        if not isinstance(v, dict):
            return None
        a = v.get("amount")
        if not isinstance(a, str) or not AMOUNT_RE.match(a):
            return None
        out = {"a": a}
        u = v.get("unit")
        if isinstance(u, str) and u.startswith("http"):
            u = u.rsplit("/", 1)[-1]
            if is_qid(u):
                out["u"] = u
        return out
    return None


def day_time(d: object) -> bool:
    """A compact time value that names one day of a year after 0: precision 11 or finer, and a real month and day."""
    if not isinstance(d, dict) or d.get("p", 0) < 11:
        return False
    m = DAY_RE.match(d.get("t", ""))
    return bool(m) and m.group(1).strip("0") != "" and m.group(2) != "00" and m.group(3) != "00"


def qualifiers(stmt: dict, spec: tuple[str, ...]) -> dict:
    qs = stmt.get("qualifiers")
    if not isinstance(qs, dict):
        return {}
    out = {}
    for qp in spec:
        vals = []
        for s in qs.get(qp) or ():
            st = s.get("snaktype") if isinstance(s, dict) else None
            if st == "value":
                v = val(s)
                if v is not None:
                    vals.append(v)
            elif st == "novalue":
                vals.append({"nv": 1})
            elif st == "somevalue":
                vals.append({"sv": 1})
        if vals:
            out[qp] = vals
    return out


def collect(claims: dict, prop: str, quals, single: bool, extra: dict, drop: frozenset = frozenset()):
    stmts = live(claims, prop)
    if single:
        stmts = best(stmts)
    out, seen = [], set()
    for c in stmts:
        v = val(c.get("mainsnak"))
        if v is None or (isinstance(v, str) and v in drop):
            continue
        if quals is None:
            e = v
        else:
            e = {"v": v}
            q = qualifiers(c, quals)
            if q:
                e["q"] = q
        key = e if isinstance(e, str) else json.dumps(e, sort_keys=True)
        if key in seen:
            continue
        seen.add(key)
        out.append(e)
    if len(out) > MAX_VALUES:
        extra[prop] = len(out)
        out = out[:MAX_VALUES]
    return out


def lang_values(ent: dict, field_name: str, langs: tuple[str, ...]) -> dict:
    src = ent.get(field_name)
    out = {}
    if isinstance(src, dict):
        for lang in langs:
            x = src.get(lang)
            if isinstance(x, dict) and isinstance(x.get("value"), str) and x["value"]:
                out[lang] = x["value"][:300]
    return out


def sitelinks(ent: dict) -> dict:
    s = ent.get("sitelinks")
    if not isinstance(s, dict):
        return {"n": 0}
    out = {"n": len(s)}
    for w in WIKIS:
        x = s.get(w)
        if isinstance(x, dict) and isinstance(x.get("title"), str):
            out[w] = x["title"]
    return out


def read_occupations(path: Path) -> tuple[frozenset, frozenset]:
    use, drop = set(), set()
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line or line.startswith("#") or line.startswith("qid\t"):
            continue
        parts = line.split("\t")
        if len(parts) < 4 or not is_qid(parts[0]):
            continue
        (use if parts[3] == "1" else drop).add(parts[0])
    return frozenset(use), frozenset(drop)


# ---- configuration (picklable: it goes to the workers) ---------------------------------------------------------------------------------
@dataclass
class Cfg:
    mode: str = "extract"                 # extract | labels
    rule: str = "strict"                  # strict | occupation | sport
    outputs: tuple[str, ...] = ("people", "events", "items")
    descriptions: bool = True
    ext_ids: tuple[str, ...] = ()
    occ_use: frozenset = field(default_factory=frozenset)
    occ_drop: frozenset = field(default_factory=frozenset)
    wanted: bytes = b""                   # labels mode: bitmap of the ids to label


def options_of(cfg: Cfg, occ_sha: str) -> dict:
    return {"mode": cfg.mode, "rule": cfg.rule, "outputs": list(cfg.outputs), "descriptions": cfg.descriptions,
            "ext_ids": list(cfg.ext_ids), "occupations_sha256": occ_sha, "version": VERSION}


# ---- one entity -> output lines ------------------------------------------------------------------------------------------------------
def build(ent: dict, claims: dict, props, cfg: Cfg, stats: Counter, desc: bool) -> dict:
    d: dict = {"id": ent["id"]}
    labs = lang_values(ent, "labels", LANGS)
    if labs:
        d["l"] = labs
    if desc and cfg.descriptions:
        en = lang_values(ent, "descriptions", ("en",)).get("en")
        if en:
            if DESC_SENSITIVE_RE.search(en):
                stats["description_dropped_sensitive"] += 1
            else:
                d["d"] = en
    d["sl"] = sitelinks(ent)
    extra: dict = {}
    for prop, quals, single in props:
        drop = cfg.occ_drop if prop == "P106" else frozenset()
        vals = collect(claims, prop, quals, single, extra, drop)
        if prop == "P106":
            stats["occupation_values_dropped"] += sum(1 for c in live(claims, "P106") if val(c.get("mainsnak")) in cfg.occ_drop)
        if vals:
            d[prop] = vals
    if extra:
        d["x"] = extra
    return d


def process_extract(ent: dict, cfg: Cfg, out: dict, stats: Counter) -> None:
    claims = ent.get("claims")
    if not isinstance(claims, dict):
        return
    p31 = [val(c.get("mainsnak")) for c in live(claims, "P31")]
    sports = [s for s in (val(c.get("mainsnak")) for c in live(claims, "P641")) if s]
    if "Q5" in p31:
        if "people" not in cfg.outputs:
            return
        occ_hit = any(val(c.get("mainsnak")) in cfg.occ_use for c in live(claims, "P106"))
        ok = {"strict": occ_hit and bool(sports), "occupation": occ_hit, "sport": bool(sports)}[cfg.rule]
        if not ok:
            if occ_hit or sports:
                stats["human_not_matched"] += 1
            return
        props = PERSON_PROPS + tuple((p, None, False) for p in cfg.ext_ids)
        out["people"].append(build(ent, claims, props, cfg, stats, True))
        stats["people"] += 1
        for s in set(sports):
            stats[f"people|{s}"] += 1
        return
    if not sports:
        return
    times = [val(c.get("mainsnak")) for p in ("P585", "P580", "P582") for c in live(claims, p)]
    dated = any(day_time(t) for t in times)
    winner = any(val(c.get("mainsnak")) for c in live(claims, "P1346"))
    kind = "events" if (dated or winner) else "items"
    if kind not in cfg.outputs:
        return
    out[kind].append(build(ent, claims, EVENT_PROPS if kind == "events" else ITEM_PROPS, cfg, stats, False))
    stats[kind] += 1
    for s in set(sports):
        stats[f"{kind}|{s}"] += 1


def process_labels(ent: dict, cfg: Cfg, out: dict, stats: Counter) -> None:
    claims = ent.get("claims") if isinstance(ent.get("claims"), dict) else {}
    out["labels"].append(build(ent, claims, LABEL_PROPS, cfg, stats, False))
    stats["labels"] += 1


def handle_batch(cfg: Cfg, n_lines: int, matched: list) -> dict:
    out = {name: [] for name in (cfg.outputs if cfg.mode == "extract" else ("labels",))}
    stats: Counter = Counter()
    bad: list[int] = []
    fn = process_extract if cfg.mode == "extract" else process_labels
    for lineno, raw in matched:
        raw = raw.rstrip()
        if raw.endswith(b","):
            raw = raw[:-1]
        try:
            ent = json.loads(raw)
        except (ValueError, UnicodeDecodeError):
            stats["malformed"] += 1
            bad.append(lineno)
            continue
        if not isinstance(ent, dict) or not is_qid(ent.get("id")) or ent.get("type") not in (None, "item"):
            stats["not_an_item"] += 1
            continue
        fn(ent, cfg, out, stats)
    return {"n_lines": n_lines, "out": {k: [json.dumps(d, ensure_ascii=False, separators=(",", ":")) for d in v] for k, v in out.items()},
            "stats": dict(stats), "bad": bad}


_CFG: Cfg | None = None


def _init(cfg: Cfg) -> None:
    global _CFG
    _CFG = cfg
    signal.signal(signal.SIGINT, signal.SIG_IGN)


def _run(task):
    n_lines, matched = task
    return handle_batch(_CFG, n_lines, matched)


# ---- bitmap of Q numbers (labels pass, refs) ------------------------------------------------------------------------------------------
class Bitmap:
    def __init__(self, data: bytes = b"") -> None:
        self.a = bytearray(data)

    def add(self, n: int) -> None:
        b = n >> 3
        if b >= len(self.a):
            self.a.extend(bytes(b + 1 - len(self.a) + (1 << 20)))
        self.a[b] |= 1 << (n & 7)

    def has(self, n: int) -> bool:
        b = n >> 3
        return b < len(self.a) and bool(self.a[b] >> (n & 7) & 1)

    def numbers(self):
        a = self.a
        for b, byte in enumerate(a):
            if byte:
                for bit in range(8):
                    if byte >> bit & 1:
                        yield b * 8 + bit

    def minus(self, other: "Bitmap") -> "Bitmap":
        out = Bitmap(bytes(self.a))
        for i in range(min(len(out.a), len(other.a))):
            out.a[i] &= ~other.a[i] & 0xFF
        return out


# ---- reading the dump -----------------------------------------------------------------------------------------------------------------
class Source:
    """The dump's lines. gzip -dc in a second process when it exists (decompression is the slow part), else Python's gzip."""

    def __init__(self, path: Path, how: str) -> None:
        self.path, self.size = path, path.stat().st_size
        self.f = open(path, "rb")
        self.proc = None
        gz = path.name.endswith(".gz")
        if not gz:
            self.stream = self.f
        elif how in ("auto", "gzip") and shutil.which("gzip"):
            self.proc = subprocess.Popen(["gzip", "-dc"], stdin=self.f, stdout=subprocess.PIPE, bufsize=1 << 20)
            self.stream = self.proc.stdout
        elif how == "gzip":
            raise SystemExit("--decompress gzip: no gzip program on PATH")
        else:
            self.stream = gzip.GzipFile(fileobj=self.f, mode="rb")

    def fraction(self) -> float:
        try:
            return min(1.0, os.lseek(self.f.fileno(), 0, os.SEEK_CUR) / self.size) if self.size else 0.0
        except OSError:
            return 0.0

    def close(self) -> bool:
        """True when the stream ended cleanly."""
        ok = True
        if self.proc is not None:
            self.proc.stdout.close()
            ok = self.proc.wait() == 0
        self.f.close()
        return ok


def prefilter(cfg: Cfg):
    if cfg.mode == "labels":
        bm = Bitmap(cfg.wanted)

        def wanted(line: bytes) -> bool:
            if line.startswith(QID_FIRST):
                j = line.find(b'"', 22)
                num = line[22:j]
            else:
                m = ID_RE.search(line, 0, 300)
                num = m.group(1) if m else b""
            return num.isdigit() and bm.has(int(num))
        return wanted
    people_any = cfg.rule == "occupation"

    def candidate(line: bytes) -> bool:
        if P641_TAG in line:
            return True
        return people_any and HUMAN_TAG in line and P106_TAG in line
    return candidate


def batches(source: Source, cfg: Cfg, start: int, limit: int | None, size: int, stop_flag: list, info: dict):
    """Yield (n_lines, [(line number, line)]) with only the lines that pass the cheap byte test."""
    keep = prefilter(cfg)
    lineno = start
    n, matched = 0, []
    for line in source.stream:
        lineno += 1
        if line[:1] != b"{":
            s = line.strip()
            if s == b"]":
                info["saw_end"] = True
            elif s not in (b"[", b""):
                info["malformed"] += 1
                if len(info["bad"]) < 20:
                    info["bad"].append(lineno)
        elif keep(line):
            matched.append((lineno, line))
        n += 1
        if n >= size:
            yield n, matched
            n, matched = 0, []
            if stop_flag[0]:
                return
        if limit is not None and lineno >= limit:
            break
    if n:
        yield n, matched


# ---- outputs, state --------------------------------------------------------------------------------------------------------------------
class Outputs:
    def __init__(self, outdir: Path, names: list[str], sizes: dict | None) -> None:
        self.paths = {n: outdir / f"{n}.jsonl.gz" for n in names}
        self.buf: dict[str, list[str]] = {n: [] for n in names}
        self.bytes = 0
        self.files = {}
        for n, p in self.paths.items():
            if sizes is None:
                p.write_bytes(b"")
            else:
                with open(p, "ab"):
                    pass
                os.truncate(p, sizes.get(n, 0))
            self.files[n] = open(p, "ab")

    def add(self, name: str, lines: list[str]) -> None:
        self.buf[name].extend(lines)
        self.bytes += sum(len(x) + 1 for x in lines)

    def flush(self, sync: bool = False) -> dict:
        for n, lines in self.buf.items():
            if lines:
                data = ("\n".join(lines) + "\n").encode("utf-8")
                self.files[n].write(gzip.compress(data, 6, mtime=0))
                self.buf[n] = []
        self.bytes = 0
        sizes = {}
        for n, f in self.files.items():
            f.flush()
            if sync:
                os.fsync(f.fileno())
            sizes[n] = f.tell()
        return sizes

    def close(self) -> None:
        for f in self.files.values():
            f.close()


def write_json(path: Path, obj: object) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(obj, indent=1, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(tmp, path)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def fmt_n(n: int) -> str:
    return f"{n:,}"


# ---- the pass ------------------------------------------------------------------------------------------------------------------------------
def run_pass(args, cfg: Cfg, dump: Path, outdir: Path, out_names: list[str]) -> int:
    mode = cfg.mode
    outdir.mkdir(parents=True, exist_ok=True)
    state_path = outdir / f"{mode}.state.json"
    summary_path = outdir / ("summary.json" if mode == "extract" else "labels-summary.json")
    occ_sha = hashlib.sha256((HERE / "occupations.tsv").read_bytes()).hexdigest() if mode == "extract" else ""
    opts = options_of(cfg, occ_sha)
    st = dump.stat()
    ident = {"name": dump.name, "bytes": st.st_size, "mtime_ns": st.st_mtime_ns}
    existing = [outdir / f"{n}.jsonl.gz" for n in out_names]

    if args.fresh:
        for p in existing + [state_path, summary_path]:
            p.unlink(missing_ok=True)
    state = None
    if state_path.exists():
        if not args.resume:
            print(f"{state_path.name} exists: use --resume to continue or --fresh to start again (deletes the outputs)", file=sys.stderr)
            return 2
        state = json.loads(state_path.read_text(encoding="utf-8"))
        if state.get("options") != opts:
            print("the options or occupations.tsv changed since the state was written; use --fresh", file=sys.stderr)
            return 2
        if state.get("dump") != ident and not args.ignore_identity:
            print("the dump file is not the one the state was written for (name, size, mtime); --ignore-identity to go on", file=sys.stderr)
            return 2
        if state.get("done"):
            print(f"already complete ({fmt_n(state['lines'])} lines); nothing to do. Use --fresh to run again.")
            return 0
    elif any(p.exists() and p.stat().st_size for p in existing):
        print("outputs exist but there is no state file; use --fresh to overwrite them", file=sys.stderr)
        return 2

    start_lines = state["lines"] if state else 0
    stats: Counter = Counter(state["stats"]) if state else Counter()
    info = {"malformed": state["malformed_lines"] if state else 0, "bad": list(state["bad"]) if state else [], "saw_end": False}
    bad_examples: list[int] = list(state["bad_examples"]) if state else []
    elapsed_before = state["elapsed"] if state else 0.0
    run_key = state["run_key"] if state else uuid.uuid4().hex
    started_at = state["started_at"] if state else time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    outs = Outputs(outdir, out_names, state["sizes"] if state else None)

    stop = [False]

    def on_signal(signum, _frame):
        stop[0] = True
        print(f"signal {signum}: finishing the batch, writing the state, stopping", file=sys.stderr, flush=True)
    signal.signal(signal.SIGINT, on_signal)
    signal.signal(signal.SIGTERM, on_signal)

    source = Source(dump, args.decompress)
    t0 = time.time()
    if start_lines:
        print(f"resuming: skipping {fmt_n(start_lines)} lines", file=sys.stderr, flush=True)
        deque(islice(source.stream, start_lines), maxlen=0)
    t_read, frac0 = time.time(), source.fraction()
    lines_done = start_lines
    last_ckpt = last_prog = start_lines
    pool = None
    if args.workers > 1:
        pool = multiprocessing.get_context("spawn").Pool(args.workers, initializer=_init, initargs=(cfg,))
    pending: deque = deque()

    def settle(res: dict) -> None:
        nonlocal lines_done, last_ckpt, last_prog
        lines_done += res["n_lines"]
        for k, lines in res["out"].items():
            outs.add(k, lines)
        stats.update(res["stats"])
        bad_examples.extend(res["bad"][: max(0, 20 - len(bad_examples))])
        if outs.bytes > (8 << 20):
            outs.flush()
        if lines_done - last_prog >= args.progress_every:
            last_prog = lines_done
            el = elapsed_before + time.time() - t0
            frac = source.fraction()
            eta = (f", about {int((time.time() - t_read) / (frac - frac0) * (1 - frac) / 60)} min left"
                   if frac - frac0 > 0.001 else "")
            got = ", ".join(f"{k} {fmt_n(stats[k])}" for k in out_names)
            print(f"[{mode}] {fmt_n(lines_done)} lines, {frac * 100:.1f}% of the file{eta}; {got}; "
                  f"{int((lines_done - start_lines) / max(1e-9, time.time() - t_read)):,} lines/s; {int(el // 60)} min", file=sys.stderr, flush=True)
        if lines_done - last_ckpt >= args.checkpoint_every:
            checkpoint(done=False)

    def checkpoint(done: bool) -> None:
        sizes = outs.flush(sync=True)
        write_json(state_path, {
            "options": opts, "dump": ident, "run_key": run_key, "started_at": started_at, "lines": lines_done, "stats": dict(stats),
            "malformed_lines": info["malformed"], "bad": info["bad"], "bad_examples": bad_examples, "sizes": sizes,
            "elapsed": elapsed_before + time.time() - t0, "done": done,
        })
        nonlocal last_ckpt
        last_ckpt = lines_done

    try:
        for n_lines, matched in batches(source, cfg, start_lines, args.limit, args.batch_lines, stop, info):
            if pool is None:
                settle(handle_batch(cfg, n_lines, matched))
            else:
                pending.append(pool.apply_async(_run, ((n_lines, matched),)))
                while len(pending) >= args.workers * 3:
                    settle(pending.popleft().get())
        while pending:
            settle(pending.popleft().get())
    except (EOFError, OSError, gzip.BadGzipFile) as e:
        print(f"the dump could not be read to the end: {e}", file=sys.stderr)
        checkpoint(done=False)
        return 3
    finally:
        if pool is not None:
            pool.close()
            pool.join()
    clean = source.close()
    if stop[0]:
        checkpoint(done=False)
        print(f"stopped at line {fmt_n(lines_done)}; rerun with --resume", file=sys.stderr)
        return 130
    if args.limit is None and not clean:
        print("gzip reported an error: the dump is corrupt or cut short (state kept; the outputs hold what was read)", file=sys.stderr)
        checkpoint(done=False)
        return 3
    reached_end = bool(info["saw_end"]) and args.limit is None
    checkpoint(done=args.limit is None)
    outs.close()

    by_sport: dict[str, dict[str, int]] = {}
    counts = {}
    for k, v in stats.items():
        if "|" in k:
            kind, sport = k.split("|", 1)
            by_sport.setdefault(kind, {})[sport] = v
        elif k in out_names:
            counts[k] = v
    for n in out_names:
        counts.setdefault(n, 0)
    summary = {
        "tool": "scripts/wikidata_dump/filter.py", "version": VERSION, "mode": mode, "run_key": run_key,
        "started_at": started_at, "finished_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "elapsed_seconds": round(elapsed_before + time.time() - t0, 1),
        "dump": {**ident, "md5": args.dump_md5 or None, "sha256": args.dump_sha256 or None, "path": args.dump_path or None},
        "options": opts, "limit": args.limit, "complete": reached_end,
        "lines": lines_done, "malformed_lines": info["malformed"] + stats.get("malformed", 0), "malformed_examples": bad_examples + info["bad"][:20],
        "counts": counts,
        "dropped": {k: stats[k] for k in ("human_not_matched", "not_an_item", "description_dropped_sensitive", "occupation_values_dropped") if stats.get(k)},
        "by_sport": {k: dict(sorted(v.items(), key=lambda kv: -kv[1])) for k, v in sorted(by_sport.items())},
        "files": {p.name: {"bytes": p.stat().st_size, "sha256": sha256_file(p)} for p in existing},
    }
    write_json(summary_path, summary)
    print(f"done: {fmt_n(lines_done)} lines in {summary['elapsed_seconds']} s; "
          + ", ".join(f"{k} {fmt_n(v)}" for k, v in counts.items()) + f"; {summary_path.name} written"
          + ("" if reached_end or mode == "labels" else " (limit reached before the end of the dump)"), file=sys.stderr)
    return 0


# ---- refs ---------------------------------------------------------------------------------------------------------------------------------
SKIP_KEYS = frozenset({"id", "l", "d", "sl", "t", "a", "u", "c", "x", "p", "nv", "sv"})


def walk_refs(o: object, add) -> None:
    if isinstance(o, str):
        if is_qid(o):
            add(int(o[1:]))
    elif isinstance(o, list):
        for x in o:
            walk_refs(x, add)
    elif isinstance(o, dict):
        for k, v in o.items():
            if k not in SKIP_KEYS:
                walk_refs(v, add)


def read_lines_gz(path: Path):
    with gzip.open(path, "rb") as f:
        yield from f


def cmd_refs(outdir: Path) -> int:
    own, refs = Bitmap(), Bitmap()
    files = [outdir / f"{n}.jsonl.gz" for n in ("people", "events", "items")]
    files = [p for p in files if p.exists()]
    if not files:
        print(f"no outputs in {outdir}", file=sys.stderr)
        return 2
    for p in files:
        for line in read_lines_gz(p):
            d = json.loads(line)
            own.add(int(d["id"][1:]))
            walk_refs(d, refs.add)
    want = refs.minus(own)
    n = 0
    with gzip.open(outdir / "refs.txt.gz", "wt", encoding="ascii", compresslevel=6) as out:
        for num in want.numbers():
            out.write(f"Q{num}\n")
            n += 1
    print(f"refs.txt.gz: {fmt_n(n)} ids that the outputs point at and that are not in them")
    return 0


def load_wanted(path: Path) -> bytes:
    bm = Bitmap()
    opener = gzip.open if path.name.endswith(".gz") else open
    with opener(path, "rt", encoding="ascii") as f:
        for line in f:
            line = line.strip()
            if is_qid(line):
                bm.add(int(line[1:]))
    return bytes(bm.a)


# ---- CLI ------------------------------------------------------------------------------------------------------------------------------------
def parse_args(argv: list[str]):
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0], formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    def engine(p: argparse.ArgumentParser) -> None:
        p.add_argument("dump", type=Path)
        p.add_argument("outdir", type=Path)
        p.add_argument("--limit", type=int, help="read only the first N lines (tests)")
        p.add_argument("--resume", action="store_true", help="continue from the state file")
        p.add_argument("--fresh", action="store_true", help="delete earlier outputs and state, start again")
        p.add_argument("--ignore-identity", action="store_true", help="resume although the dump file's size or mtime changed")
        p.add_argument("--workers", type=int, default=1, help="parsing processes (default 1; decompression is the slow part)")
        p.add_argument("--decompress", choices=("auto", "gzip", "python"), default="auto")
        p.add_argument("--progress-every", type=int, default=1_000_000)
        p.add_argument("--checkpoint-every", type=int, default=5_000_000)
        p.add_argument("--batch-lines", type=int, default=20_000)
        p.add_argument("--dump-md5", help="recorded in summary.json")
        p.add_argument("--dump-sha256", help="recorded in summary.json")
        p.add_argument("--dump-path", help="recorded in summary.json: where the dump lives, relative to the NAS docker folder")

    ex = sub.add_parser("extract", help="people, events, items")
    engine(ex)
    ex.add_argument("--rule", choices=("strict", "occupation", "sport"), default="strict")
    ex.add_argument("--outputs", default="people,events,items")
    ex.add_argument("--no-descriptions", action="store_true", help="leave the English description out of people")
    ex.add_argument("--ext-ids", default=",".join(DEFAULT_EXT_IDS), help="external id properties to keep (default none); never ESPN or Sports Reference ids")
    ex.add_argument("--occupations", type=Path, default=HERE / "occupations.tsv")
    rf = sub.add_parser("refs", help="ids the outputs point at")
    rf.add_argument("outdir", type=Path)
    lb = sub.add_parser("labels", help="second pass: labels of the ids in refs.txt.gz")
    engine(lb)
    lb.add_argument("--wanted", type=Path, help="default OUTDIR/refs.txt.gz")
    return ap.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    if args.cmd == "refs":
        return cmd_refs(args.outdir)
    if not args.dump.is_file():
        print(f"no such dump file: {args.dump}", file=sys.stderr)
        return 2
    if args.cmd == "extract":
        outputs = tuple(x for x in args.outputs.split(",") if x)
        bad = [x for x in outputs if x not in ("people", "events", "items")]
        ext = tuple(x for x in args.ext_ids.split(",") if x)
        bad_ext = [x for x in ext if x in FORBIDDEN or not re.fullmatch(r"P[0-9]+", x)]
        if bad or not outputs or bad_ext:
            print(f"bad --outputs {bad} or --ext-ids {bad_ext} (forbidden or not a property)", file=sys.stderr)
            return 2
        use, drop = read_occupations(args.occupations)
        if not use:
            print("occupations.tsv holds no occupation with use=1", file=sys.stderr)
            return 2
        cfg = Cfg("extract", args.rule, outputs, not args.no_descriptions, ext, use, drop)
        return run_pass(args, cfg, args.dump, args.outdir, list(outputs))
    wanted = args.wanted or args.outdir / "refs.txt.gz"
    if not wanted.is_file():
        print(f"no {wanted}: run `filter.py refs {args.outdir}` first", file=sys.stderr)
        return 2
    cfg = Cfg("labels", wanted=load_wanted(wanted))
    return run_pass(args, cfg, args.dump, args.outdir, ["labels"])


if __name__ == "__main__":
    sys.exit(main())
