#!/usr/bin/env python3
"""Raw articles (fetch.py) -> db/seed/mlb_pre1903_champion.csv: the pennant winner of every major league and every postseason series, 1871-1902.

  parse.py RAW_DIR [out.csv]        (default: stdout)

Columns: year, role, league, event, club, opponent, score, counts_as_champion, note, source_url, core_club
  core_club  the club's name in core that season where it differs from the article's (St. Louis Browns 1885-88 are "St. Louis Cardinals" in core; empty otherwise)
  role 'pennant'  one row per league and year: league NA, NL, AA, UA, PL, AL or FL (the Federal League's 1914 and 1915 winners); club = the club's name in its season article's title.
  role 'series'   one row per postseason series (the World's Championship Series 1884-92 and its 1885 and 1890 ties, the Temple Cup 1894-97, the
                  Chronicle-Telegraph Cup 1900); club = the winner, opponent = the other side, score as printed; a tie has club "A / B".
  counts_as_champion  'true' on the one row that names the season's champion, 'false' elsewhere. The rule (db/seed README in the build step):
                  a series winner where a series was played; else the pennant winner where only one major league played (NA 1871-75, NL 1876-81,
                  1893, 1898, 1899); no single champion where two co-equal leagues did not meet (1882, 1883, 1891, 1901, 1902).
Sources: the infobox of "<year> Major League Baseball season" (conference champions, finals) and "List of pre-World Series baseball champions"
(1871-75 National Association champions, series scores). English Wikipedia, CC BY-SA 4.0.
"""
import csv, io, os, re, sys

# a club the season article names one way and core another (core.franchise_identity of that season)
CORE_NAME = {(1885, "St. Louis Browns"): "St. Louis Cardinals", (1886, "St. Louis Browns"): "St. Louis Cardinals",
             (1887, "St. Louis Browns"): "St. Louis Cardinals", (1888, "St. Louis Browns"): "St. Louis Cardinals",
             (1901, "Chicago White Stockings"): "Chicago White Sox"}
LEAGUE_OK = {"NA", "NL", "AA", "UA", "PL", "AL", "FL"}
SOLE_MAJOR_YEARS = set(range(1871, 1882)) | {1893, 1898, 1899}


def link_club(s):
    """'[[1884 Providence Grays season|Providence Grays]]' -> ('Providence Grays', '1884 Providence Grays season'); several links give a list."""
    out = []
    for m in re.finditer(r"\[\[([^\]|]+)(?:\|([^\]]*))?\]\]", s):
        title = m.group(1).strip()
        mm = re.match(r"^\d{4} (.+) season$", title)
        out.append(mm.group(1) if mm else (m.group(2) or title).strip())
    return out


def infobox(text):
    m = re.search(r"\{\{Infobox (?:sports season|MLB season)[^\n]*\n(.*?)\n\}\}", text, re.S)
    kv = {}
    if m:
        for line in m.group(1).split("\n"):
            mm = re.match(r"\|\s*([\w\-]+)\s*=\s*(.*)", line)
            if mm: kv[mm.group(1)] = mm.group(2).strip()
    return kv


