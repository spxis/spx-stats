#!/usr/bin/env python3
"""Standings templates that are only a redirect (#REDIRECT [[Template:...]]) get their target fetched (same rules as
fetch_alignment.py) and stored beside them as "redirect_to" and "target_wikitext". Rerunnable."""
import json, re, sys
import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import fetch_alignment as F
for lg in sys.argv[1:]:
    p = f"{F.OUT}/{lg}.jsonl"
    recs = [json.loads(l) for l in open(p, encoding="utf-8")]
    for r in recs:
        for t in r["templates"]:
            w = t["wikitext"]
            if w and w.lstrip().startswith("#REDIRECT") and "target_wikitext" not in t:
                m = re.search(r"\[\[([^\]]+)\]\]", w)
                t["redirect_to"] = m.group(1)
                t["target_wikitext"] = F.cached(m.group(1))
    with open(p, "w", encoding="utf-8") as f:
        for r in recs: f.write(json.dumps(r, ensure_ascii=False, separators=(",", ":")) + "\n")
