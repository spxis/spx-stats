"""Sweep Wikimedia Commons for every logo of the clubs and name eras DS1 holds, with each file's licence, through the Commons API only
(no HTML). Read-only on our side: it needs the identities export (scripts/logos/identities.sql run on DS1, JSON) and writes one cache file.

Usage: commons_sweep.py <identities.json> <out dir>
  <out>/raw.json   everything the API answered, keyed so a rerun asks only for what is missing:
                   search[name]   the file titles a "<name> logo" search on Commons returned
                   cats[title]    whether Category:<name> (and its "logos" variants) exists, and its file members
                   info[title]    imageinfo: url, size, mime and extmetadata (licence, categories, description, dates)
One request at a time, 1.5 s apart, a User-Agent that names the project, Retry-After honoured. About 1,000 requests for 330 names.
Commons content is licensed per file; the licence is read from each file's own extmetadata and stored with it."""
import json, os, re, sys, time, urllib.error, urllib.parse, urllib.request

UA = {"User-Agent": "spx-stats/1.0 (https://spxn.com; john@spxis.com)"}
API = "https://commons.wikimedia.org/w/api.php"
PAUSE = 1.5
IMAGE_EXT = re.compile(r"\.(svg|png|gif|webp|jpe?g)$", re.I)


def norm(t):
    t = re.sub(r"[^a-z0-9 ]", "", re.sub(r"[_\-]", " ", t.lower().replace("é", "e").replace("’", "").replace("'", "")))
    return re.sub(r"\s+", " ", t).strip()


def call(**params):
    url = API + "?" + urllib.parse.urlencode({"format": "json", "formatversion": 2, **params})
    for n in range(10):
        time.sleep(PAUSE)
        print("GET", url[len(API):][:110], flush=True)
        try:
            return json.loads(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read())
        except urllib.error.HTTPError as e:
            if e.code not in (429, 503):
                raise
            wait = int(e.headers.get("Retry-After") or 20) + 5 * n
            print("HTTP", e.code, "waiting", wait, flush=True)
            time.sleep(wait)
    raise SystemExit("gave up: " + url[:100])


def main(ident_file, out):
    os.makedirs(out, exist_ok=True)
    raw_file = os.path.join(out, "raw.json")
    raw = json.load(open(raw_file)) if os.path.exists(raw_file) else {}
    for k in ("search", "cats", "info"):
        raw.setdefault(k, {})

    def save():
        json.dump(raw, open(raw_file + ".tmp", "w"))
        os.replace(raw_file + ".tmp", raw_file)

    idents = json.load(open(ident_file))
    names = sorted({r["name"] for r in idents})
    nick = {r["name"]: norm(r["nickname"]) for r in idents}

    # 1. one search per name: files whose text matches "<name>" and "logo"
    for name in names:
        if name in raw["search"]:
            continue
        r = call(action="query", list="search", srnamespace=6, srlimit=40, srsearch=f'"{name}" logo')
        raw["search"][name] = [h["title"] for h in r["query"]["search"]]
        save()

    # 2. does the club have a Commons category (or a logos category), and which files are in it
    probes = {}
    for name in names:
        for t in (f"Category:{name}", f"Category:{name} logos", f"Category:Logos of the {name}", f"Category:Logos of {name}"):
            probes[t] = name
    todo = [t for t in probes if t not in raw["cats"]]
    for i in range(0, len(todo), 50):
        chunk = todo[i:i + 50]
        r = call(action="query", prop="categoryinfo", titles="|".join(chunk))
        back = {n["from"]: n["to"] for n in r["query"].get("normalized", [])}
        found = {p["title"]: p for p in r["query"]["pages"] if not p.get("missing")}
        for t in chunk:
            p = found.get(back.get(t, t))
            raw["cats"][t] = {"exists": bool(p), "files": (p or {}).get("categoryinfo", {}).get("files", 0),
                              "subcats": (p or {}).get("categoryinfo", {}).get("subcats", 0), "members": None, "sub": None}
        save()
    for t, c in list(raw["cats"].items()):
        if not c["exists"] or c["members"] is not None:
            continue
        members, sub, cont = [], [], {}
        while True:
            r = call(action="query", list="categorymembers", cmtitle=t, cmtype="file|subcat", cmlimit=200, **cont)
            for m in r["query"]["categorymembers"]:
                (members if m["ns"] == 6 else sub).append(m["title"])
            if "continue" not in r:
                break
            cont = r["continue"]
        c["members"], c["sub"] = members, sub
        # a subcategory of logos (Category:Foo logos inside Category:Foo) is read one level down
        for s in sub:
            if re.search(r"logo|emblem|wordmark", s, re.I) and s not in raw["cats"]:
                m2, cont = [], {}
                while True:
                    r = call(action="query", list="categorymembers", cmtitle=s, cmtype="file", cmlimit=200, **cont)
                    m2 += [m["title"] for m in r["query"]["categorymembers"]]
                    if "continue" not in r:
                        break
                    cont = r["continue"]
                raw["cats"][s] = {"exists": True, "files": len(m2), "subcats": 0, "members": m2, "sub": []}
        save()

    # 3. imageinfo for the files worth reading: image types naming the club's nickname, or "logo" in the title
    cand = set()
    for name, hits in raw["search"].items():
        for t in hits:
            n = norm(t)
            if IMAGE_EXT.search(t) and (nick[name] in n) and (not re.search(r"\.jpe?g$", t, re.I) or "logo" in n):
                cand.add(t)
    for t, c in raw["cats"].items():
        for m in c.get("members") or []:
            if IMAGE_EXT.search(m):
                cand.add(m)
    todo = sorted(t for t in cand if t not in raw["info"])
    print(len(cand), "files, reading", len(todo), flush=True)
    for i in range(0, len(todo), 50):
        chunk = todo[i:i + 50]
        r = call(action="query", prop="imageinfo", iiprop="url|size|mime|extmetadata", iiurlwidth=250, titles="|".join(chunk))
        back = {n["from"]: n["to"] for n in r["query"].get("normalized", [])}
        pages = {p["title"]: p for p in r["query"]["pages"]}
        for t in chunk:
            p = pages.get(back.get(t, t), {})
            ii = (p.get("imageinfo") or [None])[0]
            raw["info"][t] = {"missing": ii is None, **({} if ii is None else {
                "url": ii.get("url"), "thumb": ii.get("thumburl"), "page": ii.get("descriptionurl"), "w": ii.get("width"),
                "h": ii.get("height"), "bytes": ii.get("size"), "mime": ii.get("mime"),
                "meta": {k: v.get("value") for k, v in (ii.get("extmetadata") or {}).items()
                         if k in ("LicenseShortName", "UsageTerms", "License", "Restrictions", "Categories", "ImageDescription", "Artist",
                                  "Credit", "DateTimeOriginal", "ObjectName", "Copyrighted", "AttributionRequired", "NonFree", "LicenseUrl")}})}
        save()
    print("done:", len(raw["search"]), "searches,", len(raw["cats"]), "categories,", len(raw["info"]), "files")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
