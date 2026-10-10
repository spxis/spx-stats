/* One sortable table for the whole site. A column header is a button; pressing it sorts by that column,
   pressing it again reverses. The sort lives in the address as ?sort=<column>.<asc|desc>, the shape
   PostgREST uses for order=, so a reload or a shared link keeps it. Numbers sort as numbers, blanks come
   last in either direction. When the rows came from the API a column can name the field it maps to
   (rest: 'game_date'); the table then asks the API for that order instead of sorting what it holds. */
window.SPX_TABLE = (() => {
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  const blank = (v) => v == null || v === '' || (typeof v === 'number' && Number.isNaN(v));

  // "w.desc,l.asc" -> [{ key: 'w', dir: 'desc' }, { key: 'l', dir: 'asc' }]; anything else is dropped.
  function parse(text) {
    return String(text || '').split(',').map((p) => p.trim()).filter(Boolean).map((p) => {
      const [key, dir] = p.split('.');
      return key ? { key, dir: dir === 'desc' ? 'desc' : 'asc' } : null;
    }).filter(Boolean);
  }
  const format = (spec) => spec.map((s) => `${s.key}.${s.dir}`).join(',');

  // Merge changes into the address without adding history. null, undefined or false removes a key.
  function query(changes) {
    const q = new URLSearchParams(location.search);
    for (const [k, v] of Object.entries(changes)) { if (v == null || v === false) q.delete(k); else q.set(k, v); }
    const href = location.pathname + (q.toString() ? '?' + q : '');
    if (href !== location.pathname + location.search) history.replaceState(null, '', href);
  }

  function sorted(rows, columns, spec) {
    const cols = spec.map((s) => ({ ...s, col: columns.find((c) => c.key === s.key) })).filter((s) => s.col);
    if (!cols.length) return rows;
    const idx = new Map(rows.map((r, i) => [r, i]));
    return [...rows].sort((a, b) => {
      for (const { col, dir } of cols) {
        const get = col.get || ((r) => r[col.key]);
        const x = get(a), y = get(b), bx = blank(x), by = blank(y);
        if (bx || by) { if (bx && by) continue; return bx ? 1 : -1; }   // blanks last, whatever the direction
        const c = typeof x === 'number' && typeof y === 'number' ? x - y : collator.compare(String(x), String(y));
        if (c) return dir === 'desc' ? -c : c;
      }
      return idx.get(a) - idx.get(b);
    });
  }

  /* columns: [{ key, label, num?, title?, get?(row) -> sort value, cell(row) -> node|string, rest? }]
     opts: { rows, columns, param = 'sort', def = 'w.desc' | null, remote?(order) -> Promise<rows>, rowClass?(row) }
     Returns { table, set(rows) } where table is the <table> element. */
  function build(el, opts) {
    const { columns, param = 'sort', def = null, remote = null, rowClass = null } = opts;
    let rows = opts.rows;
    const known = new Set(columns.map((c) => c.key));
    const read = () => {
      const fromUrl = parse(new URLSearchParams(location.search).get(param)).filter((s) => known.has(s.key));
      return fromUrl.length ? fromUrl : parse(def).filter((s) => known.has(s.key));
    };
    let spec = read();
    const thead = el('thead'), tbody = el('tbody'), table = el('table', {}, thead, tbody);
    let ticket = 0;

    const restOrder = (s) => { const c = columns.find((x) => x.key === s.key); return c && c.rest ? `${c.rest}.${s.dir}.nullslast` : null; };

    function head() {
      const first = spec[0];
      thead.replaceChildren(el('tr', {}, columns.map((c) => {
        const on = first && first.key === c.key;
        const state = on ? (first.dir === 'desc' ? 'descending' : 'ascending') : 'none';
        const next = on ? (first.dir === 'desc' ? 'ascending' : 'descending') : (c.num ? 'descending' : 'ascending');
        const btn = el('button', { type: 'button', class: 'sortbtn', title: c.title || null, 'aria-label': `${c.label}, sort ${next}`, onclick: () => press(c) },
          el('span', {}, c.label), el('span', { class: 'arrow', 'aria-hidden': 'true' }, on ? (first.dir === 'desc' ? '▼' : '▲') : '↕'));
        return el('th', { class: (c.num ? 'num ' : '') + (c.cls || ''), 'aria-sort': state, scope: 'col' }, btn);
      })));
    }
    function body() {
      tbody.replaceChildren(...sorted(rows, columns, spec).map((r) => el('tr', { class: rowClass ? rowClass(r) : null },
        columns.map((c) => { const v = c.cell ? c.cell(r) : r[c.key]; return el('td', { class: (c.num ? 'num ' : '') + (c.cls || '') }, v == null ? '' : v); }))));
    }
    function draw() { head(); body(); }

    async function press(c) {
      const first = spec[0];
      const dir = first && first.key === c.key ? (first.dir === 'desc' ? 'asc' : 'desc') : (c.num ? 'desc' : 'asc');
      spec = [{ key: c.key, dir }];
      query({ [param]: format(spec) });
      const order = remote && restOrder(spec[0]);
      if (order) {
        const mine = ++ticket;
        table.setAttribute('aria-busy', 'true'); draw();
        try { const fresh = await remote(order); if (mine === ticket) rows = fresh; } catch (e) { /* keep what we have and sort it here */ }
        if (mine === ticket) { table.removeAttribute('aria-busy'); draw(); }
      } else { ++ticket; draw(); }
      const b = [...table.querySelectorAll('th')][columns.findIndex((x) => x.key === c.key)]?.querySelector('button');
      if (b) b.focus();
    }
    draw();
    return { table, set(r) { rows = r; body(); }, order: () => (spec[0] && restOrder(spec[0])) || null };
  }

  return { parse, format, query, sorted, build, blank };
})();
