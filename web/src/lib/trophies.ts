/* Each league's championship trophy, drawn as a simple line icon in the page colour.
   Drawn for this site (not copied artwork); they suggest the trophy rather than reproduce it. */
const wrap = (body: string, label: string) =>
  `<svg viewBox="0 0 60 100" role="img" aria-label="${label}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round">${body}</svg>`;

const T: Record<string, string> = {
  // Stanley Cup: a small bowl on a stepped collar over a tall, banded barrel.
  nhl: wrap(`<path d="M15 8h30c0 13-6 18-15 18S15 21 15 8z"/><path d="M15 8c0-3 30-3 30 0"/>
      <path d="M26 26h8v5h-8z"/><path d="M21 31h18v6H21z"/><path d="M18 37h24v6H18z"/>
      <path d="M16 43h28l3 49H13z"/><path d="M15.2 55h29.6M14.5 67h31M13.8 79h32.4" stroke-width="1.6"/>`, "Stanley Cup"),
  // Larry O'Brien Trophy: a ball dropping into a net, on a tapered stand.
  nba: wrap(`<circle cx="33" cy="17" r="10"/><path d="M23 17h20M33 7v20M26 10c4 4 4 10 0 14M40 10c-4 4-4 10 0 14" stroke-width="1.4"/>
      <path d="M17 30h26"/><path d="M19 30l4 14h14l4-14M23 37h14" stroke-width="1.6"/>
      <path d="M27 44h6l4 36H23z"/><path d="M18 80h24v6H18zM15 86h30v6H15z"/>`, "Larry O'Brien Trophy"),
  // Commissioner's Trophy: a ring of pennants around a ball, on a round base.
  mlb: wrap(`<circle cx="30" cy="38" r="6"/>
      <path d="M30 70V14M30 70L14 22M30 70L46 22M30 70L8 36M30 70L52 36"/>
      <path d="M30 14l6 3-6 3M14 22l6 1-4 5M46 22l-6 1 4 5M8 36l6-1-2 6M52 36l-6-1 2 6" stroke-width="1.6"/>
      <path d="M18 70h24l4 10H14z"/><path d="M12 80h36v8H12z"/>`, "Commissioner's Trophy"),
  // Vince Lombardi Trophy: a football set on end atop a tapering stand.
  nfl: wrap(`<path d="M30 6c8 6 8 22 0 28-8-6-8-22 0-28z"/><path d="M27 15h6M27 20h6M27 25h6M30 12v16" stroke-width="1.4"/>
      <path d="M27 34h6l5 46H22z"/><path d="M18 80h24v6H18zM15 86h30v6H15z"/>`, "Vince Lombardi Trophy"),
  // Grey Cup: a wide bowl with handles on a stem and stepped base.
  cfl: wrap(`<path d="M12 18h36c0 16-8 24-18 24S12 34 12 18z"/><path d="M12 18c0-3 36-3 36 0"/>
      <path d="M12 22c-6 0-7 10 2 11M48 22c6 0 7 10-2 11"/>
      <path d="M27 42h6v14h-6z"/><path d="M20 56h20v8H20zM16 64h28v10H16zM13 74h34v12H13z"/>`, "Grey Cup"),
  // The World Cup, MLS Cup and other soccer trophies: a ball held up on a tapering stand with a stepped base.
  soccer: wrap(`<circle cx="30" cy="22" r="14"/><path d="M16 22h28M30 8c-7 7-7 21 0 28M30 8c7 7 7 21 0 28" stroke-width="1.4"/>
      <path d="M24 36c0 14 2 20-3 32h18c-5-12-3-18-3-32"/><path d="M18 68h24v8H18z"/><path d="M15 76h30v10H15z"/>`, "Trophy"),
};

/** Trusted, static SVG markup for a league's trophy. */
export const trophySvg = (lg: string): string => T[lg] || T.nhl;
