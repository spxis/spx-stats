#!/usr/bin/env python3
"""Language work for spx-stats, through the Anthropic Message Batches API only.

Translating, drafting and reviewing Japanese, German, Spanish and French text is done
with this script and nowhere else (README.md in this folder). It talks to the API with
plain urllib (the `anthropic` SDK is not required, and is not installed on the Macs).

    python3 scripts/i18n/batch.py build  [--lang fr,ja] [--only phrases,seeds] [--keys a,b] [--cap 10]
    python3 scripts/i18n/batch.py check        # one tiny normal Messages call (needs a key)
    python3 scripts/i18n/batch.py submit       # refuses above the spend cap
    python3 scripts/i18n/batch.py status
    python3 scripts/i18n/batch.py fetch
    python3 scripts/i18n/batch.py report
    python3 scripts/i18n/batch.py apply  [--write] [-v]   # fix verdicts of phrases into the FR and JA dictionaries
    python3 scripts/i18n/batch.py run          # build, submit, wait, fetch, report

The API key is read from ANTHROPIC_API_KEY. Only with --keychain (or SPX_I18N_KEYCHAIN=1) is
the macOS keychain item `spx-stats ANTHROPIC_API_KEY` read, in this process, never printed.
Nothing here writes the repository, DS1 or production. Work files go to
~/Projects/backups/spx-stats/i18n-batch/<date>/ (outside the repo).
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import math
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from collections import Counter, defaultdict
from pathlib import Path

API = "https://api.anthropic.com"
API_VERSION = "2023-06-01"
MODEL = "claude-sonnet-5-5"
# Batch prices, USD per million tokens (Sonnet 5.5: 50% off the normal price).
PRICE_IN, PRICE_OUT = 1.0, 5.0
CACHE_WRITE_1H = 2.0  # a 1-hour cache write costs twice the base input price
MAX_TOKENS = 4000
GROUP_ITEMS = 20  # phrases per request
GROUP_BYTES = 3000  # and at most this many bytes of text per request
DEFAULT_CAP = 10.0

REPO = Path(__file__).resolve().parents[2]
WORK_ROOT = Path.home() / "Projects" / "backups" / "spx-stats" / "i18n-batch"

LANGS = {
    "fr": "French as spoken in Canada (fr-CA; Quebec usage, not France French)",
    "ja": "Japanese (ja-JP)",
    "de": "German (de-DE)",
    "es": "Spanish (es; neutral international Spanish, say so when a word is Spain-only or Latin-America-only)",
}
SITE_LANGS = ("fr", "ja")  # the languages the site ships today
REVIEWED_NOT_DRAFTED = ("fr", "ja")

# One shared system block: identical in every request, cached for an hour.
SYSTEM = """You are a careful translator and reviewer of the interface text of SPXN, a website of the historical record of professional sports leagues (NHL, PWHL, NBA, WNBA, MLB, NFL, CFL, NWSL, soccer). English is the source. You work on short UI phrases: labels, table headers, tooltips, sentences with {placeholders}, and short notes about seasons.

TASK MODES (the user message says which)
- REVIEW: each item has the English source ("en") and the current translation ("cur"). Judge the translation.
- DRAFT: each item has only the English source. Write the translation in "fix"; verdict is "fix".

OUTPUT: reply with ONLY a JSON array, no prose, no code fence. One object per input item, same order, same "id":
{"id": <number from the input>, "verdict": "ok" | "fix" | "doubt", "back": "...", "fix": "...", "why": "..."}
- verdict "ok": accurate, natural, right register, placeholders intact. "fix": wrong, unnatural, inconsistent, or breaks a rule below; give the corrected text in "fix". "doubt": probably acceptable but a native speaker in sports or web UI should look; say what in "why" (put your best alternative in "fix" if you have one).
- "back": a LITERAL back-translation of the current text (REVIEW) or of your draft (DRAFT) into English, word for word where possible, so a reader who does not know the language can check it. Always required, for every item and every language, even when the verdict is ok.
- "fix": the full replacement text, or "" when the verdict is ok.
- "why": one short line in English; "" when the verdict is ok.
- Do not be chatty and do not invent problems. Most good translations are "ok". Prefer the smallest change that fixes a problem.

