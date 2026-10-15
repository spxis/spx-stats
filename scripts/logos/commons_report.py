"""Read what commons_sweep.py collected and say, per league, how many name eras have a public-domain (or other free) logo on Commons,
how many of those fill a gap, how many replace a non-free file and how many upgrade a raster to an SVG. Writes candidates.csv.

Usage: commons_report.py <identities.json> <commons dir> [<out csv> [<load.sql> <YYYY-MM-DD>]]
  with <load.sql>, also writes the SQL that loads every logo-like file read into legacy_team_brand.commons_logo (replacing its rows;
  apply with scripts/mac/ds1-apply.sh; the table is created by migration 108).
A file is matched to a name era only when the era's whole name (or its location and nickname, both) is in the file's title or categories,
and the file reads as a logo. A year range in the file's title, description or categories dates it; an undated file fits every era of
the name and is marked undated (lower confidence). Nothing here writes to a database."""
import csv, json, re, sys, collections, urllib.parse

FREE_PD = re.compile(r"public domain|\bpd\b|cc0|cc-zero|no known copyright", re.I)
NON_FREE = re.compile(r"non-free|fair use|copyright(ed)? \(c\)|all rights", re.I)
NOT_LOGO = re.compile(r"jersey|uniform|helmet|stadium|arena|ballpark|\bpark\b|\bfield\b|\bphoto|\bteam picture|schedule|season|roster|\bvs\b| v ", re.I)
LOGO = re.compile(r"logo|wordmark|emblem|insignia|crest|\bmark\b|seal|\bicon\b|sweater logo|textlogo", re.I)
YEAR = re.compile(r"(?<!\d)(1[89]\d\d|20[0-2]\d)(?!\d)")


def norm(t):
    t = t.lower().replace("é", "e").replace("’", "").replace("'", "").replace(".", "")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", re.sub(r"[_\-]", " ", t))).strip()


def years_of(text):
    ys = [int(y) for y in YEAR.findall(text)]
    return (min(ys), max(ys)) if ys else None


def licence_class(meta):
    s = " ".join(str(meta.get(k, "")) for k in ("LicenseShortName", "UsageTerms", "License"))
    if NON_FREE.search(s):
        return "non-free"
    if FREE_PD.search(s) or str(meta.get("Copyrighted", "")).lower() == "false":
        return "pd"
    if s.strip():
        return "free"          # CC BY, CC BY-SA and the like: free to show, with credit
    return "unknown"


def strip_html(s):
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", s or "")).strip()


def q(v):
    return "null" if v is None or v == "" else "'" + str(v).replace("'", "''") + "'"


def write_load_sql(files, path, day):
    with open(path, "w") as fh:
        fh.write("delete from legacy_team_brand.commons_logo;\n")
        for f in files:
            name = f["title"].removeprefix("File:").replace(" ", "_")
            yf, yt = (f["years"] or (None, None))
            fh.write("insert into legacy_team_brand.commons_logo (file, page_url, file_url, thumb_url, mime, width, height, bytes, licence, licence_class, "
                     "restrictions, categories, years_from, years_to, fetched_on) values "
                     f"({q(name)}, {q(f['page'])}, {q(f['url'])}, {q(f.get('thumb'))}, {q(f['mime'])}, {q(f['w'])}, {q(f['h'])}, {q(f['bytes'])}, "
                     f"{q(f['licence'])}, {q(f['cls'])}, {q(f['restr'])}, {q(f['cats'])}, {q(yf)}, {q(yt)}, {q(day)}) on conflict (file) do nothing;\n")


