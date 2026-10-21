#!/usr/bin/env python3
"""Fetch the English Wikipedia article "Major League Baseball schedule" (CC BY-SA 4.0): the announced length of each season by league.
One request, an identified User-Agent (the same polite fetcher as scripts/stanley_cup_final/fetch.py). A file already in the folder is not fetched again.
Usage: fetch.py <raw dir>     e.g. ~/Projects/backups/spx-stats/raw/wikipedia_mlb_schedule/2026-10-20
Writes Major_League_Baseball_schedule.wikitext and fetched.json."""
import datetime, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "stanley_cup_final"))
import fetch as F  # noqa: E402

TITLE = "Major League Baseball schedule"


def main():
    out = os.path.expanduser(sys.argv[1])
    os.makedirs(out, exist_ok=True)
    name = TITLE.replace(" ", "_")
    path = os.path.join(out, name + ".wikitext")
    if os.path.exists(path):
        return
    got = F.page(TITLE)
    if got is None:
        raise SystemExit("404 " + TITLE)
    text, rev = got
    open(path, "w", encoding="utf-8").write(text)
    json.dump({TITLE: {"url": "https://en.wikipedia.org/wiki/" + name, "fetched": datetime.date.today().isoformat(), **rev}}, open(os.path.join(out, "fetched.json"), "w"), indent=1)
    print("ok", TITLE, len(text))


if __name__ == "__main__":
    main()