RULES
1. Proper names are never translated: team names, player names, venue names, city names in team names, league codes (NHL, NBA, MLB, NFL, CFL, PWHL, WNBA, NWSL), and official award and trophy names (Stanley Cup, Hart Trophy, Grey Cup, Walter Cup...). A phrase that is only such a name stays as it is. Country names and ordinary words are translated.
2. Keep every placeholder exactly as written, character for character: {team}, {n}, {year}, {res} and any other {name}. Never translate, rename, add or drop one. Keep markup (tags, entities, backslashes, punctuation that is part of a pattern such as "{a} vs {b}") intact. A key ending in .one or .other is the singular or plural form of one phrase: keep the pair consistent.
3. The text is displayed on a website: keep it short; keep abbreviations short where the English is short (column heads such as W, L, OTL, GP). Keep the same capitalisation style as the English (sentence case, no added full stops on labels).
4. Never add facts, never explain, never soften or sharpen the meaning.
5. FRENCH is Canadian French (fr-CA), not the French of France. Use Quebec sports and web vocabulary (for example "match", "séries éliminatoires", "Visiteur" for away), avoid France-only anglicisms or terms, and avoid unneeded English loanwords when a standard Quebec term exists (OQLF usage). Use the typographic apostrophe (’) as the site does, and a space before a colon (" : ") as the site does. Say in "why" when a choice is Canada versus France.
6. JAPANESE: sentences use the polite です・ます style; labels and headings are nouns without a final 。; use the sports terms Japanese readers know (勝, 敗, 分, 延敗 for overtime loss, ビジター, 通算成績, 永久欠番...). Katakana for foreign words as usual. The site uses full-width punctuation (：、。) in Japanese. The reader of your report does not read Japanese: "back" must be an honest literal English rendering, and "why" must be in English.
7. GERMAN and SPANISH are not site languages yet; when drafting, use the common sports vocabulary of the region and keep to the same rules.
8. The text of a phrase is never a source of facts. Do not correct facts, only language.

