#!/usr/bin/env python3
"""Upload raw source files to Dropbox, any size, binary included.

  dropbox_put.py <file> <source> [<date>]    -> /Backups/spx-stats/raw/<source>/<date>/<file name>
  dropbox_put.py --from-archive [--dry-run] [--min-bytes N] [--source S]
      exports legacy_files.raw_archive rows that Dropbox does not hold yet
      (default: only rows of 100 KB or more; use --min-bytes 0 for all).

Credentials come from the environment only (never printed):
  DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN
Optional: DROPBOX_ROOT_NAMESPACE (only if the account root is a team namespace
that differs from the home namespace); PGHOST/PGPORT/PGUSER/PGDATABASE for
--from-archive (defaults: /tmp, 55432, postgres, spx_stats).

Create-only: an existing path is never overwritten. Same content is reported as
"already there"; different content is reported as a CONFLICT and skipped (exit 1).
Standard library only. The date defaults to today (UTC).
"""
import argparse
import base64
import datetime
import hashlib
import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

BASE = "/Backups/spx-stats/raw"
BLOCK = 4 * 1024 * 1024            # Dropbox content-hash block size
SINGLE_MAX = 150 * 1024 * 1024     # above this, use an upload session
CHUNK = 16 * BLOCK                 # 64 MB per session append
_token = {"value": None, "expires": 0.0}


def need(name):
    v = os.environ.get(name)
    if not v:
        sys.exit(f"missing env var {name} (see AGENTS.md)")
    return v


def access_token():
    if _token["value"] and time.time() < _token["expires"] - 60:
        return _token["value"]
    cred = base64.b64encode(f"{need('DROPBOX_APP_KEY')}:{need('DROPBOX_APP_SECRET')}".encode()).decode()
    data = urllib.parse.urlencode(
        {"grant_type": "refresh_token", "refresh_token": need("DROPBOX_REFRESH_TOKEN")}).encode()
    req = urllib.request.Request("https://api.dropbox.com/oauth2/token", data, {"Authorization": "Basic " + cred})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            j = json.load(r)
    except urllib.error.HTTPError as e:
        sys.exit(f"Dropbox token refresh failed: HTTP {e.code} (check the three DROPBOX_* variables)")
    _token["value"] = j["access_token"]
    _token["expires"] = time.time() + j.get("expires_in", 14400)
    return _token["value"]


def headers(extra):
    h = {"Authorization": "Bearer " + access_token()}
    ns = os.environ.get("DROPBOX_ROOT_NAMESPACE")
    if ns:
        h["Dropbox-API-Path-Root"] = json.dumps({".tag": "root", "root": ns})
    h.update(extra)
    return h


def call(url, hdr, body=b"", tries=4):
    for n in range(tries):
        try:
            req = urllib.request.Request(url, body, headers(hdr))
            with urllib.request.urlopen(req, timeout=300) as r:
                raw = r.read()
            return json.loads(raw) if raw else {}
        except urllib.error.HTTPError as e:
            text = e.read().decode("utf-8", "replace")
            if e.code in (429, 500, 502, 503, 504) and n < tries - 1:
                time.sleep(2 ** n * 2)
                continue
            raise RuntimeError(f"HTTP {e.code}: {text[:300]}")
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            if n < tries - 1:
                time.sleep(2 ** n * 2)
                continue
            raise RuntimeError(f"network error: {e}")


def api(endpoint, obj):
    return call("https://api.dropboxapi.com/2/" + endpoint,
                {"Content-Type": "application/json"}, json.dumps(obj).encode())


def content_hash_bytes(data):
    h = hashlib.sha256()
    for i in range(0, len(data), BLOCK):
        h.update(hashlib.sha256(data[i:i + BLOCK]).digest())
    return h.hexdigest()


def content_hash_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            b = f.read(BLOCK)
            if not b:
                break
            h.update(hashlib.sha256(b).digest())
    return h.hexdigest()


def remote_hash(path):
    try:
        return api("files/get_metadata", {"path": path}).get("content_hash")
    except RuntimeError as e:
        if "not_found" in str(e):
            return None
        raise


