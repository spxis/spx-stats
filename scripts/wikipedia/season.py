#!/usr/bin/env python3
"""One CFL season at a time: fetch -> bundle for the Dropbox archive -> (archive) -> load.

  season.py fetch YEAR   fetch the season's wikitext (raw cache, never edited) and write the
                         verbatim-extract bundle BUNDLE/wikipedia-cfl-YEAR.txt for archiving
  season.py load YEAR    parse the raw cache and load legacy_wikipedia_cfl for that season.
                         Refuses unless BUNDLE/uploaded-YEAR exists: the raw data goes to the
                         Dropbox archive before it is loaded, always.

Source: English Wikipedia (CC BY-SA 4.0), action=raw, one request per 2.5 s.
"""
import csv, datetime, glob, io, os, re, subprocess, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fetch as F, parse as P

CACHE = "/home/user/spxwork/cfl/raw/wikipedia/2026-10-10"
BUNDLE = "/home/user/spxwork/cfl/bundle"
PSQL = ["psql", "-h", "/tmp", "-p", "55432", "-U", "postgres", "-d", "spx_stats"]
FETCHED_ON = "2026-10-10"


def sh(t): return F.read(CACHE, "season", t)


def season_files(year):
    """Fetch what a season needs; return (season text, [template titles], [team page titles])."""
    for sub in ("season", "team", "template", "greycup"): os.makedirs(f"{CACHE}/{sub}", exist_ok=True)
    stext = F.save(CACHE, "season", f"{year} CFL season")
    if stext is None or stext.startswith("#REDIRECT"): return stext, [], []
    tpl = sorted(set(re.findall(r"\{\{\s*(\d{4} CFL [^{}|]*?[Ss]tandings)\s*\}\}", stext)))
    ttext = ""
    for t in tpl: ttext += F.save(CACHE, "template", "Template:" + t) or ""
    titles = {m.strip() for m in re.findall(r"\[\[(%d [^\]|]+? season)" % year, stext + ttext) if "CFL season" not in m and not re.search(r"NFL|NBA|MLB|NHL|MLS|Olympic|FIFA|Pan Am|NCAA|college|CIS|U Sports", m)}
    for t in sorted(titles): F.save(CACHE, "team", t)
    return stext, tpl, sorted(titles)


def extract_team(text):
    """Exactly the tables the parser reads (parse.schedule_tables), each under its headings, as row text: `|- <row attributes>`
    then the row's cells' wikitext, verbatim, joined by ` ¦ `. Table, header-cell and cell styling, references, prose and
    every other section are left out."""
    out, last = [], None
    for h2, h3, tab in P.schedule_tables(text):
        if (h2, h3) != last:
            if h2: out.append("==" + h2 + "==")
            if h3: out.append("===" + h3 + "===")
            last = (h2, h3)
        out.append("{| table")
        for attr, cells in P.rows(tab):
            out.append(("|- " + attr).rstrip() + "\n" + " ¦ ".join(re.sub(r"\s+", " ", c) for c in cells))
        out.append("|}")
    return "\n".join(out)


def extract_season(text):
    """The infobox, then every level-2 section about the standings or the playoffs (news, awards, leaders and all-star
    lists are left out), then the playoff bracket template itself if it sat in a section not kept."""
    box = re.search(r"\{\{Infobox.*?\n\}\}", text, re.S)
    parts = re.split(r"(?m)^(?===[^=].*?==\s*$)", text)
    keep = [x for x in parts[1:] if re.match(r"==\s*(?:Regular[- ]season|Final regular|Standings|Season standings|Grey Cup|CFL playoffs|Postseason|Playoffs)", x, re.I)]
    body = "".join(keep)
    br = re.search(r"\{\{\s*\d*Team\w*Bracket\w*\s*\n.*?\n\}\}", text, re.S)
    if br and br.group(0) not in body: body += "\n==(playoff bracket template)==\n" + br.group(0) + "\n"
    return (box.group(0) if box else "") + "\n\n" + body


