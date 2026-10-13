#!/usr/bin/env python3
"""One lock for every job that runs the daily scores update (scripts/daily/run.py --apply) against DS1.

The lock is a Postgres advisory lock on DS1, held by one idle psql session for as long as the job runs. It lives in the database,
so it works between containers (the release runner and the scheduled daily job are separate containers on the NAS), and it frees
itself if the holder dies, because the session ends. Standard library only; needs psql and the PG* settings of DS1.

  as a command:  python3 -I scripts/release/daily_lock.py [--wait SECONDS] -- <command> [arguments]
                 runs the command while holding the lock and exits with the command's exit code; exit 75 when the lock stayed taken.
  as a module:   lock = Lock(); lock.try_acquire() -> True or False; lock.release()

The scheduled daily job takes it by running its command this way (see scripts/release/README.md, "Score update requests").
"""
import os
import subprocess
import sys
import time

KEY = 7243907711  # the one agreed key; never reuse it for another lock
BUSY = 75


class Lock:
    def __init__(self, dsn=None, env=None):
        self.dsn = dsn
        self.env = dict(os.environ if env is None else env, PGCONNECT_TIMEOUT="15")
        self.proc = None

    def try_acquire(self):
        """True when this session now holds the lock, False when somebody else does. Raises when DS1 cannot be reached."""
        if self.proc:
            return True
        cmd = ["psql", "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1"] + ([self.dsn] if self.dsn else [])
        proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=self.env)
        try:
            proc.stdin.write("select pg_try_advisory_lock(%d);\n" % KEY)
            proc.stdin.flush()
            answer = proc.stdout.readline().strip()
        except OSError:
            answer = ""
        if answer == "t":
            self.proc = proc
            return True
        try:
            proc.stdin.close()
        except OSError:
            pass
        err = proc.stderr.read().strip()[:300]
        proc.wait(timeout=30)
        if answer == "f":
            return False
        raise RuntimeError("DS1: could not ask for the lock: %s" % (err or "no answer"))

    def release(self):
        if self.proc:
            try:
                self.proc.stdin.close()
                self.proc.wait(timeout=30)
            except (OSError, subprocess.TimeoutExpired):
                self.proc.kill()
            self.proc = None


def main(argv):
    wait = 0
    args = list(argv)
    if args[:1] == ["--wait"] and len(args) > 1:
        wait, args = int(args[1]), args[2:]
    if args[:1] == ["--"]:
        args = args[1:]
    if not args:
        print(__doc__.strip().split("\n")[0], file=sys.stderr)
        return 2
    lock = Lock()
    deadline = time.time() + wait
    while not lock.try_acquire():
        if time.time() >= deadline:
            print("daily_lock: another scores update is running; not starting", file=sys.stderr)
            return BUSY
        time.sleep(15)
    try:
        return subprocess.run(args).returncode
    finally:
        lock.release()


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
