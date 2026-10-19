#!/usr/bin/env python3
"""Write, check and list hand-off files and replies (standard library only). Docs: scripts/handoff/README.md.

  handoff.py check FILE...                  validate hand-off files against handoff.schema.json (exit 1 on any problem)
  handoff.py write FILE                     validate, then put it at <dir>/<ticket-id>.json
  handoff.py list [--json] [--ticket ID]    hand-offs waiting in <dir> (not done/, replies/, examples/)
  handoff.py sql FILE                       the one read-only SQL that checks a hand-off's migration objects on production
  handoff.py set-status TICKET STATUS [--release N]
  handoff.py done TICKET                    move <dir>/<ticket>.json to <dir>/done/
  handoff.py reply TICKET --status S --by WHO --detail TEXT [--version SHA] [--deployment X] [--release N]
                      [--checked TEXT]... [--change TEXT]      append one entry to replies/<ticket>.json
  handoff.py replies [--json] [--ticket ID] unread replies (replies/*.json)
  handoff.py read TICKET                    move a handled reply to replies/read/ (a later reply continues its history)
  handoff.py dir                            print the hand-off folder

Folder: $SPX_HANDOFF_DIR, else ~/Library/CloudStorage/Dropbox/Projects/Handoff/<project> (project: $SPX_HANDOFF_PROJECT, default spx-stats).
Exit: 0 ok, 1 invalid or refused, 2 usage or missing folder, 3 no Dropbox folder (cloud session: see the README).
"""
import argparse
import datetime
import json
import os
import re
import shutil
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.environ.get("SPX_HANDOFF_PROJECT", "spx-stats")
RESERVED = ("ROLES.json", "FREEZE.json")   # coordination files (coord.py) share the folder; they are not hand-offs
SECRET_RES = [
    re.compile(r"(?i)\b(password|passwd|token|secret|api[_-]?key)\b\s*[:=]\s*[^\s\"']{8,}"),
    re.compile(r"eyJ[A-Za-z0-9_-]{20,}"),
    re.compile(r"\bsbp_[A-Za-z0-9]{16,}"),
    re.compile(r"(?i)postgres(ql)?://[^\s/]*:[^\s/@]*@"),
    re.compile(r"(^|[^0-9.])(10\.\d{1,3}|192\.168|172\.(1[6-9]|2\d|3[01])|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7]))\.\d{1,3}\.\d{1,3}($|[^0-9])"),
    re.compile(r"/Users/[A-Za-z0-9_.-]+"),
]


def handoff_dir():
    d = os.environ.get("SPX_HANDOFF_DIR")
    if d:
        return d
    return os.path.expanduser("~/Library/CloudStorage/Dropbox/Projects/Handoff/" + PROJECT)


def need_dir(create=False):
    d = handoff_dir()
    if not os.path.isdir(d):
        parent = os.path.dirname(d)
        if create and os.path.isdir(parent):
            os.makedirs(d, exist_ok=True)
        else:
            print("no hand-off folder at %s (no Dropbox folder on this machine: validate with `check`, then upload the text with the "
                  "Dropbox connector to /Projects/Handoff/%s/<ticket-id>.json; see scripts/handoff/README.md)" % (d, PROJECT), file=sys.stderr)
            sys.exit(3)
    return d


def load_schema(name):
    with open(os.path.join(HERE, name)) as f:
        return json.load(f)


def _type_ok(v, t):
    if t == "string":
        return isinstance(v, str)
    if t == "integer":
        return isinstance(v, int) and not isinstance(v, bool)
    if t == "boolean":
        return isinstance(v, bool)
    if t == "array":
        return isinstance(v, list)
    if t == "object":
        return isinstance(v, dict)
    return True


