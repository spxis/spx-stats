/* SPXN, the SPX Stats Network: a browser over the archive's public API (see api.js). */
(() => {
  const app = document.getElementById('app');
  const LG = { nhl: 'NHL', nba: 'NBA', mlb: 'MLB', nfl: 'NFL', cfl: 'CFL' };
  const SRC = { spx: 'SPX', spx_database: 'SPX', spxn_database: 'SPX', spx_files: 'SPX', retrosheet: 'Retrosheet', nflverse: 'nflverse',
                wikidata: 'Wikidata', nhl_api: 'NHL', spx_stats_derived: 'From results', editorial: 'Editorial' };
  const tlink = (lg, f, name, cls) => (f != null ? el('a', { class: cls || null, href: `/${lg}/team/${f}` }, name) : el('span', { class: cls || null }, name));
  const isSpx = (s) => s && s.startsWith('spx') && s !== 'spx_stats_derived';
  const fmt = d3.format(',');
  const cache = new Map();
  const get = (path) => {
    if (!cache.has(path)) cache.set(path, window.SPX_API.load(path));
    return cache.get(path);
  };
  const el = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v);
    }
    for (const k of kids.flat()) if (k != null && k !== false) n.append(k instanceof Node ? k : document.createTextNode(String(k)));
    return n;
  };
  const show = (...kids) => app.replaceChildren(...kids.flat().filter((k) => k != null && k !== false));
  const accent = (lg) => document.documentElement.style.setProperty('--accent', lg ? `var(--${lg})` : 'var(--ink)');
  // Team colours and logos (see the Logos page). A brand era covers a date range; pick the one for a year.
  let BRAND = null;
  const brands = async () => (BRAND = BRAND || await get('brand.json').catch(() => ({})));
  const brandFor = (f, year) => {
    const list = (BRAND || {})[f] || []; if (!list.length) return null;
    const y = year ? `${year}-12-31` : null;
    return (y && list.find((b) => (!b.brand_from || b.brand_from <= y) && (!b.brand_to || b.brand_to > y))) || list.find((b) => !b.brand_to) || list.at(-1);
  };
  const lum = (hex) => { const c = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const logo = (b, size = 20) => (b && b.logo_url ? el('img', { class: 'logo', src: b.logo_url, alt: '', width: size, height: size, loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer', onerror: (e) => e.target.remove() }) : null);
  const badge = (src) => el('span', { class: 'badge' + (isSpx(src) ? ' spx' : ''), title: src }, SRC[src] || src);
  // Who holds each league's title: the latest season with a champion, and every season's champion.
  const titleHolders = async (lg) => {
    const s = await get('summary.json').catch(() => ({ seasons: [] }));
    const list = (s.seasons || []).filter((x) => x.league === lg && x.champion_franchise != null).sort((a, b) => a.year - b.year);
    return { reigning: list.at(-1) || null, byYear: new Map(list.map((x) => [x.year, x])) };
  };
  const cupIcon = (lg, cls) => { const c = el('span', { class: cls, 'aria-hidden': 'true' }); c.innerHTML = window.SPX_TROPHY(lg); return c; };
  // "20-10-2" -> share of games won (a tie counts half), for sorting a Home or Road record; null when blank.
  const recShare = (rec) => { const n = String(rec || '').match(/\d+/g); if (!n) return null; const [w, l = 0, t = 0, o = 0] = n.map(Number); const g = w + l + t + o; return g ? (w + t / 2) / g : null; };
  const PH_KEY = { regular: 'r', playoffs: 'p', preseason: 's', all_star: 'a' };
  const go = (href) => { if (href !== location.pathname + location.search) history.pushState(null, '', href); route(); };
  const seasonLabel = (lg, y) => (lg === 'nhl' || lg === 'nba') ? `${y}-${String(y + 1).slice(2)}` : String(y);

  // Tooltip helper: one per chart box.
  function tip(box) {
    const t = el('div', { class: 'tip', hidden: true }); box.append(t);
    return {
      show(ev, html) {
        t.replaceChildren(...html); t.hidden = false;
        const r = box.getBoundingClientRect();
        let x = ev.clientX - r.left + 14, y = ev.clientY - r.top + 14;
        if (x + t.offsetWidth > box.clientWidth) x = ev.clientX - r.left - t.offsetWidth - 14;
        if (y + t.offsetHeight > box.clientHeight + 40) y = ev.clientY - r.top - t.offsetHeight - 10;
        t.style.left = Math.max(0, x) + 'px'; t.style.top = Math.max(0, y) + 'px';
      },
      hide() { t.hidden = true; },
    };
  }
  const lines = (title, ...rows) => [el('b', {}, title), ...rows.filter(Boolean).map((r) => el('div', {}, r))];

  // Share of each season's games that have a result, against a typical season for that league and era.
  function coverage(seasons) {
    const byLg = d3.group(seasons, (s) => s.league);
    for (const [, list] of byLg) {
      for (const s of list) {
        const near = list.filter((o) => Math.abs(o.year - s.year) <= 6 && o.games > 0).map((o) => o.games);
        const typical = near.length ? d3.median(near) : s.games;
        s.share = s.games ? Math.min(1, s.finals / Math.max(s.games, typical * 0.9)) : 0;
      }
    }
  }
  const shareColor = (s) => s <= 0 ? 'transparent'
    : `color-mix(in srgb, var(--accent-cell) ${Math.round(18 + 82 * s)}%, transparent)`;

  function heatmap(box, seasons, leagues) {
    box.replaceChildren();
    const years = d3.range(d3.min(seasons, (s) => s.year), d3.max(seasons, (s) => s.year) + 1);
    const W = Math.max(box.clientWidth, 640), left = 46, rowH = 26, top = 18;
    const cw = (W - left) / years.length;
    const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${W} ${top + rowH * leagues.length + 4}`).attr('role', 'img')
      .attr('aria-label', 'Share of games with a result, by league and season');
    const x = (y) => left + (y - years[0]) * cw;
    const decades = years.filter((y) => y % 10 === 0);
    svg.append('g').selectAll('text').data(decades).join('text').attr('x', (y) => x(y)).attr('y', 11).text((y) => y);
    svg.append('g').selectAll('line').data(decades).join('line').attr('x1', (y) => x(y)).attr('x2', (y) => x(y))
      .attr('y1', top - 3).attr('y2', top + rowH * leagues.length).attr('stroke', 'var(--rule)');
    const T = tip(box);
    leagues.forEach((lg, i) => {
      const g = svg.append('g').attr('transform', `translate(0,${top + i * rowH})`).style(`--accent-cell`, `var(--${lg})`);
      g.append('text').attr('class', 'lab').attr('x', 0).attr('y', rowH / 2 + 5).text(LG[lg]);
      const list = seasons.filter((s) => s.league === lg);
      g.selectAll('rect').data(list).join('rect')
        .attr('x', (s) => x(s.year) + 0.5).attr('y', 3).attr('width', Math.max(1, cw - 1)).attr('height', rowH - 6)
        .attr('fill', (s) => shareColor(s.share)).attr('stroke', (s) => s.share > 0 ? 'none' : 'var(--rule)').attr('stroke-width', 0.5)
        .style('cursor', 'pointer')
        .on('click', (ev, s) => { go(`/${lg}/${s.year}`); })
        .on('mousemove', (ev, s) => T.show(ev, lines(`${LG[lg]} ${s.label}`,
          s.games ? `${fmt(s.finals)} of ${fmt(s.games)} regular-season games with a result` : 'No games held yet',
          s.champion ? `Champion: ${s.champion}` : null)))
        .on('mouseleave', T.hide);
    });
  }

  function barsBySeason(box, list, lg) {
    box.replaceChildren();
    const W = Math.max(box.clientWidth, 300), H = 220, m = { t: 10, r: 6, b: 24, l: 48 };
    const x = d3.scaleBand(list.map((s) => s.year), [m.l, W - m.r]).padding(0.15);
    const y = d3.scaleLinear([0, d3.max(list, (s) => s.games) || 1], [H - m.b, m.t]).nice();
    const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Games and results per season');
    svg.append('g').selectAll('line').data(y.ticks(4)).join('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y).attr('stroke', 'var(--rule)');
    svg.append('g').selectAll('text').data(y.ticks(4)).join('text').attr('x', m.l - 6).attr('y', y).attr('dy', '0.32em').attr('text-anchor', 'end').text(fmt);
    const step = Math.ceil(list.length / Math.max(1, Math.floor((W - m.l) / 42)));
    svg.append('g').selectAll('text').data(list.filter((s, i) => i % step === 0)).join('text')
      .attr('x', (s) => x(s.year) + x.bandwidth() / 2).attr('y', H - 6).attr('text-anchor', 'middle').text((s) => s.year);
    const T = tip(box);
    const g = svg.append('g').selectAll('g').data(list).join('g').style('cursor', 'pointer')
      .on('click', (ev, s) => { go(`/${lg}/${s.year}`); })
      .on('mousemove', (ev, s) => T.show(ev, lines(s.label, `${fmt(s.games)} games, ${fmt(s.finals)} with a result`, s.champion ? `Champion: ${s.champion}` : null)))
      .on('mouseleave', T.hide);
    g.append('rect').attr('x', (s) => x(s.year)).attr('width', x.bandwidth()).attr('y', (s) => y(s.games)).attr('height', (s) => y(0) - y(s.games))
      .attr('fill', 'var(--accent)').attr('opacity', 0.22).attr('rx', 2);
    g.append('rect').attr('x', (s) => x(s.year)).attr('width', x.bandwidth()).attr('y', (s) => y(s.finals)).attr('height', (s) => y(0) - y(s.finals))
      .attr('fill', 'var(--accent)').attr('rx', 2);
  }

  function winLine(box, team, lg) {
    box.replaceChildren();
    const pts = (team.seasons || []).map(([y, w, l, t, o]) => ({ y, w, l, t, o, pct: (w + l + (o || 0)) ? w / (w + l + (o || 0)) : null }))
      .filter((p) => p.pct != null);
    if (!pts.length) { box.append(el('p', { class: 'note' }, 'No complete seasons of results yet.')); return; }
    const W = Math.max(box.clientWidth, 300), H = 240, m = { t: 14, r: 10, b: 26, l: 40 };
    const x = d3.scaleLinear(d3.extent(pts, (p) => p.y), [m.l, W - m.r]);
    const y = d3.scaleLinear([0, 1], [H - m.b, m.t]);
    const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Winning percentage by season');
    svg.append('g').selectAll('line').data([0.25, 0.5, 0.75]).join('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y)
      .attr('stroke', (v) => v === 0.5 ? 'var(--muted)' : 'var(--rule)').attr('stroke-dasharray', (v) => v === 0.5 ? '4 3' : null);
    svg.append('g').selectAll('text').data([0.25, 0.5, 0.75]).join('text').attr('x', m.l - 6).attr('y', y).attr('dy', '0.32em').attr('text-anchor', 'end').text(d3.format('.3f'));
    svg.append('g').selectAll('text').data(x.ticks(Math.min(8, pts.length)).filter(Number.isInteger)).join('text')
      .attr('x', x).attr('y', H - 6).attr('text-anchor', 'middle').text((v) => v);
    const titles = new Set(team.titles || []);
    svg.append('path').datum(pts).attr('fill', 'none').attr('stroke', 'var(--accent)').attr('stroke-width', 2).attr('stroke-linejoin', 'round')
      .attr('d', d3.line().defined((p, i) => i === 0 || p.y - pts[i - 1].y <= 1).x((p) => x(p.y)).y((p) => y(p.pct)));
    const T = tip(box);
    svg.append('g').selectAll('circle').data(pts).join('circle').attr('cx', (p) => x(p.y)).attr('cy', (p) => y(p.pct))
      .attr('r', (p) => titles.has(p.y) ? 6 : 2.5).attr('fill', (p) => titles.has(p.y) ? 'var(--accent)' : 'var(--panel)')
      .attr('stroke', 'var(--accent)').attr('stroke-width', 1.5).style('cursor', 'pointer')
      .on('click', (ev, p) => { go(`/${lg}/${p.y}`); })
      .on('mousemove', (ev, p) => T.show(ev, lines(seasonLabel(lg, p.y), `${p.w}-${p.l}${p.t ? '-' + p.t : ''}${p.o ? '-' + p.o : ''}`,
        `Win share ${d3.format('.3f')(p.pct)}`, titles.has(p.y) ? 'Won the championship' : null)))
      .on('mouseleave', T.hide);
  }

  // ---------- pages
  async function home() {
    accent(null);
    const s = await get('summary.json'); coverage(s.seasons);
    const leagues = s.leagues.map((l) => l.code);
    const t = s.totals;
    const box = el('div', { class: 'chart scroll' });
    show(
      el('section', { class: 'head fade' }, el('span', { class: 'eyebrow' }, 'NHL · NBA · MLB · NFL · CFL'), el('h1', {}, 'Every game, every champion'),
        el('p', { class: 'lede' }, 'Scores, standings, champions and awards of five leagues, built from the SPX archive of 1997–2013 and filled out from open sources. Every result says where it came from.')),
      el('section', { class: 'figures' },
        [['Games', t.games], ['Results', t.finals], ['Confirmed by a second source', t.confirmed], ['Betting lines', t.lines], ['Award winners', t.award_winners], ['Franchises', t.franchises]]
          .map(([k, v]) => el('div', { class: 'figure' }, el('b', {}, fmt(v)), el('span', {}, k)))),
      el('section', { class: 'section' }, el('h2', {}, 'What the archive holds'),
        el('p', { class: 'note' }, 'Each square is a season, shaded by how many of its games have a result. Click one to open it.'), box),
      el('section', { class: 'cards' }, s.leagues.map((l) => {
        const list = s.seasons.filter((x) => x.league === l.code && x.games > 0);
        const last = s.seasons.filter((x) => x.league === l.code && x.champion).at(-1);
        return el('a', { class: 'card', href: `/${l.code}`, style: `--lg: var(--${l.code})` }, el('h3', {}, l.short),
          el('span', {}, l.name), el('span', { class: 'span' }, list.length ? `${list[0].year}–${list.at(-1).year} · ${list.length} seasons` : 'No games yet'),
          last ? el('span', { class: 'note' }, `${last.label} champion: ${last.champion}`) : null);
      })));
    heatmap(box, s.seasons, leagues);
    onResize = () => heatmap(box, s.seasons, leagues);
  }

  async function league(lg) {
    accent(lg);
    const s = await get('summary.json'); coverage(s.seasons);
    const info = s.leagues.find((l) => l.code === lg);
    const list = s.seasons.filter((x) => x.league === lg).sort((a, b) => a.year - b.year);
    const withGames = list.filter((x) => x.games > 0);
    const box = el('div', { class: 'chart' });
    const champs = list.filter((x) => x.champion).reverse();
    show(
      el('section', { class: 'head fade' }, el('span', { class: 'eyebrow' }, info.short), el('h1', {}, info.name),
        el('p', { class: 'lede' }, `${list.length} seasons held, ${withGames.length} with games. ${champs.length} champions on record.`)),
      el('section', { class: 'section' }, el('h2', {}, 'Seasons'), el('div', { class: 'seasonlist' },
        list.map((x) => el('a', { href: `/${lg}/${x.year}`, class: x.share >= 0.98 ? 'full' : null, title: x.games ? `${fmt(x.finals)} of ${fmt(x.games)} with a result` : 'Awards only' }, x.label)))),
      withGames.length ? el('section', { class: 'section' }, el('h2', {}, 'Games and results by season'),
        el('div', { class: 'legend' }, el('span', {}, el('i', { style: 'background: var(--accent)' }), 'With a result'), el('span', {}, el('i', { style: 'background: var(--accent); opacity: .22' }), 'Held, no result')), box) : null,
      el('section', { class: 'section' }, el('h2', {}, 'Champions'),
        champs.length ? el('div', { class: 'tablebox' }, SPX_TABLE.build(el, { rows: champs, def: 'season.desc', columns: [
          { key: 'season', label: 'Season', get: (c) => c.year, num: true, cls: 'seasoncell', cell: (c) => el('a', { href: `/${lg}/${c.year}` }, c.label) },
          { key: 'champion', label: 'Champion', cls: 'team', get: (c) => c.champion, cell: (c) => tlink(lg, c.champion_franchise, c.champion) },
          { key: 'final', label: 'Final', cls: 'note', get: (c) => c.champion_note, cell: (c) => c.champion_note || '' },
          { key: 'source', label: 'Source', get: (c) => SRC[c.champion_source] || c.champion_source, cell: (c) => badge(c.champion_source) }] }).table)
          : el('p', { class: 'note' }, 'No champions recorded yet.')));
    if (withGames.length) { barsBySeason(box, withGames, lg); onResize = () => barsBySeason(box, withGames, lg); }
  }

  // The Regular season / Playoffs / All switch used by the season and team-season pages.
  function phaseSeg(get, set) {
    const seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Part of season' },
      [['r', 'Regular season'], ['p', 'Playoffs'], ['', 'All']].map(([k, label]) => el('button', { type: 'button', 'data-k': k, onclick: () => set(k) }, label)));
    seg.sync = () => seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === get())));
    return seg;
  }

  // A game as two teams and a score, for a day's list.
  function gameRow(lg, teams, g) {
    const fin = g.st === 'f';
    const aw = fin && g.as > g.hs, hw = fin && g.hs > g.as;
    return el('div', { class: 'game' },
      el('span', {}, tlink(lg, teams.get(g.a)?.f, teams.get(g.a)?.name || '—', aw ? 'won' : null), ' at ', tlink(lg, teams.get(g.h)?.f, teams.get(g.h)?.name || '—', hw ? 'won' : null)),
      el('span', { class: 'score' }, fin ? `${g.as}–${g.hs}${g.ot ? (lg === 'mlb' ? ' extras' : ' OT') : ''}` : 'no result'),
      el('span', { class: 'meta' }, badge(g.src), g.v === 1 ? el('span', { class: 'ok', title: 'Confirmed by a second source' }, '✓ confirmed') : null,
        g.v === -1 ? el('span', { class: 'bad', title: 'A second source disagrees' }, '≠ disputed') : null));
  }

  // A month calendar of games: each day shaded by how many games it held, or by a team's result on its days.
  // Games are { date, a, as, hs, h, ph, st, src, ot, v }. month and day start from ?month= and ?day=;
  // persist({ month, day }) is told whenever they change. dayOnly lists games only for a picked day.
  function calendarView({ lg, q, teams, persist, dayOnly = false }) {
    let month = q.get('month') || '', day = q.get('day') || '', sel = [], team = '';
    const cal = el('div', { class: 'cal' }), box = el('div', { class: 'daylist' });
    const iso = d3.utcFormat('%Y-%m-%d'), ym = (d) => d.slice(0, 7);
    const score = (g) => (String(g.h) === team ? [g.hs, g.as] : [g.as, g.hs]);
    const result = (list) => { const g = list[0]; if (!g || g.st !== 'f') return 'N'; const [m, t] = score(g); return m > t ? 'W' : m < t ? 'L' : 'T'; };
    const mark = (list) => {
      const g = list[0]; if (!g || g.st !== 'f') return el('span', { class: 'mk' }, '·');
      const [m, t] = score(g), r = m > t ? 'W' : m < t ? 'L' : 'T';
      return el('span', { class: 'mk ' + r }, `${r} ${m}–${t}`);
    };
    function redraw() {
      const byDay = d3.group(sel, (g) => g.date);
      const months = [...new Set(sel.map((g) => ym(g.date)))].sort();
      if (!months.length) { cal.replaceChildren(); box.replaceChildren(el('p', { class: 'note' }, 'No games for this choice.')); persist({ month, day }); return; }
      if (!months.includes(month)) { month = months.at(-1); day = ''; }
      if (day && !byDay.has(day)) day = '';
      persist({ month, day });
      const most = d3.max(byDay.values(), (l) => l.length) || 1;
      const first = new Date(month + '-01T00:00:00Z');
      const cells = [];
      for (let i = 0; i < first.getUTCDay(); i++) cells.push(el('span', { class: 'cell blank' }));
      for (let d = new Date(first); d.getUTCMonth() === first.getUTCMonth(); d.setUTCDate(d.getUTCDate() + 1)) {
        const key = iso(d), list = byDay.get(key) || [];
        cells.push(list.length
          ? el('button', { type: 'button', class: 'cell has' + (team ? ' res ' + result(list) : '') + (key === day ? ' on' : ''), style: `--heat:${Math.round(18 + 62 * list.length / most)}%`,
              'aria-label': `${d3.utcFormat('%B %-d')(d)}: ${list.length} game${list.length === 1 ? '' : 's'}`, 'aria-pressed': String(key === day),
              onclick: () => { day = key === day ? '' : key; redraw(); } },
              el('span', { class: 'dn' }, d.getUTCDate()), team ? mark(list) : el('span', { class: 'ct' }, list.length))
          : el('span', { class: 'cell' }, el('span', { class: 'dn' }, d.getUTCDate())));
      }
      const mi = months.indexOf(month);
      const go = (k) => { month = months[k]; day = ''; redraw(); };
      cal.replaceChildren(
        el('div', { class: 'calhead' },
          el('button', { type: 'button', class: 'nav', disabled: mi === 0 ? '' : null, 'aria-label': 'Previous month', onclick: () => go(mi - 1) }, '‹'),
          el('div', { class: 'months' }, months.map((m, k) => el('button', { type: 'button', class: 'mo', 'aria-pressed': String(m === month), onclick: () => go(k) },
            d3.utcFormat(months.length > 12 ? '%b %y' : '%b')(new Date(m + '-01T00:00:00Z'))))),
          el('button', { type: 'button', class: 'nav', disabled: mi === months.length - 1 ? '' : null, 'aria-label': 'Next month', onclick: () => go(mi + 1) }, '›')),
        el('div', { class: 'grid' }, ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((w) => el('span', { class: 'wd' }, w)), cells));
      if (dayOnly && !day) { box.replaceChildren(el('p', { class: 'note' }, `${d3.utcFormat('%B %Y')(first)}. Pick a day to see its game.`)); return; }
      const shown = day ? [[day, byDay.get(day)]] : [...byDay].filter(([k]) => ym(k) === month).sort((a, b) => a[0].localeCompare(b[0]));
      const n = d3.sum(shown, ([, l]) => l.length);
      box.replaceChildren(
        el('p', { class: 'note' }, day ? `${d3.utcFormat('%A, %B %-d, %Y')(new Date(day + 'T00:00:00Z'))}: ${n} game${n === 1 ? '' : 's'}. ` : `${d3.utcFormat('%B %Y')(first)}: ${n} games. Pick a day to see just that day. `,
          day ? el('button', { type: 'button', class: 'linkish', onclick: () => { day = ''; redraw(); } }, 'Show the whole month') : null),
        el('div', { class: 'games' }, shown.map(([date, list]) => el('div', { class: 'day' },
          el('h3', {}, d3.utcFormat('%a %b %-d, %Y')(new Date(date + 'T00:00:00Z'))), list.map((g) => gameRow(lg, teams, g))))));
    }
    return { cal, box, draw(games, forTeam) { sel = games; team = forTeam ? String(forTeam) : ''; redraw(); } };
  }

  async function season(lg, y) {
    accent(lg);
    const [d, holders] = await Promise.all([get(`${lg}/${y}.json`), titleHolders(lg), brands()]);
    const defending = holders.byYear.get(y - 1)?.champion_franchise;
    const teams = new Map((d.teams || []).map((t) => [t.id, t]));
    const nm = (id) => teams.get(id)?.name || '—';
    const games = (d.games || []).map(([date, a, as, hs, h, ph, st, src, ot, v]) => ({ date, a, as, hs, h, ph, st, src, ot, v }));
    const champ = (d.awards || []).find((x) => x.kind === 'championship');
    const awards = (d.awards || []).filter((x) => x.kind !== 'championship');
    const st = d.standings || [];
    const pub = st.find((r) => r.basis === 'published');
    const basis = pub ? 'As ' + (isSpx(pub.source) ? 'SPX' : 'the ' + (SRC[pub.source] || pub.source)) + ' published them' : 'Worked out from the final scores';
    // Selections live in the address (?phase=&team=&month=&day=), next to ?sort=, so a reload or a shared link keeps them.
    const q = new URLSearchParams(location.search);
    let phase = q.has('phase') ? q.get('phase') : 'r', team = q.get('team') || '';
    const view = calendarView({ lg, q, teams, persist: ({ month, day }) => SPX_TABLE.query({ phase: phase !== 'r' ? phase : null, team: team || null, month: month || null, day: day || null }) });
    const pick = el('select', { 'aria-label': 'Team', onchange: (e) => { team = e.target.value; drawGames(); } },
      el('option', { value: '' }, 'All teams'), [...teams.values()].map((t) => el('option', { value: t.id, selected: String(t.id) === team ? '' : null }, t.name)));
    const seg = phaseSeg(() => phase, (k) => { phase = k; drawGames(); });
    function drawGames() {
      seg.sync();
      view.draw(games.filter((g) => (!phase || g.ph === phase) && (!team || String(g.a) === team || String(g.h) === team)), team);
    }
    const maxPct = d3.max(st, (r) => r.pct) || 1;
    const showT = st.some((r) => r.t), showO = st.some((r) => r.otl), showP = st.some((r) => r.pts != null);
    const fOf = (r) => r.franchise_id ?? teams.get(r.id)?.f;
    const standingsTable = SPX_TABLE.build(el, { rows: st, def: 'pct.desc', columns: [
      { key: 'team', label: 'Team', cls: 'team', get: (r) => r.name, cell: (r) => [logo(brandFor(fOf(r), y)), el('a', { href: `/${lg}/team/${fOf(r)}` }, r.name),
        defending != null && String(fOf(r)) === String(defending) ? el('span', { class: 'defending', title: `Won the ${seasonLabel(lg, y - 1)} title` }, 'Defending champion') : null] },
      { key: 'gp', label: 'GP', num: true, title: "Games played; opens the team's whole season", cell: (r) => (r.gp != null && fOf(r) != null ? el('a', { href: `/${lg}/${y}/team/${fOf(r)}`, title: `Every ${r.name} game of ${d.label}` }, r.gp) : r.gp ?? '') },
      { key: 'w', label: 'W', num: true }, { key: 'l', label: 'L', num: true },
      ...(showT ? [{ key: 't', label: 'T', num: true }] : []), ...(showO ? [{ key: 'otl', label: 'OTL', num: true }] : []), ...(showP ? [{ key: 'pts', label: 'Pts', num: true }] : []),
      { key: 'pf', label: 'For', num: true, cell: (r) => (r.pf != null ? fmt(r.pf) : '') }, { key: 'pa', label: 'Against', num: true, cell: (r) => (r.pa != null ? fmt(r.pa) : '') },
      { key: 'home', label: 'Home', get: (r) => recShare(r.home), cell: (r) => r.home || '' }, { key: 'road', label: 'Road', get: (r) => recShare(r.road), cell: (r) => r.road || '' },
      { key: 'pct', label: 'Pct', num: true, cell: (r) => [r.pct != null ? d3.format('.3f')(r.pct) : '', r.pct != null ? el('span', { class: 'pctbar', style: `width:${Math.round(60 * r.pct / maxPct)}px` }) : null] }] });
    show(
      el('section', { class: 'head fade' }, el('nav', { class: 'seasonnav', 'aria-label': 'Other seasons' }, el('a', { href: `/${lg}/${y - 1}`, rel: 'prev' }, '← ' + seasonLabel(lg, y - 1)), el('a', { href: `/${lg}/${y + 1}`, rel: 'next' }, seasonLabel(lg, y + 1) + ' →')), el('span', { class: 'eyebrow' }, el('a', { href: `/${lg}` }, LG[lg])), el('h1', {}, `${d.label} season`),
        el('p', { class: 'lede' }, `${fmt(games.filter((g) => g.ph === 'r').length)} regular-season games, ${fmt(games.filter((g) => g.ph === 'r' && g.st === 'f').length)} with a result.`)),
      champ ? el('section', { class: 'banner' }, el('span', { class: 'cup' }, champ.award), badge(champ.source), el('span', { class: 'who' }, tlink(lg, champ.franchise_id, champ.winner)), el('span', { class: 'how' }, champ.note || '')) : null,
      st.length ? el('section', { class: 'section' }, el('h2', {}, 'Standings'), el('p', { class: 'note' }, basis + '. Press a column to sort. Games played opens that team\'s whole season.'),
        el('div', { class: 'scroll' }, standingsTable.table)) : null,
      awards.length ? el('section', { class: 'section' }, el('h2', {}, 'Awards'), el('div', { class: 'awards' },
        awards.map((a) => el('div', { class: 'award' }, el('span', { class: 'name' }, a.award), el('span', { class: 'winner' }, tlink(lg, a.franchise_id, a.winner)),
          el('span', { class: 'note' }, a.note || '', ' ', badge(a.source)))))) : null,
      games.length ? el('section', { class: 'section' }, el('h2', {}, 'Games'), el('div', { class: 'controls' }, seg, pick), view.cal, view.box) : null);
    if (games.length) drawGames();
  }

  // The big count of titles with the league's trophy beside it.
  function trophies(lg, n, titles = []) {
    const cup = el('span', { class: 'cup' }); cup.innerHTML = window.SPX_TROPHY(lg);
    return el('div', { class: 'trophyrow fade' },
      el('div', { class: 'trophies' }, el('b', {}, String(n)), cup),
      titles.length ? el('div', { class: 'champs' }, el('h2', {}, 'Championships'), el('div', { class: 'seasonlist' },
        titles.map((y) => el('a', { class: 'full', href: `/${lg}/${y}` }, seasonLabel(lg, y))))) : null);
  }

  // One row per season of a franchise's standings, newest first.
  // The franchise's all-time regular-season record, summed over every season shown.
  // A small map of the team's home (top right of its page); pressing it opens every team that season.
  async function teamMapCorner(lg, f, year, name) {
    const me = brandFor(f, year);
    if (!me || me.latitude == null) return null;
    const { drawTeamMap } = await import('/teammap.js');
    const small = await drawTeamMap([{ f, name, lat: me.latitude, lon: me.longitude, venue: me.home_venue, me: true }], { title: `Where the ${name} play` });
    if (!small) return null;
    const btn = el('button', { type: 'button', class: 'mapbtn', 'aria-label': `Map of every ${LG[lg]} team in ${seasonLabel(lg, year)}` }, small);
    btn.addEventListener('click', async () => {
      const clubs = await get(`${lg}/${year}/clubs.json`).catch(() => []);
      const teams = clubs.map((c) => { const b = brandFor(c.franchise_id, year); return b && b.latitude != null ? { f: c.franchise_id, name: c.team, lat: b.latitude, lon: b.longitude, venue: b.home_venue, href: `/${lg}/team/${c.franchise_id}`, me: String(c.franchise_id) === String(f) } : null; }).filter(Boolean);
      const big = await drawTeamMap(teams.length ? teams : [{ f, name, lat: me.latitude, lon: me.longitude, me: true }], { big: true, title: `${LG[lg]} teams, ${seasonLabel(lg, year)}` });
      const dlg = el('dialog', { class: 'mapdlg', 'aria-label': `${LG[lg]} teams, ${seasonLabel(lg, year)}` },
        el('div', { class: 'dlghead' }, el('h2', {}, `${LG[lg]} teams, ${seasonLabel(lg, year)}`), el('button', { type: 'button', class: 'theme', onclick: () => dlg.close() }, 'Close')),
        big || el('p', { class: 'note' }, 'No locations for this season yet.'),
        el('p', { class: 'note' }, `${teams.length} of ${clubs.length} teams placed. Press a dot to open that team. Map: Chizu, from Natural Earth.`));
      dlg.addEventListener('close', () => dlg.remove());
      dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
      document.body.append(dlg); dlg.showModal();
    });
    return btn;
  }

  function lifetime(lg, rows) {
    const sum = (k) => d3.sum(rows, (r) => r[k] || 0);
    const w = sum('w'), l = sum('l'), t = sum('t'), o = sum('otl'), gp = sum('gp');
    const pct = w + l + t + o ? (w + t / 2) / (w + l + t + o) : null;
    const figs = [['Seasons', rows.length], ['Games', gp], ['Wins', w], ['Losses', l]];
    if (t) figs.push(['Ties', t]);
    if (o) figs.push([lg === 'nhl' ? 'OT losses' : 'OT', o]);
    figs.push(['Winning share', pct == null ? '—' : d3.format('.3f')(pct)]);
    return el('section', { class: 'section' }, el('h2', {}, 'All-time record'),
      el('div', { class: 'figures' }, figs.map(([k, v]) => el('div', { class: 'figure' }, el('b', {}, typeof v === 'number' ? fmt(v) : v), el('span', {}, k)))),
      el('p', { class: 'note' }, 'Regular seasons only. Winning share counts a tie as half a win and an overtime loss as a loss.'));
  }

  function teamStandings(lg, rows, titles, f) {
    const won = new Set((titles || []).map(Number));
    const showT = rows.some((r) => r.t), showO = rows.some((r) => r.otl), showP = rows.some((r) => r.pts != null);
    const maxPct = d3.max(rows, (r) => r.pct) || 1;
    const cupIcon = () => { const c = el('span', { class: 'minicup', title: 'Champion', role: 'img', 'aria-label': 'Champion' }); c.innerHTML = window.SPX_TROPHY(lg); return c; };
    const t = SPX_TABLE.build(el, { rows, def: 'season.desc', columns: [
      { key: 'season', label: 'Season', num: true, cls: 'seasoncell', get: (r) => r.year, cell: (r) => [el('a', { href: `/${lg}/${r.year}` }, seasonLabel(lg, r.year)), won.has(r.year) ? cupIcon() : null] },
      { key: 'team', label: 'Team', cls: 'team', get: (r) => r.team, cell: (r) => r.team || '' },
      { key: 'gp', label: 'GP', num: true, title: "Games played; opens that season's every game", cell: (r) => (r.gp != null ? el('a', { href: `/${lg}/${r.year}/team/${f}`, title: `Every game of ${seasonLabel(lg, r.year)}` }, r.gp) : '') },
      { key: 'w', label: 'W', num: true }, { key: 'l', label: 'L', num: true },
      ...(showT ? [{ key: 't', label: 'T', num: true }] : []), ...(showO ? [{ key: 'otl', label: 'OTL', num: true }] : []), ...(showP ? [{ key: 'pts', label: 'Pts', num: true }] : []),
      { key: 'pf', label: 'PF', num: true, cell: (r) => (r.pf != null ? fmt(r.pf) : '') }, { key: 'pa', label: 'PA', num: true, cell: (r) => (r.pa != null ? fmt(r.pa) : '') },
      { key: 'home', label: 'Home', get: (r) => recShare(r.home), cell: (r) => r.home || '' }, { key: 'road', label: 'Road', get: (r) => recShare(r.road), cell: (r) => r.road || '' },
      { key: 'pct', label: 'Pct', num: true, cell: (r) => [r.pct != null ? d3.format('.3f')(r.pct) : '', r.pct != null ? el('span', { class: 'pctbar', style: `width:${Math.round(60 * r.pct / maxPct)}px` }) : null] }] });
    return el('section', { class: 'section' }, el('h2', {}, 'Standings by season'),
      el('p', { class: 'note' }, `${rows.length} season${rows.length === 1 ? '' : 's'}, newest first. The trophy marks a championship season. Press a column to sort; games played opens that season's every game.`),
      el('div', { class: 'tablebox' }, t.table));
  }

  async function teamPage(lg, f) {
    accent(lg);
    const [all, stRows, holders] = await Promise.all([get(`${lg}/teams.json`), get(`${lg}/team/${f}/standings.json`).catch(() => []), titleHolders(lg)]);
    const t = all.find((x) => String(x.f) === String(f));
    if (!t) { show(el('p', {}, 'No such team.')); return; }
    const names = t.names || [];
    const box = el('div', { class: 'chart' });
    const now = names.at(-1)?.name || `Team ${f}`;
    await brands();
    const b = brandFor(f);
    applyBrand(b);
    const latest = stRows.filter((r) => r.w != null).sort((a, c) => c.year - a.year)[0];
    const marginBox = el('div', { class: 'chart' });
    const glance = stRows.length ? el('section', { class: 'section' }, el('h2', {}, 'Record at a glance'),
      el('div', { class: 'chartrow' }, donut('All-time record', `${stRows.length} regular seasons`, recordParts(lg, { w: d3.sum(stRows, (r) => r.w || 0), l: d3.sum(stRows, (r) => r.l || 0), t: d3.sum(stRows, (r) => r.t || 0), otl: d3.sum(stRows, (r) => r.otl || 0) })),
        latest ? donut(`${seasonLabel(lg, latest.year)} record`, 'Most recent season with results', recordParts(lg, latest)) : null),
      el('h3', {}, 'Scoring margin per game, by season'), el('p', { class: 'note' }, 'Points for minus points against, divided by games played. Click a season to open every game of it.'), marginBox) : null;
    show(
      b && b.primary_hex ? el('div', { class: 'teamband', style: `--tp:#${b.primary_hex};--ts:#${b.secondary_hex || b.primary_hex}` }) : null,
      el('section', { class: 'head fade' }, el('span', { class: 'eyebrow' }, el('a', { href: `/${lg}` }, LG[lg])), el('h1', { class: 'teamname' }, logo(b, 56), now), holders.reigning && String(holders.reigning.champion_franchise) === String(f) ? el('a', { class: 'reigning', href: `/${lg}/${holders.reigning.year}` }, cupIcon(lg, 'rcup'), `Reigning champions · ${holders.reigning.label}`) : null,
        el('p', { class: 'lede' }, `${(t.seasons || []).length} seasons of results${(t.titles || []).length ? `, ${t.titles.length} championship${t.titles.length === 1 ? '' : 's'}` : ''}.`)),
      stRows.length ? lifetime(lg, stRows) : null,
      glance,
      (t.titles || []).length ? trophies(lg, t.titles.length, t.titles) : null,
      el('section', { class: 'section' }, el('h2', {}, 'Winning share by season'), el('p', { class: 'note' }, 'Filled dots are championship seasons. Click a season to open it.'), box),
      stRows.length ? teamStandings(lg, stRows, t.titles, f) : null,
      names.length ? el('section', { class: 'section' }, el('h2', {}, 'Names over time'), SPX_TABLE.build(el, { rows: names, param: 'sort_names', columns: [
        { key: 'name', label: 'Name', cls: 'team' }, { key: 'from', label: 'From', cell: (n) => n.from || '' },
        { key: 'until', label: 'Until', get: (n) => n.to || '9999', cell: (n) => n.to || 'today' }] }).table) : null,);
    winLine(box, t, lg); if (glance) marginBars(marginBox, stRows, lg, f);
    onResize = () => { winLine(box, t, lg); if (glance) marginBars(marginBox, stRows, lg, f); };
    const lastYear = stRows.length ? d3.max(stRows, (r) => r.year) : null;
    if (lastYear != null) teamMapCorner(lg, f, lastYear, now).then((m) => { const head = document.querySelector('#app .head'); if (m && head && head.isConnected) head.prepend(m); }).catch(() => {});
  }

  async function sources() {
    accent(null);
    const s = await get('sources.json');
    show(
      el('section', { class: 'head fade' }, el('h1', {}, 'Sources'), el('p', { class: 'lede' }, 'SPX\'s own data is the base wherever SPX holds it. Open sources fill what SPX never had and check what it did.')),
      el('section', { class: 'section' }, el('div', { class: 'scroll' }, SPX_TABLE.build(el, { rows: s.filter((x) => x.games || x.award_winners), columns: [
        { key: 'source', label: 'Source', cls: 'team', get: (x) => x.name, cell: (x) => [x.url ? el('a', { href: x.url }, x.name) : x.name, el('div', { class: 'note' }, x.notes || '')] },
        { key: 'licence', label: 'Licence and credit', get: (x) => x.licence, cell: (x) => [x.licence || '', x.attribution ? el('div', { class: 'note' }, x.attribution) : null] },
        { key: 'games', label: 'Games', num: true, cell: (x) => fmt(x.games) }, { key: 'winners', label: 'Award winners', num: true, get: (x) => x.award_winners, cell: (x) => fmt(x.award_winners) }] }).table)));
  }

  async function quality() {
    accent(null);
    const q = await get('quality.json');
    const checks = q.checks || [], issues = q.issues || [];
    const conf = d3.sum(checks.filter((c) => c.status === 'confirmed'), (c) => c.n), disp = d3.sum(checks.filter((c) => c.status === 'disputed'), (c) => c.n);
    show(
      el('section', { class: 'head fade' }, el('h1', {}, 'Data quality'), el('p', { class: 'lede' }, 'Every change to what a source said is logged, and every value a second source checks gets a mark.')),
      el('section', { class: 'figures' }, [['Confirmed by a second source', conf], ['Disputed', disp], ['Logged issues', d3.sum(issues, (i) => i.n)]]
        .map(([k, v]) => el('div', { class: 'figure' }, el('b', {}, fmt(v)), el('span', {}, k)))),
      el('section', { class: 'section' }, el('h2', {}, 'Where each league\'s games come from'), el('div', { class: 'scroll' }, SPX_TABLE.build(el, { rows: q.games_by_source || [], param: 'sort_games', columns: [
        { key: 'league', label: 'League', get: (r) => LG[r.league], cell: (r) => LG[r.league] }, { key: 'source', label: 'Source', get: (r) => SRC[r.source] || r.source, cell: (r) => badge(r.source) },
        { key: 'games', label: 'Games', num: true, get: (r) => r.n, cell: (r) => fmt(r.n) }] }).table)),
      el('section', { class: 'section' }, el('h2', {}, 'Logged issues'), el('div', { class: 'tablebox' }, SPX_TABLE.build(el, { rows: issues, param: 'sort_issues', columns: [
        { key: 'issue', label: 'Issue' }, { key: 'resolution', label: 'What was done', cls: 'note' },
        { key: 'source', label: 'Source', get: (i) => SRC[i.source] || i.source, cell: (i) => badge(i.source) }, { key: 'count', label: 'Count', num: true, get: (i) => i.n, cell: (i) => fmt(i.n) }] }).table)));
  }

  // ---------- team charts (accent = the team's colour; motion only when the reader allows it)
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const OTL = () => 'OT losses';
  const recordParts = (lg, r) => [{ k: 'w', label: 'Wins', n: r.w || 0 }, { k: 'l', label: 'Losses', n: r.l || 0 }, { k: 't', label: 'Ties', n: r.t || 0 }, { k: 'o', label: OTL(lg), n: r.otl ?? r.o ?? 0 }];

  // A donut of wins, losses, ties and overtime losses, with the win share in the middle.
  function donut(title, sub, parts) {
    parts = parts.filter((p) => p.n > 0);
    const total = d3.sum(parts, (p) => p.n);
    const wrap = el('div', { class: 'donutbox' }, el('h3', {}, title), el('p', { class: 'note' }, sub));
    if (!total) { wrap.append(el('p', { class: 'note' }, 'No results yet.')); return wrap; }
    const box = el('div', { class: 'chart donut' });
    const share = ((parts.find((p) => p.k === 'w')?.n || 0) + (parts.find((p) => p.k === 't')?.n || 0) / 2) / total;
    const svg = d3.select(box).append('svg').attr('viewBox', '0 0 200 200').attr('role', 'img').attr('aria-label', `${title}: ` + parts.map((p) => `${fmt(p.n)} ${p.label.toLowerCase()}`).join(', '));
    const g = svg.append('g').attr('transform', 'translate(100,100)');
    const arc = d3.arc().innerRadius(64).outerRadius(96).padAngle(parts.length > 1 ? 0.015 : 0).cornerRadius(2);
    const T = tip(box);
    const paths = g.selectAll('path').data(d3.pie().sort(null).value((p) => p.n)(parts)).join('path').attr('class', (d) => 'seg-' + d.data.k)
      .on('mousemove', (ev, d) => T.show(ev, lines(d.data.label, `${fmt(d.data.n)} of ${fmt(total)} games (${d3.format('.1%')(d.data.n / total)})`))).on('mouseleave', T.hide);
    if (still()) paths.attr('d', arc);
    else paths.transition().duration(800).ease(d3.easeCubicOut).attrTween('d', (d) => { const i = d3.interpolate({ startAngle: d.startAngle, endAngle: d.startAngle }, d); return (t) => arc(i(t)); });
    svg.append('text').attr('class', 'big').attr('x', 100).attr('y', 104).text(d3.format('.3f')(share));
    svg.append('text').attr('class', 'sub').attr('x', 100).attr('y', 122).text('Win share');
    wrap.append(box, el('div', { class: 'legend' }, parts.map((p) => el('span', {}, el('i', { class: 'seg-' + p.k }), `${p.label} ${fmt(p.n)}`))));
    return wrap;
  }

  // Scoring margin per game for each season: bars up in the team colour when it outscored its opponents.
  function marginBars(box, rows, lg, f) {
    box.replaceChildren();
    const list = rows.filter((r) => r.pf != null && r.pa != null && r.gp > 0).map((r) => ({ ...r, d: (r.pf - r.pa) / r.gp })).sort((a, b) => a.year - b.year);
    if (list.length < 2) { box.append(el('p', { class: 'note' }, 'No scoring figures for this team yet.')); return; }
    const W = Math.max(box.clientWidth, 300), H = 220, m = { t: 10, r: 6, b: 24, l: 40 };
    const x = d3.scaleBand(list.map((s) => s.year), [m.l, W - m.r]).padding(0.12);
    const ext = d3.max(list, (s) => Math.abs(s.d)) || 1;
    const y = d3.scaleLinear([-ext, ext], [H - m.b, m.t]).nice();
    const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Points for minus points against per game, by season');
    svg.append('g').selectAll('line').data(y.ticks(4)).join('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y).attr('stroke', 'var(--rule)');
    svg.append('g').selectAll('text').data(y.ticks(4)).join('text').attr('x', m.l - 6).attr('y', y).attr('dy', '0.32em').attr('text-anchor', 'end').text((v) => (v > 0 ? '+' : '') + d3.format('~g')(v));
    const step = Math.ceil(list.length / Math.max(1, Math.floor((W - m.l) / 42)));
    svg.append('g').selectAll('text').data(list.filter((s, i) => i % step === 0)).join('text').attr('x', (s) => x(s.year) + x.bandwidth() / 2).attr('y', H - 6).attr('text-anchor', 'middle').text((s) => s.year);
    const T = tip(box);
    const bars = svg.append('g').selectAll('rect').data(list).join('rect').attr('x', (s) => x(s.year)).attr('width', x.bandwidth())
      .attr('fill', (s) => (s.d >= 0 ? 'var(--accent)' : 'color-mix(in srgb, var(--ink) 55%, var(--paper))')).style('cursor', 'pointer')
      .on('click', (ev, s) => go(`/${lg}/${s.year}/team/${f}`))
      .on('mousemove', (ev, s) => T.show(ev, lines(seasonLabel(lg, s.year), `${s.d >= 0 ? '+' : ''}${d3.format('.2f')(s.d)} per game`, `${fmt(s.pf)} for, ${fmt(s.pa)} against in ${s.gp} games`))).on('mouseleave', T.hide);
    const top = (s) => Math.min(y(s.d), y(0)), hgt = (s) => Math.abs(y(s.d) - y(0));
    if (still()) bars.attr('y', top).attr('height', hgt);
    else bars.attr('y', y(0)).attr('height', 0).transition().duration(700).delay((s, i) => i * 4).attr('y', top).attr('height', hgt);
    svg.append('line').attr('class', 'zero').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(0)).attr('y2', y(0));
  }

  // Games over .500 after each game of a season.
  function runningLine(box, games) {
    box.replaceChildren();
    const pts = []; let diff = 0, w = 0, n = 0;
    for (const g of games) { if (g.res === '') continue; n++; if (g.res === 'W') { w++; diff++; } else if (g.res === 'L' || g.res === 'OTL') diff--; else w += 0.5; pts.push({ n, diff, share: w / n, g }); }
    if (pts.length < 2) { box.append(el('p', { class: 'note' }, 'Not enough results to draw a line.')); return; }
    const W = Math.max(box.clientWidth, 300), H = 240, m = { t: 14, r: 12, b: 26, l: 40 };
    const x = d3.scaleLinear([1, pts.length], [m.l, W - m.r]);
    const ext = d3.extent(pts, (p) => p.diff), y = d3.scaleLinear([Math.min(ext[0], 0), Math.max(ext[1], 0)], [H - m.b, m.t]).nice();
    const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Wins minus losses after each game of the season');
    svg.append('g').selectAll('line').data(y.ticks(4)).join('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y).attr('y2', y).attr('stroke', 'var(--rule)');
    svg.append('g').selectAll('text').data(y.ticks(4)).join('text').attr('x', m.l - 6).attr('y', y).attr('dy', '0.32em').attr('text-anchor', 'end').text((v) => (v > 0 ? '+' : '') + v);
    svg.append('g').selectAll('text').data(x.ticks(Math.min(8, pts.length)).filter(Number.isInteger)).join('text').attr('x', x).attr('y', H - 6).attr('text-anchor', 'middle').text((v) => v);
    svg.append('line').attr('class', 'zero').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(0)).attr('y2', y(0));
    svg.append('path').datum(pts).attr('fill', 'var(--accent)').attr('opacity', 0.14).attr('d', d3.area().x((p) => x(p.n)).y0(y(0)).y1((p) => y(p.diff)).curve(d3.curveStepAfter));
    const line = svg.append('path').datum(pts).attr('fill', 'none').attr('stroke', 'var(--accent)').attr('stroke-width', 2).attr('stroke-linejoin', 'round')
      .attr('d', d3.line().x((p) => x(p.n)).y((p) => y(p.diff)).curve(d3.curveStepAfter));
    if (!still()) { const len = line.node().getTotalLength(); line.attr('stroke-dasharray', len).attr('stroke-dashoffset', len).transition().duration(1100).ease(d3.easeCubicOut).attr('stroke-dashoffset', 0); }
    const dot = svg.append('circle').attr('r', 4).attr('fill', 'var(--accent)').attr('stroke', 'var(--paper)').attr('stroke-width', 1.5).attr('display', 'none');
    const T = tip(box), bis = d3.bisector((p) => p.n).center;
    svg.append('rect').attr('x', m.l).attr('y', 0).attr('width', W - m.l - m.r).attr('height', H - m.b).attr('fill', 'transparent').style('touch-action', 'pan-y')
      .on('pointermove', (ev) => {
        const [mx] = d3.pointer(ev), p = pts[Math.max(0, Math.min(pts.length - 1, bis(pts, x.invert(mx))))];
        dot.attr('display', null).attr('cx', x(p.n)).attr('cy', y(p.diff));
        T.show(ev, lines(`Game ${p.n}, ${d3.utcFormat('%b %-d')(new Date(p.g.date + 'T00:00:00Z'))}`, `${p.g.res} ${p.g.mine}–${p.g.theirs} ${p.g.loc === 'Home' ? 'vs' : 'at'} ${p.g.oppName}`, `Record ${p.g.rec}`, `${p.diff > 0 ? '+' : ''}${p.diff} games over .500 · win share ${d3.format('.3f')(p.share)}`));
      }).on('pointerleave', () => { T.hide(); dot.attr('display', 'none'); });
  }

  // Home and road records as two stacked bars.
  function splitBars(box, games) {
    box.replaceChildren();
    const rows = ['Home', 'Away'].map((loc) => { const gs = games.filter((g) => g.loc === loc && g.res !== ''); return { loc, w: gs.filter((g) => g.res === 'W').length, l: gs.filter((g) => g.res === 'L' || g.res === 'OTL').length, t: gs.filter((g) => g.res === 'T').length }; }).filter((r) => r.w + r.l + r.t);
    if (!rows.length) { box.append(el('p', { class: 'note' }, 'No results yet.')); return; }
    const W = Math.max(box.clientWidth, 260), bh = 30, H = rows.length * (bh + 18) + 4, left = 54;
    const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('role', 'img').attr('aria-label', 'Wins and losses at home and on the road');
    const T = tip(box);
    rows.forEach((r, i) => {
      const tot = r.w + r.l + r.t, gy = i * (bh + 18) + 2, g = svg.append('g').attr('transform', `translate(0,${gy})`);
      g.append('text').attr('class', 'lab').attr('x', 0).attr('y', bh / 2 + 5).text(r.loc === 'Away' ? 'Road' : 'Home');
      let x0 = left; const wdt = W - left - 4;
      for (const [k, label, n] of [['w', 'Wins', r.w], ['t', 'Ties', r.t], ['l', 'Losses', r.l]]) {
        if (!n) continue;
        const rect = g.append('rect').attr('class', 'seg-' + k).attr('x', x0).attr('y', 0).attr('height', bh).attr('rx', 2)
          .on('mousemove', (ev) => T.show(ev, lines(`${r.loc === 'Away' ? 'Road' : 'Home'} ${label.toLowerCase()}`, `${n} of ${tot} games (${d3.format('.1%')(n / tot)})`))).on('mouseleave', T.hide);
        const wpx = wdt * n / tot;
        if (still()) rect.attr('width', wpx); else rect.attr('width', 0).transition().duration(700).attr('width', wpx);
        if (wpx > 22) g.append('text').attr('x', x0 + wpx / 2).attr('y', bh / 2 + 4).attr('text-anchor', 'middle').attr('fill', k === 'w' ? 'var(--paper)' : 'var(--ink)').style('fill', k === 'w' || k === 'l' ? 'var(--paper)' : 'var(--ink)').style('font-weight', 600).style('pointer-events', 'none').text(n);
        x0 += wpx;
      }
    });
  }

  // The page takes the team's colours; the accent is whichever team colour reads on the page background.
  function applyBrand(b) {
    if (!b || !b.primary_hex) return;
    const paper = getComputedStyle(document.body).backgroundColor.match(/\d+/g).slice(0, 3).map((n) => Number(n).toString(16).padStart(2, '0')).join('');
    const pick = [b.primary_hex, b.secondary_hex].filter(Boolean).find((h) => contrast(h, paper) >= 3);
    if (pick) document.documentElement.style.setProperty('--accent', '#' + pick);
  }

  // Every game one franchise played in one season: /nhl/2005/team/1408.
  async function teamSeason(lg, y, f) {
    accent(lg);
    const q = new URLSearchParams(location.search);
    const dateDir = (SPX_TABLE.parse(q.get('sort')).find((s) => s.key === 'date') || {}).dir;
    const fetchGames = (order) => window.SPX_API.teamGames(lg, y, f, order);
    const byDate = (o) => o.replace(/^game_date\.(asc|desc)\.nullslast$/, 'game_date.$1,game_id.$1');
    const [raw, all, stAll, holders] = await Promise.all([fetchGames(dateDir ? byDate(`game_date.${dateDir}.nullslast`) : 'game_date,game_id'),
      get(`${lg}/teams.json`).catch(() => []), get(`${lg}/team/${f}/standings.json`).catch(() => []), titleHolders(lg), brands()]);
    if (!raw.length) { show(el('p', { class: 'note' }, 'No games for that team in that season.'), el('p', {}, el('a', { href: `/${lg}/${y}` }, 'Back to the season'))); return; }
    const mineF = String(f);
    const first = raw.find((g) => String(g.home_f) === mineF) || raw[0];
    const me = String(first.home_f) === mineF ? { id: first.home_id, name: first.home } : { id: first.away_id, name: first.away };
    const st = stAll.find((r) => r.year === y) || null;
    const b = brandFor(f, y); applyBrand(b);
    const name = st?.team || me.name;
    const teams = new Map();
    for (const g of raw) { teams.set(g.home_id, { id: g.home_id, f: g.home_f, name: g.home }); teams.set(g.away_id, { id: g.away_id, f: g.away_f, name: g.away }); }

    // Each game from this team's side, with the running record kept for each part of the season.
    const derive = (list) => {
      const chrono = [...list].sort((a, c) => (a.game_date + a.game_id).localeCompare(c.game_date + c.game_id, undefined, { numeric: true }));
      const tally = {}, out = new Map();
      for (const g of chrono) {
        const home = String(g.home_f) === mineF, fin = g.status === 'final';
        const mine = home ? g.home_score : g.away_score, theirs = home ? g.away_score : g.home_score;
        let res = '';
        if (fin && mine != null && theirs != null) res = mine > theirs ? 'W' : mine < theirs ? (g.overtime && st?.otl ? 'OTL' : 'L') : 'T';
        const c = (tally[g.phase] = tally[g.phase] || { w: 0, l: 0, t: 0, o: 0 });
        if (res === 'W') c.w++; else if (res === 'L') c.l++; else if (res === 'T') c.t++; else if (res === 'OTL') c.o++;
        const played = c.w + c.l + c.t + c.o;
        out.set(g, { g, id: g.game_id, date: g.game_date, ph: PH_KEY[g.phase] || 'r', loc: home ? 'Home' : 'Away', oppF: home ? g.away_f : g.home_f, oppName: home ? g.away : g.home,
          mine, theirs, res, ot: !!g.overtime, margin: res ? mine - theirs : null, src: g.source, v: g.checked,
          rec: res ? `${c.w}–${c.l}${st?.t || c.t ? '–' + c.t : ''}${st?.otl || c.o ? '–' + c.o : ''}` : '', recPct: res && played ? (c.w + c.t / 2) / played : null });
      }
      return list.map((g) => out.get(g));
    };
    let allRows = derive(raw);
    let phase = q.has('phase') ? q.get('phase') : 'r';
    const inPhase = (r) => !phase || r.ph === phase;
    const toCal = (r) => ({ date: r.g.game_date, a: r.g.away_id, as: r.g.away_score, hs: r.g.home_score, h: r.g.home_id, ph: r.ph, st: r.g.status[0], src: r.src, ot: r.ot ? 1 : 0, v: r.v });

    const extra = lg === 'mlb' ? 'Extras' : 'OT';
    const resCell = (r) => (r.res ? el('span', { class: r.res === 'W' ? 'ok' : r.res === 'T' ? '' : 'bad' }, r.res) : el('span', { class: 'note' }, 'no result'));
    const T = SPX_TABLE.build(el, { rows: allRows.filter(inPhase), def: 'date.asc',
      remote: async (order) => { allRows = derive(await fetchGames(byDate(order))); return allRows.filter(inPhase); },
      columns: [
        { key: 'date', label: 'Date', rest: 'game_date', cls: 'seasoncell', get: (r) => r.date, cell: (r) => [d3.utcFormat('%a %b %-d')(new Date(r.date + 'T00:00:00Z')), r.ph !== 'r' ? el('span', { class: 'badge tag' }, r.ph === 'p' ? 'Playoffs' : r.ph === 's' ? 'Preseason' : 'All-Star') : null] },
        { key: 'loc', label: 'H/A', title: 'Home or away', cell: (r) => (r.loc === 'Home' ? 'Home' : 'Away') },
        { key: 'opp', label: 'Opponent', cls: 'team', get: (r) => r.oppName, cell: (r) => tlink(lg, r.oppF, r.oppName) },
        { key: 'score', label: 'Score', num: true, title: 'This team first. Sorted by margin.', get: (r) => r.margin, cell: (r) => (r.res ? `${r.mine}–${r.theirs}` : '') },
        { key: 'res', label: lg === 'nhl' ? 'W/L/T' : 'Result', cell: resCell, get: (r) => r.res || null },
        { key: 'ot', label: extra, title: lg === 'mlb' ? 'Went to extra innings' : 'Went to overtime', get: (r) => (r.ot ? 1 : 0), cell: (r) => (r.ot ? extra : '') },
        { key: 'rec', label: 'Record', num: true, title: 'Record after the game, within its part of the season', get: (r) => r.recPct, cell: (r) => r.rec },
        { key: 'src', label: 'Source', get: (r) => SRC[r.src] || r.src, cell: (r) => [badge(r.src), r.v === 1 ? el('span', { class: 'ok tag', title: 'Confirmed by a second source' }, '✓') : null, r.v === -1 ? el('span', { class: 'bad tag', title: 'A second source disagrees' }, '≠') : null] }] });

    // Calendar: this team's win or loss on each day.
    const view = calendarView({ lg, q, teams, dayOnly: true, persist: ({ month, day }) => SPX_TABLE.query({ phase: phase !== 'r' ? phase : null, month: month || null, day: day || null }) });
    const count = el('p', { class: 'note' });
    const seg = phaseSeg(() => phase, (k) => { phase = k; update(); });
    function update() {
      seg.sync();
      const rows = allRows.filter(inPhase);
      T.set(rows);
      const done = rows.filter((r) => r.res);
      count.textContent = `${fmt(rows.length)} game${rows.length === 1 ? '' : 's'}, ${fmt(done.length)} with a result. Press a column to sort.`;
      view.draw(rows.map(toCal), me.id);
    }

    const years = (all.find((x) => String(x.f) === mineF)?.seasons || []).map((s) => s[0]).sort((a, c) => a - c);
    const prev = years.filter((v) => v < y).at(-1), next = years.find((v) => v > y);
    const isChamp = holders.byYear.get(y) && String(holders.byYear.get(y).champion_franchise) === mineF;
    const reg = allRows.filter((r) => r.ph === 'r');
    const rec = st && st.w != null ? { w: st.w, l: st.l, t: st.t, otl: st.otl } : { w: reg.filter((r) => r.res === 'W').length, l: reg.filter((r) => r.res === 'L').length, t: reg.filter((r) => r.res === 'T').length, otl: reg.filter((r) => r.res === 'OTL').length };
    const recText = `${rec.w || 0}–${rec.l || 0}${rec.t ? '–' + rec.t : ''}${rec.otl ? '–' + rec.otl : ''}`;
    const figs = [['Record', recText]];
    if (st?.pts != null) figs.push(['Points', st.pts]);
    const share = (rec.w + (rec.t || 0) / 2) / ((rec.w + rec.l + (rec.t || 0) + (rec.otl || 0)) || 1);
    figs.push(['Winning share', rec.w + rec.l + (rec.t || 0) + (rec.otl || 0) ? d3.format('.3f')(share) : '—']);
    if (st?.pf != null) figs.push(['Points for', fmt(st.pf)], ['Points against', fmt(st.pa)]);
    if (st?.home) figs.push(['Home', st.home]); if (st?.road) figs.push(['Road', st.road]);
    const lineBox = el('div', { class: 'chart' }), splitBox = el('div', { class: 'chart' });
    const season = seasonLabel(lg, y);
    show(
      b && b.primary_hex ? el('div', { class: 'teamband', style: `--tp:#${b.primary_hex};--ts:#${b.secondary_hex || b.primary_hex}` }) : null,
      el('section', { class: 'head fade' },
        el('nav', { class: 'seasonnav', 'aria-label': 'Other seasons of this team' }, prev != null ? el('a', { href: `/${lg}/${prev}/team/${f}`, rel: 'prev' }, '← ' + seasonLabel(lg, prev)) : null, next != null ? el('a', { href: `/${lg}/${next}/team/${f}`, rel: 'next' }, seasonLabel(lg, next) + ' →') : null),
        el('span', { class: 'eyebrow' }, el('a', { href: `/${lg}` }, LG[lg]), ' · ', el('a', { href: `/${lg}/${y}` }, `${season} season`)),
        el('h1', { class: 'teamname' }, logo(b, 56), name),
        isChamp ? el('span', { class: 'reigning' }, cupIcon(lg, 'rcup'), `${season} champions`) : null,
        el('p', { class: 'lede' }, `Every game of the ${season} season: ${recText}. `, el('a', { href: `/${lg}/team/${f}` }, 'All seasons of the franchise'), ' · ', el('a', { href: `/${lg}/${y}?team=${me.id}` }, `The whole ${LG[lg]} season`))),
      el('section', { class: 'figures' }, figs.map(([k, v]) => el('div', { class: 'figure' }, el('b', {}, typeof v === 'number' ? fmt(v) : v), el('span', {}, k)))),
      el('section', { class: 'section' }, el('h2', {}, 'The season at a glance'),
        el('div', { class: 'chartrow' }, donut(`${season} record`, 'Regular season', recordParts(lg, rec)),
          el('div', { class: 'donutbox' }, el('h3', {}, 'Home and road'), el('p', { class: 'note' }, 'Every game with a result in the part of the season chosen below.'), splitBox)),
        el('h3', {}, 'Wins minus losses, game by game'), lineBox),
      el('section', { class: 'section' }, el('h2', {}, 'Games'), el('div', { class: 'controls' }, seg), count, el('div', { class: 'tablebox' }, T.table)),
      el('section', { class: 'section' }, el('h2', {}, 'Calendar'), el('p', { class: 'note' }, 'Green days are wins, red days losses. Pick a day to see its game.'), view.cal, view.box));
    const draw = () => { const rows = allRows.filter((r) => r.ph === (phase || r.ph)); runningLine(lineBox, rows); splitBars(splitBox, rows); };
    update(); draw();
    seg.addEventListener('click', draw);
    onResize = draw;
  }

  // ---------- routing
  let onResize = null;
  // Why the site shows team logos, and on what basis.
  async function logosPage() {
    accent(null);
    await brands();
    const list = Object.values(BRAND || {}).flat().filter((b) => b.logo_url);
    const kinds = d3.rollups(list, (v) => v.length, (b) => b.logo_licence || 'Not recorded').sort((a, b) => b[1] - a[1]);
    show(
      el('section', { class: 'head fade' }, el('span', { class: 'eyebrow' }, 'About the logos'), el('h1', {}, 'Team logos'),
        el('p', { class: 'lede' }, 'Why this site shows team logos, where they come from, and how to ask for one to be removed.')),
      el('section', { class: 'section prose' },
        el('h2', {}, 'They belong to their owners'),
        el('p', {}, 'Every team and league logo shown here is a trademark, and often a copyrighted work, of its team or league. SPXN is not affiliated with, sponsored by or endorsed by any team or league, and claims no rights in their logos.'),
        el('h2', {}, 'Why we show them'),
        el('p', {}, 'SPXN is a historical record of five leagues: scores, standings, champions and awards back to the 1870s. A small logo beside a name lets a reader recognize a team at a glance, the way a logo appears in a newspaper standings table. We use them for that alone: to identify the team being described, in a reference work about the sport’s history.'),
        el('p', {}, 'We believe this is fair use (in Canada, fair dealing for research, education and reporting): the logos are shown small and unaltered, only beside the team they name, never to sell anything, never in a way that suggests a team endorses this site, and they do not replace any market for the logos themselves. Sports reference sites have used logos on the same basis for many years.'),
        el('h2', {}, 'Where they come from'),
        el('p', {}, 'Logos are taken from Wikimedia Commons, through each team’s Wikidata entry, and shown from Commons’ own servers. Each logo keeps the licence its file page gives it. Some simple text logos are in the public domain for copyright, but remain trademarks.'),
        kinds.length ? SPX_TABLE.build(el, { rows: kinds, columns: [{ key: 'licence', label: 'Licence given by the file page', get: (k) => k[0], cell: (k) => k[0] },
          { key: 'logos', label: 'Logos', num: true, get: (k) => k[1], cell: (k) => fmt(k[1]) }] }).table : el('p', { class: 'note' }, 'No logos are loaded yet.'),
        el('h2', {}, 'Team colours'),
        el('p', {}, 'Team pages take the team’s colours. Colours are facts, not anyone’s property; ours come from Wikidata (CC0).'),
        el('h2', {}, 'Asking for removal'),
        el('p', {}, 'If you own a logo shown here and want it removed, tell us and it will be taken down promptly, no questions asked: ', el('a', { href: 'https://github.com/spxis/spx-stats/issues' }, 'open an issue'), '.')));
  }

  async function route(keepScroll) {
    onResize = null;
    const parts = location.pathname.split('/').filter(Boolean);
    document.querySelectorAll('#league-nav a').forEach((a) => a.setAttribute('aria-current', a.dataset.lg === parts[0] ? 'page' : 'false'));
    try {
      if (!parts.length) await home();
      else if (parts[0] === 'sources') await sources();
      else if (parts[0] === 'quality') await quality();
      else if (parts[0] === 'logos') await logosPage();
      else if (LG[parts[0]] && parts[1] === 'team') await teamPage(parts[0], parts[2]);
      else if (LG[parts[0]] && parts[2] === 'team' && /^\d+$/.test(parts[1]) && /^\d+$/.test(parts[3] || '')) await teamSeason(parts[0], Number(parts[1]), parts[3]);
      else if (LG[parts[0]] && parts[1]) await season(parts[0], Number(parts[1]));
      else if (LG[parts[0]]) await league(parts[0]);
      else await home();
    } catch (e) {
      show(el('p', { class: 'note' }, 'This page has no data yet.'), el('p', {}, el('a', { href: '/' }, 'Back to the start')));
    }
    if (!keepScroll) window.scrollTo(0, 0);
  }
  document.getElementById('league-nav').append(...Object.entries(LG).map(([k, v]) => el('a', { href: `/${k}`, 'data-lg': k }, v)));
  window.addEventListener('popstate', () => route(true));
  // Links inside the site change the address without reloading the page.
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href^="/"]');
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target) return;
    e.preventDefault(); go(a.getAttribute('href'));
  });
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => onResize && onResize(), 150); });
  route();
})();
