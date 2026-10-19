#!/usr/bin/env python3
"""Home venues for club seasons that have none, from the "stadium" field of the club-season article's infobox (English Wikipedia, CC BY-SA 4.0).

  from_infobox.py --refilter db/seed/home_venue.csv    re-apply the venue rules below to the rows already in the seed
  from_infobox.py OUT_DIR            writes OUT_DIR/home_venue_infobox.csv (rows for db/seed/home_venue.csv) and OUT_DIR/report.txt
                                     OUT_DIR also keeps title_qid.json, the answers of the one batched Wikipedia query that turns each venue article into its Wikidata id

Which seasons: the team seasons of the NFL, AFL and AAFC (the club-season articles scripts/nfl/season.py archived in legacy_files.raw_archive as
'wikipedia-<league>/<year>/team/<year>_<club>_season.wikitext') that no period of core.franchise_home_venue covers on 1 July of the season, found with
read-only selects through scripts/daily/ds1.sh (HOME_VENUE_PSQL, a command that reads SQL on stdin and prints rows, points it at another database).
Nothing is written to DS1.

Rules (nothing is guessed):
  * the venue is the first article the infobox's stadium field links; an infobox naming two venues (the Packers at Green Bay and Milwaukee) gives the first
    and the row's note says so; no link ("Traveling team", empty) leaves the season without a venue, listed in the report.
  * the venue's Wikidata id comes from the article's page properties. A venue the seed names that core.venue lacks is logged by step 198 and fetched with
    scripts/game_venue/ (ids.py --new, fetch.py, load.py) before it counts.
  * consecutive seasons of one club at one venue are one row, from 1 January of the first season to 1 January after the last; the franchise is named as the
    identity of those years names it (step 198 matches it exactly); a row whose franchise name fits no franchise or more than one in those years is not written.
Source credit: English Wikipedia, CC BY-SA 4.0 (text by the articles' editors).
"""
import base64, csv, json, os, re, subprocess, sys, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DS1 = os.path.join(HERE, "..", "daily", "ds1.sh")
UA = {"User-Agent": "spx-stats/0.1 (https://github.com/spxis/spx-stats)"}
LEAGUES = ("nfl", "afl", "aafc")


def sql(q):
    cmd = os.environ["HOME_VENUE_PSQL"].split() if os.environ.get("HOME_VENUE_PSQL") else ["bash", DS1, "-q", "-At", "-F", "\t", "-f", "-"]
    p = subprocess.run(cmd, input=q, text=True, capture_output=True, env={**os.environ, "PGOPTIONS": "-c default_transaction_read_only=on"})
    if p.returncode: sys.exit(p.stderr[-1500:])
    return [l.split("\t") for l in p.stdout.splitlines() if l]


GAPS = """
select se.league_code, se.start_year, ts.team_season_id, api.team_name(ts.team_season_id), ts.franchise_id
from core.team_season ts join core.season se using (season_id)
where se.league_code in ('nfl', 'afl', 'aafc')
  and not exists (select 1 from core.franchise_home_venue h where h.franchise_id = ts.franchise_id
                  and h.valid_during && daterange(make_date(se.start_year, 7, 1), make_date(se.start_year, 7, 2)))
order by 1, 4, 2;
"""
PAGES = """
select name, replace(encode(data, 'base64'), E'\\n', '') from legacy_files.raw_archive
where name ~ '^wikipedia-(nfl|afl|aafc)/[0-9]{4}/team/[0-9]{4}_.*_season[.]wikitext$';
"""
# Venue articles whose Wikidata item is not the venue (checked against the items fetched with scripts/game_venue/fetch.py): left out, listed in the report.
NOT_THE_VENUE = {"Q7836037": "the article 'Traveling team' is a concept, not a ground", "Q975275": "'League Field' redirects to the team's article (a team item)",
                 "Q5337815": "'Edgerton Park' resolves to the New Haven park, not Rochester's", "Q1033335": "'Canisius College' is the university's item, not its field",
                 "Q5308065": "'Driving Park' is the Columbus neighbourhood's item, not the park"}
