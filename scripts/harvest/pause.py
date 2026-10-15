"""When the harvest must stand still: around the daily scores run, and while it (or a requested scores update) is running.

Four signals, checked at most every `pause_check_secs`:
  1. the clock: a window in local time (default 09:50-10:30 America/Toronto; the daily job starts at 10:00);
  2. the shared lock scripts/release/daily_lock.py (a Postgres advisory lock on DS1), probed and let go at once, never held;
  3. a `running` row in ingest.daily_run started in the last 30 minutes (the heartbeat of the scheduled daily job, which does not take the lock yet);
  4. the switch an admin sets on /admin/ops ("Pause harvester"): the release runner writes ingest.harvest_state key `ops_pause`
     (value {"by": ..., "at": ...}) and deletes it again on "Resume harvester". Checked first, so the reason names the admin.
"""
import importlib.util
import os
import time
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import db

HERE = os.path.dirname(os.path.abspath(__file__))
LOCK_PATH = os.path.join(HERE, "..", "release", "daily_lock.py")


def parse_window(text):
    """'09:50-10:30' -> (590, 630) minutes after local midnight; '' -> None (no window)."""
    if not text or "-" not in text:
        return None
    a, b = text.split("-", 1)
    h1, m1 = a.strip().split(":")
    h2, m2 = b.strip().split(":")
    return int(h1) * 60 + int(m1), int(h2) * 60 + int(m2)


def in_window(now_utc, window_text, tz_name):
    w = parse_window(window_text)
    if not w:
        return False
    local = now_utc.astimezone(ZoneInfo(tz_name))
    m = local.hour * 60 + local.minute
    s, e = w
    return (s <= m < e) if s <= e else (m >= s or m < e)


def lock_is_held():
    """True when another job holds the daily scores lock. Takes it only for an instant to find out."""
    spec = importlib.util.spec_from_file_location("daily_lock", LOCK_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    lock = mod.Lock()
    if lock.try_acquire():
        lock.release()
        return False
    return True


def daily_running():
    return bool(db.value("select exists (select 1 from ingest.daily_run where outcome = 'running' and started_at > now() - interval '30 minutes')"))


def ops_pause():
    """The admin's pause switch (ingest.harvest_state key ops_pause) as {"by", "at"}, or None when the harvester may run."""
    v = db.query_json("select value from ingest.harvest_state where key = 'ops_pause'")
    return v if isinstance(v, dict) else ({"by": "an admin", "at": None} if v else None)


class PauseGuard:
    """check() -> None when the harvest may go on, else a short reason. The DS1 signals are cached for `cfg.pause_check_secs`."""

    def __init__(self, cfg, lock_probe=lock_is_held, running_probe=daily_running, clock=time.monotonic, utcnow=lambda: datetime.now(timezone.utc),
                 switch_probe=ops_pause):
        self.cfg, self.lock_probe, self.running_probe, self.clock, self.utcnow = cfg, lock_probe, running_probe, clock, utcnow
        self.switch_probe = switch_probe
        self._at, self._reason = None, None

    def check(self):
        if in_window(self.utcnow(), self.cfg.pause_window, self.cfg.pause_tz):
            return "daily scores window %s %s" % (self.cfg.pause_window, self.cfg.pause_tz)
        t = self.clock()
        if self._at is None or t - self._at >= self.cfg.pause_check_secs:
            self._at = t
            try:
                flag = self.switch_probe()
                if flag:
                    self._reason = "paused from /admin/ops by %s%s" % (flag.get("by") or "an admin", (" at " + str(flag["at"])[:16]) if flag.get("at") else "")
                elif self.lock_probe():
                    self._reason = "daily scores lock held"
                elif self.running_probe():
                    self._reason = "daily scores run in progress"
                else:
                    self._reason = None
            except Exception as e:   # DS1 not answering: nothing can be done anyway
                self._reason = "DS1 not answering (%s)" % str(e)[:120]
        return self._reason
