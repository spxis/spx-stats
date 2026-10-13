#!/usr/bin/env python3
"""Read the raw standings templates in <raw dir>/{nba,nfl,mlb}.jsonl (fetch_alignment.py) into
legacy_alignment.wikipedia_template / wikipedia_team. Rerunnable: replaces the rows of the leagues and seasons it reads (so one new season can be loaded on its own; ALIGNMENT_FETCHED sets the fetch date).
Usage: load_wikipedia.py RAWDIR [psql args...]   (default psql args: -h /tmp -p 55432 -U postgres -d spx_stats)"""
import csv, io, json, os, re, subprocess, sys

D = "–"
FETCHED = os.environ.get("ALIGNMENT_FETCHED", "2026-10-10")

def nba(title, wt):
    m = re.match(r"(\d{4})" + D + r"\d{2} NBA (.+?) standings$", title)
    grp = m.group(2)
    kind = "conference" if grp in ("East", "West") else "division"
    parent = None
    teams = []
    mm = re.search(r"\{\{\s*\d{4}" + D + r"\d{2} NBA (East|West) standings\s*\|\s*division\s*=", wt)
    if mm:  # module style (2013 on): the division's clubs are listed under the template's documentation
        parent = mm.group(1)
        inc = wt.split("<noinclude>", 1)[1] if "<noinclude>" in wt else ""
        teams = [t.strip() for t in re.findall(r"^\*\s*(.+?)\s+[–-]\s+[A-Z]{3}\s*$", inc, re.M)]
        h = re.search(r"To highlight the ([^,\n]+?),? insert", inc)  # the documentation's example is left out of the list
        if h and h.group(1).strip() not in teams: teams.append(h.group(1).strip())
        if kind == "conference": return None
    else:
        for t in re.findall(r"\[\[\d{4}" + D + r"\d{2} ([^\]|]+?) season(?:\|[^\]]*)?\]\]", wt):
            if t not in teams: teams.append(t)
    return kind, grp, parent, teams

def body_of(wt):
    """The template's own text: without its <noinclude> notes and comments."""
    wt = re.sub(r"<!--.*?-->", "", wt, flags=re.S)
    wt = re.sub(r"<noinclude>.*?</noinclude>", "", wt, flags=re.S)
    return wt.split("<noinclude>", 1)[0]

def mlb(title, wt):
    m = re.match(r"\d{4} (AL|NL) (East|West|Central)", title)
    grp = m.group(1) + " " + m.group(2)
    teams = mlb_teams(wt)
    return "division", grp, None, teams

def mlb_teams(wt):
    body = body_of(wt)
    # newer layout: {{MLB standings |division=.. |year=.. |Team |w|l |w|l ...}}; older: a wikitable of links
    names = []
    for line in body.splitlines():
        l = line.strip()
        if l.startswith("|") and not re.match(r"^\|\s*[\w ]+\s*=", l):
            v = l.lstrip("|").split("|")[0].strip()  # a club may share its line with its record
            if v and not re.match(r"^[\d.\-–\s|]+$", v) and "{{" not in v and "[" not in v and "=" not in v:
                names.append(v)
    if names: return names
    out = []
    for t in re.findall(r"\[\[(?:\d{4} )?([^\]|]+?)(?: season)?(?:\|[^\]]*)?\]\]", body):
        if t not in out and not re.search(r"standings|division|league|games behind", t, re.I): out.append(t)
    return out

def nfl(title, wt):
    m = re.match(r"\d{4} (AFC|NFC) (East|West|North|South|Central)", title)
    grp = m.group(1) + " " + m.group(2)
    body = body_of(wt)
    teams = []
    for t in re.findall(r"\[\[\d{4}(?:[–-]\d{2,4})? ([^\]|]+?) season(?:\|[^\]]*)?\]\]", body):
        if t not in teams: teams.append(t)
    return "division", grp, None, teams

PARSE = {"nba": nba, "mlb": mlb, "nfl": nfl}

def main():
    raw = sys.argv[1]
    pargs = sys.argv[2:] or ["-h", "/tmp", "-p", "55432", "-U", "postgres", "-d", "spx_stats"]
    tpl, team, bad = [], [], []
    leagues = []
    for lg in PARSE:
        p = f"{raw}/{lg}.jsonl"
        if not os.path.exists(p): continue
        leagues.append(lg)
        for line in open(p, encoding="utf-8"):
            r = json.loads(line)
            y = r["year"]
            for t in r["templates"]:
                if t.get("target_wikitext"): t = {**t, "wikitext": t["target_wikitext"]}  # a redirect: the template it points to
                if t["wikitext"] is None: bad.append((lg, y, t["title"], "missing")); continue
                res = PARSE[lg](t["title"], t["wikitext"])
                if res is None: continue
                kind, grp, parent, teams = res
                if not teams: bad.append((lg, y, t["title"], "no teams")); continue
                tpl.append((lg, y, r["article"], t["title"], kind, grp, parent, FETCHED))
                for i, n in enumerate(teams, 1): team.append((lg, y, t["title"], i, n))
    def tsv(rows):
        b = io.StringIO(); w = csv.writer(b, delimiter="\t", quoting=csv.QUOTE_MINIMAL, lineterminator="\n", quotechar='"')
        for r in rows: w.writerow(["\\N" if x is None else x for x in r])
        return b.getvalue()
    sql = ["begin;", "delete from legacy_alignment.wikipedia_template where league_code in (%s) and season in (%s);" % (",".join("'%s'" % l for l in leagues), ",".join(str(y) for y in sorted({r[1] for r in tpl} | {r[1] for r in team}))),
           "\\copy legacy_alignment.wikipedia_template (league_code, season, article, template, kind, grp, parent_grp, fetched_on) from stdin with (format csv, delimiter E'\\t', null '\\N')"]
    sql_in = "\n".join(sql) + "\n" + tsv(tpl) + "\\.\n"
    sql_in += "\\copy legacy_alignment.wikipedia_team (league_code, season, template, position, team_name) from stdin with (format csv, delimiter E'\\t', null '\\N')\n" + tsv(team) + "\\.\ncommit;\n"
    r = subprocess.run(["psql", "-v", "ON_ERROR_STOP=1", "-q"] + pargs, input=sql_in, text=True, capture_output=True)
    print(r.stdout, r.stderr)
    print(len(tpl), "templates,", len(team), "team rows;", len(bad), "templates skipped")
    for b in bad[:40]: print("  skipped", b)

if __name__ == "__main__": main()
