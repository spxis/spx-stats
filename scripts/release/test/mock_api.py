#!/usr/bin/env python3
"""A stand-in for the Supabase Management API query endpoint, for tests only. It runs each query text on a local
Postgres with psql in one transaction (the way a multi-statement text runs on the real API) and answers with the rows.

    python3 -I mock_api.py PORT "host=127.0.0.1 port=55432 user=postgres dbname=..." [CONTROL_FILE]

A query whose text starts with the wrapper ApiSide.run uses is answered as [{"j": <json>}]. Any other query returns
[{"j": <last output line>}] when its last output line is JSON, else []. A failed query answers HTTP 400 {"message": ...}.
CONTROL_FILE (JSON, read on every request) can hold {"drop_after_commit": "<regex>"}: a query matching it is run, then
answered with HTTP 500, as if the answer had been lost on the way back.
Like the real API, its sessions print floats with 15 digits (extra_float_digits 0), so a float read through it is rounded.
Bearer token: the value of MOCK_TOKEN (default "test").
"""
import json
import os
import re
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

DSN = sys.argv[2]
CONTROL = sys.argv[3] if len(sys.argv) > 3 else None
TOKEN = os.environ.get("MOCK_TOKEN", "test")


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def reply(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        if self.headers.get("Authorization") != "Bearer " + TOKEN:
            return self.reply(401, {"message": "bad token"})
        if not self.path.endswith("/database/query"):
            return self.reply(404, {"message": "no such endpoint"})
        query = json.loads(self.rfile.read(int(self.headers["Content-Length"])))["query"]
        r = subprocess.run(["psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-1", DSN, "-f", "-"],
                           input=query, capture_output=True, text=True,
                           env=dict(os.environ, PGOPTIONS="-c extra_float_digits=0"))
        if r.returncode != 0:
            return self.reply(400, {"message": r.stderr.strip()})
        if CONTROL and os.path.exists(CONTROL):
            rule = json.load(open(CONTROL)).get("drop_after_commit")
            if rule and re.search(rule, query):
                return self.reply(500, {"message": "answer lost"})
        lines = [x for x in r.stdout.splitlines() if x.strip()]
        for text in (r.stdout.strip(), lines[-1] if lines else ""):
            try:
                return self.reply(200, [{"j": json.loads(text)}])
            except ValueError:
                pass
        return self.reply(200, [])


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1])), Handler).serve_forever()
