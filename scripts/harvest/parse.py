"""One archived Wikipedia answer -> what goes into legacy_wikipedia_harvest. Pure functions: no network, no database."""
import json
import re

import wikitext as W

STAT_SECTIONS = re.compile(r"standing|statistic|stats|leaders|totals|record|results", re.I)
MAX_TABLE_ROWS = 400


def page_from_archive(data):
    """The bytes kept in the archive (see worker.page_payload) -> (page object of the API answer, wikitext)."""
    obj = json.loads(data)
    page = obj["page"]
    rev = (page.get("revisions") or [{}])[0]
    return page, (rev.get("slots", {}).get("main", {}).get("content") or rev.get("content") or "")


def parse_page(kind, text, league=None):
    """-> {"status": ok|no_data|error, "error": str|None, "infobox": [...], "tables": [(Table, ...)], "roster": [...], "draft": [...], "how": str|None}"""
    out = {"status": "ok", "error": None, "infobox": [], "tables": [], "roster": [], "draft": [], "how": None}
    try:
        out["infobox"] = W.infobox(text)
        if kind == "wp_team_season":
            # Keep staff as explicit, queryable fields in the existing infobox table.
            # The source field and original wikitext remain alongside these normalized keys.
            staff_keys = {
                "head_coach": {"coach", "head coach", "head_coach", "headcoach"},
                "captain": {"captain", "team captain"},
            }
            for field, aliases in staff_keys.items():
                source = next((f for f in out["infobox"] if f["field"].strip().lower() in aliases and f["value"]), None)
                if source:
                    out["infobox"].append({"field": "staff_" + field, "value": source["value"],
                                           "raw": source["raw"], "links": source["links"]})
            out["roster"], out["how"] = W.parse_roster(text, league)
            out["tables"] = [t for t in W.parse_tables(text)
                             if t.section and STAT_SECTIONS.search(t.section) and not re.search(r"game log|schedule|roster", t.section, re.I)]
        elif kind in ("wp_league_season", "wp_playoffs", "wp_list"):
            out["tables"] = W.parse_tables(text)      # a playoffs article, a franchise's list of seasons or head coaches: every table, as printed
        elif kind == "wp_draft":
            out["draft"] = W.parse_draft(text)
        out["tables"] = [t for t in out["tables"] if t.rows and len(t.rows) <= MAX_TABLE_ROWS]
        if not (out["infobox"] or out["roster"] or out["draft"] or out["tables"]):
            out["status"] = "no_data"
    except Exception as e:      # a page the parsers cannot read is kept (archived, page row) and shown by status.py, never lost
        out["status"], out["error"] = "error", ("%s: %s" % (type(e).__name__, e))[:300]
    return out
