/** The address of what a club's season fetches when it is needed: the pins of the big map and the roster flow, as JSON, from the season page's address. No server code, so the browser can use it. */
export const seasonRowsPath = (seasonPath: string, name: "map" | "flow"): string => `${seasonPath}/rows/${name}`;