def validate(v, schema, path="$"):
    """Small JSON Schema subset: type enum pattern minLength maxLength minItems items required properties additionalProperties."""
    errs = []
    t = schema.get("type")
    if t and not _type_ok(v, t):
        return ["%s: must be %s" % (path, t)]
    if "enum" in schema and v not in schema["enum"]:
        errs.append("%s: must be one of %s" % (path, ", ".join(map(str, schema["enum"]))))
    if isinstance(v, str):
        if "pattern" in schema and not re.search(schema["pattern"], v):
            errs.append("%s: %r does not match %s" % (path, v if len(v) < 60 else v[:60] + "...", schema["pattern"]))
        if len(v) < schema.get("minLength", 0):
            errs.append("%s: shorter than %d" % (path, schema["minLength"]))
        if len(v) > schema.get("maxLength", 10**9):
            errs.append("%s: longer than %d" % (path, schema["maxLength"]))
    if isinstance(v, list):
        if len(v) < schema.get("minItems", 0):
            errs.append("%s: needs at least %d item(s)" % (path, schema["minItems"]))
        for i, x in enumerate(v):
            if "items" in schema:
                errs += validate(x, schema["items"], "%s[%d]" % (path, i))
    if isinstance(v, dict):
        for k in schema.get("required", []):
            if k not in v:
                errs.append("%s: missing %s" % (path, k))
        props = schema.get("properties", {})
        for k, x in v.items():
            if k in props:
                errs += validate(x, props[k], "%s.%s" % (path, k))
            elif schema.get("additionalProperties") is False:
                errs.append("%s: unknown field %s" % (path, k))
    return errs


def walk_strings(v):
    if isinstance(v, str):
        yield v
    elif isinstance(v, list):
        for x in v:
            yield from walk_strings(x)
    elif isinstance(v, dict):
        for x in v.values():
            yield from walk_strings(x)


def semantic(h):
    errs = []
    st = h.get("status")
    if st == "needs-decision":
        d = h.get("decision")
        if not d:
            errs.append("needs-decision requires a decision (question, options, recommendation)")
        elif d.get("recommendation") not in [o.get("id") for o in d.get("options", [])]:
            errs.append("decision.recommendation must be the id of one of the options")
    if st == "blocked" and not h.get("blocked_reason"):
        errs.append("blocked requires blocked_reason")
    if st in ("ready", "data-applied-not-released", "deployed", "released") and not h.get("commits"):
        errs.append("%s requires at least one commit" % st)
    if st == "data-applied-not-released" and not h.get("release_tables"):
        errs.append("data-applied-not-released requires release_tables")
    if h.get("site_only") and (h.get("ds1_steps") or h.get("release_tables") or h.get("migrations") or h.get("turso_tables")):
        errs.append("site_only is true but migrations, ds1_steps, release_tables or turso_tables are listed")
    if h.get("kind") == "package" and not h.get("package"):
        errs.append("kind package requires package {name, dir, tag}")
    if h.get("kind") == "data" and st == "ready" and not (h.get("ds1_steps") or h.get("release_tables")):
        errs.append("kind data and ready requires ds1_steps or release_tables")
    for s in walk_strings(h):
        for r in SECRET_RES:
            if r.search(s):
                errs.append("looks like a secret, private address or home path (never put these in a hand-off): %r" % s[:40])
                break
    return errs


def check_handoff(h):
    return validate(h, load_schema("handoff.schema.json")) or semantic(h)


def read_json(path):
    with open(path) as f:
        return json.load(f)


def write_json(path, obj):
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)
        f.write("\n")
    os.replace(tmp, path)


def now():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def waiting(d, ticket=None):
    out = []
    for n in sorted(os.listdir(d)):
        p = os.path.join(d, n)
        if not n.endswith(".json") or not os.path.isfile(p) or n in RESERVED:
            continue
        if ticket and n != ticket + ".json":
            continue
        try:
            h = read_json(p)
        except ValueError as e:
            out.append({"ticket_id": n[:-5], "status": "invalid", "title": "unreadable JSON: %s" % e, "_errors": [str(e)]})
            continue
        errs = check_handoff(h)
        if errs:
            h = dict(h)
            h["_errors"] = errs
        out.append(h)
    return out


