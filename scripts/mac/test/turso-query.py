#!/usr/bin/env python3
"""Run one statement on a libSQL server's HTTP pipeline (the scratch Turso stand-in of same-data-test.sh).
    python3 -I scripts/mac/test/turso-query.py http://127.0.0.1:7741 "create table t (id integer)"
Exit 0 when the statement worked, 1 when the server refused it."""
import json
import sys
import urllib.request

body = {"requests": [{"type": "execute", "stmt": {"sql": sys.argv[2]}}, {"type": "close"}]}
req = urllib.request.Request(sys.argv[1] + "/v2/pipeline", data=json.dumps(body).encode(),
                             headers={"Content-Type": "application/json"}, method="POST")
res = json.loads(urllib.request.urlopen(req, timeout=10).read())
sys.exit(0 if res["results"][0]["type"] == "ok" else 1)