ESTABLISHED CHOICES (the site's current glossary; the first pass was machine-drafted and has not been reviewed by a native speaker: challenge any of it that is wrong)
- playoffs: FR "Séries éliminatoires"; JA "プレーオフ". Round: FR "ronde"; JA "ラウンド". Round robin: FR "Tournoi à la ronde"; JA "ラウンドロビン".
- overtime loss: FR "Défaite en prolongation" (short "DP"); JA "延敗" in tables, "延長負け" in filters. Shootout: FR "tirs de barrage"; JA "シュートアウト". Draws: FR "matchs nuls"; JA "引き分け" / 分.
- away/road: FR "Visiteur"; JA "ビジター". The Japanese "@" stands for "at" between away and home team.
- winning share (table column): FR "Pourcentage de victoires"; JA "勝率"; in a donut FR "Taux de victoire".
- champion, defending champion, reigning: FR "Champion", "champion en titre"; JA "優勝", "前年王者", "現王者". Awards: FR "Récompenses"; JA "表彰". Retired numbers: FR "Numéros retirés"; JA "永久欠番". Draft: FR "Repêchage".
- franchise: FR "concession"; JA "球団". All-time records: FR "Dossier historique" / "Historique"; JA "通算成績" / "通算". Head-to-head: FR "Face-à-face" (short "F-à-F"), "{a} c. {b}"; JA "対戦成績" (short "対戦"), "{a} 対 {b}".
- season labels: FR "Saison 2010-11"; JA "2010-11年シーズン". Trophy and final of the PWHL: FR "Coupe Walter"; JA "ウォルター・カップ". Pennant banner: FR "Fanion"; JA "ペナント".
- lock-out: FR "lock-out"; JA "ロックアウト". Players' strike: FR "grève des joueurs"; JA "選手会のストライキ".
- Japanese counters (試合, シーズン, 回, 件) use one form for every number; French count nouns without a .one/.other pair are written "match(s)", "titre(s)".
- Source link text: FR "Source : Wikipédia"; JA "出典：Wikipedia". Legal and licensing text (fair use, logos page) is a plain translation, not legal copy.
"""




# ---------------------------------------------------------------- the API

def read_key(use_keychain: bool) -> str | None:
    key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if key:
        return key
    if use_keychain or os.environ.get("SPX_I18N_KEYCHAIN") == "1":
        try:
            out = subprocess.run(
                ["security", "find-generic-password", "-s", "spx-stats ANTHROPIC_API_KEY", "-w"],
                capture_output=True, text=True, timeout=30,
            )
        except (OSError, subprocess.TimeoutExpired):
            return None
        if out.returncode == 0 and out.stdout.strip():
            return out.stdout.strip()
    return None


def need_key(args) -> str:
    key = read_key(getattr(args, "keychain", False))
    if not key:
        sys.exit("No API key: set ANTHROPIC_API_KEY, or add --keychain (item `spx-stats ANTHROPIC_API_KEY`).")
    return key


def http(method: str, url: str, key: str, body=None, tries: int = 4, stream_to: Path | None = None):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    headers = {"x-api-key": key, "anthropic-version": API_VERSION, "content-type": "application/json"}
    for attempt in range(tries):
        req = urllib.request.Request(url, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=600) as resp:
                if stream_to is not None:
                    part = stream_to.with_suffix(stream_to.suffix + ".part")
                    with open(part, "wb") as fh:
                        while True:
                            chunk = resp.read(1 << 16)
                            if not chunk:
                                break
                            fh.write(chunk)
                    part.replace(stream_to)
                    return None
                return json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as err:
            text = err.read()[:1500].decode("utf-8", "replace")
            if err.code in (429, 500, 502, 503, 529) and attempt < tries - 1:
                time.sleep(2 ** (attempt + 2))
                continue
            sys.exit(f"API error {err.code} on {method} {url.replace(API, '')}: {text}")
        except (urllib.error.URLError, TimeoutError) as err:
            if attempt < tries - 1:
                time.sleep(2 ** (attempt + 2))
                continue
            sys.exit(f"Network error on {method} {url.replace(API, '')}: {err}")


# ---------------------------------------------------------------- collecting what exists

def dump_catalogues() -> dict:
    cmd = ["node", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "scripts/i18n/dump.ts"]
    out = subprocess.run(cmd, cwd=REPO, capture_output=True, text=True)
    if out.returncode != 0:
        sys.exit(f"node scripts/i18n/dump.ts failed (Node 22.18 or newer needed): {out.stderr[-600:]}")
    return json.loads(out.stdout)


COUNTRY_EN = {
    "england": "England", "scotland": "Scotland", "wales": "Wales", "northern-ireland": "Northern Ireland",
    "west-germany": "West Germany", "east-germany": "East Germany", "soviet-union": "Soviet Union",
    "yugoslavia": "Yugoslavia", "czechoslovakia": "Czechoslovakia", "zaire": "Zaire",
    "dutch-east-indies": "Dutch East Indies", "serbia-and-montenegro": "Serbia and Montenegro",
    "dr-congo": "DR Congo", "chinese-taipei": "Chinese Taipei",
}


# Position names that ref.position (db/build/185_ref_position.sql) does not hold in French and Japanese yet: drafted with `--only positions`.
# The key is context for the model, not text. Add a row here when a new code is added to the seed, run the batch, copy the results into the seed.
POSITION_DRAFTS = [
    ("position:nfl+cfl:LN (football: the group of offensive and defensive linemen, like OL and DL together)", "Lineman"),
    ("position:nfl+cfl:LS (football special teams: the player who snaps the ball to the punter or holder)", "Long snapper"),
]


def read_csv(rel: str) -> list[dict]:
    with open(REPO / rel, newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def collect(langs: list[str], only: set[str]) -> tuple[list[dict], dict]:
    """Every existing translation as items {src, lang, key, en, cur}; plus counts and what is left out."""
    items: list[dict] = []
    info: dict = {"untranslated": Counter(), "scanned": Counter()}

    if "phrases" in only:
        cat = dump_catalogues()
        en = cat["en"]
        info["phrases_en"] = len(en)
        for lang in langs:
            have = cat.get(lang)
            for key, src in en.items():
                cur = have.get(key) if have is not None else None
                if cur is None or cur == "":
                    if have is None:  # DE or ES: nothing exists, draft everything
                        items.append({"src": "ph", "lang": lang, "key": key, "en": src, "cur": None})
                    else:
                        info["untranslated"][lang] += 1  # falls back to English on the site
                    continue
                items.append({"src": "ph", "lang": lang, "key": key, "en": src, "cur": cur})

    if "positions" in only:
        for lang in langs:
            for key, en in POSITION_DRAFTS:
                items.append({"src": "pos", "lang": lang, "key": key, "en": en, "cur": None})

    if "seeds" in only:
        seeds = [
            ("sn", "db/seed/season_note.csv", "note_en", "note_{l}", lambda r: f"season_note:{r['league']}:{r['year']}:{r['franchise_key'] or 'league'}:{r['kind']}"),
            ("so", "db/seed/season_outage.csv", "note_en", "note_{l}", lambda r: f"season_outage:{r['league']}:{r['year']}:{r['kind']}"),
            ("tn", "db/seed/title_not_awarded.csv", "reason_en", "reason_{l}", lambda r: f"title_not_awarded:{r['league']}:{r['year']}:{r['award']}"),
        ]
        for tag, rel, en_col, cur_col, keyf in seeds:
            for r in read_csv(rel):
                for lang in langs:
                    col = cur_col.format(l=lang)
                    if col in r:
                        if not r[col].strip():
                            info["untranslated"][f"{lang}:{tag}"] += 1
                            continue
                        cur = r[col]
                    else:  # DE or ES: no column exists, draft it
                        cur = None
                    items.append({"src": tag, "lang": lang, "key": keyf(r), "en": r[en_col], "cur": cur})
        if "fr" in langs:
            for tag, rel in (("ct", "db/seed/city.csv"), ("mt", "db/seed/metro.csv")):
                for r in read_csv(rel):
                    if r.get("name_fr", "").strip():
                        items.append({"src": tag, "lang": "fr", "key": f"{rel.split('/')[-1][:-4]}:{r['slug']}", "en": r["name"], "cur": r["name_fr"]})
        text = (REPO / "web/src/lib/soccerNames.ts").read_text(encoding="utf-8")
        for m in re.finditer(r'"?([a-z-]+)"?: \{ fr: "([^"]+)", ja: "([^"]+)" \}', text):
            slug, fr, ja = m.groups()
            for lang, val in (("fr", fr), ("ja", ja)):
                if lang in langs:
                    items.append({"src": "sc", "lang": lang, "key": f"soccer_nation:{slug}", "en": COUNTRY_EN.get(slug, slug), "cur": val})
    for it in items:
        info["scanned"][f"{it['lang']}:{it['src']}"] += 1
    return items, info


# ---------------------------------------------------------------- requests

def user_text(lang: str, chunk: list[dict]) -> str:
    mode = "DRAFT" if chunk[0]["cur"] is None else "REVIEW"
    rows = []
    for n, it in enumerate(chunk, 1):
        row = {"id": n, "key": it["key"], "en": it["en"]}
        if it["cur"] is not None:
            row["cur"] = it["cur"]
        rows.append(row)
    return (
        f"Mode: {mode}\nTarget language: {lang} - {LANGS[lang]}\n"
        "Items (the key shows where the text is used; it is context, not text):\n"
        + json.dumps(rows, ensure_ascii=False, separators=(",", ":"))
        + "\nReply with the JSON array only."
    )


def params_for(lang: str, chunk: list[dict], model: str = MODEL, max_tokens: int = MAX_TOKENS) -> dict:
    return {
        "model": model,
        "max_tokens": max_tokens,
        "system": [{"type": "text", "text": SYSTEM, "cache_control": {"type": "ephemeral", "ttl": "1h"}}],
        "messages": [{"role": "user", "content": user_text(lang, chunk)}],
    }


def group(items: list[dict]) -> list[tuple[str, list[dict]]]:
    """Requests: same language, source and mode together, in file order, a few lines each."""
    buckets: dict[tuple, list[dict]] = defaultdict(list)
    for it in items:
        buckets[(it["lang"], it["src"], it["cur"] is None)].append(it)
    out: list[tuple[str, list[dict]]] = []
    for (lang, src, _draft), rows in buckets.items():
        chunk: list[dict] = []
        size = 0
        n = 0
        for it in rows:
            sz = len(it["en"].encode()) + len((it["cur"] or "").encode()) + len(it["key"])
            if chunk and (len(chunk) >= GROUP_ITEMS or size + sz > GROUP_BYTES):
                n += 1
                out.append((f"{lang}-{src}-{n:04d}", chunk))
                chunk, size = [], 0
            chunk.append(it)
            size += sz
        if chunk:
            n += 1
            out.append((f"{lang}-{src}-{n:04d}", chunk))
    return out


CID = re.compile(r"^[a-zA-Z0-9_-]{1,64}$")


def tokens(text: str) -> int:
    """Conservative token estimate without a key: half a token per UTF-8 byte (real text runs near a quarter
    for English and about one per Japanese character, which is three bytes). Never below the truth by design."""
    return math.ceil(len(text.encode("utf-8")) / 2)


def estimate(reqs: list[tuple[str, dict]], model: str, exact: dict | None = None) -> dict:
    if exact:
        sys_tok = exact["__system__"]
        user_tok = sum(max(exact[cid] - sys_tok, 0) for cid, _p in reqs)
    else:
        sys_tok = tokens(SYSTEM)
        user_tok = sum(tokens(p["messages"][0]["content"]) for _cid, p in reqs)
    n = len(reqs)
    out_expected = 0
    for _cid, p in reqs:
        rows = json.loads(re.search(r"\n(\[.*\])\nReply", p["messages"][0]["content"], re.S).group(1))
        for r in rows:
            out_expected += 45 + tokens(r["en"]) + math.ceil(0.35 * (tokens(r.get("cur", r["en"])) + 30))
    worst_out = n * MAX_TOKENS
    cost_in = (n * sys_tok * CACHE_WRITE_1H + user_tok * PRICE_IN) / 1e6
    return {
        "model": model, "requests": n, "system_tokens_est": sys_tok, "user_tokens_est": user_tok,
        "exact_user_tokens": bool(exact),
        "output_tokens_expected": out_expected, "output_tokens_worst": worst_out,
        "usd_expected": round(((sys_tok * 1.1 + user_tok) * PRICE_IN + out_expected * PRICE_OUT) / 1e6, 2),
        "usd_worst": round(cost_in + worst_out * PRICE_OUT / 1e6, 2),
        "basis": (
            "Batch prices $1 in / $5 out per MTok. Worst case = every request writes the 1-hour cache at 2x ($2/MTok) for "
            f"its {sys_tok}-token system block (estimated), user text at $1/MTok, and every request fills max_tokens={MAX_TOKENS} "
            "of output. Tokens are estimated at half a token per UTF-8 byte (a ceiling) unless `build --exact` counted them."
        ),
    }


def count_exact(reqs: list[tuple[str, dict]], key: str) -> dict:
    out = {}
    first = reqs[0][1]
    res = http("POST", f"{API}/v1/messages/count_tokens", key,
               {"model": first["model"], "system": first["system"], "messages": [{"role": "user", "content": "x"}]})
    out["__system__"] = res["input_tokens"] - 1  # the one-word user message costs about a token
    for cid, p in reqs:
        body = {"model": p["model"], "system": p["system"], "messages": p["messages"]}
        res = http("POST", f"{API}/v1/messages/count_tokens", key, body)
        # input_tokens covers system plus user; estimate() subtracts the system part
        out[cid] = res["input_tokens"]
    return out


# ---------------------------------------------------------------- work folder

def today_dir(new: bool) -> Path:
    base = WORK_ROOT / dt.date.today().isoformat()
    if not new:
        return base
    d, n = base, 1
    while (d / "batch.json").exists():
        n += 1
        d = WORK_ROOT / f"{dt.date.today().isoformat()}-{n}"
    return d


def pick_dir(args, need: str | None = None) -> Path:
    if getattr(args, "dir", None):
        return Path(args.dir).expanduser()
    if WORK_ROOT.exists():
        for d in sorted((p for p in WORK_ROOT.iterdir() if p.is_dir()), reverse=True):
            if need is None or (d / need).exists():
                return d
    sys.exit("No work folder yet: run `build` first.")


def print_estimate(est: dict) -> None:
    print(f"requests:                {est['requests']}")
    print(f"model:                   {est['model']}")
    print(f"system block tokens:     ~{est['system_tokens_est']} (one block, 1-hour cache, identical in every request)")
    print(f"user tokens:             ~{est['user_tokens_est']}{' (counted by the API)' if est['exact_user_tokens'] else ' (ceiling estimate)'}")
    print(f"output tokens expected:  ~{est['output_tokens_expected']}   worst case: {est['output_tokens_worst']}")
    print(f"USD expected:            ~{est['usd_expected']}")
    print(f"USD worst case:          {est['usd_worst']}   <- compared with the cap")
    print(f"basis: {est['basis']}")


# ---------------------------------------------------------------- subcommands

def cmd_build(args) -> dict:
    langs = [x for x in args.lang.split(",") if x]
    for lang in langs:
        if lang not in LANGS:
            sys.exit(f"unknown language {lang}; choose from {','.join(LANGS)}")
    only = set(args.only.split(","))
    items, info = collect(langs, only)
    if args.keys:
        keys = set(args.keys.split(","))
        items = [it for it in items if it["key"] in keys]
        missing = keys - {it["key"] for it in items}
        if missing:
            sys.exit(f"no such key: {','.join(sorted(missing))}")
    if args.limit:
        items = items[: args.limit]
    groups = group(items)
    reqs = []
    for cid, chunk in groups:
        assert CID.match(cid), cid
        reqs.append((cid, params_for(chunk[0]["lang"], chunk, args.model)))
    exact = None
    if args.exact:
        exact = count_exact(reqs, need_key(args))
    est = estimate(reqs, args.model, exact)
    est["cap"] = args.cap
    d = today_dir(new=True)
    d.mkdir(parents=True, exist_ok=True)
    with open(d / "requests.jsonl", "w", encoding="utf-8") as fh:
        for cid, p in reqs:
            fh.write(json.dumps({"custom_id": cid, "params": p}, ensure_ascii=False) + "\n")
    manifest = {cid: {"lang": c[0]["lang"], "src": c[0]["src"], "mode": "draft" if c[0]["cur"] is None else "review",
                      "items": [{"id": n, "key": it["key"], "en": it["en"], "cur": it["cur"]} for n, it in enumerate(c, 1)]}
                for cid, c in groups}
    (d / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
    est["items"] = len(items)
    est["scanned"] = dict(info["scanned"])
    est["untranslated_fall_back_to_english"] = dict(info["untranslated"])
    (d / "estimate.json").write_text(json.dumps(est, indent=1), encoding="utf-8")
    print(f"folder: {d}")
    print(f"items:  {len(items)}  " + "  ".join(f"{k}={v}" for k, v in sorted(Counter(i['lang'] for i in items).items())))
    print("by source: " + "  ".join(f"{k}={v}" for k, v in sorted(info["scanned"].items())))
    if info["untranslated"]:
        print("no translation yet (English shows): " + "  ".join(f"{k}={v}" for k, v in sorted(info["untranslated"].items())))
    print_estimate(est)
    print("nothing submitted.")
    return est


def cmd_check(args) -> None:
    key = need_key(args)
    ping = http("POST", f"{API}/v1/messages", key, {"model": args.model, "max_tokens": 16, "messages": [{"role": "user", "content": "Reply with the word ok."}]})
    print(f"model {args.model}: accepted ({ping.get('model')}), stop_reason {ping.get('stop_reason')}")
    sample = [
        {"src": "ph", "lang": "fr", "key": "tip.champion", "en": "Champion: {team}", "cur": "Champion : {team}"},
        {"src": "ph", "lang": "fr", "key": "rheat.card.away", "en": "{res} {score} at {opp}", "cur": "{res} {score} à {opp}"},
    ]
    p = params_for("fr", sample, args.model, max_tokens=600)
    res = http("POST", f"{API}/v1/messages", key, p)
    text = "".join(b.get("text", "") for b in res.get("content", []) if b.get("type") == "text")
    rows = parse_rows(text)
    ok = rows is not None and len(rows) == 2 and all({"id", "verdict", "back", "fix", "why"} <= set(r) for r in rows)
    print(f"request shape (system with 1h cache_control, 2 items): {'valid' if ok else 'INVALID'}; usage {res.get('usage')}")
    if not ok:
        print(text[:800])
        sys.exit(1)


def cmd_submit(args) -> None:
    d = pick_dir(args, "requests.jsonl")
    if (d / "batch.json").exists() and not args.again:
        sys.exit(f"{d} already holds a submitted batch ({json.loads((d / 'batch.json').read_text())['id']}); build again for a new one.")
    est_path = d / "estimate.json"
    if not est_path.exists():
        sys.exit("No estimate: run `build` first (it prints and saves one).")
    est = json.loads(est_path.read_text())
    print_estimate(est)
    cap = args.cap if args.cap is not None else DEFAULT_CAP
    if est["usd_worst"] >= cap:
        sys.exit(f"REFUSED: worst-case USD {est['usd_worst']} is not under the cap {cap}. Raise --cap only if you accept that.")
    key = need_key(args)
    requests = [json.loads(line) for line in (d / "requests.jsonl").read_text(encoding="utf-8").splitlines() if line.strip()]
    res = http("POST", f"{API}/v1/messages/batches", key, {"requests": requests})
    (d / "batch.json").write_text(json.dumps(res, indent=1), encoding="utf-8")
    print(f"submitted batch {res['id']} ({len(requests)} requests), status {res.get('processing_status')}; saved in {d}")


def batch_id(d: Path) -> str:
    p = d / "batch.json"
    if not p.exists():
        sys.exit(f"{d} has no batch.json: nothing was submitted from it.")
    return json.loads(p.read_text())["id"]


def cmd_status(args) -> dict:
    d = pick_dir(args, "batch.json")
    res = http("GET", f"{API}/v1/messages/batches/{batch_id(d)}", need_key(args))
    (d / "batch.json").write_text(json.dumps(res, indent=1), encoding="utf-8")
    c = res["request_counts"]
    print(f"{res['id']}: {res['processing_status']}  processing={c['processing']} succeeded={c['succeeded']} errored={c['errored']} canceled={c['canceled']} expired={c['expired']}")
    return res


def cmd_fetch(args) -> None:
    d = pick_dir(args, "batch.json")
    res = cmd_status(args)
    if res["processing_status"] != "ended":
        sys.exit("Not ended yet; the batch finishes within 24 hours (usually under one).")
    out = d / "results.jsonl"
    http("GET", res["results_url"], need_key(args), stream_to=out)
    seen = set()
    for line in out.read_text(encoding="utf-8").splitlines():
        if line.strip():
            seen.add(json.loads(line)["custom_id"])
    manifest = json.loads((d / "manifest.json").read_text(encoding="utf-8"))
    missing = set(manifest) - seen
    print(f"results: {len(seen)} of {len(manifest)} requests, matched on custom_id; missing {len(missing)}; saved {out}")


def parse_rows(text: str):
    t = text.strip()
    t = re.sub(r"^```(?:json)?\s*|\s*```$", "", t)
    try:
        v = json.loads(t)
    except json.JSONDecodeError:
        a, b = t.find("["), t.rfind("]")
        if a < 0 or b <= a:
            return None
        try:
            v = json.loads(t[a : b + 1])
        except json.JSONDecodeError:
            return None
    return v if isinstance(v, list) else None


PH = re.compile(r"\{[A-Za-z0-9_.]+\}")


def load_rows(d: Path) -> tuple[list[dict], Counter, Counter]:
    """One record per reviewed item, from manifest.json and results.jsonl (matched on custom_id)."""
    manifest = json.loads((d / "manifest.json").read_text(encoding="utf-8"))
    results = {}
    for line in (d / "results.jsonl").read_text(encoding="utf-8").splitlines():
        if line.strip():
            r = json.loads(line)
            results[r["custom_id"]] = r["result"]
    rows_out = []  # one record per item
    problems = Counter()
    usage = Counter()
    for cid, m in manifest.items():
        res = results.get(cid)
        if res is None or res["type"] != "succeeded":
            problems[f"{m['lang']}:request-{(res or {'type': 'missing'})['type']}"] += len(m["items"])
            continue
        msg = res["message"]
        for k in ("input_tokens", "output_tokens", "cache_creation_input_tokens", "cache_read_input_tokens"):
            usage[k] += (msg.get("usage") or {}).get(k) or 0
        text = "".join(b.get("text", "") for b in msg["content"] if b.get("type") == "text")
        parsed = parse_rows(text)
        if parsed is None:
            problems[f"{m['lang']}:unparsable{'-truncated' if msg.get('stop_reason') == 'max_tokens' else ''}"] += len(m["items"])
            continue
        by_id = {r.get("id"): r for r in parsed if isinstance(r, dict)}
        for it in m["items"]:
            r = by_id.get(it["id"])
            if r is None:
                problems[f"{m['lang']}:item-missing"] += 1
                continue
            rec = {"lang": m["lang"], "src": m["src"], "mode": m["mode"], "key": it["key"], "en": it["en"], "cur": it["cur"],
                   "verdict": r.get("verdict"), "back": r.get("back", ""), "fix": r.get("fix", ""), "why": r.get("why", "")}
            want = Counter(PH.findall(it["en"]))
            if it["cur"] is not None and Counter(PH.findall(it["cur"])) != want:
                rec["placeholder_mismatch"] = "current text"
            if rec["fix"] and Counter(PH.findall(rec["fix"])) != want:
                rec["placeholder_mismatch_fix"] = True
            rows_out.append(rec)
    return rows_out, problems, usage


def cmd_report(args) -> None:
    d = pick_dir(args, "results.jsonl")
    rows_out, problems, usage = load_rows(d)
    (d / "report.json").write_text(json.dumps(rows_out, ensure_ascii=False, indent=1), encoding="utf-8")

    lines = ["# Language batch report", "", f"Folder: {d}", ""]
    counts: dict = defaultdict(Counter)
    for r in rows_out:
        counts[r["lang"]][r["verdict"]] += 1
    lines += ["## Verdict counts", ""]
    for lang in sorted(counts):
        c = counts[lang]
        lines.append(f"- {lang}: {sum(c.values())} items: ok {c['ok']}, fix {c['fix']}, doubt {c['doubt']}")
    if problems:
        lines += ["", "Not usable: " + ", ".join(f"{k}={v}" for k, v in sorted(problems.items()))]
    lines += ["", f"Usage: {dict(usage)}", ""]
    ph = [r for r in rows_out if r.get("placeholder_mismatch")]
    if ph:
        lines += ["## Placeholder mismatches in the CURRENT text (checked by the script, not the model)", ""]
        for r in ph:
            lines.append(f"- {r['lang']} `{r['key']}`: EN `{r['en']}` / current `{r['cur']}`")
        lines.append("")
    for lang in sorted(counts):
        for verdict, title in (("fix", "Fixes proposed"), ("doubt", "Doubts for a native speaker")):
            sel = [r for r in rows_out if r["lang"] == lang and r["verdict"] == verdict]
            if not sel:
                continue
            lines += [f"## {lang}: {title} ({len(sel)})", ""]
            for r in sel:
                lines.append(f"- `{r['key']}`")
                lines.append(f"  - EN: {r['en']}")
                lines.append(f"  - current: {r['cur']}")
                lines.append(f"  - back-translation (literal): {r['back']}")
                lines.append(f"  - proposed: {r['fix']}")
                lines.append(f"  - why: {r['why']}")
                if r.get("placeholder_mismatch_fix"):
                    lines.append("  - WARNING: the proposed text changes the placeholders")
            lines.append("")
    path = d / "report.md"
    path.write_text("\n".join(lines), encoding="utf-8")
    print("verdicts: " + "; ".join(f"{lang} ok {c['ok']} fix {c['fix']} doubt {c['doubt']}" for lang, c in sorted(counts.items())))
    if problems:
        print("not usable: " + ", ".join(f"{k}={v}" for k, v in sorted(problems.items())))
    print(f"placeholder mismatches in current text: {len(ph)}")
    print(f"report: {path}")


# ---------------------------------------------------------------- applying the fixes

I18N_DIR = Path("web/src/lib/i18n")
BLOCK = re.compile(r"^export const (\w+)\b[^=]*=\s*\{\s*$")
ENTRY = re.compile(r'^(\s*)("(?:[^"\\]|\\.)+"): ("(?:[^"\\]|\\.)*"),\s*$')
NBSP = "\u00a0"


def keep_nbsp(cur: str, fix: str) -> str:
    """The model returns a plain space before : ; ? ! and » where the current French text has a no-break space:
    keep the no-break space for each of those marks the current text already writes that way."""
    for mark in (":", ";", "?", "!", "\u00bb"):
        if f"{NBSP}{mark}" in cur:
            fix = fix.replace(f" {mark}", f"{NBSP}{mark}")
    return fix


def lang_blocks(root: Path):
    """Yield (file, lines, [(index, lang, key, value)]) for every FR or JA dictionary entry under web/src/lib/i18n.
    A block is an `export const NAME = {` whose NAME is FR, JA or ends in _FR or _JA; English is never read."""
    for f in sorted((root / I18N_DIR).rglob("*.ts")):
        lines = f.read_text(encoding="utf-8").split("\n")
        entries, lang = [], None
        for i, line in enumerate(lines):
            m = BLOCK.match(line)
            if m:
                name = m.group(1)
                lang = name[-2:].lower() if name[-2:] in ("FR", "JA") and (name == name[-2:] or name[-3] == "_") else None
                continue
            if lang and line.startswith("}"):
                lang = None
                continue
            e = ENTRY.match(line) if lang else None
            if e:
                try:
                    entries.append((i, lang, json.loads(e.group(2)), json.loads(e.group(3))))
                except json.JSONDecodeError:
                    pass
        yield f, lines, entries


def plan_apply(rows: list[dict], root: Path, langs=SITE_LANGS) -> tuple[dict, list[dict]]:
    """Which phrase fixes can be applied. Returns ({file: lines}, decisions); a decision is
    {lang, key, status, old, new} with status applied, same, placeholders, stale (the file no longer holds the text
    the batch reviewed) or missing (no such key in that language's dictionary). Nothing is written here."""
    fixes = {(r["lang"], r["key"]): r for r in rows if r["verdict"] == "fix" and r["src"] == "ph" and r["lang"] in langs}
    decisions: dict = {}
    files: dict = {}
    for f, lines, entries in lang_blocks(root):
        for i, lang, key, value in entries:
            r = fixes.get((lang, key))
            if r is None:
                continue
            d = decisions.setdefault((lang, key), {"lang": lang, "key": key, "status": "stale", "old": r["cur"], "new": None})
            if value != r["cur"]:
                continue
            new = keep_nbsp(r["cur"], r["fix"]) if lang == "fr" else r["fix"]
            d["new"] = new
            if new == r["cur"]:
                d["status"] = "same"
            elif Counter(PH.findall(new)) != Counter(PH.findall(r["en"])):
                d["status"] = "placeholders"
            else:
                d["status"] = "applied"
                lines[i] = ENTRY.match(lines[i]).expand(r"\1\2: ") + json.dumps(new, ensure_ascii=False) + ","
                files[f] = lines
    for (lang, key), r in fixes.items():
        decisions.setdefault((lang, key), {"lang": lang, "key": key, "status": "missing", "old": r["cur"], "new": None})
    return files, sorted(decisions.values(), key=lambda d: (d["lang"], d["key"]))


def cmd_apply(args) -> None:
    """Apply the phrase fixes of a fetched batch to the FR and JA dictionaries (dry run unless --write)."""
    d = pick_dir(args, "results.jsonl")
    rows, _problems, _usage = load_rows(d)
    langs = tuple(x for x in args.lang.split(",") if x)
    files, decisions = plan_apply(rows, REPO, langs)
    counts = Counter((x["lang"], x["status"]) for x in decisions)
    for (lang, status), n in sorted(counts.items()):
        print(f"{lang}: {status} {n}")
    for x in decisions:
        if x["status"] != "applied":
            print(f"  not applied ({x['status']}): {x['lang']} {x['key']}")
        elif args.verbose:
            print(f"  {x['lang']} {x['key']}\n    - {x['old']}\n    + {x['new']}")
    if not args.write:
        print("dry run: nothing written (add --write to change the dictionaries).")
        return
    for f, lines in files.items():
        f.write_text("\n".join(lines), encoding="utf-8")
    print(f"written: {', '.join(str(f.relative_to(REPO)) for f in files)}")


def cmd_run(args) -> None:
    key = need_key(args)
    os.environ["ANTHROPIC_API_KEY"] = key  # for the steps below, this process only
    cmd_check(args)
    est = cmd_build(args)
    cap = args.cap if args.cap is not None else DEFAULT_CAP
    if est["usd_worst"] >= cap:
        sys.exit(f"REFUSED: worst-case USD {est['usd_worst']} is not under the cap {cap}.")
    args.dir = None
    cmd_submit(args)
    while True:
        res = cmd_status(args)
        if res["processing_status"] == "ended":
            break
        time.sleep(60)
    cmd_fetch(args)
    cmd_report(args)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    def common(p, build=False):
        p.add_argument("--dir", help="work folder (default: the newest under ~/Projects/backups/spx-stats/i18n-batch/)")
        p.add_argument("--keychain", action="store_true", help="read the key from the keychain item `spx-stats ANTHROPIC_API_KEY` if the env var is unset")
        p.add_argument("--model", default=MODEL)
        p.add_argument("--cap", type=float, default=None, help=f"spend cap in USD on the worst-case estimate (default {DEFAULT_CAP})")
        if build:
            p.add_argument("--lang", default="fr,ja", help="comma list from fr,ja,de,es (fr and ja are reviewed; de and es are drafted)")
            p.add_argument("--only", default="phrases,seeds", help="phrases, seeds, positions (drafts the names in POSITION_DRAFTS) or a comma list")
            p.add_argument("--limit", type=int, default=0, help="only the first N items (a test)")
            p.add_argument("--keys", default="", help="only these keys, comma separated (one new phrase need not pay for reviewing every phrase)")
            p.add_argument("--exact", action="store_true", help="count user tokens with the API's free count_tokens endpoint (needs a key)")

    for name, fn, b in (("build", cmd_build, True), ("check", cmd_check, False), ("submit", cmd_submit, False),
                        ("status", cmd_status, False), ("fetch", cmd_fetch, False), ("report", cmd_report, False), ("apply", cmd_apply, False), ("run", cmd_run, True)):
        p = sub.add_parser(name)
        common(p, b)
        if name == "submit":
            p.add_argument("--again", action="store_true")
        if name == "apply":
            p.add_argument("--lang", default="fr,ja", help="languages to apply (fr, ja)")
            p.add_argument("--write", action="store_true", help="change the dictionaries (default: a dry run)")
            p.add_argument("--verbose", "-v", action="store_true", help="print every old and new text")
        p.set_defaults(fn=fn)
    args = ap.parse_args()
    if args.cmd == "build" or args.cmd == "run":
        args.cap = args.cap if args.cap is not None else DEFAULT_CAP
    args.fn(args)


if __name__ == "__main__":
    main()