# db/checks/063's words for a city or place, and teams and schools: such a Wikidata item is never a venue
PLACE = re.compile(r"(^|[; ,])(city|town|village|municipality|borough|metropolis|megacity|hamlet|suburb|neighborhood|neighbourhood|county seat|settlement|census-designated place|unincorporated community|historic district|university|college|defunct american football team|american football team|disambiguation)([; ,]|$)|(city|municipality|town|borough) (in|of) |sports competition", re.I)
VENUE_ITEMS = """
select qid, coalesce(array_to_string(instance_of, '; '), ''), coalesce(opened_on::text, ''), coalesce(closed_on::text, '') from legacy_game_venue.venue
union all select source_key, '', coalesce(opened_on::text, ''), coalesce(closed_on::text, '') from core.venue where source_key like 'Q%' and source_key not in (select qid from legacy_game_venue.venue);
"""


def judge(y, qid, title, items):
    """(reason it cannot be used or None, the day the venue opened when that falls inside season y else None)."""
    if qid in NOT_THE_VENUE: return NOT_THE_VENUE[qid], None
    cls, opened, closed = items.get(qid, ("", "", ""))
    if PLACE.search(cls): return f"its Wikidata item is a place or team, not a venue ({cls})", None
    if closed and closed < f"{y}-06-01": return f"the item closed {closed}, before the season (a later ground of that name?)", None
    if opened and opened > f"{y + 1}-01-01": return f"the item opened {opened}, after the season", None
    return None, (opened if opened and f"{y}-01-01" < opened <= f"{y + 1}-01-01" else None)


flat = lambda x: re.sub(r"[^a-z0-9]", "", x.lower())


def stadium(text):
    m = re.search(r"\|[ \t]*(?:stadium|home_field|arena|ballpark|venue)[ \t]*=[ \t]*(.*)", text)
    if not m: return None
    raw = re.sub(r"<!--.*?-->", "", m.group(1)).strip()
    links = [x.strip() for x in re.findall(r"\[\[([^\]|#]+)", raw)]
    return raw, links


def qids(titles, cache):
    have = json.load(open(cache)) if os.path.exists(cache) else {}
    todo = [t for t in sorted(titles) if t not in have]
    for i in range(0, len(todo), 50):
        b = todo[i:i + 50]
        url = "https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageprops&ppprop=wikibase_item&titles=" + urllib.parse.quote("|".join(b))
        q = json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60))["query"]
        norm = {x["from"]: x["to"] for x in q.get("normalized", [])}
        red = {x["from"]: x["to"] for x in q.get("redirects", [])}
        pg = {p["title"]: p.get("pageprops", {}).get("wikibase_item") for p in q["pages"].values()}
        for t in b:
            t1 = norm.get(t, t); have[t] = pg.get(red.get(t1, t1))
        time.sleep(2)
    json.dump(have, open(cache, "w"), indent=0, sort_keys=True)
    return have


