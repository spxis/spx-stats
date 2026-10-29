/** The senshu-jerseys cut for a league's retired-number sweater. Soccer and unknown leagues get hockey. */
const CUT: Record<string, "hockey" | "basketball" | "baseball" | "football"> = {
  nhl: "hockey", pwhl: "hockey", nha: "hockey", pcha: "hockey", wchl: "hockey", wha: "hockey", ahl: "hockey", echl: "hockey",
  nba: "basketball", wnba: "basketball",
  mlb: "baseball", na: "baseball", aa: "baseball", ua: "baseball", pl: "baseball", fl: "baseball",
  nfl: "football", afl: "football", aafc: "football", cfl: "football",
};

export function jerseyCut(league: string): "hockey" | "basketball" | "baseball" | "football" {
  return CUT[league] ?? "hockey";
}
