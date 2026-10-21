#!/usr/bin/env python3
"""Read the saved All-Star Game articles (fetch.py, English Wikipedia, CC BY-SA 4.0) into rows, and write them as SQL for legacy_wikipedia_all_star (migration 144),
plus a JSON copy and a report.
Usage: parse.py <raw dir> <out.sql> [<out.json>]
Each league's list article gives the events (year, scores, venue, host, Most Valuable Players, why a game was not held); each game article adds the day (when the
list has none), the attendance and the rosters. A value the two disagree on keeps the list's and is written to `unparsed`. Nothing is guessed."""
import datetime, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import game  # noqa: E402
import lists  # noqa: E402


def sql_val(v):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, int):
        return str(v)
    if isinstance(v, datetime.date):
        return "'%s'" % v.isoformat()
    return "'" + str(v).replace("'", "''") + "'"


def read(raw, title):
    return open(os.path.join(raw, title.replace(" ", "_").replace("/", "_") + ".wikitext"), encoding="utf-8").read()


def build(raw, today=None):
    log = json.load(open(os.path.join(raw, "fetched.json")))
    pages, events, games, mvps, selections, unparsed = {}, [], [], [], [], []
    for lg, titles in lists.SOURCES.items():
        for title in titles:
            if title not in log:
                unparsed.append(dict(league=lg, year=None, what="list", detail="the list article %s was not fetched" % title))
                continue
            pages[title] = dict(title=title, kind="list", league=lg, revision_id=log[title]["revid"], fetched_on=log[title]["fetched"])
            evs, iss = lists.read_list(lg, read(raw, title), today)
            unparsed += [dict(league=lg, year=y, what=w, detail=d) for y, w, d in iss]
            for ev in evs:
                info, ros = {}, []
                if ev["article"]:
                    if ev["article"] in log:
                        pages[ev["article"]] = dict(title=ev["article"], kind="game", league=lg, revision_id=log[ev["article"]]["revid"], fetched_on=log[ev["article"]]["fetched"])
                        info, ros, gi = game.parse_game(read(raw, ev["article"]))
                        unparsed += [dict(league=lg, year=ev["year"], what=w, detail=d) for w, d in gi]
                    else:
                        unparsed.append(dict(league=lg, year=ev["year"], what="article", detail="the game article %s was not fetched" % ev["article"]))
                        ev["article"] = None
                # the list's values win; the article fills what the list does not print
                if info.get("first_day") and ev["played_on"] and info["first_day"] != ev["played_on"]:
                    unparsed.append(dict(league=lg, year=ev["year"], what="date", detail="list %s, game article %s: the list's is kept" % (ev["played_on"], info["first_day"])))
                if ev["played_on"] is None and ev["status"] == "played":
                    ev["played_on"], ev["last_day"] = info.get("first_day"), info.get("last_day")
                for k in ("venue_name", "venue_title", "city_text", "city_title", "attendance"):
                    if ev[k] is None and info.get(k) is not None:
                        ev[k] = info[k]
                if ev["status"] == "played" and ev["played_on"] is None:
                    unparsed.append(dict(league=lg, year=ev["year"], what="date", detail="no day found in the list or the game article"))
                if ev["format"] is None and any((g["stage"] or "").startswith(("semifinal", "round-robin")) for g in ev["games"]):
                    ev["format"] = "tournament"
                events.append(ev)
                for g in ev["games"]:
                    games.append(dict(league=lg, year=ev["year"], event_no=ev["event_no"], **g))
                for i, m in enumerate(ev["mvps"], 1):
                    mvps.append(dict(league=lg, year=ev["year"], event_no=ev["event_no"], seq=i, **m))
                for i, r in enumerate(ros, 1):
                    selections.append(dict(league=lg, year=ev["year"], event_no=ev["event_no"], seq=i, **r))
    return pages, events, games, mvps, selections, unparsed


