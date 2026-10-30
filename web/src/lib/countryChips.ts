/** One country chip as the page sends it: [the country's code, its name in the reader's language, its players, 1 when the site has its flag]. */
export type ChipCountry = readonly [code: string, name: string, players: number, flag: 0 | 1];
