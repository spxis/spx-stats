#!/usr/bin/env python3
"""Read the saved "List of Stanley Cup champions" wikitext (fetch.py) into rows, and write them as SQL for
legacy_wikipedia_stanley_cup (migration 086), plus a JSON copy and a report.
Usage: parse.py <raw dir> <out.sql> [<out.json>]
Rows: one per Cup win in the challenge-era table (a challenge won or defended, or a league title won while holding the Cup) and one
per final of 1915-1926. The 1919 final (cancelled) has no winner and is not a row. Nothing is guessed: a cell the reader does not
understand stops the run."""
import datetime, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "wikipedia_awards"))
import wikitable  # noqa: E402

MONTHS = {m: i + 1 for i, m in enumerate("January February March April May June July August September October November December".split())}
ARTICLE = "List of Stanley Cup champions"
LEAGUE_ROW = re.compile(r"^\d{4}\s+.*\bchampions?\b", re.I)


def split_team(cell):
    """'Montreal Hockey Club (AHAC)' -> ('Montreal Hockey Club', 'AHAC'); the '(1, 1-0)' record of the final era is dropped."""
    s = re.sub(r"\s*\(\d+,\s*\d+[–-]\d+\)\s*$", "", cell.strip())
    m =re.match(r"^(.*?)\s*\(([^()]+)\)\s*$", s)
    if m:
        return m.group(1).strip(), m.group(2).strip()
    return s, None


def parse_date(text):
    """(played_on or None, ended_on or None, cup_year). cup_year is the calendar year the series ended in, the year Wikipedia files it under."""
    years = [int(y) for y in re.findall(r"\b(1[89]\d\d)\b", text)]
    if not years:
        raise SystemExit("no year in date: " + text)
    month_pos = [(m.start(), MONTHS[m.group(1)]) for m in re.finditer(r"(" + "|".join(MONTHS) + r")", text)]
    if not month_pos:
        raise SystemExit("no month in date: " + text)
    first_month = month_pos[0][1]
    last_pos, last_month = month_pos[-1]
    last_year = years[-1]
    # the year of the first month: the first year printed after it
    first_year = next(int(y) for y in re.findall(r"\b(1[89]\d\d)\b", text[month_pos[0][0]:]))
    d1 = re.search(r"(?:" + "|".join(MONTHS) + r")\s+(\d{1,2})\b", text)
    tail = text[last_pos:]
    nums = [int(n) for n in re.findall(r"\b(\d{1,2})\b(?!\d)", re.sub(r"\b1[89]\d\d\b", "", tail))]
    played = datetime.date(first_year, first_month, int(d1.group(1))).isoformat() if d1 else None
    ended = datetime.date(last_year, last_month, nums[-1]).isoformat() if nums else None
    return played, ended, last_year


def challenge_rows(table):
    out = []
    for r in table["rows"][1:]:
        c = r["cells"]
        if len(c) < 7:
            raise SystemExit("short row: %r" % c)
        date, win, _coach, lose, fmt, score, _goal = c[:7]
        played, ended, cup_year = parse_date(date)
        wname, wleague = split_team(win)
        if LEAGUE_ROW.match(lose):
            out.append(dict(era="challenge", cup_year=cup_year, date_text=date, played_on=played, ended_on=ended, winner_text=win, winner_name=wname,
                            winner_league=wleague, loser_text=None, loser_name=None, loser_league=None, kind="league", format=lose, score=None))
        else:
            lname, lleague = split_team(lose)
            out.append(dict(era="challenge", cup_year=cup_year, date_text=date, played_on=played, ended_on=ended, winner_text=win, winner_name=wname,
                            winner_league=wleague, loser_text=lose, loser_name=lname, loser_league=lleague, kind="challenge",
                            format=fmt or None, score=score or None))
    return out


def final_rows(table):
    out = []
    for r in table["rows"][1:]:
        c = r["cells"]
        year, win, _coach, games, lose = c[0], c[1], c[2], c[3], c[4]
        if "not awarded" in win.lower():
            continue  # 1919: cancelled; core.title_not_awarded holds it
        wname, wleague = split_team(win)
        lname, lleague = split_team(lose)
        out.append(dict(era="final", cup_year=int(year), date_text=year, played_on=None, ended_on=None, winner_text=win, winner_name=wname,
                        winner_league=wleague, loser_text=lose, loser_name=lname, loser_league=lleague, kind="final", format=None, score=games or None))
    return out


def appearances(text):
    """The challenge-era Appearances table: per club the wins (SC) and losses (UC) and each year with its count; bold = a win that year."""
    block = text.split("===Challenge Cup era (1893–1914)===", 1)[1].split("===Stanley Cup Final era", 1)[0]
    totals, years = [], []
    for line in block.split("\n"):
        if not line.startswith("|") or "winpct" not in line:
            continue
        cells = [x.strip() for x in line[1:].split("||")]
        club = wikitable.clean(re.sub(r"^align=\"?left\"?\s*\|\s*", "", cells[1]))
        sc, uc = int(cells[2]), int(cells[3])
        totals.append(dict(club=club, sc=sc, uc=uc))
        for m in re.finditer(r"('''|)(\d{4})\1(?:\s*\((\d+)\))?", re.sub(r"^align=\"?left\"?\s*\|\s*", "", cells[5])):
            years.append(dict(club=club, cup_year=int(m.group(2)), won=bool(m.group(1)), n=int(m.group(3) or 1)))
    return totals, years


