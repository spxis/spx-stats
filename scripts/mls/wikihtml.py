"""Tables of a rendered English Wikipedia page (the API's parse text), as lists of rows of cells.
A table is {caption, id, rows: [[cell, ...]]}; a cell is {text, links: [(title, shown)], header: bool, colspan, rowspan}.
Only what the MLS loader needs: no styling, no scripts, <style> and <sup> (references) dropped."""
import re
from html.parser import HTMLParser


class _P(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tables = []      # finished tables
        self.stack = []       # open tables
        self.skip = 0         # inside <style> / <sup> / <script>
        self.cell = None
        self.link = None
        self.heading = ""     # the last h2/h3/h4 text seen (the section a table sits in)
        self._h = None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ("style", "script"):
            self.skip += 1; return
        if tag in ("h2", "h3", "h4"):
            self._h = ""
        if tag == "table":
            self.stack.append({"caption": "", "id": a.get("id") or "", "class": a.get("class") or "", "rows": [], "heading": self.heading})
        elif self.stack:
            t = self.stack[-1]
            if tag == "tr":
                t["rows"].append([])
            elif tag in ("td", "th"):
                if not t["rows"]:
                    t["rows"].append([])
                self.cell = {"text": "", "links": [], "header": tag == "th", "colspan": int(re.sub(r"\D", "", a.get("colspan") or "1") or 1),
                             "rowspan": int(re.sub(r"\D", "", a.get("rowspan") or "1") or 1)}
            elif tag == "caption":
                self.cell = {"text": "", "links": [], "caption": True}
            elif tag == "a" and self.cell is not None and a.get("title") and not (a.get("class") or "").startswith("image"):
                self.link = [a["title"], ""]
            elif tag in ("br", "p") and self.cell is not None:
                self.cell["text"] += " "
            elif tag == "abbr" and self.cell is not None and a.get("title"):
                self.cell.setdefault("abbr", []).append(a["title"])

    def handle_endtag(self, tag):
        if self.skip:
            if tag in ("style", "script"):
                self.skip -= 1
            return
        if tag in ("h2", "h3", "h4") and self._h is not None:
            self.heading = re.sub(r"\s+", " ", self._h).strip(); self._h = None
        if not self.stack:
            return
        t = self.stack[-1]
        if tag == "a" and self.link is not None and self.cell is not None:
            self.cell["links"].append((self.link[0], self.link[1].strip())); self.link = None
        elif tag in ("td", "th") and self.cell is not None and not self.cell.get("caption"):
            self.cell["text"] = re.sub(r"\s+", " ", self.cell["text"]).strip()
            t["rows"][-1].append(self.cell); self.cell = None
        elif tag == "caption" and self.cell is not None:
            t["caption"] = re.sub(r"\s+", " ", self.cell["text"]).strip(); self.cell = None
        elif tag == "table":
            self.tables.append(self.stack.pop())

    def handle_data(self, data):
        if self.skip:
            return
        if self._h is not None:
            self._h += data
        if self.cell is not None:
            self.cell["text"] += data
            if self.link is not None:
                self.link[1] += data


def tables(html):
    # <sup>/<span> nesting inside skipped elements is tracked by a counter: drop whole reference sups up front instead
    html = re.sub(r"<sup[^>]*class=\"reference\"[^>]*>.*?</sup>", "", html, flags=re.S)
    html = re.sub(r"<style.*?</style>", "", html, flags=re.S)
    html = re.sub(r"<span class=\"mw-editsection\">.*?</span></span>", "", html, flags=re.S)
    p = _P()
    p.feed(html)
    p.close()
    return p.tables


def grid(t):
    """The table's rows with colspan / rowspan expanded, as lists of cells (a spanned cell repeats)."""
    out, pending = [], {}
    for r in t["rows"]:
        row, col = [], 0
        cells = list(r)
        i = 0
        while i < len(cells) or col in pending:
            if col in pending:
                c, left = pending[col]
                row.append(c)
                if left > 1:
                    pending[col] = (c, left - 1)
                else:
                    del pending[col]
                col += 1
                continue
            c = cells[i]; i += 1
            for k in range(c.get("colspan", 1)):
                row.append(c)
                if c.get("rowspan", 1) > 1:
                    pending[col] = (c, c["rowspan"] - 1)
                col += 1
        out.append(row)
    return out