def cmd_fetch(year):
    stext, tpl, titles = season_files(year)
    if stext is None or stext.startswith("#REDIRECT"):
        print(year, "no CFL season article"); return
    os.makedirs(BUNDLE, exist_ok=True)
    parts = [f"=== wikipedia-cfl-{year}.txt: verbatim wikitext extracts, English Wikipedia (CC BY-SA 4.0), fetched {FETCHED_ON} ===\n"]
    def add(title, kind, body, ns=""):
        url = "https://en.wikipedia.org/wiki/" + title.replace(" ", "_")
        parts.append(f"\n##### [{kind}] {title} <{url}>\n{body.rstrip()}\n")
    add(f"{year} CFL season", "season article: infobox, standings, playoff bracket", extract_season(stext))
    for t in tpl: add("Template:" + t, "standings template", F.read(CACHE, "template", "Template:" + t))
    for t in titles: add(t, "club season: regular-season schedule tables as row text", extract_team(F.read(CACHE, "team", t)))
    path = f"{BUNDLE}/wikipedia-cfl-{year}.txt"
    open(path, "w", encoding="utf-8").write("".join(parts))
    print(year, "bundle", path, os.path.getsize(path), "bytes;", len(titles), "teams;", len(tpl), "templates")


def run(sql):
    p = subprocess.run(PSQL + ["-v", "ON_ERROR_STOP=1", "-q", "-f", "-"], input=sql, text=True, capture_output=True)
    if p.returncode: sys.exit(p.stderr)
    return p.stdout


def n(v): return "\\N" if v is None else v


def copy_block(table, cols, rows):
    if not rows: return ""
    b = io.StringIO(); csv.writer(b, lineterminator="\n").writerows(rows)
    return f"\\copy {table} ({cols}) from stdin with (format csv, null '\\N')\n{b.getvalue()}\\.\n"


