/**
 * PostgREST answers `Accept: text/csv` with one header line and one line a row, with no column name repeated per row: a season of games is about
 * a third of the size it is as JSON. This reads that text. No imports, so a test can run it as it is.
 *
 * A column is a string ("s"), a number ("n") or a boolean ("b", written t or f as Postgres writes it); an empty field is null, which is what PostgREST writes for a null. A field is
 * quoted when it holds a comma, a quote or a line break, with a quote inside doubled.
 */
export type CsvKind = "s" | "n" | "b";

/** The fields of every line of a CSV text. */
export function csvLines(text: string): string[][] {
  const out: string[][] = [];
  let line: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (text[i + 1] === '"') { field += '"'; i++; }
      else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ",") { line.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      line.push(field); field = "";
      out.push(line); line = [];
    } else field += c;
  }
  if (quoted) throw new Error("csv: a quoted field is not closed");
  if (field || line.length) { line.push(field); out.push(line); }
  return out;
}

/** The rows of a CSV text as objects with the types in `kinds`, matched by the header's column names. Empty text (what PostgREST sends for no rows at all) is no rows. A column the header lacks or a value of the wrong type throws. */
export function csvRows(text: string, kinds: Readonly<Record<string, CsvKind>>): Record<string, string | number | boolean | null>[] {
  if (!text.trim()) return [];
  const lines = csvLines(text);
  const head = lines[0];
  const names = Object.keys(kinds);
  for (const n of names) if (!head.includes(n)) throw new Error(`csv: no column ${n}`);
  return lines.slice(1).map((l) => {
    if (l.length !== head.length) throw new Error("csv: a line has the wrong number of fields");
    const row: Record<string, string | number | boolean | null> = {};
    for (const n of names) {
      const v = l[head.indexOf(n)];
      if (v === "") { row[n] = null; continue; }
      if (kinds[n] === "s") row[n] = v;
      else if (kinds[n] === "n") {
        const x = Number(v);
        if (!Number.isFinite(x)) throw new Error(`csv: ${n} is not a number`);
        row[n] = x;
      } else if (v === "t" || v === "f") row[n] = v === "t";
      else throw new Error(`csv: ${n} is not a boolean`);
    }
    return row;
  });
}
