// "Am I improving?" report: compares your early practice with your recent practice, skill by skill.
(function () {
  const PT = window.PT;
  const { h, chart, mean, toast } = PT.ui;
  const store = PT.store;

  const DAY = 86400000;
  const dkey = (t) => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };

  // Daily series [{x: day, y}] from history entries matching `match`.
  function series(match, field, how = 'avg', scale = 1) {
    const by = {};
    store.state.history.forEach((e) => {
      if (!match(e) || e[field] == null) return;
      (by[dkey(e.t)] = by[dkey(e.t)] || []).push(e[field]);
    });
    return Object.keys(by).sort().map((x) => {
      const a = by[x];
      return { x, y: (how === 'max' ? Math.max(...a) : mean(a)) * scale, n: a.length };
    });
  }

  // For skills measured per exercise (tempo of each finger drill, changes of each chord pair):
  // index each exercise against its own first day (= 100), then average per day.
  function indexed(match, groupOf, field) {
    const groups = {};
    store.state.history.forEach((e) => {
      if (!match(e) || e[field] == null) return;
      const g = groupOf(e), k = dkey(e.t);
      groups[g] = groups[g] || {};
      groups[g][k] = Math.max(groups[g][k] || 0, e[field]);
    });
    const by = {};
    Object.values(groups).forEach((days) => {
      const ks = Object.keys(days).sort();
      const base = days[ks[0]];
      if (!base) return;
      ks.forEach((k) => (by[k] = by[k] || []).push((days[k] / base) * 100));
    });
    return Object.keys(by).sort().map((x) => ({ x, y: mean(by[x]), n: by[x].length }));
  }

  const isSeq = (e) => /^(pattern|scale|prog|song:.*:read)/.test(e.d);

  const METRICS = [
    {
      id: 'notes', name: 'Finding notes on the keyboard', unit: 's per note', lower: true, dec: 2,
      get: () => series((e) => e.d === 'notefinder', 'rt'),
      fix: 'Do two extra rounds of Find the note with labels turned OFF (Settings → Key labels → None). Say each note name out loud.',
    },
    {
      id: 'tempo', name: 'Finger speed (clean reps)', unit: 'index, day 1 = 100', dec: 0,
      get: () => indexed((e) => isSeq(e) && e.cbpm, (e) => e.d, 'cbpm'),
      fix: 'Speed has stalled. Press “− slower” 2–3 times and do 10 perfect reps; then go back up. Speed grows out of slow, clean reps.',
    },
    {
      id: 'clean', name: 'Clean rep rate (no wrong notes)', unit: '% of reps', dec: 0,
      get: () => series((e) => isSeq(e) && e.clean != null, 'clean', 'avg', 100),
      fix: 'Too many wrong notes — you are playing faster than your hands can control. Lower the goal tempo until most reps are clean.',
    },
    {
      id: 'even', name: 'Evenness (steady rhythm)', unit: '%', dec: 0,
      get: () => series((e) => isSeq(e) && e.even != null && e.clean, 'even'),
      fix: 'Turn the metronome on and make each note land exactly on the click, even at a slow tempo.',
    },
    {
      id: 'chords', name: 'Chord speed', unit: 's per chord', lower: true, dec: 1,
      get: () => series((e) => e.d === 'chords', 'ct'),
      fix: 'Say the chord’s notes before playing it (C = C E G). Then do one-minute changes on the two slowest chords.',
    },
    {
      id: 'changes', name: 'Chord changes per minute', unit: 'index, first try = 100', dec: 0,
      get: () => indexed((e) => e.d === 'changes', (e) => e.pair, 'changes'),
      fix: 'Before switching, look at the next chord and move ALL fingers together as one shape, rather than one finger at a time.',
    },
    {
      id: 'echo', name: 'Ear: echo level', unit: 'level', dec: 1,
      get: () => series((e) => e.d === 'echo', 'lvl', 'max'),
      fix: 'Sing each tune back before touching the keys, and ask “higher or lower?” for each next note.',
    },
    {
      id: 'earok', name: 'Ear: first-try accuracy', unit: '%', dec: 0,
      get: () => series((e) => e.d === 'echo' || e.d.startsWith('ear:'), 'ok', 'avg', 100),
      fix: 'Use Replay more — listening 3 times before answering is not cheating, it is training.',
    },
  ];

  // Compare the first few practice days with the last few.
  function trend(pts, lower) {
    if (pts.length < 2) return { verdict: 'nodata' };
    const w = Math.min(3, Math.floor(pts.length / 2));
    const first = mean(pts.slice(0, w).map((p) => p.y));
    const last = mean(pts.slice(-w).map((p) => p.y));
    let pct = first ? ((last - first) / Math.abs(first)) * 100 : 0;
    if (lower) pct = -pct;
    // Last 7 days vs the 7 days before (only when both have data).
    const now = parseKey(dkey(Date.now()));
    const wk = pts.filter((p) => now - parseKey(p.x) < 7 * DAY);
    const prev = pts.filter((p) => { const a = now - parseKey(p.x); return a >= 7 * DAY && a < 14 * DAY; });
    let week = null;
    if (wk.length && prev.length) {
      const a = mean(prev.map((p) => p.y)), b = mean(wk.map((p) => p.y));
      week = a ? ((b - a) / Math.abs(a)) * 100 * (lower ? -1 : 1) : null;
    }
    const verdict = pts.length < 3 ? 'early' : pct > 5 ? 'up' : pct < -5 ? 'down' : 'flat';
    return { verdict, first, last, pct, week, days: pts.length };
  }

  function consistency() {
    const days = store.state.days;
    const now = parseKey(dkey(Date.now()));
    const within = (n) => Object.keys(days).filter((k) => now - parseKey(k) < n * DAY && days[k].sec >= 60);
    const d7 = within(7), d30 = within(30);
    const totalMin = Object.values(days).reduce((a, d) => a + d.sec, 0) / 60;
    const practiced = Object.keys(days).filter((k) => days[k].sec >= 60);
    const avg = practiced.length ? mean(practiced.map((k) => days[k].sec / 60)) : 0;
    const reps = store.state.history.filter((e) => e.clean === 1).length;
    const lessons = Object.values(days).filter((d) => d.lessonDone).length;
    let best = 0, run = 0, prev = null;
    practiced.sort().forEach((k) => { const t = parseKey(k); run = prev != null && t - prev <= DAY * 1.5 ? run + 1 : 1; best = Math.max(best, run); prev = t; });
    return { d7: d7.length, d30: d30.length, totalMin, avg, reps, lessons, best, first: practiced.sort()[0] };
  }

  function weekly() {
    const rows = {};
    const wkStart = (t) => { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return dkey(d.getTime()); };
    Object.entries(store.state.days).forEach(([k, d]) => {
      const w = wkStart(parseKey(k));
      const r = (rows[w] = rows[w] || { days: 0, min: 0, reps: 0, rt: [], ct: [], lvl: [] });
      if (d.sec >= 60) r.days++;
      r.min += d.sec / 60;
    });
    store.state.history.forEach((e) => {
      const r = rows[wkStart(e.t)];
      if (!r) return;
      if (e.clean === 1) r.reps++;
      if (e.d === 'notefinder') r.rt.push(e.rt);
      if (e.d === 'chords') r.ct.push(e.ct);
      if (e.d === 'echo') r.lvl.push(e.lvl);
    });
    return Object.keys(rows).sort().reverse().slice(0, 12).map((w) => ({ w, ...rows[w] }));
  }

  function compute() {
    const items = METRICS.map((m) => { const pts = m.get(); return { m, pts, ...trend(pts, m.lower) }; });
    const judged = items.filter((i) => ['up', 'flat', 'down'].includes(i.verdict));
    const up = judged.filter((i) => i.verdict === 'up').length;
    const down = judged.filter((i) => i.verdict === 'down').length;
    const c = consistency();
    let headline, tone;
    if (judged.length === 0) { headline = 'Not enough data yet — practise on 3 different days and this report will tell you how you are doing.'; tone = 'neutral'; }
    else if (up >= Math.ceil(judged.length / 2)) { headline = `Yes — you are improving! ${up} of ${judged.length} measured skills are clearly better than when you started.`; tone = 'good'; }
    else if (up > 0) { headline = `Partly. ${up} of ${judged.length} skills are improving; the others are flat${down ? ' or slipping' : ''}. See the tips below.`; tone = 'mixed'; }
    else { headline = 'Not yet measurably — the numbers are flat. That is normal in the first weeks or after a gap. See the tips below.'; tone = 'bad'; }
    const advice = [];
    if (c.d7 < 4) advice.push(`You practised on ${c.d7} of the last 7 days. The single biggest lever for motor skills is practising MORE DAYS (even 10 minutes) — aim for 5+ days a week.`);
    if (c.avg && c.avg < 8) advice.push('Your sessions are short (under 8 minutes of hands-on-keys time). Try finishing the whole daily lesson.');
    items.filter((i) => i.verdict === 'flat' || i.verdict === 'down').forEach((i) => advice.push(`${i.m.name}: ${i.m.fix}`));
    if (!advice.length && judged.length) advice.push('Keep doing exactly what you are doing. When an exercise feels easy, that is the lesson moving on — trust the process.');
    return { items, c, headline, tone, advice, weeks: weekly(), judged: judged.length, up };
  }

  const fmt = (v, dec) => (v == null || isNaN(v) ? '–' : (+v).toFixed(dec));
  const VERDICT = {
    up: ['Improving', 'up'], flat: ['Flat', 'flat'], down: ['Slipping', 'down'],
    early: ['Too early to tell', 'early'], nodata: ['No data yet', 'early'],
  };

  function asText(r) {
    const lines = [`Piano practice report — ${dkey(Date.now())}`, '', r.headline, '',
      `Practice: ${r.c.d7}/7 days this week, ${r.c.d30}/30 days this month, ${Math.round(r.c.totalMin)} min total, ${r.c.reps} clean reps, ${r.c.lessons} full lessons.`, ''];
    r.items.forEach((i) => lines.push(`- ${i.m.name}: ${VERDICT[i.verdict][0]}` + (i.first != null ? ` (${fmt(i.first, i.m.dec)} → ${fmt(i.last, i.m.dec)} ${i.m.unit})` : '')));
    if (r.advice.length) { lines.push('', 'What to do next:'); r.advice.forEach((a) => lines.push('- ' + a)); }
    return lines.join('\n');
  }

  function view(main) {
    const r = compute();
    const c = r.c;
    const panel = h('div.panel.report');
    main.append(panel);
    panel.append(
      h('div.row.noprint', h('h1', { style: { margin: 0, flex: 1 } }, 'Am I improving?'),
        h('button', { onclick: () => window.print() }, '🖨 Print / PDF'),
        h('button', { onclick: () => navigator.clipboard.writeText(asText(r)).then(() => toast('Report copied', 'good'), () => toast('Copy failed', 'bad')) }, '📋 Copy as text')),
      h('h1.printonly', 'Piano practice report — ' + dkey(Date.now())),
      h('div.verdict.' + r.tone, r.headline),
      h('p.tip', 'How this works: for each skill, your first 3 practice days are compared with your latest 3. More than 5% better = improving; within ±5% = flat. “This week” compares the last 7 days with the 7 before.'),
      h('h3', 'Consistency'),
      h('div.stats',
        h('div.stat', h('div.v', c.d7 + '/7'), h('div.l', 'days this week')),
        h('div.stat', h('div.v', c.d30 + '/30'), h('div.l', 'days this month')),
        h('div.stat', h('div.v', Math.round(c.totalMin) + ' min'), h('div.l', 'total hands-on time')),
        h('div.stat', h('div.v', Math.round(c.avg) + ' min'), h('div.l', 'avg per practice day')),
        h('div.stat', h('div.v', c.reps), h('div.l', 'clean reps ever')),
        h('div.stat', h('div.v', c.lessons), h('div.l', 'full daily lessons')),
        h('div.stat', h('div.v', c.best + ' d'), h('div.l', 'longest streak'))),
      h('h3', 'Skill by skill'),
    );
    const grid = h('div.rgrid');
    panel.append(grid);
    r.items.forEach((i) => {
      const [label, cls] = VERDICT[i.verdict];
      const canvas = h('canvas');
      const better = i.m.lower ? 'lower is better' : 'higher is better';
      grid.append(h('div.rcard',
        h('div.rhead', h('b', i.m.name), h('span.badge.' + cls, label)),
        i.first != null
          ? h('div.rnums', 'Start ', h('b', fmt(i.first, i.m.dec)), ' → now ', h('b', fmt(i.last, i.m.dec)), ` ${i.m.unit}`,
            h('span.pct.' + (i.pct > 0 ? 'pos' : i.pct < 0 ? 'neg' : ''), ` ${i.pct > 0 ? '+' : ''}${Math.round(i.pct)}%`),
            i.week != null ? h('span.muted', ` · this week ${i.week > 0 ? '+' : ''}${Math.round(i.week)}%`) : null)
          : h('div.rnums.muted', i.pts.length ? 'One day of data so far.' : 'Not practised yet.'),
        h('div.muted.small', `${i.days || i.pts.length} day(s) of data · ${better}`),
        canvas));
      requestAnimationFrame(() => chart(canvas, i.pts, {}));
    });
    panel.append(h('h3', 'What to do next'), h('ul.advice', r.advice.map((a) => h('li', a))));
    if (r.weeks.length) {
      panel.append(h('h3', 'Week by week'), h('div.tablewrap', h('table.weeks',
        h('thead', h('tr', ['Week of', 'Days', 'Minutes', 'Clean reps', 'Find note (s)', 'Chord (s)', 'Echo level'].map((t) => h('th', t)))),
        h('tbody', r.weeks.map((w) => h('tr',
          h('td', w.w), h('td', w.days), h('td', Math.round(w.min)), h('td', w.reps),
          h('td', w.rt.length ? mean(w.rt).toFixed(2) : '–'), h('td', w.ct.length ? mean(w.ct).toFixed(1) : '–'),
          h('td', w.lvl.length ? Math.max(...w.lvl) : '–')))))));
    }
    panel.append(h('p.noprint', h('a.btn', { href: '#/progress' }, '📊 All detailed charts & personal bests')));
    panel.append(h('p.tip', 'Plateaus are normal: motor skills often improve in jumps after several flat days. Judge yourself over 2–3 weeks, not 2–3 days.'));
  }

  PT.report = { compute, view, asText };
})();
