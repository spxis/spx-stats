/* SPXN, the SPX Stats Network: a browser over the archive's public API (see api.js). */
(() => {
  const app = document.getElementById('app');
  const LG = { nhl: 'NHL', nba: 'NBA', mlb: 'MLB', nfl: 'NFL', cfl: 'CFL' };
  const SRC = { spx: 'SPX', spx_database: 'SPX', spxn_database: 'SPX', spx_files: 'SPX', retrosheet: 'Retrosheet', nflverse: 'nflverse',
                wikidata: 'Wikidata', nhl_api: 'NHL', spx_stats_derived: 'From results', editorial: 'Editorial' };
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
  const badge = (src) => el('span', { class: 'badge' + (isSpx(src) ? ' spx' : ''), title: src }, SRC[src] || src);
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
        .on('click', (ev, s) => { location.hash = `#/${lg}/${s.year}`; })
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
      .on('click', (ev, s) => { location.hash = `#/${lg}/${s.year}`; })
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
      .on('click', (ev, p) => { location.hash = `#/${lg}/${p.y}`; })
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
        return el('a', { class: 'card', href: `#/${l.code}`, style: `--lg: var(--${l.code})` }, el('h3', {}, l.short),
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
        list.map((x) => el('a', { href: `#/${lg}/${x.year}`, class: x.share >= 0.98 ? 'full' : null, title: x.games ? `${fmt(x.finals)} of ${fmt(x.games)} with a result` : 'Awards only' }, x.label)))),
      withGames.length ? el('section', { class: 'section' }, el('h2', {}, 'Games and results by season'),
        el('div', { class: 'legend' }, el('span', {}, el('i', { style: 'background: var(--accent)' }), 'With a result'), el('span', {}, el('i', { style: 'background: var(--accent); opacity: .22' }), 'Held, no result')), box) : null,
      el('section', { class: 'section' }, el('h2', {}, 'Champions'),
        champs.length ? el('div', { class: 'tablebox' }, el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Season'), el('th', {}, 'Champion'), el('th', {}, 'Final'), el('th', {}, 'Source'))),
          el('tbody', {}, champs.map((c) => el('tr', {}, el('td', {}, el('a', { href: `#/${lg}/${c.year}` }, c.label)), el('td', { class: 'team' }, c.champion),
            el('td', { class: 'note' }, c.champion_note || ''), el('td', {}, badge(c.champion_source)))))))
          : el('p', { class: 'note' }, 'No champions recorded yet.')));
    if (withGames.length) { barsBySeason(box, withGames, lg); onResize = () => barsBySeason(box, withGames, lg); }
  }

  async function season(lg, y) {
    accent(lg);
    const d = await get(`${lg}/${y}.json`);
    const teams = new Map((d.teams || []).map((t) => [t.id, t]));
    const nm = (id) => teams.get(id)?.name || '—';
    const games = (d.games || []).map(([date, a, as, hs, h, ph, st, src, ot, v]) => ({ date, a, as, hs, h, ph, st, src, ot, v }));
    const champ = (d.awards || []).find((x) => x.kind === 'championship');
    const awards = (d.awards || []).filter((x) => x.kind !== 'championship');
    const st = d.standings || [];
    const pub = st.find((r) => r.basis === 'published');
    const basis = pub ? 'As ' + (isSpx(pub.source) ? 'SPX' : 'the ' + (SRC[pub.source] || pub.source)) + ' published them' : 'Worked out from the final scores';
    let phase = 'r', team = '';
    const gamesBox = el('div', { class: 'games' });
    const pick = el('select', { 'aria-label': 'Team', onchange: (e) => { team = e.target.value; drawGames(); } },
      el('option', { value: '' }, 'All teams'), [...teams.values()].map((t) => el('option', { value: t.id }, t.name)));
    const seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Part of season' },
      [['r', 'Regular season'], ['p', 'Playoffs'], ['', 'All']].map(([k, label]) => el('button', { type: 'button', 'data-k': k, onclick: () => { phase = k; drawGames(); } }, label)));
    function drawGames() {
      seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.k === phase)));
      const sel = games.filter((g) => (!phase || g.ph === phase) && (!team || String(g.a) === team || String(g.h) === team));
      const days = d3.groups(sel, (g) => g.date);
      gamesBox.replaceChildren(...days.slice(-400).reverse().map(([date, list]) => el('div', { class: 'day' },
        el('h3', {}, d3.utcFormat('%a %b %-d, %Y')(new Date(date))),
        list.map((g) => {
          const fin = g.st === 'f';
          const aw = fin && g.as > g.hs, hw = fin && g.hs > g.as;
          return el('div', { class: 'game' },
            el('span', {}, el('span', { class: aw ? 'won' : null }, nm(g.a)), ' at ', el('span', { class: hw ? 'won' : null }, nm(g.h))),
            el('span', { class: 'score' }, fin ? `${g.as}–${g.hs}${g.ot ? ' OT' : ''}` : 'no result'),
            el('span', { class: 'meta' }, badge(g.src), g.v === 1 ? el('span', { class: 'ok', title: 'Confirmed by a second source' }, '✓ confirmed') : null,
              g.v === -1 ? el('span', { class: 'bad', title: 'A second source disagrees' }, '≠ disputed') : null));
        }))));
      if (!days.length) gamesBox.append(el('p', { class: 'note' }, 'No games for this choice.'));
      else if (days.length > 400) gamesBox.append(el('p', { class: 'note' }, `Showing the last 400 of ${days.length} days. Pick a team to see all of its games.`));
    }
    const maxPct = d3.max(st, (r) => r.pct) || 1;
    const showT = st.some((r) => r.t), showO = st.some((r) => r.otl), showP = st.some((r) => r.pts != null);
    show(
      el('section', { class: 'head fade' }, el('span', { class: 'eyebrow' }, el('a', { href: `#/${lg}` }, LG[lg])), el('h1', {}, `${d.label} season`),
        el('p', { class: 'lede' }, `${fmt(games.filter((g) => g.ph === 'r').length)} regular-season games, ${fmt(games.filter((g) => g.ph === 'r' && g.st === 'f').length)} with a result.`)),
      champ ? el('section', { class: 'banner' }, el('span', { class: 'cup' }, champ.award), badge(champ.source), el('span', { class: 'who' }, champ.winner), el('span', { class: 'how' }, champ.note || '')) : null,
      st.length ? el('section', { class: 'section' }, el('h2', {}, 'Standings'), el('p', { class: 'note' }, basis + '. Sorted by share of games won.'),
        el('div', { class: 'scroll' }, el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Team'), el('th', { class: 'num' }, 'GP'), el('th', { class: 'num' }, 'W'), el('th', { class: 'num' }, 'L'),
          showT ? el('th', { class: 'num' }, 'T') : null, showO ? el('th', { class: 'num' }, 'OTL') : null, showP ? el('th', { class: 'num' }, 'Pts') : null,
          el('th', { class: 'num' }, 'For'), el('th', { class: 'num' }, 'Against'), el('th', {}, 'Home'), el('th', {}, 'Road'), el('th', {}, 'Pct'))),
          el('tbody', {}, st.map((r) => el('tr', {}, el('td', { class: 'team' }, el('a', { href: `#/${lg}/team/${teams.get(r.id)?.f}` }, r.name)),
            el('td', { class: 'num' }, r.gp ?? ''), el('td', { class: 'num' }, r.w ?? ''), el('td', { class: 'num' }, r.l ?? ''),
            showT ? el('td', { class: 'num' }, r.t ?? '') : null, showO ? el('td', { class: 'num' }, r.otl ?? '') : null, showP ? el('td', { class: 'num' }, r.pts ?? '') : null,
            el('td', { class: 'num' }, r.pf != null ? fmt(r.pf) : ''), el('td', { class: 'num' }, r.pa != null ? fmt(r.pa) : ''),
            el('td', {}, r.home || ''), el('td', {}, r.road || ''),
            el('td', {}, r.pct != null ? d3.format('.3f')(r.pct) : '', r.pct != null ? el('span', { class: 'pctbar', style: `width:${Math.round(60 * r.pct / maxPct)}px` }) : null))))))) : null,
      awards.length ? el('section', { class: 'section' }, el('h2', {}, 'Awards'), el('div', { class: 'awards' },
        awards.map((a) => el('div', { class: 'award' }, el('span', { class: 'name' }, a.award), el('span', { class: 'winner' }, a.winner),
          el('span', { class: 'note' }, a.note || '', ' ', badge(a.source)))))) : null,
      games.length ? el('section', { class: 'section' }, el('h2', {}, 'Games'), el('div', { class: 'controls' }, seg, pick), gamesBox) : null,
      el('p', { class: 'note' }, el('a', { href: `#/${lg}/${y - 1}` }, '← ' + seasonLabel(lg, y - 1)), ' · ', el('a', { href: `#/${lg}/${y + 1}` }, seasonLabel(lg, y + 1) + ' →')));
    if (games.length) drawGames();
  }

  // The big count of titles with the league's trophy beside it.
  function trophies(lg, n) {
    const cup = el('span', { class: 'cup' }); cup.innerHTML = window.SPX_TROPHY(lg);
    return el('div', { class: 'trophies fade' }, el('b', {}, String(n)), cup);
  }

  async function teamPage(lg, f) {
    accent(lg);
    const all = await get(`${lg}/teams.json`);
    const t = all.find((x) => String(x.f) === String(f));
    if (!t) { show(el('p', {}, 'No such team.')); return; }
    const names = t.names || [];
    const box = el('div', { class: 'chart' });
    const now = names.at(-1)?.name || `Team ${f}`;
    show(
      el('section', { class: 'head fade' }, el('span', { class: 'eyebrow' }, el('a', { href: `#/${lg}` }, LG[lg])), el('h1', {}, now),
        el('p', { class: 'lede' }, `${(t.seasons || []).length} seasons of results${(t.titles || []).length ? `, ${t.titles.length} championship${t.titles.length === 1 ? '' : 's'}` : ''}.`)),
      (t.titles || []).length ? trophies(lg, t.titles.length) : null,
      el('section', { class: 'section' }, el('h2', {}, 'Winning share by season'), el('p', { class: 'note' }, 'Filled dots are championship seasons. Click a season to open it.'), box),
      names.length ? el('section', { class: 'section' }, el('h2', {}, 'Names over time'), el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Name'), el('th', {}, 'From'), el('th', {}, 'Until'))),
        el('tbody', {}, names.map((n) => el('tr', {}, el('td', { class: 'team' }, n.name), el('td', {}, n.from || ''), el('td', {}, n.to || 'today')))))) : null,
      (t.titles || []).length ? el('section', { class: 'section' }, el('h2', {}, 'Championships'), el('div', { class: 'seasonlist' },
        t.titles.map((y) => el('a', { class: 'full', href: `#/${lg}/${y}` }, seasonLabel(lg, y))))) : null);
    winLine(box, t, lg); onResize = () => winLine(box, t, lg);
  }

  async function sources() {
    accent(null);
    const s = await get('sources.json');
    show(
      el('section', { class: 'head fade' }, el('h1', {}, 'Sources'), el('p', { class: 'lede' }, 'SPX\'s own data is the base wherever SPX holds it. Open sources fill what SPX never had and check what it did.')),
      el('section', { class: 'section' }, el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Source'), el('th', {}, 'Licence and credit'), el('th', { class: 'num' }, 'Games'), el('th', { class: 'num' }, 'Award winners'))),
        el('tbody', {}, s.filter((x) => x.games || x.award_winners).map((x) => el('tr', {},
          el('td', { class: 'team' }, x.url ? el('a', { href: x.url }, x.name) : x.name, el('div', { class: 'note' }, x.notes || '')),
          el('td', {}, x.licence || '', x.attribution ? el('div', { class: 'note' }, x.attribution) : null),
          el('td', { class: 'num' }, fmt(x.games)), el('td', { class: 'num' }, fmt(x.award_winners))))))));
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
      el('section', { class: 'section' }, el('h2', {}, 'Where each league\'s games come from'), el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'League'), el('th', {}, 'Source'), el('th', { class: 'num' }, 'Games'))),
        el('tbody', {}, (q.games_by_source || []).map((r) => el('tr', {}, el('td', {}, LG[r.league]), el('td', {}, badge(r.source)), el('td', { class: 'num' }, fmt(r.n))))))),
      el('section', { class: 'section' }, el('h2', {}, 'Logged issues'), el('div', { class: 'tablebox' }, el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Issue'), el('th', {}, 'What was done'), el('th', {}, 'Source'), el('th', { class: 'num' }, 'Count'))),
        el('tbody', {}, issues.map((i) => el('tr', {}, el('td', {}, i.issue), el('td', { class: 'note' }, i.resolution), el('td', {}, badge(i.source)), el('td', { class: 'num' }, fmt(i.n)))))))));
  }

  // ---------- routing
  let onResize = null;
  async function route() {
    onResize = null;
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    document.querySelectorAll('#league-nav a').forEach((a) => a.setAttribute('aria-current', a.dataset.lg === parts[0] ? 'page' : 'false'));
    try {
      if (!parts.length) await home();
      else if (parts[0] === 'sources') await sources();
      else if (parts[0] === 'quality') await quality();
      else if (LG[parts[0]] && parts[1] === 'team') await teamPage(parts[0], parts[2]);
      else if (LG[parts[0]] && parts[1]) await season(parts[0], Number(parts[1]));
      else if (LG[parts[0]]) await league(parts[0]);
      else await home();
    } catch (e) {
      show(el('p', { class: 'note' }, 'This page has no data yet.'), el('p', {}, el('a', { href: '#/' }, 'Back to the start')));
    }
    window.scrollTo(0, 0);
  }
  document.getElementById('league-nav').append(...Object.entries(LG).map(([k, v]) => el('a', { href: `#/${k}`, 'data-lg': k }, v)));
  window.addEventListener('hashchange', route);
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => onResize && onResize(), 150); });
  route();
})();
