#!/usr/bin/env python3
"""The 2023 FIFA Women's World Cup from English Wikipedia (CC BY-SA 4.0): fetch the group and knockout articles, read their football boxes, write SQL for
legacy_worldcup.of_match / of_goal / of_stadium (year 2023: no men's tournament shares the year; the 2026 men's tournament is the other user of these tables).

  wwc2023.py fetch RAW_DIR            one request per 2.5 s: the tournament article, Group A-H, the knockout stage, the final's article; then one batched page-properties query
                                      (title_qid.json) for the stadium articles' Wikidata ids. RAW_DIR must be new or hold only this script's files.
  wwc2023.py sql RAW_DIR OUT.sql      read the files, check every match, write the SQL (apply with scripts/mac/ds1-apply.sh; no network, no database)

A match is a {{Football box}} (or {{Football box collapsible}}) of a group article ("Group A".."Group H", one box per match) or of the knockout article (the
heading before it names the round). Fields read: date ({{Start date|y|m|d}}), time and UTC offset, the two sides ({{fbw-rt|NZL}} or {{fbw|NOR}}: the FIFA code),
score, aet=yes, penaltyscore, goals1 and goals2 ({{goal|48}}, {{goal|45+2}}, {{goal|30|pen.}}, {{goal|og|12}}: an own goal is listed under the side it counted
for, as in the box), stadium and city. Checks that stop the load for a match: the goals listed must add up to the score (extra time included, shootout
excluded), every code must be one of the 32 teams, a round must be known. Nothing is guessed: a box that fails is printed and left out.
The 90-minute score of an extra-time match is worked out from the goals (minute 90 or less); the halftime score is not stored (the boxes do not carry it).
"""
import hashlib, json, os, re, sys, time, urllib.error, urllib.parse, urllib.request

UA = {"User-Agent": "spx-stats/0.1 (https://github.com/spxis/spx-stats)"}
PAGES = ["2023 FIFA Women's World Cup"] + [f"2023 FIFA Women's World Cup Group {g}" for g in "ABCDEFGH"] + ["2023 FIFA Women's World Cup knockout stage", "2023 FIFA Women's World Cup final"]
# FIFA code -> the name core.soccer_team carries (checked against DS1 on 2026-10-19); Zambia, Vietnam and the Philippines are new national teams
TEAMS = {"NZL": "New Zealand", "NOR": "Norway", "PHI": "Philippines", "SUI": "Switzerland", "AUS": "Australia", "IRL": "Republic of Ireland", "NGA": "Nigeria",
         "CAN": "Canada", "ESP": "Spain", "CRC": "Costa Rica", "ZAM": "Zambia", "JPN": "Japan", "ENG": "England", "HAI": "Haiti", "DEN": "Denmark", "CHN": "China",
         "USA": "United States", "VIE": "Vietnam", "NED": "Netherlands", "POR": "Portugal", "FRA": "France", "JAM": "Jamaica", "BRA": "Brazil", "PAN": "Panama",
         "SWE": "Sweden", "RSA": "South Africa", "ITA": "Italy", "ARG": "Argentina", "GER": "Germany", "MAR": "Morocco", "COL": "Colombia", "KOR": "South Korea"}
ROUNDS = {"round of 16": "Round of 16", "quarter-finals": "Quarter-finals", "semi-finals": "Semi-finals", "third place play-off": "Third place", "final": "Final"}
fname = lambda t: re.sub(r"[^A-Za-z0-9._-]+", "_", t) + ".wikitext"


def get(title):
    url = "https://en.wikipedia.org/w/index.php?title=" + urllib.parse.quote(title.replace(" ", "_")) + "&action=raw"
    delay = 20
    for _ in range(8):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60) as r: return r.read().decode("utf-8")
        except urllib.error.HTTPError as e:
            if e.code in (429,) or e.code >= 500: time.sleep(delay); delay = min(delay * 2, 300); continue
            raise
        except (urllib.error.URLError, TimeoutError, ConnectionError): time.sleep(delay); delay = min(delay * 2, 300)
    raise RuntimeError("giving up on " + title)


def boxes(text):
    """Every {{Football box ...}} with its brace-balanced body, with the heading line before it."""
    out, i = [], 0
    heads = [(m.start(), m.group(1).strip()) for m in re.finditer(r"^={2,4}\s*([^=\n]+?)\s*={2,4}\s*$", text, re.M)]
    while True:
        j = text.find("{{Football box", i)
        if j < 0: return out
        d, k = 0, j
        while k < len(text):
            if text.startswith("{{", k): d += 1; k += 2
            elif text.startswith("}}", k):
                d -= 1; k += 2
                if d == 0: break
            else: k += 1
        body = text[j:k]
        h = [t for p, t in heads if p < j and t.lower() in ROUNDS]   # the round's heading (the match's own heading is one level lower)
        out.append((body, h[-1] if h else ""))
        i = k


