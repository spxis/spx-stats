#!/usr/bin/env python3
"""Download the openfootball club-league repositories (CC0) and keep the files the loader reads.
Usage: fetch.py <raw dir> [--tarballs DIR]     e.g. fetch.py ~/Projects/backups/spx-stats/raw/openfootball/2026-10-25
One request per repository (the branch tarball from codeload) and one for its latest commit id, two seconds apart; nothing else is fetched. With --tarballs the
tarballs are read from (and, when missing, saved to) DIR instead of being kept nowhere. <raw dir> gets, per repository, LICENSE.md, README.md, NOTES.md and the
league files of the seasons the loader reads, at the same paths as in the repository, plus MANIFEST.json (repository, commit, sha256 of the tarball, licence).
Rerunnable: files are replaced by the same bytes."""
import hashlib, json, os, re, sys, tarfile, time, urllib.request

UA = "spx-stats/1.0 (https://spxn.com; john@spxis.com)"
REPOS = ["england", "deutschland", "espana", "italy", "europe"]
# paths (inside a repository) the loader reads: the league files (a digit first: 1-premierleague.txt) and, for France, europe/france/<season>_fr1|fr2.txt
KEEP = [
    r"^england/(\d{4}-\d\d|archive/1990s/\d{4}-\d\d)/[1-5]-[a-z0-9]+\.txt$",
    r"^deutschland/\d{4}-\d\d/[1-3]-[a-z0-9]+\.txt$",
    r"^espana/\d{4}-\d\d/[1-2]-[a-z0-9]+\.txt$",
    r"^italy/\d{4}-\d\d/[1-2]-[a-z0-9]+\.txt$",
    r"^europe/france/\d{4}-\d\d_fr[12]\.txt$",
    r"^[a-z]+/(LICENSE|README|NOTES)\.md$",
]
KEEP_RE = [re.compile(k) for k in KEEP]


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=180) as r:
        return r.read()


def main():
    argv = sys.argv[1:]
    tdir = None
    if "--tarballs" in argv:
        i = argv.index("--tarballs"); tdir = os.path.expanduser(argv[i + 1]); del argv[i:i + 2]
        os.makedirs(tdir, exist_ok=True)
    raw = os.path.expanduser(argv[0])
    os.makedirs(raw, exist_ok=True)
    manifest = {}
    for repo in REPOS:
        tpath = os.path.join(tdir, repo + ".tar.gz") if tdir else None
        if tpath and os.path.exists(tpath):
            data = open(tpath, "rb").read()
        else:
            data = get(f"https://codeload.github.com/openfootball/{repo}/tar.gz/refs/heads/master")
            if tpath:
                open(tpath, "wb").write(data)
            time.sleep(2)
        commit = json.loads(get(f"https://api.github.com/repos/openfootball/{repo}/commits/master"))["sha"] if not (tdir and os.path.exists(os.path.join(tdir, repo + ".commit"))) \
            else open(os.path.join(tdir, repo + ".commit")).read().strip()
        if tdir:
            open(os.path.join(tdir, repo + ".commit"), "w").write(commit)
        time.sleep(2)
        n = 0
        tf = tarfile.open(fileobj=__import__("io").BytesIO(data), mode="r:gz")
        for m in tf.getmembers():
            if not m.isfile():
                continue
            rel = m.name.split("/", 1)[1] if "/" in m.name else m.name
            full = repo + "/" + rel
            if repo == "europe" and not (full.startswith("europe/france/") or full in ("europe/LICENSE.md", "europe/README.md")):
                continue
            if not any(k.match(full) for k in KEEP_RE) or full.endswith("-full.txt"):
                continue
            dest = os.path.join(raw, full)
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            open(dest, "wb").write(tf.extractfile(m).read())
            n += 1
        manifest[repo] = {"repository": f"https://github.com/openfootball/{repo}", "commit": commit, "tarball_sha256": hashlib.sha256(data).hexdigest(),
                          "licence": "CC0 1.0 (LICENSE.md in the repository)", "files_kept": n}
        print(repo, commit[:10], n, "files", file=sys.stderr)
    json.dump(manifest, open(os.path.join(raw, "MANIFEST.json"), "w"), indent=1, sort_keys=True)


if __name__ == "__main__":
    main()
