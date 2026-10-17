#!/usr/bin/env python3
"""{{sortname}} titles and a few real cached rows. Run from the repo root."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extract import extract_article, sortname_title

assert sortname_title("{{sortname|Wayne|Gretzky}}") == "Wayne Gretzky"
assert sortname_title("{{sortname|Mario|Lemieux}}") == "Mario Lemieux"
assert sortname_title("{{sortname|Pavel|Bure}}") == "Pavel Bure"
assert sortname_title("{{sortname|Jackie|Robinson|dab=baseball}}") == "Jackie Robinson (baseball)"
assert sortname_title("[[Wayne Gretzky]]") is None

cache = os.path.join("raw", "wikipedia_jersey", "cache", "nhl_retired.wikitext")
if os.path.exists(cache):
    text = open(cache, encoding="utf-8").read()
    out = extract_article("nhl_retired", "nhl", text, {"title": "List of NHL retired numbers", "revision_id": 1})
    by = {(r["player_name"], r["jersey_number"], r["league_wide"], r.get("team_name")): r for r in out["rows"]}
    g_league = next(r for r in out["rows"] if r["player_name"] == "Wayne Gretzky" and r["league_wide"])
    g_oil = next(r for r in out["rows"] if r["player_name"] == "Wayne Gretzky" and r.get("team_name") == "Edmonton Oilers")
    lem = next(r for r in out["rows"] if r["player_name"] == "Mario Lemieux" and r["jersey_number"] == 66)
    bure = next(r for r in out["rows"] if r["player_name"] == "Pavel Bure" and r["jersey_number"] == 10)
    assert g_league["player_title"] == "Wayne Gretzky", g_league["player_title"]
    assert g_oil["player_title"] == "Wayne Gretzky", g_oil["player_title"]
    assert lem["player_title"] == "Mario Lemieux", lem["player_title"]
    assert bure["player_title"] == "Pavel Bure", bure["player_title"]
    assert bure.get("team_name") == "Vancouver Canucks"
    print("nhl", len(out["rows"]), "rows; Gretzky/Lemieux/Bure titles ok")
else:
    print("sortname titles ok (no NHL cache)")
