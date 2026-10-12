/** Folding a name for searching, for the server and the browser both (the browser matches what it has typed to what the server found). */

const MAPPED: Record<string, string> = { ø: "o", ł: "l", đ: "d", ð: "d", ı: "i", æ: "ae", œ: "oe", ß: "ss" };

/** What a search compares: no accents, lower case, no dots or apostrophes, other marks as one space. The same as core.fold_text in migration 037. */
export const fold = (s: string): string =>
  s.normalize("NFD").toLowerCase().replace(/[\u0300-\u036f.'\u2019]/g, "").replace(/[øłđðıæœß]/g, (c) => MAPPED[c]).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