def cmd_load(year):
    if not os.path.exists(f"{BUNDLE}/uploaded-{year}"):
        sys.exit(f"{year}: raw data not archived to Dropbox yet ({BUNDLE}/uploaded-{year} missing). Archive first, then load.")
    stext = sh(f"{year} CFL season")
    if not stext or stext.startswith("#REDIRECT"): sys.exit(f"{year}: no season article")
    tpl = sorted(set(re.findall(r"\{\{\s*(\d{4} CFL [^{}|]*?[Ss]tandings)\s*\}\}", stext)))
    ttext = "\n".join(F.read(CACHE, "template", "Template:" + t) for t in tpl)
    team_pages = sorted(re.sub(r"\.wikitext$", "", os.path.basename(f)).replace("_", " ") for f in glob.glob(f"{CACHE}/team/{year}_*.wikitext"))
    team_pages = [t for t in team_pages if not re.search(r"NFL|NBA|MLB|NHL|MLS|Olympic|FIFA|Pan Am|NCAA", t) and not F.read(CACHE, "team", t).startswith("#MISSING")]
    # a club's page is named for the club that year; team_name is the name without year and "season"
    names = [P.title_name(t) for t in team_pages]
    unparsed, views = [], []
    for t in team_pages:
        v, sk = P.team_games(F.read(CACHE, "team", t), year, P.title_name(t), names)
        views += v
        unparsed += [(year, t, sec, row) for sec, row in sk]
    merged = P.merge_views(views)
    seq, grows = {}, []
    for g in sorted(merged, key=lambda g: (g["game_date"], g["teams"])):
        k = (g["game_date"], tuple(sorted(g["teams"])))
        i = seq[k] = seq.get(k, -1) + 1
        grows.append([year, "regular", g["game_date"], g["week"], None, g["home"], g["away"], "{" + ",".join('"%s"' % t for t in sorted(g["teams"])) + "}",
                      n(g["home_pts"]), n(g["away_pts"]), "t" if g["overtime"] else "f", "f", g["views"], n(g["conflict"]), g["src"], i])
    info = P.season_info(stext)
    games, kv = P.brackets(stext, year)
    for b in games:
        try: sa, sb = int(re.match(r"\d+", b["a"]["score"]).group()), int(re.match(r"\d+", b["b"]["score"]).group())
        except (AttributeError, ValueError):
            if b["a"]["team"] or b["b"]["team"]: unparsed.append((year, f"{year} CFL season", "bracket", b["src"]))
            continue
        seeds = (P.seed_no(b["a"]["seed"]), P.seed_no(b["b"]["seed"]))
        gc = bool(re.search(r"grey cup", b["round_name"], re.I))
        if gc:
            home = info["east_champion"] if info["east_champion"] in (b["a"]["team"], b["b"]["team"]) else b["a"]["team"]
        elif seeds[0] and seeds[1] and seeds[0] != seeds[1]:
            home = b["a"]["team"] if seeds[0] < seeds[1] else b["b"]["team"]
        else:
            home = None
        if home is None: away = None; hp = ap = None
        else:
            away = b["b"]["team"] if home == b["a"]["team"] else b["a"]["team"]
            hp, ap = (sa, sb) if home == b["a"]["team"] else (sb, sa)
        if gc and not b["game_date"]: b["game_date"] = P.mk_date(year, info["grey_cup_date"] or "")  # no dates in early brackets: the infobox dates the final
        if gc and not b["game_date"] and info["grey_cup"]:  # no date in the infobox either: the Grey Cup article's own
            gt = F.read(CACHE, "greycup", info["grey_cup"])
            dm = re.search(r"^\|\s*date\s*=\s*(.*)", gt or "", re.M)
            if dm: b["game_date"] = P.mk_date(year, P.clean(dm.group(1)))
        tm = sorted([b["a"]["team"], b["b"]["team"]])
        i = seq.get(("p", b["game_date"], tuple(tm)), -1) + 1; seq[("p", b["game_date"], tuple(tm))] = i
        grows.append([year, "playoffs", n(b["game_date"]), None, b["round_name"], n(home), n(away), "{" + ",".join('"%s"' % t for t in tm) + "}",
                      n(hp), n(ap), "\\N", "t" if gc else "f", 1, "\\N" if home else "home team not given by the bracket", b["src"], i])
    st = P.standings(stext + "\n" + ttext, year)
    seen, srows = set(), []
    for s in st:
        k = (s["division"], s["team"])
        if k in seen: continue
        seen.add(k)
        srows.append([year, s["division"], s["rank"], s["team"], n(s["gp"]), n(s["w"]), n(s["l"]), n(s["t"]), n(s["otl"]), n(s["pts"]), n(s["pf"]), n(s["pa"]), s["src"]])
    if not srows: unparsed.append((year, f"{year} CFL season", "standings", "no standings table read"))
    sql = f"begin;\n" + "".join(f"delete from legacy_wikipedia_cfl.{t} where season = {year};\n" for t in ("season", "team_season", "game", "standing", "unparsed"))
    sql += copy_block("legacy_wikipedia_cfl.season", "season,page_title,grey_cup,grey_cup_date,grey_cup_venue,champion,east_champion,west_champion,duration,fetched_on",
                      [[year, f"{year} CFL season", n(info["grey_cup"]), n(info["grey_cup_date"]), n(info["grey_cup_venue"]), n(info["champion"]),
                        n(info["east_champion"]), n(info["west_champion"]), n(info["duration"]), FETCHED_ON]])
    sql += copy_block("legacy_wikipedia_cfl.team_season", "season,page_title,team_name", [[year, t, P.title_name(t)] for t in team_pages])
    sql += copy_block("legacy_wikipedia_cfl.game", "season,phase,game_date,week,round_name,home_team,away_team,teams,home_pts,away_pts,overtime,neutral_site,views,conflict,src,game_seq", [
        [r[0], r[1], r[2], n(r[3]), n(r[4]), n(r[5]), n(r[6]), r[7], r[8], r[9], r[10], r[11], r[12], r[13], r[14], r[15]] for r in grows])
    sql += copy_block("legacy_wikipedia_cfl.standing", "season,division,rank,team,gp,w,l,t,otl,pts,pf,pa,src", srows)
    sql += copy_block("legacy_wikipedia_cfl.unparsed", "season,page,section,row_text", unparsed)
    run(sql + "commit;\n")
    reg = [g for g in merged]
    print(f"{year}: teams {len(team_pages)}, regular games {len(reg)} (paired {sum(1 for g in reg if g['views'] == 2)}, "
          f"conflicts {sum(1 for g in reg if g['conflict'])}, home unknown {sum(1 for g in reg if not g['location_known'])}), "
          f"playoff games {sum(1 for r in grows if r[1] == 'playoffs')}, standings {len(srows)}, unparsed {len(unparsed)}")


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] not in ("fetch", "load"): sys.exit(__doc__)
    {"fetch": cmd_fetch, "load": cmd_load}[sys.argv[1]](int(sys.argv[2]))