def sql_for(h):
    """One query: a row per migration object with ok true/false. Names are validated by the schema pattern, so they are safe to inline."""
    parts = []
    for m in h.get("migrations", []):
        for o in m["objects"]:
            kind, name = o.split(":", 1) if ":" in o else ("table", o)
            if kind == "function":
                parts.append("select '%s' as object, to_regprocedure('%s') is not null as ok" % (o, name))
            elif kind == "column":
                if name.count(".") != 2:
                    sys.exit("column object needs schema.table.column: " + o)
                sch, tab, col = name.split(".")
                parts.append("select '%s' as object, exists (select 1 from information_schema.columns where table_schema = '%s' and table_name = '%s' and column_name = '%s') as ok" % (o, sch, tab, col))
            else:
                parts.append("select '%s' as object, to_regclass('%s') is not null as ok" % (o, name))
    return " union all ".join(parts)


def cmd_check(a):
    bad = 0
    for f in a.files:
        try:
            h = read_json(f)
        except (OSError, ValueError) as e:
            print("%s: %s" % (f, e))
            bad += 1
            continue
        errs = check_handoff(h)
        if errs:
            bad += 1
            print("%s: INVALID" % f)
            for e in errs:
                print("  " + e)
        else:
            print("%s: ok (%s, %s)" % (f, h["ticket_id"], h["status"]))
    return 1 if bad else 0


def cmd_write(a):
    h = read_json(a.file)
    errs = check_handoff(h)
    if errs:
        print("\n".join(["INVALID:"] + ["  " + e for e in errs]), file=sys.stderr)
        return 1
    if h["project"] != PROJECT:
        print("project is %s, this folder is for %s" % (h["project"], PROJECT), file=sys.stderr)
        return 1
    d = need_dir(create=True)
    dest = os.path.join(d, h["ticket_id"] + ".json")
    write_json(dest, h)
    print("wrote " + dest)
    return 0


def cmd_list(a):
    items = waiting(need_dir(), a.ticket)
    if a.json:
        print(json.dumps(items))
        return 0
    if not items:
        print("no waiting hand-offs")
    for h in items:
        print("%-12s %-27s %s  %s" % (h.get("status"), h.get("ticket_id"), h.get("kind", "-"), h.get("title", "")))
        for e in h.get("_errors", []):
            print("    INVALID: " + e)
    return 0


def cmd_sql(a):
    h = read_json(a.file)
    errs = check_handoff(h)
    if errs:
        print("\n".join(errs), file=sys.stderr)
        return 1
    print(sql_for(h))
    return 0


def cmd_set_status(a):
    d = need_dir()
    p = os.path.join(d, a.ticket + ".json")
    h = read_json(p)
    h["status"] = a.status
    if a.release:
        h["release"] = a.release
    errs = check_handoff(h)
    if errs:
        print("\n".join(errs), file=sys.stderr)
        return 1
    write_json(p, h)
    return 0


def cmd_done(a):
    d = need_dir()
    p = os.path.join(d, a.ticket + ".json")
    os.makedirs(os.path.join(d, "done"), exist_ok=True)
    shutil.move(p, os.path.join(d, "done", a.ticket + ".json"))
    return 0