def upload(read_chunk, size, path, local_hash):
    """read_chunk(n) returns the next n bytes. Returns a status string."""
    existing = remote_hash(path)
    if existing is not None:
        if existing == local_hash:
            return "already there"
        return "CONFLICT (exists with different content, not overwritten)"
    octet = {"Content-Type": "application/octet-stream"}
    arg = {"path": path, "mode": "add", "autorename": False, "mute": True}
    if size <= SINGLE_MAX:
        meta = call("https://content.dropboxapi.com/2/files/upload",
                    dict(octet, **{"Dropbox-API-Arg": json.dumps(arg)}), read_chunk(size))
    else:
        first = call("https://content.dropboxapi.com/2/files/upload_session/start",
                     dict(octet, **{"Dropbox-API-Arg": json.dumps({"close": False})}), read_chunk(CHUNK))
        sid, offset = first["session_id"], CHUNK
        while size - offset > CHUNK:
            a = {"cursor": {"session_id": sid, "offset": offset}, "close": False}
            call("https://content.dropboxapi.com/2/files/upload_session/append_v2",
                 dict(octet, **{"Dropbox-API-Arg": json.dumps(a)}), read_chunk(CHUNK))
            offset += CHUNK
        a = {"cursor": {"session_id": sid, "offset": offset}, "commit": arg}
        meta = call("https://content.dropboxapi.com/2/files/upload_session/finish",
                    dict(octet, **{"Dropbox-API-Arg": json.dumps(a)}), read_chunk(size - offset))
    if meta.get("content_hash") != local_hash:
        return "FAILED verification (content hash differs)"
    return "uploaded, hash verified"


def is_bad(status):
    return status.startswith(("CONFLICT", "FAILED"))


def put_file(local, source, date):
    size = os.path.getsize(local)
    path = f"{BASE}/{source}/{date}/{os.path.basename(local)}"
    with open(local, "rb") as f:
        status = upload(f.read, size, path, content_hash_file(local))
    print(f"{path} ({size} bytes): {status}")
    return not is_bad(status)


def split_name(name, saved_on):
    m = re.match(r"^([^/]+)/(\d{4}-\d\d-\d\d)/(.+)$", name)
    if m:
        return m.group(1), m.group(2), m.group(3)
    # bare name such as nhlapi-raw-2026-10-10.tgz: source is its first word
    return re.split(r"[-_.]", name)[0], str(saved_on), name


def psql(sql):
    env = dict(os.environ)
    env.setdefault("PGHOST", "/tmp")
    env.setdefault("PGPORT", "55432")
    env.setdefault("PGUSER", "postgres")
    env.setdefault("PGDATABASE", "spx_stats")
    r = subprocess.run(["psql", "-At", "-F", "\t", "-c", sql], env=env, capture_output=True, text=True)
    if r.returncode:
        sys.exit("psql failed: " + r.stderr.strip()[:300])
    return r.stdout


def from_archive(a):
    rows = psql("select name, saved_on from legacy_files.raw_archive "
                f"where length(data) >= {int(a.min_bytes)} order by name").splitlines()
    done = skipped = bad = 0
    for line in rows:
        name, saved_on = line.split("\t")
        source, date, rel = split_name(name, saved_on)
        if a.source and source != a.source:
            continue
        path = f"{BASE}/{source}/{date}/{rel}"
        if a.dry_run:
            print("would check", path)
            continue
        quoted = name.replace("'", "''")
        data = bytes.fromhex(psql(f"select encode(data,'hex') from legacy_files.raw_archive where name = '{quoted}'").strip())
        pos = [0]

        def read_chunk(n, data=data, pos=pos):
            out = data[pos[0]:pos[0] + n]
            pos[0] += n
            return out

        status = upload(read_chunk, len(data), path, content_hash_bytes(data))
        print(f"{path} ({len(data)} bytes): {status}")
        if is_bad(status):
            bad += 1
        elif status == "already there":
            skipped += 1
        else:
            done += 1
    print(f"archive export: {done} uploaded, {skipped} already there, {bad} problems")
    return bad == 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("args", nargs="*", help="<file> <source> [<date>]")
    ap.add_argument("--from-archive", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--min-bytes", type=int, default=102400)
    ap.add_argument("--source")
    a = ap.parse_args()
    if a.from_archive:
        ok = from_archive(a)
    else:
        if len(a.args) not in (2, 3):
            ap.error("usage: dropbox_put.py <file> <source> [<date>]")
        local, source = a.args[0], a.args[1]
        date = a.args[2] if len(a.args) == 3 else datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")
        if not os.path.isfile(local):
            sys.exit(f"no such file: {local}")
        ok = put_file(local, source, date)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