def main(out):
    os.makedirs(out, exist_ok=True)
    gaps = [(lg, int(y), int(tsid), name, int(f)) for lg, y, tsid, name, f in sql(GAPS)]
    pages = {}
    for name, b64 in sql(PAGES):
        m = re.match(r"wikipedia-(nfl|afl|aafc)/(\d{4})/team/\d{4}_(.+)_season\.wikitext", name)
        pages[(m.group(1), int(m.group(2)), flat(m.group(3).replace("_", " ")))] = base64.b64decode(b64).decode("utf-8")
    found, report = [], []
    for lg, y, tsid, name, f in gaps:
        t = pages.get((lg, y, flat(name)))
        if t is None:
            c = [k for k in pages if k[0] == lg and k[1] == y and (flat(name) in k[2] or k[2] in flat(name))]
            t = pages[c[0]] if len(c) == 1 else None
        if t is None: report.append(f"{lg} {y} {name}: no archived club-season article"); continue
        s = stadium(t)
        if not s or not s[1]: report.append(f"{lg} {y} {name}: infobox names no venue article ({(s[0][:40] if s else 'no field')!r})"); continue
        found.append((lg, y, tsid, name, f, s[1], len(s[1]) > 1))
    items = {r[0]: (r[1], r[2], r[3]) for r in sql(VENUE_ITEMS)}
    q = qids({t for r in found for t in r[5][:1]}, os.path.join(out, "title_qid.json"))
    rows, grouped = [], {}
    for lg, y, tsid, name, f, links, many in sorted(found, key=lambda r: (r[0], r[4], r[1])):
        qid = q.get(links[0])
        if not qid: report.append(f"{lg} {y} {name}: venue article {links[0]!r} has no Wikidata item"); continue
        why, opened_in = judge(y, qid, links[0], items)
        if why: report.append(f"{lg} {y} {name}: {links[0]!r} left out: {why}"); continue
        grouped.setdefault((lg, f, name, qid, links[0]), []).append((y, many, opened_in))
    for (lg, f, name, qid, title), ys in sorted(grouped.items()):
        ys.sort()
        run = [ys[0]]
        for y, many, op in ys[1:]:
            if y == run[-1][0] + 1: run.append((y, many, op))
            else: rows.append((lg, name, qid, title, run)); run = [(y, many, op)]
        rows.append((lg, name, qid, title, run))
    w = csv.writer(open(os.path.join(out, "home_venue_infobox.csv"), "w", encoding="utf-8", newline=""), lineterminator="\n")
    w.writerow(["league", "franchise", "qid", "from", "until", "source", "source_url", "note"])
    for lg, name, qid, title, run in rows:
        y0, y1 = run[0][0], run[-1][0]
        start = run[0][2] or f"{y0}-01-01"   # a venue that opened during its first season: from the day it opened
        note = f"Infobox stadium of the club-season article{'s' if y1 > y0 else ''} {y0}" + (f"-{y1}" if y1 > y0 else "") + f": {title}" + ("; the infobox names more than one venue, the first is used" if any(r[1] for r in run) else "")
        club = name.replace(" ", "_")
        w.writerow([lg, name, qid, start, f"{y1 + 1}-01-01", "wikipedia", f"https://en.wikipedia.org/wiki/{y0}_{club}_season", note])
    open(os.path.join(out, "report.txt"), "w", encoding="utf-8").write("\n".join(report) + "\n")
    print(f"{len(gaps)} club seasons without a home venue; {len(found)} with a venue article; {len(rows)} seed rows; {len(report)} left out (report.txt)")


def refilter(path):
    """Apply the same rules to the rows this script already wrote into db/seed/home_venue.csv (note 'Infobox stadium ...'): drop a row whose venue is a place, team
    or school, or whose dates cannot hold the season; start a row the day its venue opened when that falls inside its first season. Rewrites the file."""
    items = {r[0]: (r[1], r[2], r[3]) for r in sql(VENUE_ITEMS)}
    rows = list(csv.reader(open(path, encoding="utf-8")))
    head, body, dropped = rows[0], rows[1:], []
    out = [head]
    for r in body:
        d = dict(zip(head, r))
        if not d["note"].startswith("Infobox stadium"): out.append(r); continue
        y0, y1 = int(d["from"][:4]), int(d["until"][:4]) - 1
        why = None; start = d["from"]
        for y in range(y0, y1 + 1):
            w, op = judge(y, d["qid"], "", items)
            if w: why = f"{y}: {w}"; break
            if y == y0 and op: start = op
        if why: dropped.append(f"{d['league']} {d['franchise']} {d['from']}..{d['until']} {d['qid']} dropped: {why}"); continue
        r[head.index("from")] = start; out.append(r)
    csv.writer(open(path, "w", encoding="utf-8", newline=""), lineterminator="\n").writerows(out)
    print(f"{len(body)} rows read, {len(dropped)} dropped")
    print("\n".join(dropped))


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "--refilter": refilter(sys.argv[2])
    elif len(sys.argv) == 2: main(os.path.expanduser(sys.argv[1]))
    else: sys.exit(__doc__)