def fields(body):
    """{name: value}: the top-level |name= parts of a box (a value may hold templates, links and bullet lines)."""
    inner = body[2:-2]
    parts, d, cur = [], 0, ""
    for ch_i, ch in enumerate(inner):
        two = inner[ch_i:ch_i + 2]
        if two in ("{{", "[["): d += 1
        elif two in ("}}", "]]"): d -= 1
        if ch == "|" and d <= 0: parts.append(cur); cur = ""
        else: cur += ch
    parts.append(cur)
    kv = {}
    for p in parts[1:]:
        m = re.match(r"\s*([\w\-]+)\s*=(.*)$", p, re.S)
        if m: kv[m.group(1).lower()] = m.group(2).strip()
    return kv


def code_of(v):
    m = re.search(r"\{\{\s*fbw?(?:-rt)?\s*\|\s*([A-Z]{3})", v) or re.search(r"\{\{\s*fb(?:w)?-rt\s*\|\s*([A-Z]{3})", v)
    return m.group(1) if m else None


def goals_of(v):
    """[(minute text, kind)] from a goals field; kind '', 'pen' or 'og'. A scorer's name is the link's short text."""
    out = []
    for line in re.split(r"\n|<br\s*/?>", v):
        mname = re.search(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", line)
        name = mname.group(1).strip() if mname else re.sub(r"\{\{.*?\}\}|[*]", "", line).strip(" ,")
        for t in re.finditer(r"\{\{\s*goal\s*\|([^}]*)\}\}", line, re.I):
            gs = []
            for tok in [x.strip() for x in t.group(1).split("|")]:
                if re.fullmatch(r"\d+(\+\d+)?", tok): gs.append([tok, ""])
                elif re.match(r"pen", tok, re.I) and gs: gs[-1][1] = "pen"
                elif re.match(r"o\.?g", tok, re.I):
                    if gs: gs[-1][1] = "og"
                    else: gs.append([None, "og"])
                elif gs and gs[-1][0] is None and re.fullmatch(r"\d+(\+\d+)?", tok): gs[-1][0] = tok
            for mn, kind in gs:
                if mn: out.append((name, mn, kind))
    return out


def minute_n(m): return int(m.split("+")[0])


def read_match(body, heading, page_group):
    kv = fields(body)
    d = re.search(r"\{\{\s*Start date\s*\|\s*(\d{4})\s*\|\s*(\d{1,2})\s*\|\s*(\d{1,2})", kv.get("date", ""), re.I)
    c1, c2 = code_of(kv.get("team1", "")), code_of(kv.get("team2", ""))
    sc = re.search(r"(\d+)\s*[–-]\s*(\d+)", re.sub(r"\{\{\s*score link\s*\|[^|]*\|", "", kv.get("score", "")).replace("}}", ""))
    if not (d and c1 in TEAMS and c2 in TEAMS and sc): return None, "date, teams or score not read"
    tm = re.search(r"(\d{1,2}):(\d\d)", kv.get("time", "")); off = re.search(r"UTC([+−-]\d{1,2})(?::(\d\d))?", kv.get("time", ""))
    aet = kv.get("aet", "").lower() in ("yes", "y", "true")
    ps = re.search(r"(\d+)\s*[–-]\s*(\d+)", kv.get("penaltyscore", ""))
    g1, g2 = goals_of(kv.get("goals1", "")), goals_of(kv.get("goals2", ""))
    s1, s2 = int(sc.group(1)), int(sc.group(2))
    if len(g1) != s1 or len(g2) != s2: return None, f"goals listed {len(g1)}-{len(g2)} but the score is {s1}-{s2}"
    stad = re.findall(r"\[\[([^\]|#]+)(?:\|[^\]]*)?\]\]", kv.get("stadium", ""))
    city = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", kv.get("stadium", "")).split(",")
    if page_group: stage, group = "Group stage", page_group
    else:
        stage, group = ROUNDS.get(heading.lower()), None
        if stage is None: return None, f"round {heading!r} unknown"
    return dict(date=f"{d.group(1)}-{int(d.group(2)):02d}-{int(d.group(3)):02d}", kickoff=f"{int(tm.group(1)):02d}:{tm.group(2)}" if tm else None,
                utc=((off.group(1).replace("−", "-") + ":" + (off.group(2) or "00")) if off else None), t1=TEAMS[c1], t2=TEAMS[c2], s1=s1, s2=s2, aet=aet,
                p1=int(ps.group(1)) if ps else None, p2=int(ps.group(2)) if ps else None, stage=stage, group=group,
                stadium=stad[0] if stad else None, city=(city[1].strip() if len(city) > 1 else None), g1=g1, g2=g2), None


def cmd_fetch(raw):
    os.makedirs(raw, exist_ok=True)
    last = 0.0
    for t in PAGES:
        p = os.path.join(raw, fname(t))
        if os.path.exists(p): continue
        w = 2.5 - (time.time() - last)
        if w > 0: time.sleep(w)
        last = time.time()
        open(p, "w", encoding="utf-8").write(get(t)); print(t, flush=True)
    titles = sorted({s for t in PAGES for body, _ in boxes(open(os.path.join(raw, fname(t)), encoding="utf-8").read())
                     for s in re.findall(r"\[\[([^\]|#]+)", fields(body).get("stadium", ""))[:1]})
    q = os.path.join(raw, "title_qid.json")
    if not os.path.exists(q):
        url = "https://en.wikipedia.org/w/api.php?action=query&format=json&redirects=1&prop=pageprops&ppprop=wikibase_item&titles=" + urllib.parse.quote("|".join(titles))
        r = json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60))["query"]
        norm = {x["from"]: x["to"] for x in r.get("normalized", [])}; red = {x["from"]: x["to"] for x in r.get("redirects", [])}
        pg = {p["title"]: p.get("pageprops", {}).get("wikibase_item") for p in r["pages"].values()}
        out = {t: pg.get(red.get(norm.get(t, t), norm.get(t, t))) for t in titles}
        json.dump(out, open(q, "w"), indent=0, sort_keys=True)
    print(len(titles), "stadium articles")


