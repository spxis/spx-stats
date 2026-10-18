// Prints the site's phrase catalogues as JSON: { en: {...}, fr: {...}, ja: {...} }.
// Read-only. Run by batch.py (node runs .ts directly, 22.18 or newer).
import { PHRASES } from "../../web/src/lib/i18n/phrases.constants.ts";
import { FR } from "../../web/src/lib/i18n/dictionaries/fr.constants.ts";
import { JA } from "../../web/src/lib/i18n/dictionaries/ja.constants.ts";

process.stdout.write(JSON.stringify({ en: PHRASES, fr: FR, ja: JA }));
