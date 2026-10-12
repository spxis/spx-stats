import { readFileSync } from "node:fs";
import { PHRASES } from "../src/lib/i18n/phrases.constants.ts";
import { FR } from "../src/lib/i18n/dictionaries/fr.constants.ts";
import { JA } from "../src/lib/i18n/dictionaries/ja.constants.ts";
import { READBACK, TODO_KEYS } from "./i18n-review.constants.ts";

/**
 * The files whose phrases must be translated, in the order a reader meets them: the footer is on every page, so it
 * comes first. A phrase key is found by reading these files for `say("…")`, so a key added to a page is checked
 * without anyone remembering to list it.
 */
export const SCOPE: readonly { file: string; place: string }[] = [
  { file: "src/components/SiteChrome.tsx", place: "Every page: header and footer" },
  { file: "src/components/i18n/LanguagePicker.tsx", place: "Every page: footer" },
  { file: "src/app/about/page.tsx", place: "About page, /about" },
  { file: "src/app/terms/page.tsx", place: "Terms page, /terms" },
  { file: "src/app/privacy/page.tsx", place: "Privacy page, /privacy" },
];

export const SHEET_FILE = "docs/i18n-review.md";

const WEB = new URL("../", import.meta.url);

/** Keys whose French or Japanese is the same as the English on purpose: names, addresses, and words French spells the same. */
export const SAME_AS_ENGLISH: ReadonlySet<string> = new Set([
  "nav.sources",
  "nav.logos",
  "footer.version",
  "privacy.questionsTitle",
  "about.eyebrow",
  "terms.eyebrow",
  "privacy.eyebrow",
  "about.contactLink",
]);

export interface Found {
  key: string;
  places: string[];
}

/** Every phrase key the scoped files ask `say()` for, in reading order, each with where it is met. */
export function scopedKeys(): { found: Found[]; unreadable: string[] } {
  const found = new Map<string, Found>();
  const unreadable: string[] = [];
  for (const { file, place } of SCOPE) {
    const source = readFileSync(new URL(file, WEB), "utf8");
    // The page body is read first; generateMetadata (the browser tab and search result) comes last.
    const cut = source.indexOf("export default");
    const parts: [string, string][] =
      cut === -1 ? [[source, place]] : [[source.slice(cut), place], [source.slice(0, cut), `${place} (tab title and search result)`]];
    for (const [text, where] of parts) {
      const calls = text.match(/\bsay\(/g)?.length ?? 0;
      const literal = [...text.matchAll(/\bsay\(\s*"([^"]+)"/g)];
      if (calls !== literal.length) unreadable.push(file);
      for (const m of literal) {
        const key = m[1] as string;
        const one = found.get(key) ?? { key, places: [] };
        if (!one.places.includes(where)) one.places.push(where);
        found.set(key, one);
      }
    }
  }
  return { found: [...found.values()], unreadable };
}

export function placeholders(text: string): string[] {
  return [...new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string))].sort();
}

const english = PHRASES as Readonly<Record<string, string>>;
const french = FR as Readonly<Record<string, string>>;
const japanese = JA as Readonly<Record<string, string>>;

const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\n/g, " ");

function rows(items: { key: string; place: string }[]): string {
  return items
    .map(({ key, place }) =>
      `| ${cell(place)} | ${cell(english[key] ?? "")} | ${cell(french[key] ?? "")} | **${cell(japanese[key] ?? "")}** | ${cell(READBACK[key] ?? "")} |  |`,
    )
    .join("\n");
}

const HEAD = "| Where a reader meets it | English on the site | French | Japanese | What the Japanese says back | Correction |\n| --- | --- | --- | --- | --- | --- |";

/** The review sheet, built from the dictionaries the site renders from. */
export function sheet(): string {
  const { found } = scopedKeys();
  const scoped = new Set(found.map((f) => f.key));
  const main = found.map((f) => ({ key: f.key, place: f.places.join("; ") }));
  const todo = TODO_KEYS.filter((k) => !scoped.has(k)).map((key) => ({ key, place: "Elsewhere on the site" }));
  return `# French and Japanese review sheet

**Generated from the code. Do not edit by hand. Edit \`src/lib/i18n/dictionaries/\` (and the readings in**
**\`scripts/i18n-review.constants.ts\`), then run \`pnpm i18n:review\`. \`pnpm test:i18n\` fails when this file is stale.**

The French (Canada) and Japanese here were written by a machine. English is the source
(\`src/lib/i18n/phrases.constants.ts\`). Rows are in the order a reader meets them: the header and footer are on
every page, so they come first, then the About, Terms and Privacy pages in the order the text appears on the page.

**What the Japanese says back** is a literal reading of the Japanese returned to English, so the site's owner, who
does not read Japanese, can check the meaning. If that column does not match the English beside it, the Japanese is
wrong whatever its style. Write fixes in the **Correction** column.

**Legal and licence wording** (Terms, Privacy, the credit lines, the logo notice) is a plain translation, not
reviewed legal copy.

Not translated on purpose: team, player and venue names, league codes (NHL, NBA, MLB, NFL, CFL), and the names
SPX Stats Network, SPXN, Retrosheet, Lahman, nflverse, Wikipedia, Wikidata, Wikimedia Commons, Vercel, Supabase and GitHub.

## 1. About, Terms, Privacy and the footer (${main.length})

${HEAD}
${rows(main)}

## 2. Doubts already listed in web/I18N_TODO.md (${todo.length})

These ship today. They are the lines that file marks as best guesses, repeated so they can be checked in one pass.

${HEAD}
${rows(todo)}
`;
}