EVENT_COLS = ["league", "year", "event_no", "article", "status", "status_reason", "format", "first_day", "last_day", "venue_name", "venue_title", "city_text",
              "city_title", "host_name", "host_title", "attendance"]
GAME_COLS = ["league", "year", "event_no", "game_no", "stage", "side1", "score1", "side2", "score2", "decided_by"]
MVP_COLS = ["league", "year", "event_no", "seq", "kind", "name", "title", "team_name"]
SEL_COLS = ["league", "year", "event_no", "seq", "side", "role", "grp", "position", "name", "title", "team_name", "team_title"]


def write_sql(path, pages, events, games, mvps, selections, unparsed):
    S = "legacy_wikipedia_all_star."
    with open(path, "w", encoding="utf-8") as f:
        f.write("-- generated by scripts/all_star/parse.py from the saved wikitext (CC BY-SA 4.0); rerunnable\n")
        for t in ("unparsed", "selection", "mvp", "game", "event", "page"):
            f.write("delete from %s%s;\n" % (S, t))
        for p in pages.values():
            f.write("insert into %spage (title, kind, league, revision_id, fetched_on) values (%s);\n" % (S, ", ".join(sql_val(p[c]) for c in ("title", "kind", "league", "revision_id", "fetched_on"))))
        for e in events:
            row = dict(e, first_day=e["played_on"])
            f.write("insert into %sevent (%s) values (%s);\n" % (S, ", ".join(EVENT_COLS), ", ".join(sql_val(row[c]) for c in EVENT_COLS)))
        for r in games:
            f.write("insert into %sgame (%s) values (%s);\n" % (S, ", ".join(GAME_COLS), ", ".join(sql_val(r[c]) for c in GAME_COLS)))
        for r in mvps:
            f.write("insert into %smvp (%s) values (%s);\n" % (S, ", ".join(MVP_COLS), ", ".join(sql_val(r[c]) for c in MVP_COLS)))
        for r in selections:
            row = dict(r, grp=r.get("group"))
            f.write("insert into %sselection (%s) values (%s);\n" % (S, ", ".join(SEL_COLS), ", ".join(sql_val(row[c]) for c in SEL_COLS)))
        for r in unparsed:
            f.write("insert into %sunparsed (league, year, what, detail) values (%s);\n" % (S, ", ".join(sql_val(r[c]) for c in ("league", "year", "what", "detail"))))


def main():
    raw, out_sql = os.path.expanduser(sys.argv[1]), os.path.expanduser(sys.argv[2])
    out_json = os.path.expanduser(sys.argv[3]) if len(sys.argv) > 3 else None
    pages, events, games, mvps, selections, unparsed = build(raw)
    write_sql(out_sql, pages, events, games, mvps, selections, unparsed)
    if out_json:
        json.dump(dict(events=events, games=games, mvps=mvps, selections=selections, unparsed=unparsed), open(out_json, "w"), indent=1, ensure_ascii=False, default=str)
    played = [e for e in events if e["status"] == "played"]
    print(len(events), "events (%d played)," % len(played), len(games), "games,", len(mvps), "MVPs,", len(selections), "roster lines,", len(unparsed), "notes in unparsed")
    by = {}
    for e in played:
        s = by.setdefault(e["league"], dict(events=0, day=0, mvp=0, roster=0))
        s["events"] += 1
        s["day"] += e["played_on"] is not None
        s["mvp"] += any(m["year"] == e["year"] and m["event_no"] == e["event_no"] and m["league"] == e["league"] for m in mvps)
        s["roster"] += any(m["year"] == e["year"] and m["event_no"] == e["event_no"] and m["league"] == e["league"] for m in selections)
    for lg, s in by.items():
        print("  %-5s %3d played, %3d with a day, %3d with an MVP, %3d with rosters" % (lg, s["events"], s["day"], s["mvp"], s["roster"]))


if __name__ == "__main__":
    main()
