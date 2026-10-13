"""python3 -I scripts/nhlapi/test_guard.py   (no network: each NHL fetch script must refuse before any request)"""
import os, subprocess, sys, tempfile
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
WANT = "NHL endpoints are not used for new requests: AGENTS.md section 3"
cases = [
    ["scripts/nhlapi/fetch.py"],
    ["scripts/nhlapi/fetch.py", "--first", "1"],
    ["scripts/players/nhl_fetch.py", "RAWDIR"],
    ["scripts/team_stats/fetch.py", "--source", "nhl", "--raw", "RAWDIR"],
]
with tempfile.TemporaryDirectory() as tmp:
    for c in cases:
        args = [tmp if a == "RAWDIR" else a for a in c]
        # the environment points every proxy at a dead port, so a request that slipped past the guard could not succeed quietly
        env = dict(os.environ, HTTPS_PROXY="http://127.0.0.1:9", HTTP_PROXY="http://127.0.0.1:9")
        p = subprocess.run([sys.executable, "-I", os.path.join(ROOT, args[0])] + args[1:], capture_output=True, text=True, cwd=tmp, env=env, timeout=30)
        assert p.returncode != 0 and WANT in p.stderr, (c, p.returncode, p.stderr)
        assert os.listdir(tmp) == [], (c, os.listdir(tmp))   # and it wrote nothing
print("ok: all NHL fetch scripts refuse")