def q(s): return "null" if s is None else "'" + str(s).replace("'", "''") + "'"


def cmd_sql(raw, out):
    qid = json.load(open(os.path.join(raw, "title_qid.json")))
    matches, bad = [], []
    for t in PAGES[1:]:
        text = open(os.path.join(raw, fname(t)), encoding="utf-8").read()
        gm = re.search(r"Group ([A-H])$", t)
        bx = boxes(text)
        if t.endswith("Cup final"): bx = [(bx[0][0], "Final")]   # the knockout article transcludes the final from this one: its first box is the match
        for body, head in bx:
            m, why = read_match(body, head, gm.group(1) if gm else None)
            if m is None: bad.append((t, head, why))
            else: matches.append(m)
    matches.sort(key=lambda m: (m["date"], m["kickoff"] or ""))
    for t, h, why in bad: print("NOT READ:", t, h, why)
    sql = ["begin;", "delete from legacy_worldcup.of_goal where year = 2023;", "delete from legacy_worldcup.of_match where year = 2023;", "delete from legacy_worldcup.of_stadium where year = 2023;"]
    stad = {}
    for seq, m in enumerate(matches, 1):
        gtxt = "; ".join(f"{n} {mn}'" + (" (pen)" if k == "pen" else " (og)" if k == "og" else "") for side in ("g1", "g2") for n, mn, k in m[side])
        sql.append("insert into legacy_worldcup.of_match (year, seq, file, stage, group_name, match_date, kickoff, utc_offset, team1, team2, score1, score2, aet, pens1, pens2, venue, goal_text) values "
                   f"(2023, {seq}, {q('wikipedia')}, {q(m['stage'])}, {q(m['group'])}, {q(m['date'])}, {q(m['kickoff'])}, {q(m['utc'])}, {q(m['t1'])}, {q(m['t2'])}, "
                   f"{m['s1']}, {m['s2']}, {'true' if m['aet'] else 'false'}, {m['p1'] if m['p1'] is not None else 'null'}, {m['p2'] if m['p2'] is not None else 'null'}, {q(m['stadium'])}, {q(gtxt)});")
        n = 0
        for side, key in (("home", "g1"), ("away", "g2")):
            for name, mn, kind in m[key]:
                n += 1
                sql.append(f"insert into legacy_worldcup.of_goal (year, seq, n, side, scorer, minute, kind) values (2023, {seq}, {n}, {q(side)}, {q(name)}, {q(mn)}, {q(kind)});")
        if m["stadium"]: stad[m["stadium"]] = m["city"]
    for name, city in sorted(stad.items()):
        sql.append("insert into legacy_worldcup.of_stadium (year, city, cc, name, wikipedia, wikidata, line) values "
                   f"(2023, {q(city)}, {q('au' if city in ('Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide') else 'nz')}, {q(name)}, {q(name)}, {q(qid.get(name))}, {q('wikipedia: ' + name)});")
    sql.append("commit;")
    open(out, "w", encoding="utf-8").write("\n".join(sql) + "\n")
    print(f"{len(matches)} matches, {sum(len(m['g1']) + len(m['g2']) for m in matches)} goals, {len(stad)} stadiums, {len(bad)} boxes not read -> {out}")


if __name__ == "__main__":
    a = sys.argv[1:]
    if len(a) == 2 and a[0] == "fetch": cmd_fetch(os.path.expanduser(a[1]))
    elif len(a) == 3 and a[0] == "sql": cmd_sql(os.path.expanduser(a[1]), os.path.expanduser(a[2]))
    else: sys.exit(__doc__)
