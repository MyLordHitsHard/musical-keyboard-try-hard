// App shell: routing, header, home, daily session, learn list, free play, chord tools, progress, settings.
(function () {
  const PT = window.PT;
  const T = PT.theory;
  const { h, toast, Piano, chart, daily, fmtTime, mean } = PT.ui;
  const store = PT.store;
  const S = () => store.settings;

  const main = document.getElementById('main');
  let active = null; // current drill
  let piano = null;
  let cleanup = [];

  // Route all notes to the active drill.
  PT.bus.on('noteon', (m, v) => active && active.noteOn(m, v));
  PT.bus.on('noteoff', (m) => active && active.noteOff(m));

  function teardown() {
    if (active && active.destroy) active.destroy();
    active = null;
    if (piano) piano.destroy();
    piano = null;
    cleanup.forEach((f) => f());
    cleanup = [];
    main.innerHTML = '';
  }

  function stage() {
    const panel = h('div.panel');
    const kb = h('div.kbwrap', h('div'));
    main.append(panel, kb);
    piano = new Piano(kb.firstChild);
    return panel;
  }

  function startDrill(id, params, into) {
    if (active && active.destroy) active.destroy();
    if (piano) piano.destroy();
    const def = PT.drills[id];
    if (!def) return;
    const panel = into || stage();
    if (into) {
      into.innerHTML = '';
      const p = h('div.panel');
      const kb = h('div.kbwrap', h('div'));
      into.append(p, kb);
      piano = new Piano(kb.firstChild);
      active = def.make(params || {});
      active.mount(p, piano);
    } else {
      active = def.make(params || {});
      active.mount(panel, piano);
    }
  }

  // ---------------- Header ----------------
  const midiEl = document.getElementById('midi');
  const xpEl = document.getElementById('xp');
  function renderMidi(status, names = []) {
    const txt = {
      none: 'Not connected', waiting: 'No keyboard found — plug in the USB cable', connected: '🎹 ' + names.join(', '),
      unsupported: 'This browser has no MIDI — use Chrome or Edge', denied: 'MIDI permission blocked — allow it in the address bar',
    }[status];
    midiEl.className = 'midi ' + status;
    midiEl.textContent = txt;
    midiEl.title = status === 'connected' ? 'Keyboard connected' : 'Click to connect';
  }
  midiEl.addEventListener('click', () => PT.input.connect());
  PT.bus.on('midistatus', (st, names) => {
    renderMidi(st, names);
    if (st === 'connected') toast('Keyboard connected 🎹', 'good');
  });
  function renderXp() {
    const L = store.level();
    const mins = Math.round(store.day().sec / 60);
    xpEl.innerHTML = '';
    xpEl.append(
      h('span', { title: 'Days in a row with at least 1 minute of practice' }, '🔥 ' + store.streak()),
      h('span', { title: 'Hands-on-keys time today' }, '⏱ ' + mins + ' min'),
      h('span.lvl', { title: `${L.into}/${L.need} XP to next level` }, 'Lv ' + L.lvl, h('span.bar', h('span', { style: { width: Math.min(100, (L.into / L.need) * 100) + '%' } }))),
    );
  }
  PT.bus.on('xp', (total, n) => {
    const before = store.level().lvl;
    renderXp();
    if (n > 0 && store.level().lvl > before) toast('⭐ Level ' + store.level().lvl + '!', 'good');
  });
  setInterval(renderXp, 15000);

  // ---------------- Progress summaries ----------------
  function improvement(prefix, field, lowerBetter, filter) {
    const e = store.state.history.filter((x) => x.d.startsWith(prefix) && x[field] != null && (!filter || filter(x)));
    if (e.length < 4) return null;
    const n = Math.min(3, Math.floor(e.length / 2));
    const first = mean(e.slice(0, n).map((x) => x[field]));
    const last = mean(e.slice(-n).map((x) => x[field]));
    const better = lowerBetter ? last < first : last > first;
    return { first, last, better };
  }

  // ---------------- Daily session ----------------
  function dayIndex() { return Math.floor(Date.now() / 86400000); }
  function buildSession(minutes) {
    const di = dayIndex();
    const pats = PT.PATTERNS;
    const pat = pats[di % pats.length];
    const positions = ['C', 'C', 'G', 'F', 'Am', 'D', 'Dm'];
    const pos = positions[Math.floor(di / pats.length) % positions.length];
    const hand = ['R', 'L', 'R', 'B'][di % 4];
    const nf = store.drill('notefinder', { level: 0 }).level;
    const ch = store.drill('chords', { level: 0 }).level;
    const scales = ['C', 'G', 'Am', 'F', 'D', 'Em', 'A', 'Dm', 'E'];
    const songs = PT.SONGS;
    const learned = (s) => (store.state.drills[`song:${s.id}:read`] || {}).clean >= 3;
    const nextSong = songs.find((s) => !learned(s));
    const earSong = songs.filter(learned)[di % Math.max(1, songs.filter(learned).length)];

    const blocks = [];
    blocks.push({ label: 'Warm-up: fingers', id: 'pattern', p: { pattern: pat.id, pos, hand }, w: 2 });
    if (nf < 5 || Math.random() < 0.2) blocks.push({ label: 'Keyboard map', id: 'notefinder', p: {}, w: 2 });
    else blocks.push({ label: 'Scale', id: 'scale', p: { scale: scales[di % scales.length], hand: di % 2 ? 'L' : 'R' }, w: 2 });
    if (ch < 2 || di % 3 === 0) blocks.push({ label: 'Chords', id: 'chords', p: {}, w: 3 });
    else if (di % 3 === 1) blocks.push({ label: 'Chord changes', id: 'changes', p: { pair: PT.PAIRS[di % PT.PAIRS.length] }, w: 3 });
    else blocks.push({ label: 'Progression', id: 'prog', p: { prog: T.PROGRESSIONS[di % T.PROGRESSIONS.length].id, key: ['C', 'G', 'F', 'D', 'A'][di % 5] }, w: 3 });
    blocks.push({ label: 'Ear: echo', id: 'echo', p: {}, w: 4 });
    if (minutes >= 20) blocks.push({ label: 'Ear: ' + ['scale notes', 'intervals', 'major/minor'][di % 3], id: ['degree', 'interval', 'quality'][di % 3], p: {}, w: 2 });
    if (earSong && (di % 2 === 0 || !nextSong)) blocks.push({ label: 'Song by ear: ' + earSong.title, id: 'song', p: { song: earSong.id, mode: 'ear' }, w: 3 });
    else if (nextSong) blocks.push({ label: 'Song: ' + nextSong.title, id: 'song', p: { song: nextSong.id }, w: 3 });
    const tw = blocks.reduce((a, b) => a + b.w, 0);
    blocks.forEach((b) => (b.sec = Math.round(((b.w / tw) * minutes * 60) / 30) * 30 || 60));
    return blocks;
  }

  function viewSession() {
    const minutes = S().sessionMinutes;
    const blocks = buildSession(minutes);
    let cur = 0, left = blocks[0].sec, running = true, total = 0;
    const ribbon = h('div.ribbon');
    const timer = h('div.timer');
    const nextBtn = h('button.primary', { onclick: () => go(cur + 1) }, 'Next ▶');
    const pauseBtn = h('button', { onclick: () => { running = !running; pauseBtn.textContent = running ? '⏸ Pause' : '▶ Resume'; } }, '⏸ Pause');
    const area = h('div');
    main.append(h('div.sessionbar', ribbon, timer, pauseBtn, nextBtn), area);
    function drawRibbon() {
      ribbon.innerHTML = '';
      blocks.forEach((b, i) => ribbon.append(h('button.rb' + (i < cur ? '.done' : i === cur ? '.cur' : ''), { onclick: () => go(i) }, h('b', i + 1), ' ' + b.label, h('small', ' ' + Math.round(b.sec / 60 * 10) / 10 + 'm'))));
    }
    function go(i) {
      if (i >= blocks.length) return finish();
      cur = i;
      left = blocks[i].sec;
      nextBtn.classList.remove('pulse');
      drawRibbon();
      startDrill(blocks[i].id, blocks[i].p, area);
    }
    function finish() {
      clearInterval(iv);
      if (active && active.destroy) active.destroy();
      active = null;
      if (piano) piano.destroy();
      piano = null;
      store.addXp(25);
      store.log('session', { min: Math.round(total / 60) });
      area.innerHTML = '';
      area.append(h('div.panel.center',
        h('h2', '🎉 Session complete!'),
        h('p', `You practised ${Math.round(total / 60)} minutes. Streak: ${store.streak()} day(s). +25 XP`),
        h('p.tip', 'Your hands keep learning while you rest — sleep after practice is when a lot of motor learning gets locked in. Same time tomorrow?'),
        h('div.row', h('a.btn.primary', { href: '#/progress' }, 'See my progress'), h('a.btn', { href: '#/' }, 'Home'))));
      ribbon.innerHTML = '';
      timer.textContent = '';
      nextBtn.remove(); pauseBtn.remove();
    }
    const iv = setInterval(() => {
      if (!running || document.hidden) return;
      total++;
      left--;
      timer.textContent = left > 0 ? fmtTime(left) : '⏰ time!';
      if (left === 0) {
        PT.audio.ding();
        nextBtn.classList.add('pulse');
        toast(cur + 1 < blocks.length ? 'Time for the next block — finish your rep, then press Next ▶' : 'Last block done — press Next ▶ to finish');
      }
    }, 1000);
    cleanup.push(() => clearInterval(iv));
    go(0);
  }

  // ---------------- Home ----------------
  function viewHome() {
    const st = PT.input.status;
    const L = store.level();
    const imp = [
      ['Finding notes', improvement('notefinder', 'rt', true), (v) => v.toFixed(2) + ' s'],
      ['Clean finger tempo', improvement('pattern', 'cbpm', false), (v) => Math.round(v) + ' BPM'],
      ['Chord speed', improvement('chords', 'ct', true), (v) => v.toFixed(1) + ' s'],
      ['Chord changes / min', improvement('changes', 'changes', false), (v) => Math.round(v)],
      ['Ear level', improvement('echo', 'lvl', false), (v) => v.toFixed(1)],
    ].filter((x) => x[1]);
    main.append(...[
      h('div.panel',
        h('h1', 'Hi! Ready for today’s practice?'),
        h('p.lead', `${S().sessionMinutes} focused minutes, split into short blocks so it never gets boring. Little and often beats long and rare.`),
        h('div.row', h('a.btn.primary.big', { href: '#/session' }, '▶ Start today’s session'), h('a.btn', { href: '#/learn' }, 'Pick a drill myself'), h('a.btn', { href: '#/free' }, 'Free play')),
        h('div.stats',
          h('div.stat', h('div.v', '🔥 ' + store.streak()), h('div.l', 'day streak')),
          h('div.stat', h('div.v', Math.round(store.day().sec / 60) + ' min'), h('div.l', 'today')),
          h('div.stat', h('div.v', 'Lv ' + L.lvl), h('div.l', store.state.xp + ' XP total')),
          h('div.stat', h('div.v', Math.round(Object.values(store.state.days).reduce((a, d) => a + d.sec, 0) / 60) + ' min'), h('div.l', 'all time'))),
      ),
      st !== 'connected' ? h('div.panel.warn',
        h('h3', 'Connect your Casio'),
        h('ol',
          h('li', 'Plug the USB (printer-style) cable into the port on the back of the keyboard marked USB, and into the laptop.'),
          h('li', 'Use Google Chrome or Microsoft Edge (Firefox/Safari can’t read MIDI keyboards).'),
          h('li', h('button', { onclick: () => PT.input.connect() }, 'Connect keyboard'), ' and click “Allow” if the browser asks.'),
          h('li', 'Turn OFF the auto-accompaniment / rhythm on the keyboard while practising, so only your notes are sent.')),
        h('p.tip', 'No keyboard handy? You can still practise with your computer keys: A W S E D F T G Y H U J K = C to C (Z / X change octave), or click the keys on screen.'))
        : null,
      imp.length ? h('div.panel', h('h3', 'Your improvement so far'), h('div.imp', imp.map(([n, v, f]) =>
        h('div.impc' + (v.better ? '.up' : ''), h('div.l', n), h('div.v', f(v.first), ' → ', h('b', f(v.last))), h('div.s', v.better ? 'better ✓' : 'keep going'))))) : null,
      h('div.panel', h('h3', 'The plan'), roadmap()),
    ].filter(Boolean));
  }

  function roadmap() {
    const items = [
      ['Week 1–2', 'Know the keyboard map (Find the note to level 4). Five-finger patterns in C, both hands. Echo levels 1–3. Mary, Twinkle, Ode to Joy with guidance.'],
      ['Week 3–4', 'C, F, G, Am, Dm, Em chords under 3 s. First one-minute changes (aim: 20+). Echo 2–3 note tunes. Play learned songs BY EAR.'],
      ['Month 2', 'All major & minor chords. I–V–vi–IV progression in C, G, D, F. Left hand plays the bass note, right hand the chord. C/G/F scales.'],
      ['Month 3+', 'Echo 4–6 note tunes in any key. Free play → work out tunes you know using “find the key”. Play songs from chord sheets (Chords tab).'],
    ];
    return h('div.road', items.map(([a, b]) => h('div.step', h('b', a), h('span', b))));
  }

  // ---------------- Learn (drill list) ----------------
  function viewLearn() {
    const groups = [
      ['keys', '🗺 Keyboard map'], ['fingers', '✋ Fingers & technique'], ['chords', '🎼 Chords'], ['ears', '👂 Ear training'], ['songs', '🎵 Songs'],
    ];
    const panel = h('div.panel');
    main.append(panel);
    panel.append(h('h1', 'Practice library'), h('p.lead', 'Every drill adapts: it gets harder only when you are ready, and easier if you are struggling.'));
    groups.forEach(([g, title]) => {
      const sec = h('div.group', h('h2', title));
      Object.entries(PT.drills).filter(([, d]) => d.group === g).forEach(([id, d]) => {
        const card = h('div.card', h('h3', d.name), h('p', d.desc));
        const opts = drillOptions(id);
        card.append(opts);
        sec.append(card);
      });
      panel.append(sec);
    });
  }

  function link(id, p, text, cls = '') {
    const q = new URLSearchParams(p || {}).toString();
    return h('a.btn' + cls, { href: `#/drill/${id}${q ? '?' + q : ''}` }, text);
  }

  function drillOptions(id) {
    const box = h('div.opts');
    if (id === 'pattern') {
      const pat = h('select', PT.PATTERNS.map((p) => h('option', { value: p.id }, p.name)));
      const pos = h('select', Object.entries(PT.FIVE).map(([k, v]) => h('option', { value: k }, v.name + ' position')));
      const hand = h('select', [['R', 'Right hand'], ['L', 'Left hand'], ['B', 'Both (mirror)']].map(([v, t]) => h('option', { value: v }, t)));
      hand.value = S().hand;
      box.append(pat, pos, hand, h('button.primary', { onclick: () => go('pattern', { pattern: pat.value, pos: pos.value, hand: hand.value }) }, 'Start'));
    } else if (id === 'scale') {
      const sc = h('select', T.SCALES.map((s) => h('option', { value: s.id }, s.name)));
      const hand = h('select', [['R', 'Right hand'], ['L', 'Left hand']].map(([v, t]) => h('option', { value: v }, t)));
      box.append(sc, hand, h('button.primary', { onclick: () => go('scale', { scale: sc.value, hand: hand.value }) }, 'Start'));
    } else if (id === 'prog') {
      const pr = h('select', T.PROGRESSIONS.map((p) => h('option', { value: p.id }, p.name)));
      const key = h('select', ['C', 'G', 'D', 'A', 'E', 'F', 'Bb', 'Eb'].map((k) => h('option', { value: k }, 'Key of ' + k)));
      box.append(pr, key, h('button.primary', { onclick: () => go('prog', { prog: pr.value, key: key.value }) }, 'Start'));
    } else if (id === 'changes') {
      const pr = h('select', PT.PAIRS.map((p) => h('option', { value: p }, p.replace('-', ' ↔ '))));
      box.append(pr, h('button.primary', { onclick: () => go('changes', { pair: pr.value }) }, 'Start'));
    } else if (id === 'song') {
      PT.SONGS.forEach((s) => {
        const st = store.state.drills[`song:${s.id}:read`];
        const done = st && st.clean >= 3;
        box.append(h('div.songrow', h('span', '★'.repeat(s.level) + ' ' + s.title + (done ? ' ✓' : '')), link('song', { song: s.id }, 'Learn'), link('song', { song: s.id, mode: 'ear' }, 'By ear')));
      });
    } else {
      box.append(link(id, {}, 'Start', '.primary'));
    }
    return box;
  }
  function go(id, p) { location.hash = `#/drill/${id}?` + new URLSearchParams(p).toString(); }

  // ---------------- Free play ----------------
  function viewFree() {
    const panel = stage();
    piano.setRange(36, 96);
    const chordEl = h('div.big', '—');
    const heldEl = h('div.msg', 'Play anything. Chords are named live.');
    const trail = h('div.trail');
    const keyEl = h('div.keyguess');
    const counts = new Array(12).fill(0);
    let recent = [];
    const scaleSel = h('select', { onchange: () => showScale() },
      h('option', { value: '' }, 'Highlight a scale…'),
      ...[0, 7, 2, 9, 4, 5, 10, 3].map((p) => h('option', { value: p + ':0' }, T.noteName(p, T.FLAT_KEYS.has(p)) + ' major')),
      ...[9, 4, 2, 7, 0].map((p) => h('option', { value: p + ':1' }, T.noteName(p) + ' minor')));
    panel.append(
      h('h2', 'Free play & “figure it out” mode'),
      h('p.tip', 'Trying to play a song you know? Pick out a few melody notes by trial and error — the app guesses which KEY the song is in and shows the chords that will most likely fit. Then try those chords under the melody.'),
      h('div.row', scaleSel, h('button', { onclick: () => { counts.fill(0); recent = []; trail.innerHTML = ''; keyEl.innerHTML = ''; } }, 'Clear')),
      chordEl, heldEl, trail, keyEl,
    );
    function showScale() {
      if (!scaleSel.value) { piano.clear(); piano.tonic = 0; piano.relabel(); return; }
      const [p, mi] = scaleSel.value.split(':').map(Number);
      const steps = mi ? T.MINOR : T.MAJOR;
      piano.tonic = mi ? T.pc(p + 3) : p;
      piano.relabel();
      const list = [];
      for (let m = piano.lo; m <= piano.hi; m++) {
        const r = T.pc(m - p);
        if (steps.includes(r)) list.push({ m, cls: r === 0 ? 'tonic' : 'scale' });
      }
      piano.setTargets(list);
    }
    function update() {
      const held = [...PT.input.held].sort((a, b) => a - b);
      chordEl.textContent = T.detectChord(held) || (held.length === 1 ? T.noteName(held[0]) : held.length ? '?' : '—');
      heldEl.textContent = held.length ? held.map((m) => T.noteNameOct(m) + (S().labels === 'sargam' || S().labels === 'both' ? ` (${T.sargam(m, piano.tonic)})` : '')).join('  ') : 'Play anything. Chords are named live.';
    }
    active = {
      noteOn(m) {
        update();
        counts[T.pc(m)]++;
        recent.push(m);
        if (recent.length > 24) recent.shift();
        trail.innerHTML = '';
        recent.forEach((x) => trail.append(h('span', T.noteName(x))));
        const n = counts.reduce((a, b) => a + b, 0);
        keyEl.innerHTML = '';
        if (n >= 8) {
          const g = T.guessKeys(counts).slice(0, 3);
          const best = g[0];
          keyEl.append(
            h('div', 'Probably in ', h('b', best.name), ` — or ${g[1].name} / ${g[2].name}`),
            h('div.row', 'Chords that fit: ', ...T.keyChords(best.tonic, best.minor).map((c) =>
              h('button.chipbtn', { onclick: () => { const v = T.voicing(c); piano.setTargets(v.map((mm, i) => ({ m: mm, finger: T.chordFingers(v.length)[i] }))); PT.audio.chord(v); } }, c.name))));
        } else keyEl.append(h('div.muted', `Play ${8 - n} more notes and I’ll guess the key.`));
      },
      noteOff() { update(); },
    };
  }

  // ---------------- Chords tools ----------------
  function viewChords() {
    const panel = stage();
    piano.setRange(36, 84);
    const out = h('div.msg');
    const inp = h('input', { placeholder: 'Type a chord, e.g. Am, F#m7, Bb, Gsus4, D/F#', onkeydown: (e) => e.key === 'Enter' && show(inp.value) });
    function show(name) {
      const c = T.parseChord(name);
      if (!c) { out.textContent = 'I don’t know that chord. Try e.g. C, Am, G7, Fmaj7, Dsus4.'; return; }
      const v = T.voicing(c);
      const f = T.chordFingers(v.length);
      const list = v.map((m, i) => ({ m, finger: f[i] }));
      if (c.bass !== c.root) list.push({ m: 36 + 12 + c.bass - (c.bass > 4 ? 12 : 0), cls: 'hint' });
      piano.setTargets(list);
      PT.audio.chord(v);
      out.textContent = `${c.name}: ${c.type.name} — notes ${c.pcs.map((p) => T.noteName(p, c.flats)).join(' – ')}${c.approx ? ' (simplified)' : ''}. Fingers ${f.join('-')}.` + (c.bass !== c.root ? ' Grey key = bass note for the left hand.' : '');
    }
    const grid = h('div.chordgrid');
    [0, 7, 2, 9, 4, 11, 5, 10, 3, 8, 1, 6].forEach((p) => {
      const flats = T.FLAT_KEYS.has(p);
      grid.append(h('div.cg', ...['', 'm', '7'].map((t) => { const n = T.noteName(p, flats) + t; return h('button.chipbtn', { onclick: () => show(n) }, n); })));
    });
    let sheet = [];
    let shift = 0;
    const sheetIn = h('textarea', { rows: 6, placeholder: 'Paste chords from any chords website here, with or without lyrics. e.g.\n\n[Verse]\nC        G\nTum hi ho...\nAm       F\n...' });
    const sheetOut = h('div.sheet');
    function parseSheet() {
      sheet = T.extractChords(sheetIn.value);
      shift = 0;
      drawSheet();
    }
    function drawSheet() {
      sheetOut.innerHTML = '';
      const chords = sheet.map((c) => (shift ? T.transposeChord(c, shift) : c));
      if (!chords.length) { sheetOut.append(h('div.muted', sheetIn.value ? 'No chords found. Chords should be on their own line or in [brackets].' : '')); return; }
      const uniq = [...new Map(chords.map((c) => [c.name, c])).values()];
      sheetOut.append(
        h('div.row', h('b', `${chords.length} chords, ${uniq.length} different:`), ...uniq.map((c) => h('button.chipbtn', { onclick: () => show(c.name) }, c.name))),
        h('div.row',
          h('button', { onclick: () => { shift--; drawSheet(); } }, '♭ Transpose −1'),
          h('button', { onclick: () => { shift++; drawSheet(); } }, '♯ Transpose +1'),
          h('span.muted', shift ? ` (${shift > 0 ? '+' : ''}${shift} semitones)` : ''),
          h('button', { onclick: () => { shift = easiestShift(); drawSheet(); } }, '✨ Easiest key'),
          h('a.btn.primary', { href: '#/drill/prog?' + new URLSearchParams({ chords: chords.slice(0, 64).map((c) => c.name).join(',') }) }, '▶ Practise this song’s chords')),
        h('div.muted', 'Order: ' + chords.map((c) => c.name).join(' → ')),
      );
    }
    function easiestShift() {
      // Fewest black keys across the song's chords.
      let best = 0, bestScore = 1e9;
      for (let s = -5; s <= 6; s++) {
        let score = 0;
        sheet.forEach((c) => { const t = T.transposeChord(c, s); T.voicing(t).forEach((m) => (score += T.isBlack(m) ? 1 : 0)); });
        if (score < bestScore) { bestScore = score; best = s; }
      }
      return best;
    }
    panel.append(
      h('h2', 'Chord finder & song sheets'),
      h('div.row', inp, h('button.primary', { onclick: () => show(inp.value) }, 'Show')),
      out, grid,
      h('h3', 'Play a song from its chord sheet'),
      h('p.tip', 'Search “<song name> chords” online, copy the page text and paste it here. The app pulls out the chords, can move them to an easier key, and turns them into a practice drill. Tip: right hand plays the chord, left hand plays just the bass note (the chord’s letter).'),
      sheetIn, h('div.row', h('button.primary', { onclick: parseSheet }, 'Find chords')), sheetOut,
    );
  }

  // ---------------- Progress ----------------
  function viewProgress() {
    const panel = h('div.panel');
    main.append(panel);
    panel.append(h('h1', 'Progress'), h('p.lead', 'Each dot is a day. Ups and downs are normal — look at the trend over weeks.'));
    const days = Object.keys(store.state.days).sort().map((k) => ({ x: k, y: Math.round(store.state.days[k].sec / 6) / 10 }));
    const charts = [
      ['Practice minutes per day (hands on keys)', days, { type: 'bar', zero: true }],
      ['Find the note — average seconds (lower = better)', daily('notefinder', 'rt', 'avg'), {}],
      ['Finger patterns & scales — best clean tempo (BPM)', mergeDaily([daily('pattern', 'cbpm', 'max'), daily('scale', 'cbpm', 'max')]), {}],
      ['Finger evenness % (higher = smoother)', daily('pattern', 'even', 'avg'), {}],
      ['Chord shapes — seconds per chord (lower = better)', daily('chords', 'ct', 'avg'), {}],
      ['One-minute changes — best score', daily('changes', 'changes', 'max'), { zero: true }],
      ['Echo ear level', daily('echo', 'lvl', 'max'), { zero: true }],
      ['Ear quizzes — % correct', mergeAcc(), { zero: true }],
    ];
    const grid = h('div.charts');
    panel.append(grid);
    charts.forEach(([t, pts, o]) => {
      const c = h('canvas');
      grid.append(h('div.chartbox', h('h4', t), c));
      requestAnimationFrame(() => chart(c, pts, o));
    });
    const bests = h('div.bests');
    const d = store.state.drills;
    Object.entries(d).filter(([k, v]) => /^(pattern|scale|song)/.test(k) && v.best).sort().forEach(([k, v]) =>
      bests.append(h('div', h('span', k.replace(/:/g, ' · ')), h('b', v.best + ' BPM'), h('small', ` (${v.clean} clean reps, goal ${v.goal})`))));
    const ch = d.changes && d.changes.best;
    if (ch) Object.entries(ch).forEach(([p, n]) => bests.append(h('div', h('span', 'changes · ' + p), h('b', n), h('small', ' per minute'))));
    panel.append(h('h3', 'Personal bests'), bests.childNodes.length ? bests : h('p.muted', 'Nothing yet — go practise!'));
    function mergeDaily(lists) {
      const by = {};
      lists.flat().forEach((p) => (by[p.x] = Math.max(by[p.x] || 0, p.y)));
      return Object.keys(by).sort().map((x) => ({ x, y: by[x] }));
    }
    function mergeAcc() {
      const pts = ['ear:degree', 'ear:interval', 'ear:quality'].map((k) => daily(k, 'ok', 'avg')).flat();
      const by = {};
      pts.forEach((p) => (by[p.x] = by[p.x] || []).push(p.y));
      return Object.keys(by).sort().map((x) => ({ x, y: Math.round(mean(by[x]) * 100) }));
    }
  }

  // ---------------- Settings ----------------
  function viewSettings() {
    const s = S();
    const sel = (k, opts) => { const e = h('select', { onchange: (ev) => store.set(k, isNaN(+ev.target.value) ? ev.target.value : +ev.target.value) }, opts.map(([v, t]) => h('option', { value: v }, t))); e.value = s[k]; return e; };
    const chk = (k) => h('input', { type: 'checkbox', checked: s[k], onchange: (e) => store.set(k, e.target.checked) });
    const rng = (k) => h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: s[k], oninput: (e) => store.set(k, +e.target.value) });
    const file = h('input', { type: 'file', accept: '.json', onchange: (e) => { const f = e.target.files[0]; if (!f) return; f.text().then((t) => { try { store.import(t); } catch (err) { toast('Could not import: ' + err.message, 'bad'); } }); } });
    main.append(h('div.panel.settings',
      h('h1', 'Settings'),
      h('label', 'Key labels ', sel('labels', [['letters', 'Letters (C D E)'], ['sargam', 'Sargam (Sa Re Ga)'], ['both', 'Both'], ['none', 'None (only C’s) — for testing yourself']])),
      h('label', chk('showFingers'), ' Show finger numbers (1 = thumb … 5 = pinky)'),
      h('label', 'Main hand for drills ', sel('hand', [['R', 'Right'], ['L', 'Left']])),
      h('label', 'Daily session length ', sel('sessionMinutes', [[10, '10 minutes'], [15, '15 minutes'], [20, '20 minutes'], [30, '30 minutes']])),
      h('h3', 'Sound'),
      h('label', chk('promptsToKeyboard'), ' Play the app’s example tunes through the Casio’s speakers (via USB) instead of the laptop'),
      h('label', chk('appSoundForMidi'), ' Laptop also makes sound when I play the Casio (only if the keyboard volume is down / headphones)'),
      h('label', 'App volume ', rng('volume')),
      h('label', 'Metronome volume ', rng('metronomeVolume')),
      h('label', chk('ignoreDrumChannel'), ' Ignore the keyboard’s drum/rhythm channel'),
      h('h3', 'Your data'),
      h('p.tip', 'Progress is saved in this browser on this laptop. Export a backup now and then.'),
      h('div.row',
        h('button', { onclick: () => { const a = h('a', { href: URL.createObjectURL(new Blob([store.export()], { type: 'application/json' })), download: `piano-progress-${store.today()}.json` }); a.click(); } }, '⬇ Export progress'),
        h('label.btn', 'Import… ', file),
        h('button.danger', { onclick: () => confirm('Delete ALL progress? This cannot be undone.') && store.reset() }, 'Reset everything')),
      h('h3', 'Keyboard tips for the CT-X870IN'),
      h('ul',
        h('li', 'Use the USB port on the back (the square “printer” socket) — no driver needed on Windows 10/11 or macOS.'),
        h('li', 'Keep auto-accompaniment OFF while practising. The rhythm’s drums are ignored by the app anyway.'),
        h('li', 'If no notes arrive: unplug/replug the cable, then click the status pill at the top right.'),
        h('li', 'A plain piano tone (Tone 001 — Stereo Grand Piano) is best for ear training.')),
    ));
  }

  // ---------------- Router ----------------
  function route() {
    teardown();
    const [path, qs] = location.hash.replace(/^#\/?/, '').split('?');
    const parts = path.split('/');
    const params = Object.fromEntries(new URLSearchParams(qs || ''));
    document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#/' + parts[0]));
    switch (parts[0]) {
      case 'session': viewSession(); break;
      case 'learn': viewLearn(); break;
      case 'drill': startDrill(parts[1], params); main.prepend(h('div.back', h('a', { href: '#/learn' }, '← Library'))); break;
      case 'free': viewFree(); break;
      case 'chords': viewChords(); break;
      case 'progress': viewProgress(); break;
      case 'settings': viewSettings(); break;
      default: viewHome();
    }
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);

  // Unlock audio on first interaction (browser autoplay rules).
  window.addEventListener('pointerdown', () => PT.audio.ac(), { once: true });
  window.addEventListener('keydown', () => PT.audio.ac(), { once: true });

  renderMidi('none');
  renderXp();
  route();
  PT.input.connect();
})();
