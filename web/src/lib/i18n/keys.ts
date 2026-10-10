/** Phrase keys chosen by a data code, kept beside the catalogue so a code and its words are found together. */
export const RESULT_KEY = { W: "result.w", L: "result.l", T: "result.t", OTL: "result.otl" } as const;
export type ResultCode = keyof typeof RESULT_KEY;
