"""Find logos for the teams Wikidata has none for: the logo file named in the infobox of the team's English Wikipedia
article (via Wikidata's enwiki sitelink, the article's wikitext, and the file's URL and licence from imageinfo).
PageImages leaves non-free files out, which is why the wikitext is read instead.
Usage: team_logos_wikipedia.py <out dir> <YYYY-MM-DD>
Writes <out>/raw.json (the answers as received, wikitext cut to the infobox logo line), then loads
legacy_team_brand.wikipedia_logo through psql. Rerunnable: it replaces the table. One request per 1.5 s."""
import json, os, re, subprocess, sys, time, urllib.parse, urllib.request, urllib.error
out, day = sys.argv[1:3]
os.makedirs(out, exist_ok=True)
UA = {"User-Agent": "spx-stats/1.0 (https://spxn.com; john@spxis.com)"}
PSQL = ["psql", "-h", "/tmp", "-p", "55432", "-U", "postgres", "-d", "spx_stats", "-X", "-At", "-v", "ON_ERROR_STOP=1"]
INFOBOX_LOGO = re.compile(
    r"^\s*\|\s*(?:logo|logo_image|team_logo|image|image_name)\s*=\s*(?:\[\[)?(?:File:|Image:)?([^|\]\n]+?\.(?:svg|png|gif|jpe?g|webp))",
    re.I | re.M)


def get(url):
    for n in range(12):
        time.sleep(1.5)
        print("GET", url[:100], flush=True)
        try:
            return json.loads(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read())
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            if e.code not in (429, 503):
                raise
            wait = int(e.headers.get("Retry-After") or 20) + 5 * n
            print("HTTP", e.code, "waiting", wait, flush=True)
            time.sleep(wait)
    raise SystemExit("gave up: " + url[:90])


def save():
    json.dump(raw, open(raw_file, "w"), indent=0)


teams = subprocess.run(
    PSQL + ["-F", "\t", "-c",
            "select t.qid, t.league_code, t.label from legacy_team_brand.team t where not exists "
            "(select 1 from legacy_team_brand.team_logo l where l.qid = t.qid and l.thumb_url is not null) order by 2, 1"],
    capture_output=True, text=True, check=True).stdout.strip().splitlines()
raw_file = f"{out}/raw.json"
raw = json.load(open(raw_file)) if os.path.exists(raw_file) else {}
for k in ("entity", "article", "imageinfo"):
    raw.setdefault(k, {})

todo = []
for line in teams:
    qid, lg, label = line.split("\t")
    if qid not in raw["entity"]:
        e = get(f"https://www.wikidata.org/wiki/Special:EntityData/{qid}.json")
        ent = list(e["entities"].values())[0] if e else {}
        raw["entity"][qid] = {"enwiki": ent.get("sitelinks", {}).get("enwiki", {}).get("title")}
        save()
    title = raw["entity"][qid]["enwiki"]
    if not title:
        print("no article", qid, label)
        continue
    todo.append((qid, lg, label, title))

for i in range(0, len(todo), 20):
    chunk = [t for _, _, _, t in todo[i:i + 20] if t not in raw["article"]]
    if not chunk:
        continue
    r = get("https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode({
        "action": "query", "format": "json", "prop": "revisions", "rvprop": "content", "rvslots": "main",
        "redirects": 1, "titles": "|".join(chunk)}))
    q_ = r["query"]
    back = {n["from"]: n["to"] for n in q_.get("normalized", []) + q_.get("redirects", [])}
    pages = {p["title"]: p for p in q_["pages"].values()}
    for t in chunk:
        tt = back.get(t, t)
        tt = back.get(tt, tt)
        text = ((pages.get(tt, {}).get("revisions") or [{}])[0].get("slots", {}).get("main", {}).get("*")) or ""
        m = INFOBOX_LOGO.search(text)
        raw["article"][t] = {"title": tt, "logo": m.group(1).strip().replace("_", " ") if m else None, "line": m.group(0).strip() if m else None}
    save()

names = sorted({raw["article"][t]["logo"] for _, _, _, t in todo if raw["article"].get(t, {}).get("logo")})
for i in range(0, len(names), 40):
    chunk = [n for n in names[i:i + 40] if n.replace(" ", "_") not in raw["imageinfo"]]
    if not chunk:
        continue
    r = get("https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode({
        "action": "query", "format": "json", "prop": "imageinfo", "iiprop": "url|extmetadata", "iiurlwidth": 200,
        "titles": "|".join("File:" + n for n in chunk)}))
    q_ = r["query"]
    back = {n["from"]: n["to"] for n in q_.get("normalized", [])}
    pages = {p["title"]: p for p in q_["pages"].values()}
    for n in chunk:
        raw["imageinfo"][n.replace(" ", "_")] = pages.get(back.get("File:" + n, "File:" + n), {})
    save()

found = {}
for qid, lg, label, title in todo:
    fname = (raw["article"].get(title) or {}).get("logo")
    info = raw["imageinfo"].get((fname or "").replace(" ", "_")) or {}
    ii = (info.get("imageinfo") or [None])[0]
    if not fname or not ii or re.search(r"helmet|jersey|uniform|stadium", fname, re.I):
        print("no logo image", qid, label, fname)
        continue
    found[qid] = (lg, title, fname, ii.get("thumburl") or ii.get("url"), ii.get("url"), ii.get("extmetadata") or {})


def q(v):
    return "null" if v is None else "'" + str(v).replace("'", "''") + "'"


sql = ["begin;", "delete from legacy_team_brand.wikipedia_logo;"]
for qid, (lg, title, fname, th, full, md) in sorted(found.items()):
    nonfree = md.get("NonFree", {}).get("value") in ("true", True) or not md.get("LicenseShortName")
    lic = "Non-free logo, fair use (English Wikipedia)" if nonfree else md["LicenseShortName"]["value"]
    page = "https://en.wikipedia.org/wiki/File:" + urllib.parse.quote(fname.replace(" ", "_"))
    sql.append(f"insert into legacy_team_brand.wikipedia_logo values ({q(qid)},{q(lg)},{q(title)},{q(fname)},{q(th)},{q(full)},{q(page)},{q(lic)},{'true' if nonfree else 'false'},{q(day)});")
sql.append("commit;")
subprocess.run(PSQL + ["-q"], input="\n".join(sql), text=True, check=True)
print(len(found), "of", len(teams), "teams have a logo image")
