/* Reads the archive from the public, read-only API (Supabase REST over the api schema)
   and hands app.js the same shapes the static export used to. The key is Supabase's
   publishable key: public by design, it can only read what the api schema exposes. */
window.SPX_API = (() => {
  const URL = 'https://njpvfrceahkvnrduerkk.supabase.co/rest/v1/';
  const KEY = 'sb_publishable_FmeiL6oX9_Mrb8psQZFSQg_YO_O4afC';
  const LEAGUES = [
    { code: 'nhl', name: 'National Hockey League', short: 'NHL' }, { code: 'nba', name: 'National Basketball Association', short: 'NBA' },
    { code: 'mlb', name: 'Major League Baseball', short: 'MLB' }, { code: 'nfl', name: 'National Football League', short: 'NFL' },
    { code: 'cfl', name: 'Canadian Football League', short: 'CFL' }];
  async function rows(view, query = '') {
    const out = [];
    for (let from = 0; ; from += 1000) {
      const r = await fetch(URL + view + '?' + query, { headers: { apikey: KEY, 'Accept-Profile': 'api', Range: from + '-' + (from + 999) } });
      if (!r.ok) throw new Error(view + ' ' + r.status);
      const part = await r.json(); out.push(...part);
      if (part.length < 1000) return out;
    }
  }
  const PH = { regular: 'r', playoffs: 'p', preseason: 's', all_star: 'a' };
  return {
    async load(path) {
      if (path === 'summary.json') {
        const [seasons, totals] = await Promise.all([rows('season_summary', 'select=*&order=league,year'), rows('totals', 'select=*')]);
        return { leagues: LEAGUES, seasons, totals: totals[0] };
      }
      if (path === 'sources.json') {
        const [src, by] = await Promise.all([rows('sources', 'select=*'), rows('games_by_source', 'select=*')]);
        return src.map((s) => ({ ...s, games: by.filter((b) => b.source === s.code).reduce((a, b) => a + b.games, 0), award_winners: null }));
      }
      if (path === 'quality.json') {
        const [q, by] = await Promise.all([rows('quality', 'select=*&order=n.desc'), rows('games_by_source', 'select=*&order=league,games.desc')]);
        return { checks: q.filter((x) => x.kind === 'check').map((x) => ({ source: x.source, kind: x.entity, status: x.what, n: x.n })),
                 issues: q.filter((x) => x.kind === 'issue').slice(0, 60).map((x) => ({ source: x.source, kind: x.entity, issue: x.what, resolution: x.resolution, n: x.n })),
                 games_by_source: by.map((b) => ({ league: b.league, source: b.source, n: b.games })) };
      }
      let m = path.match(/^(\w+)\/teams\.json$/);
      if (m) {
        const [ts, names] = await Promise.all([rows('team_seasons', 'league=eq.' + m[1] + '&select=*&order=year'), rows('franchise_names', 'league=eq.' + m[1] + '&select=*&order=name_from')]);
        const by = new Map();
        const t = (f) => { if (!by.has(f)) by.set(f, { f, names: [], seasons: [], titles: [] }); return by.get(f); };
        for (const n of names) t(n.franchise_id).names.push({ name: n.name, from: n.name_from, to: n.name_to });
        for (const s of ts) { const x = t(s.franchise_id); if (s.w != null) x.seasons.push([s.year, s.w, s.l, s.t, s.otl]); if (s.champion) x.titles.push(s.year); if (!x.names.length) x.last = s.team; }
        for (const x of by.values()) if (!x.names.length && x.last) x.names.push({ name: x.last, from: null, to: null });
        return [...by.values()];
      }
      m = path.match(/^(\w+)\/(\d+)\.json$/);
      if (m) {
        const [lg, y] = [m[1], Number(m[2])], q = 'league=eq.' + lg + '&year=eq.' + y;
        const [summary, games, st, awards] = await Promise.all([rows('season_summary', q + '&select=label'), rows('games', q + '&select=*&order=game_date,game_id'),
          rows('standings', q + '&select=*'), rows('awards', q + '&select=*')]);
        if (!summary.length) throw new Error('no season');
        const teams = new Map();
        for (const g of games) { teams.set(g.home_id, { id: g.home_id, name: g.home }); teams.set(g.away_id, { id: g.away_id, name: g.away }); }
        for (const s of st) teams.set(s.team_id, { id: s.team_id, f: s.franchise_id, name: s.team });
        return { league: lg, year: y, label: summary[0].label,
          teams: [...teams.values()].sort((a, b) => (a.name || '').localeCompare(b.name || '')),
          standings: st.map((s) => ({ ...s, id: s.team_id, name: s.team })).sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || (b.w ?? 0) - (a.w ?? 0)),
          awards: awards.sort((a, b) => (a.kind > b.kind ? 1 : -1)),
          games: games.map((g) => [g.game_date, g.away_id, g.away_score, g.home_score, g.home_id, PH[g.phase] || 'r', g.status[0], g.source, g.overtime ? 1 : 0, g.checked]) };
      }
      throw new Error('unknown ' + path);
    },
  };
})();
