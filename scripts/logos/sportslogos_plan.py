"""Propose which SportsLogos.Net logo goes to which name era, for the eras that still have no logo once the Commons assignments are made.
Usage: sportslogos_plan.py <identities.json> <candidates.csv> <review.csv> <fetch dir> <out plan.csv>
  identities.json  scripts/logos/identities.sql run on DS1      candidates.csv  commons_report.py (the era's state now: gap, non-free, free)
  review.csv       the decisions on the Commons plan (db/seed/logo_extra_review.csv); eras it fills are skipped
  <fetch dir>      sportslogos_fetch.py's teams.json and logos.json
Only a logo of kind Primary or Primary Dark is taken; with none, the first of Secondary, Alternate, Wordmark. A logo belongs to an era when its
title names the era (the whole name, punctuation and "St."/"Saint" ignored), it comes from a team page of the era's league, and its years
overlap the era's. Several logos of one era are laid end to end by their start years (the first reaches back to the era's start, the last on
to its end), so a season shows the mark of its own years. Columns first are those of db/seed/logo_extra.csv; the others are for review."""
import csv, json, re, sys, collections

ident_f, cand_f, review_f, fetch, out = sys.argv[1:6]
# SportsLogos.Net league ids: 1 NHL, 4 MLB, 6 NBA, 7 NFL, 8 CFL, 12 WHA, 61 NHA, 99 AFL, 147 PCHA, 172 Federal League, 197 WCHL, 237 AAFC.
# A club that was in a rival league and later the NHL or NFL answers to both (the Winnipeg Jets of the WHA, a club of the AFL).
LEAGUE_IDS = {"nhl": {1, 12}, "nba": {6}, "mlb": {4, 172}, "nfl": {7, 99, 237}, "cfl": {8}, "other:hockey": {12, 61, 147, 197}}
# An identity name our history writes differently from SportsLogos.Net's titles: the names its logos go under.
ALIAS = {"Michigan Stags / Baltimore Blades": ["Michigan Stags", "Baltimore Blades"],
         "New York Golden Blades / Jersey Knights": ["New York Golden Blades", "Jersey Knights"],
         "Denver Spurs / Ottawa Civics": ["Denver Spurs", "Ottawa Civics"],
         "Baltimore CFLers": ["Baltimore Stallions"], "Seattle": ["Seattle SuperSonics"], "Ottawa Hockey Club": ["Ottawa Senators"]}
PREFER = ["Primary", "Primary Dark"]
FALLBACK = ["Secondary", "Alternate", "Wordmark"]


def norm(t):
    t = t.lower().replace("saint ", "st ").replace("é", "e")
    return re.sub(r"[^a-z0-9]", "", t.replace("st.", "st"))


idents = json.load(open(ident_f))
state = {int(r["iid"]): r for r in csv.DictReader(open(cand_f))}
filled = {(r["team"], r["era_from"]) for r in csv.DictReader(open(review_f)) if r["decision"] == "accept" and r["action"] == "fill"}
teams = json.load(open(f"{fetch}/teams.json"))
logos = json.load(open(f"{fetch}/logos.json"))
by_name = collections.defaultdict(list)
for l in logos.values():
    if not l["name"] or l["from"] is None:
        continue
    t = teams.get(str(l["team_id"]))
    if not t:
        continue
    by_name[(t["league_id"], norm(l["name"]))].append(l)

names_n = collections.Counter((r["lg"], norm(r["name"])) for r in idents)   # a name worn by several identity rows (a renamed-back club, a split era) needs explicit years
rows = []
for r in idents:
    st = state[r["iid"]]
    if st["now"] != "gap" or (r["name"], str(r["y0"])) in filled:
        continue
    lg = r["lg"]
    pool = []
    for lid in LEAGUE_IDS[lg]:
        for nm in ALIAS.get(r["name"], [r["name"]]):
            pool += by_name.get((lid, norm(nm)), [])
    y0, y1 = r["y0"], (r["y1"] or 9999)
    # SportsLogos.Net dates a winter sport's logo by the year its season ends ("1947" is 1946-47: its Toronto Huskies of 1946-47 are "1947");
    # our years are the seasons' first years. Baseball and football seasons sit in one calendar year.
    shift = 1 if lg in ("nhl", "nba", "other:hockey") else 0
    pool = [dict(l, **{"from": l["from"] - shift, "to": l["to"] - shift, "sl_from": l["from"], "sl_to": l["to"]}) for l in pool]
    pool = [l for l in pool if l["from"] <= (y1 - 1 if y1 != 9999 else y1) and l["to"] >= y0]   # y1 is where the identity ends, its last season starts a year before
    chosen = []
    for kinds in (PREFER, *[[k] for k in FALLBACK]):
        chosen = [l for l in pool if l["kind"] in kinds]
        if chosen:
            break
    if not chosen:
        continue
    # one logo per start year (the longest-worn of two that start together), then laid end to end
    start = {}
    for l in sorted(chosen, key=lambda l: (l["from"], -(l["to"] - l["from"]), l["key"])):
        start.setdefault(max(l["from"], y0), l)
    segs = sorted(start.items())
    shared = names_n[(lg, norm(r["name"]))] > 1
    for i, (s, l) in enumerate(segs):
        e = segs[i + 1][0] - 1 if i + 1 < len(segs) else (r["y1"] - 1 if r["y1"] else None)   # years are the seasons' start years, inclusive
        first, last = i == 0, i + 1 == len(segs)
        rows.append({"league": r.get("league") or (lg.split(":")[0] if lg.startswith("other") else lg), "team": r["name"],
                     "from_year": s if (shared or not first) else "", "to_year": (e if e is not None else "") if (shared or not last) else "", "source": "sportslogos", "file_key": l["key"], "replaces": "",
                     "note": f"SportsLogos.Net {l['kind']} logo {l['sl_from']}-{l['sl_to']}, fair use",
                     "kind": l["kind"], "logo_from": l["sl_from"], "logo_to": l["sl_to"], "era_from": r["y0"], "era_to": r["y1"] or "",
                     "title": l["title"], "page": l["page"], "image": l["image"], "iid": r["iid"]})
with open(out, "w", newline="") as fh:
    w = csv.DictWriter(fh, fieldnames=list(rows[0]))
    w.writeheader()
    w.writerows(rows)
eras = {r["iid"] for r in rows}
print(len(rows), "logo rows for", len(eras), "eras ->", out)
print(collections.Counter(r["league"] for r in rows), collections.Counter(r["kind"] for r in rows))
