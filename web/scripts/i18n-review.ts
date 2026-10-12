import { mkdirSync, writeFileSync } from "node:fs";
import { SHEET_FILE, sheet } from "./i18n-sheet.ts";

/** Writes the French and Japanese review sheet (run in web/: pnpm i18n:review). */
const target = new URL(`../${SHEET_FILE}`, import.meta.url);
mkdirSync(new URL("./", target), { recursive: true });
writeFileSync(target, sheet());
console.log(`wrote ${SHEET_FILE}`);
