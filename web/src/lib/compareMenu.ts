/** The address of what a franchise's Compare menu lists (the route `rows/compare`), from the franchise page's address. No server code, so the menu in the browser can use it. */
export const compareRestPath = (teamPath: string): string => `${teamPath}/rows/compare`;