def plain(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>|'''|''|\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", s)).strip()


def series_scores(list_text):
    """{year: score text} from the main table of the list (the Series column: '3–0', '3–3–(1)*', 'no Series')."""
    out = {}
    a = list_text.find("==Champions from 1876 to 1904==")
    b = list_text.find("==Totals==")
    body = list_text[a:b]
    for row in body.split("\n|-"):
        m = re.search(r"\{\{(?:m?l?by)\|(\d{4})\}\}", row)
        if not m: continue
        cells = [c.strip() for c in re.split(r"\n\|", row)]
        for c in cells:
            if re.match(r"^(?:bgcolor=\S+\s*\|)?\s*''?\s*\d+(?:&ndash;|[–-])\d+(?:(?:&ndash;|[–-])\(\d+\)\*)?'*\s*(?:†)?\s*$", c) or re.search(r"bgcolor=(?:eeeeee|honeydew)\s*\|", c) and re.search(r"\d", c):
                sc = re.sub(r"^.*\|", "", c)
                sc = plain(sc.replace("&ndash;", "–")).replace("†", "").strip()
                if re.match(r"^\d+–\d+", sc): out[int(m.group(1))] = sc; break
    return out


def na_champions(list_text):
    """1871-75: the first table's {{by|year}} rows with the link to that season's article."""
    out = {}
    for m in re.finditer(r"\{\{by\|(18(?:7[1-5]))\}\}\s*\n\|[^\n]*?\[\[(\d{4} [^\]|]+? season)(?:\|[^\]]*)?\]\]", list_text):
        out[int(m.group(1))] = re.sub(r"^\d{4} | season$", "", m.group(2))
    return out


def rows(raw):
    lt = open(os.path.join(raw, "list.wikitext"), encoding="utf-8").read()
    scores = series_scores(lt)
    res = []
    url = lambda y: f"https://en.wikipedia.org/wiki/{y}_Major_League_Baseball_season"
    for y, club in sorted(na_champions(lt).items()):
        res.append([y, "pennant", "NA", "National Association pennant", club, "", "", "true", "", "https://en.wikipedia.org/wiki/List_of_pre-World_Series_baseball_champions"])
    for y in list(range(1876, 1903)) + [1914, 1915]:
        p = os.path.join(raw, f"s{y}.wikitext")
        if not os.path.exists(p): continue
        kv = infobox(open(p, encoding="utf-8").read())
        pennants = []
        for i in (1, 2, 3):
            lg = plain(kv.get(f"conf{i}", ""))
            ch = link_club(kv.get(f"conf{i}_champ", ""))
            if lg in LEAGUE_OK and ch and (y < 1903 or lg == "FL"): pennants.append((lg, ch[0]))   # 1914-15: the Federal League only (the modern World Series names the rest)
        fin = plain(kv.get("finals", ""))
        champ_raw = kv.get("finals_champ", "")
        has_series = bool(fin) and y < 1903
        for lg, club in sorted(pennants, key=lambda x: ("NA", "NL", "AA", "UA", "PL", "AL", "FL").index(x[0])):
            counts = (not has_series) and y in SOLE_MAJOR_YEARS and lg == "NL"
            res.append([y, "pennant", lg, {"NA": "National Association pennant", "NL": "National League pennant", "AA": "American Association pennant", "UA": "Union Association pennant",
                                             "PL": "Players' League pennant", "AL": "American League pennant", "FL": "Federal League pennant"}[lg], club, "", "", "true" if counts else "false", "", url(y)])
        if has_series:
            ru = link_club(kv.get("finals_runner-up", ""))
            ch = link_club(champ_raw)
            tie = "tie" in champ_raw.lower() or len(ru) == 2 and not ch
            event = re.sub(r"^Chronicle-Telegraph Cup$", "Chronicle-Telegraph Cup", fin)
            sc = scores.get(y, "")
            if tie:
                res.append([y, "series", "", event, " / ".join(ru), "", sc, "true", "The series ended in a tie.", url(y)])
            else:
                note = "Played between the winners of the two halves of the National League's split season." if y == 1892 else ""
                res.append([y, "series", "", event, ch[0] if ch else "", ru[0] if ru else "", sc, "true", note, url(y)])
    return res


def main(raw, out=None):
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(["year", "role", "league", "event", "club", "opponent", "score", "counts_as_champion", "note", "source_url", "core_club"])
    for r in rows(raw):
        names = [x.strip() for x in r[4].split(" / ")]
        core = " / ".join(CORE_NAME.get((r[0], x), x) for x in names)
        w.writerow(r + ["" if core == r[4] else core])
    if out: open(out, "w", encoding="utf-8", newline="").write(buf.getvalue())
    else: sys.stdout.write(buf.getvalue())


if __name__ == "__main__":
    if len(sys.argv) not in (2, 3): sys.exit(__doc__)
    main(os.path.expanduser(sys.argv[1]), sys.argv[2] if len(sys.argv) == 3 else None)
