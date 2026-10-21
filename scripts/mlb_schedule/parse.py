#!/usr/bin/env python3
"""Read the saved "Major League Baseball schedule" wikitext (fetch.py, English Wikipedia, CC BY-SA 4.0) into the announced regular-season length of
each major-league season, and write db/seed/mlb_season_length.csv (start_year, games_per_team).
Usage: parse.py <raw dir> <out.csv>
The article lists, per league, the years the announced length changed (National League, American League, American Association), plus one-line
entries for the Union Association (1884) and the Players' League (1890). A season gets a number only when every league that played it announced the same
one; a season of two different lengths (1884, 1886-87, 1961 ...) or of a league the article does not list (the National Association 1871-75, the
Federal League 1914-15) stays empty. 1995 (revised to 144) and 2020 (60) are read from the prose. Nothing is guessed: a table the reader does not
understand stops the run."""
import csv, os, re, sys

LEAGUE_YEARS = {"NL": (1876, 9999), "AA": (1882, 1891), "AL": (1901, 9999), "UA": (1884, 1884), "PL": (1890, 1890)}
NOT_LISTED = {1871, 1872, 1873, 1874, 1875, 1914, 1915}  # National Association; Federal League


def clean_int(s):
    m = re.search(r"\d+", re.sub(r"<!--.*?-->", "", s))
    if not m:
        raise SystemExit("not a number: " + s)
    return int(m.group(0))


def tables(text):
    """[(section heading, [(start year, games)])] for each wikitable, in page order."""
    out, section = [], ""
    lines = text.split("\n")
    i = 0
    while i < len(lines):
        ln = lines[i]
        m = re.match(r"^=+\s*(.*?)\s*=+\s*$", ln)
        if m:
            section = m.group(1)
        if ln.startswith("{| class=\"wikitable\""):
            rows, cells = [], []
            i += 1
            while not lines[i].startswith("|}"):
                s = lines[i]
                if s.startswith("|-"):
                    if len(cells) >= 2:
                        rows.append((cells[0], cells[1]))
                    cells = []
                elif s.startswith("|") and not s.startswith("|}") and len(cells) < 2:
                    cells.append(s[1:].strip())
                i += 1
            if len(cells) >= 2:
                rows.append((cells[0], cells[1]))
            if rows and rows[0][0].lstrip("!").strip().lower().startswith("start"):
                rows = rows[1:]
            rows = [(r[0], r[1]) for r in rows if re.match(r"^\s*(?:\d{4})", re.sub(r"<!--.*?-->", "", r[0]))]
            if rows and re.match(r"^\s*\d+", re.sub(r"<!--.*?-->", "", rows[0][1])):
                out.append((section, [(clean_int(a), clean_int(b)) for a, b in rows]))
        i += 1
    return out


def league_steps(text):
    """{'NL': [(year, games)], 'AL': [...], 'AA': [...]} from the tables, by the section each is under."""
    steps = {"NL": [], "AL": [], "AA": []}
    for section, rows in tables(text):
        if section.startswith("National League"):
            steps["NL"] += rows
        elif section.startswith("American League"):
            steps["AL"] += rows
        elif section.startswith("American Association"):
            steps["AA"] += rows
    for k, v in steps.items():
        if not v:
            raise SystemExit("no table found for " + k)
        v.sort()
    return steps


def one_line(text, year):
    m = re.search(r"^:%d:\s*(\d+) games" % year, text, re.M)
    if not m:
        raise SystemExit("no line for %d" % year)
    return int(m.group(1))


def season_lengths(text):
    steps = league_steps(text)
    step = {k: dict(v) for k, v in steps.items()}
    first = {"NL": 1876, "AL": 1901, "AA": 1882}
    if min(y for y, _ in steps["NL"]) != 1876 or min(y for y, _ in steps["AL"]) != 1901 or min(y for y, _ in steps["AA"]) != 1882:
        raise SystemExit("a league table does not start in its first year")
    fixed = {"UA": one_line(text, 1884), "PL": one_line(text, 1890)}
    last_year = max(y for y, _ in steps["NL"] + steps["AL"])
    res, why = {}, {}
    for year in range(1876, 2027):
        vals = {}
        for lg, (a, b) in LEAGUE_YEARS.items():
            if not a <= year <= b:
                continue
            if lg in fixed:
                vals[lg] = fixed[lg]
            else:
                vals[lg] = [g for y, g in steps[lg] if y <= year][-1]
        if year in NOT_LISTED:
            continue
        if len(set(vals.values())) == 1:
            res[year] = next(iter(vals.values()))
        else:
            why[year] = vals
    m = re.search(r"shortened from (\d+) to (\d+) games", text)
    if not m or int(m.group(2)) != 144:
        raise SystemExit("1995 revision not found")
    res[1995] = 144
    m = re.search(r"Each team would only play (\d+) games this season", text)
    if not m:
        raise SystemExit("2020 length not found")
    res[2020] = int(m.group(1))
    if last_year > 2012:
        raise SystemExit("the tables now reach past 2012: review the step rule")
    return res, why


def main():
    raw, out = os.path.expanduser(sys.argv[1]), os.path.expanduser(sys.argv[2])
    text = open(os.path.join(raw, "Major_League_Baseball_schedule.wikitext"), encoding="utf-8").read()
    res, why = season_lengths(text)
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["start_year", "games_per_team"])
        for y in sorted(res):
            w.writerow([y, res[y]])
    print(len(res), "seasons with a length;", len(why), "left empty (leagues differ):", ", ".join("%d %s" % (y, v) for y, v in sorted(why.items())))


if __name__ == "__main__":
    main()