def final_article(raw, year, fetched):
    """The infobox of the article about one of the 1915-1917 finals: the two teams (the winner is bold and has the most games), games won and dates."""
    name = f"{year}_Stanley_Cup_Final.wikitext"
    t = open(os.path.join(raw, name), encoding="utf-8").read()
    box = t.split("{{Infobox Stanley Cup Final", 1)[1].split("\n}}", 1)[0]
    def field(k):
        m = re.search(r"^\|\s*" + k + r"\s*=(.*)$", box, re.M)
        return m.group(1).strip() if m else None
    out = dict(cup_year=year, article=f"{year} Stanley Cup Final", revision_id=fetched.get("revid"), fetched_on=fetched["fetched"], date_text=wikitable.clean(field("dates") or ""))
    for n in ("1", "2"):
        raw_team = field("team" + n)
        name_, league = split_team(wikitable.clean(raw_team))
        out["team" + n], out["team" + n + "_league"] = name_, league
        out["team" + n + "_games"] = int(field("team" + n + "_tot"))
    return out


def sql_str(v):
    return "null" if v is None else "'" + str(v).replace("'", "''") + "'"


def main():
    raw, out_sql = os.path.expanduser(sys.argv[1]), os.path.expanduser(sys.argv[2])
    out_json = os.path.expanduser(sys.argv[3]) if len(sys.argv) > 3 else None
    text = open(os.path.join(raw, "List_of_Stanley_Cup_champions.wikitext"), encoding="utf-8").read()
    log = json.load(open(os.path.join(raw, "fetched.json")))[ARTICLE]
    tables = wikitable.tables(text)
    ch = next(t for t in tables if t["rows"][0]["cells"][:2] == ["Date", "Winning team"])
    fi = next(t for t in tables if t["rows"][0]["cells"][:2] == ["Year", "Winning team"] and t["rows"][1]["cells"][0] == "1915")
    rows = challenge_rows(ch) + final_rows(fi)
    fin = json.load(open(os.path.join(raw, "fetched.json")))
    finals = [final_article(raw, y, fin[f"{y} Stanley Cup Final"]) for y in (1915, 1916, 1917)]
    seq = {}
    by_year = {x["cup_year"]: x for x in finals}
    for r in rows:
        x = by_year.get(r["cup_year"]) if r["era"] == "final" else None
        if x:  # the list gives only the year of these finals; the article for the final gives the days
            r["played_on"], r["ended_on"], _ = parse_date(x["date_text"])
        seq[r["cup_year"]] = seq.get(r["cup_year"], 0) + 1
        r["seq"] = seq[r["cup_year"]]
        r["article"], r["revision_id"], r["fetched_on"] = ARTICLE, log.get("revid"), log["fetched"]
    totals, years = appearances(text)
    cols = ["era", "cup_year", "seq", "date_text", "played_on", "ended_on", "winner_text", "winner_name", "winner_league", "loser_text", "loser_name",
            "loser_league", "kind", "format", "score", "article", "revision_id", "fetched_on"]
    with open(out_sql, "w", encoding="utf-8") as f:
        f.write("-- generated by scripts/stanley_cup/parse.py from the saved wikitext (CC BY-SA 4.0); rerunnable\n")
        f.write("delete from legacy_wikipedia_stanley_cup.series;\ndelete from legacy_wikipedia_stanley_cup.appearance;\ndelete from legacy_wikipedia_stanley_cup.appearance_total;\ndelete from legacy_wikipedia_stanley_cup.final_article;\n")
        fcols = ["cup_year", "article", "revision_id", "fetched_on", "date_text", "team1", "team1_league", "team1_games", "team2", "team2_league", "team2_games"]
        for x in finals:
            f.write("insert into legacy_wikipedia_stanley_cup.final_article (%s) values (%s);\n" % (", ".join(fcols), ", ".join(
                str(x[c]) if c in ("cup_year", "revision_id", "team1_games", "team2_games") else sql_str(x[c]) for c in fcols)))
        for r in rows:
            f.write("insert into legacy_wikipedia_stanley_cup.series (%s) values (%s);\n" % (", ".join(cols), ", ".join(
                (sql_str(r[c]) if c not in ("cup_year", "seq", "revision_id") else str(r[c] if r[c] is not None else "null")) for c in cols)))
        for t in totals:
            f.write("insert into legacy_wikipedia_stanley_cup.appearance_total (club, wins, losses) values (%s, %d, %d);\n" % (sql_str(t["club"]), t["sc"], t["uc"]))
        for y in years:
            f.write("insert into legacy_wikipedia_stanley_cup.appearance (club, cup_year, won, n) values (%s, %d, %s, %d);\n" % (sql_str(y["club"]), y["cup_year"], str(y["won"]).lower(), y["n"]))
    if out_json:
        json.dump({"series": rows, "totals": totals, "years": years, "finals": finals}, open(out_json, "w"), indent=1, ensure_ascii=False)
    kinds = {}
    for r in rows:
        kinds[r["kind"]] = kinds.get(r["kind"], 0) + 1
    print(len(rows), "series rows", kinds, "| appearance clubs", len(totals), "club-years", len(years))


if __name__ == "__main__":
    main()
