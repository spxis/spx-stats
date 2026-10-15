#!/usr/bin/env python3
"""Stand-in for psql, used only by spx-raw-export-test.sh.

STUB_HOSTS   "host=mode ..." where mode is up, timeout, refused, noroute, noname or hang
STUB_FIXTURE JSON list of {"name", "data", optional "recorded_sha", optional "served"}
STUB_FLAKY   label (batch, list, fetch) whose first call fails with a timeout
STUB_NO_STATUS_TABLE  set: the status insert (ingest.raw_export_run) fails as if migration 105 were missing
STUB_LOG     file that gets one line per call (host, port, a short label: probe, list, batch or fetch), never the password
"""
import hashlib, json, os, re, sys, time

args = sys.argv[1:]
host = port = out = sql = None
i = 0
while i < len(args):
    a = args[i]
    if a == "-h": host = args[i + 1]; i += 2
    elif a == "-p": port = args[i + 1]; i += 2
    elif a == "-o": out = args[i + 1]; i += 2
    elif a == "-c": sql = args[i + 1]; i += 2
    elif a in ("-U", "-d", "-F", "-v"): i += 2
    else: i += 1

modes = dict(p.split("=", 1) for p in os.environ.get("STUB_HOSTS", "").split())
mode = modes.get(host, "refused")
if sql and sql.strip() == "select 1": label = "probe"
elif sql and "order by name" in sql: label = "list"
elif sql and "(name, sha256) in" in sql: label = "batch"
elif sql and "ingest.raw_export_run" in sql: label = "status"
else: label = "fetch"
with open(os.environ["STUB_LOG"], "a") as f:
    f.write("%s %s %s %s\n" % (host, port, label, mode))

def fail(msg):
    sys.stderr.write('psql: error: connection to server at "%s" failed: %s\n' % (host, msg)); sys.exit(2)

flaky = os.environ.get("STUB_FLAKY")  # e.g. "batch": the first call with that label times out, later ones work
if flaky == label and not os.path.exists(os.environ["STUB_LOG"] + ".flaky"):
    open(os.environ["STUB_LOG"] + ".flaky", "w").close(); fail("timeout expired")

if mode == "hang": time.sleep(60); sys.exit(0)
if mode == "timeout": time.sleep(1); fail("timeout expired")
if mode == "refused": fail("Connection refused")
if mode == "noroute": fail("No route to host")
if mode == "noname":
    sys.stderr.write('psql: error: could not translate host name "%s" to address: Name or service not known\n' % host); sys.exit(2)
if os.environ.get("PGPASSWORD") != "stubpw":
    fail('FATAL:  password authentication failed for user "postgres"')

rows = json.load(open(os.environ["STUB_FIXTURE"]))
for r in rows:
    r["bytes"] = r["data"].encode()
    r["sha"] = r.get("recorded_sha") or hashlib.sha256(r["bytes"]).hexdigest()

lines = []
if label == "probe":
    lines = ["1"]
elif label == "list":
    for r in sorted(rows, key=lambda r: r["name"]):
        h = r["name"].encode().hex()
        lines.append("|".join([h, "".join("\\x" + h[k:k + 2] for k in range(0, len(h), 2)), r["sha"], str(len(r["bytes"]))]))
elif label == "batch":
    want = re.findall(r"decode\('([0-9a-f]*)', 'hex'\), 'UTF8'\), '([0-9a-f]+)'", sql)
    assert want, sql
    for hexname, sha in want:
        name = bytes.fromhex(hexname).decode()
        for r in rows:
            if r["name"] == name and r["sha"] == sha:
                h = hexname
                esc = "".join("\\x" + h[k:k + 2] for k in range(0, len(h), 2))
                lines.append("|".join([h, esc, sha, r.get("served", r["data"]).encode().hex()]))
elif label == "status":
    if os.environ.get("STUB_NO_STATUS_TABLE"):
        sys.stderr.write('ERROR:  relation "ingest.raw_export_run" does not exist\n'); sys.exit(2)
    with open(os.environ["STUB_LOG"] + ".status", "a") as f:
        f.write(sql + "\n")
else:
    hexname = re.search(r"decode\('([0-9a-f]*)'", sql).group(1)
    sha = re.search(r"sha256 = '([0-9a-f]+)'", sql).group(1)
    name = bytes.fromhex(hexname).decode()
    for r in rows:
        if r["name"] == name and r["sha"] == sha:
            lines = [r.get("served", r["data"]).encode().hex()]
text = "".join(l + "\n" for l in lines)
if out:
    open(out, "w").write(text)
else:
    sys.stdout.write(text)