def main(ident_file, cdir, out_csv, sql_out=None, day=None):
    idents = json.load(open(ident_file))
    raw = json.load(open(f"{cdir}/raw.json"))
    info = {t: i for t, i in raw["info"].items() if not i.get("missing")}
    files = []
    for t, i in info.items():
        m = i.get("meta", {})
        catlist = [norm(c) for c in (m.get("Categories") or "").split("|") if c]
        cats = " ; ".join(catlist)
        desc = strip_html(m.get("ImageDescription"))
        title = norm(t.removeprefix("File:").rsplit(".", 1)[0] + " " + (m.get("ObjectName") or ""))
        mime = i.get("mime") or ""
        # a logo is a vector or small picture whose title says so, or whose categories do; a photograph (jpeg) only when its title says logo
        if mime == "image/jpeg":
            ok = "logo" in title
        elif mime == "image/svg+xml":
            ok = bool(LOGO.search(title) or LOGO.search(cats))
        else:
            ok = bool(LOGO.search(title) or re.search(r"logo|wordmark|textlogo|emblem", cats))
        if not ok or (NOT_LOGO.search(title) and "logo" not in title):
            continue
        files.append({"title": t, "text": title, "catlist": catlist, "cats": cats, "cls": licence_class(m), "mime": mime,
                      "w": i.get("w"), "h": i.get("h"), "bytes": i.get("bytes"), "page": i.get("page"), "url": i.get("url"),
                      "licence": m.get("LicenseShortName") or m.get("UsageTerms") or "", "restr": m.get("Restrictions") or "",
                      "thumb": i.get("thumb"), "years": years_of(t + " " + (m.get("ObjectName") or "") + " " + desc[:300] + " " + (m.get("Categories") or "")),
                      "title_years": years_of(t)})

    # the names of every identity of a franchise, to tell a file about one era's name from a file about another's
    sib = collections.defaultdict(set)
    for r in idents:
        sib[r["fid"]].add(norm(r["name"]))

    def has(text, phrase):
        return bool(phrase) and re.search(rf"(?<![a-z0-9]){re.escape(phrase)}(?![a-z0-9])", text) is not None

    # the sport a file's title or categories name; a file that names another sport than the club's (the Edmonton Eskimos of the CFL
    # for the hockey club of that name, a rugby club for a basketball one) is not this club's
    SPORTS = {"hockey": r"hockey", "basketball": r"basketball", "baseball": r"baseball", "american_football": r"american football|\bnfl\b",
              "canadian_football": r"canadian football|\bcfl\b", "other": r"rugby|soccer|association football|cricket|lacrosse|volleyball|handball|netball|futsal|roller derby|esports|college|university|high school"}
    OWN_SPORT = {"nhl": "hockey", "nba": "basketball", "mlb": "baseball", "nfl": "american_football", "cfl": "canadian_football", "other:hockey": "hockey"}

    def sports_of(text):
        return {k for k, rx in SPORTS.items() if re.search(rx, text, re.I)}

    for f in files:
        f["sports"] = sports_of(f["text"] + " " + f["cats"])

    if sql_out:
        write_load_sql(files, sql_out, day)

    def cur_ext(cur):
        u = (cur or {}).get("url") or ""
        m = re.search(r"/thumb/.*?/([^/]+?)/\d+px-", u) or re.search(r"/([^/?]+?)(?:\?|$)", u)
        n = (m.group(1) if m else u).lower()
        return "svg" if ".svg" in n else ("gif" if ".gif" in n else "png/jpg")

    def cur_class(cur):
        lic = (cur or {}).get("licence") or ""
        if not cur:
            return "gap"
        return "non-free" if NON_FREE.search(lic) else "free"

    rows = []
    per = collections.defaultdict(lambda: collections.Counter())
    for r in idents:
        lg = r["lg"]
        full, loc, nick = norm(r["name"]), norm(r["location"]), norm(r["nickname"])
        y0, y1 = r["y0"] or 0, (r["y1"] or 9999)
        cands = []
        for f in files:
            own_title = has(f["text"], full) if len(full.split()) >= 2 else False
            own_pair = bool(loc and nick and has(f["text"], nick) and has(f["text"], loc))
            by_cat = full in f["catlist"] and len(full.split()) >= 2 and not any(has(f["text"], o) for o in sib[r["fid"]] if o != full and len(o.split()) >= 2)
            if not (own_title or own_pair or by_cat):
                continue
            # another era's name in the title (Indianapolis Colts for the Baltimore Colts) makes it that era's file
            if not own_title and any(has(f["text"], o) for o in sib[r["fid"]] if o != full and len(o.split()) >= 2):
                continue
            if f["sports"] and OWN_SPORT.get(lg) not in f["sports"]:
                continue
            if lg.startswith("other") and OWN_SPORT[lg] not in f["sports"] and not own_title:
                continue
            ys = f["years"]
            if ys:
                # a dated file fits the era when its years overlap the era's; a single year (a logo "introduced" in Y)
                # also fits an era that starts after it
                if not ((ys[0] < y1 and ys[1] >= y0) or (ys[0] == ys[1] and ys[0] < y0)):
                    continue
            cands.append((f, "dated" if ys else "undated"))
        cc = cur_class(r["cur"])
        ext = cur_ext(r["cur"])
        pd = [(f, d) for f, d in cands if f["cls"] == "pd"]
        free = [(f, d) for f, d in cands if f["cls"] in ("pd", "free")]
        word = lambda f: bool(re.search(r"word ?mark|lettering only|\btext\b", f["text"]))   # a club's name in letters, not its mark
        best = None
        if free:
            best = sorted(free, key=lambda x: (x[0]["cls"] != "pd", word(x[0]), x[1] != "dated", not x[0]["title"].lower().endswith(".svg"), x[0]["title"]))[0]
        c = per[lg]
        c["eras"] += 1
        c[f"now_{cc}"] += 1
        if pd:
            c["eras_with_pd"] += 1
            if cc == "gap":
                c["pd_fills_gap"] += 1
                if all(word(f) for f, _ in pd):
                    c["pd_gap_wordmark_only"] += 1
            if cc == "non-free":
                c["pd_replaces_wordmark" if all(word(f) for f, _ in pd) else "pd_replaces_nonfree"] += 1
            if cc == "free" and ext != "svg" and any(f["title"].lower().endswith(".svg") for f, _ in pd):
                c["pd_svg_upgrade"] += 1
            if all(d == "undated" for _, d in pd):
                c["pd_undated_only"] += 1
        elif free:
            c["eras_with_other_free"] += 1
            if cc == "gap":
                c["other_free_fills_gap"] += 1
        if cc == "gap" and not free:
            c["still_missing"] += 1
        rows.append({"league": lg, "iid": r["iid"], "fid": r["fid"], "era": r["name"], "from": r["y0"], "to": r["y1"], "now": cc, "now_ext": ext,
                     "n_pd": len(pd), "n_free": len(free), "best": best[0]["title"] if best else "", "best_class": best[0]["cls"] if best else "",
                     "best_dating": best[1] if best else "", "best_licence": best[0]["licence"] if best else "",
                     "best_page": best[0]["page"] if best else "", "best_wordmark": word(best[0]) if best else ""})
    with open(out_csv, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    keys = ["eras", "now_gap", "now_non-free", "now_free", "eras_with_pd", "pd_fills_gap", "pd_gap_wordmark_only", "pd_replaces_nonfree", "pd_replaces_wordmark", "pd_svg_upgrade",
            "pd_undated_only", "eras_with_other_free", "other_free_fills_gap", "still_missing"]
    print("league".ljust(14) + "".join(k[:13].rjust(14) for k in keys))
    tot = collections.Counter()
    for lg in sorted(per):
        print(lg.ljust(14) + "".join(str(per[lg][k]).rjust(14) for k in keys))
        tot.update(per[lg])
    print("TOTAL".ljust(14) + "".join(str(tot[k]).rjust(14) for k in keys))
    print(len(files), "logo-like files read of", len(info))


if __name__ == "__main__":
    a = sys.argv[1:]
    main(a[0], a[1], a[2] if len(a) > 2 else "candidates.csv", a[3] if len(a) > 3 else None, a[4] if len(a) > 4 else None)