def cmd_reply(a):
    d = need_dir()
    rdir = os.path.join(d, "replies")
    os.makedirs(os.path.join(rdir, "read"), exist_ok=True)
    p = os.path.join(rdir, a.ticket + ".json")
    old = os.path.join(rdir, "read", a.ticket + ".json")
    if os.path.exists(p):
        doc = read_json(p)
    elif os.path.exists(old):
        doc = read_json(old)
    else:
        doc = {"schema_version": 1, "project": PROJECT, "ticket_id": a.ticket, "history": []}
    entry = {"at": now(), "from": a.by, "status": a.status, "detail": a.detail}
    for k, v in (("version", a.version), ("deployment", a.deployment), ("release", a.release), ("change_requested", a.change)):
        if v:
            entry[k] = v
    if a.checked:
        entry["checked"] = a.checked
    last = doc["history"][-1] if doc["history"] else None
    if last and all(last.get(k) == entry.get(k) for k in ("from", "status", "detail", "version", "deployment", "release")) and os.path.exists(p):
        print("same as the last reply; not added")
        return 0
    doc["history"].append(entry)
    errs = validate(doc, load_schema("reply.schema.json"))
    for e in entry.values():
        for s in walk_strings(e):
            if any(r.search(s) for r in SECRET_RES):
                errs.append("reply looks like it holds a secret, private address or home path")
    if errs:
        print("\n".join(["INVALID reply:"] + errs), file=sys.stderr)
        return 1
    write_json(p, doc)
    if os.path.exists(old):
        os.remove(old)
    print("reply %s: %s" % (a.ticket, a.status))
    return 0


def cmd_replies(a):
    rdir = os.path.join(need_dir(), "replies")
    docs = []
    if os.path.isdir(rdir):
        for n in sorted(os.listdir(rdir)):
            if n.endswith(".json") and (not a.ticket or n == a.ticket + ".json"):
                docs.append(read_json(os.path.join(rdir, n)))
    if a.json:
        print(json.dumps(docs))
        return 0
    if not docs:
        print("no unread replies")
    for doc in docs:
        e = doc["history"][-1]
        print("%s  %s  %s from %s at %s" % (doc["ticket_id"], e["status"].upper(), e.get("version", ""), e["from"], e["at"]))
        print("    " + e["detail"])
        if e.get("change_requested"):
            print("    change requested: " + e["change_requested"])
        print("    (%d entries; `handoff.py read %s` when handled)" % (len(doc["history"]), doc["ticket_id"]))
    return 0


def cmd_read(a):
    rdir = os.path.join(need_dir(), "replies")
    p = os.path.join(rdir, a.ticket + ".json")
    if not os.path.exists(p):
        print("no unread reply for " + a.ticket)
        return 0
    os.makedirs(os.path.join(rdir, "read"), exist_ok=True)
    shutil.move(p, os.path.join(rdir, "read", a.ticket + ".json"))
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("check"); s.add_argument("files", nargs="+"); s.set_defaults(f=cmd_check)
    s = sub.add_parser("write"); s.add_argument("file"); s.set_defaults(f=cmd_write)
    s = sub.add_parser("list"); s.add_argument("--json", action="store_true"); s.add_argument("--ticket"); s.set_defaults(f=cmd_list)
    s = sub.add_parser("sql"); s.add_argument("file"); s.set_defaults(f=cmd_sql)
    s = sub.add_parser("set-status"); s.add_argument("ticket"); s.add_argument("status"); s.add_argument("--release"); s.set_defaults(f=cmd_set_status)
    s = sub.add_parser("done"); s.add_argument("ticket"); s.set_defaults(f=cmd_done)
    s = sub.add_parser("reply"); s.add_argument("ticket")
    s.add_argument("--status", required=True); s.add_argument("--by", required=True); s.add_argument("--detail", required=True)
    s.add_argument("--version"); s.add_argument("--deployment"); s.add_argument("--release"); s.add_argument("--change")
    s.add_argument("--checked", action="append"); s.set_defaults(f=cmd_reply)
    s = sub.add_parser("replies"); s.add_argument("--json", action="store_true"); s.add_argument("--ticket"); s.set_defaults(f=cmd_replies)
    s = sub.add_parser("read"); s.add_argument("ticket"); s.set_defaults(f=cmd_read)
    s = sub.add_parser("dir"); s.set_defaults(f=lambda a: print(handoff_dir()) or 0)
    a = ap.parse_args()
    sys.exit(a.f(a))


if __name__ == "__main__":
    main()
