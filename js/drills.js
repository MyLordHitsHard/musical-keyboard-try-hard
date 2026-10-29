// All practice drills. Each drill: { title, mount(panel, piano), noteOn(m), noteOff(m), destroy() }.
(function () {
  const PT = window.PT;
  const T = PT.theory;
  const { h, toast, pick, shuffle, mean, sd, fmtTime } = PT.ui;
  const S = () => PT.store.settings;

  function stat(label, value = '–') {
    const v = h('div.v', value);
    return { el: h('div.stat', v, h('div.l', label)), set: (x) => (v.textContent = x) };
  }
  function now() { return performance.now(); }
  function fingerLabel(f, hand) { return f ? (hand === 'L' ? 'L' : '') + f : ''; }

  // ===================================================================
  // Sequence drill: five-finger patterns, scales, songs, chord progressions.
  // Steps: { notes:[midi], fingers:[n], hand, dur, pcs?:[pc], label }
  // ===================================================================
  class SequenceDrill {
    constructor(o) {
      this.o = Object.assign({ bpmStart: 50, hidden: false, phrases: null, range: [48, 84] }, o);
      this.title = o.title;
      this.st = PT.store.drill(o.id, { best: 0, goal: this.o.bpmStart, hits: 0, misses: 0, reps: 0, clean: 0 });
      this.idx = 0;
      this.got = new Set();
      this.errors = 0;
      this.stepErr = 0;
      this.times = [];
      this.metro = new PT.Metronome(this.st.goal);
    }
    mount(panel, piano) {
      this.piano = piano;
      piano.setRange(...this.o.range);
      piano.tonic = this.o.tonic || 0;
      piano.relabel();
      const o = this.o;
      this.sReps = stat('clean reps in a row (goal 3)', '0');
      this.sBpm = stat('last tempo (BPM)');
      this.sEven = stat('evenness');
      this.sGoal = stat('goal tempo', this.st.goal);
      this.sBest = stat('best clean tempo', this.st.best || '–');
      this.strip = h('div.strip');
      this.msg = h('div.msg', o.hidden ? 'Listen to the phrase, then find it on the keys.' : 'Play the highlighted key. Green number = which finger.');
      this.metroBtn = h('button', { onclick: () => this.toggleMetro() }, '♩ Metronome: off');
      const buttons = h('div.row',
        h('button', { onclick: () => this.listen() }, o.hidden ? '▶ Replay phrase' : '▶ Listen'),
        o.hidden ? h('button', { onclick: () => this.hint() }, '💡 Hint') : this.metroBtn,
        o.hidden ? h('button', { onclick: () => this.reveal() }, '👀 Show notes') : h('button', { onclick: () => this.tempo(-4) }, '− slower'),
        o.hidden ? null : h('button', { onclick: () => this.tempo(4) }, '+ faster'),
        h('button', { onclick: () => this.restart() }, '↺ Restart'),
      );
      panel.append(
        h('h2', o.title),
        o.tip ? h('p.tip', o.tip) : null,
        o.hidden ? null : h('div.stats', this.sReps.el, this.sBpm.el, this.sEven.el, this.sGoal.el, this.sBest.el),
        this.strip, this.msg, buttons,
      );
      this.renderStrip();
      this.showTargets();
      if (o.hidden) setTimeout(() => this.listen(), 500);
    }
    phraseOf(i) {
      const ph = this.o.phrases;
      if (!ph) return { start: 0, end: this.o.steps.length };
      let p = 0;
      while (p + 1 < ph.length && ph[p + 1] <= i) p++;
      return { p, start: ph[p], end: ph[p + 1] ?? this.o.steps.length };
    }
    stepLabel(s) {
      if (s.label) return s.label;
      const flats = T.FLAT_KEYS.has(this.o.tonic || 0);
      return s.notes.map((m) => (S().labels === 'sargam' ? T.sargam(m, this.o.tonic || 0) : T.noteName(m, flats))).join('+');
    }
    renderStrip() {
      const steps = this.o.steps;
      this.strip.innerHTML = '';
      let start = 0, end = steps.length;
      if (this.o.hidden) ({ start, end } = this.phraseOf(this.idx));
      for (let i = start; i < end; i++) {
        const s = steps[i];
        const hiddenChip = this.o.hidden && !this.revealed && i >= this.idx;
        const cls = i < this.idx ? '.done' : i === this.idx ? '.cur' : '';
        this.strip.append(h('div.chip' + cls,
          h('div.n', hiddenChip ? '?' : this.stepLabel(s)),
          h('div.f', !hiddenChip && S().showFingers && s.fingers ? s.fingers.map((f) => fingerLabel(f, s.hand)).join(' ') : '')));
        if (this.o.phrases && !this.o.hidden && this.o.phrases.includes(i + 1)) this.strip.append(h('div.bar'));
      }
      const cur = this.strip.querySelector('.cur');
      if (cur) cur.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
      if (this.o.hidden) {
        const { p } = this.phraseOf(this.idx);
        this.msg.textContent = `Phrase ${p + 1} of ${this.o.phrases.length} — play it back by ear. (${this.errors} wrong notes so far)`;
      }
    }
    showTargets() {
      const s = this.o.steps[this.idx];
      const nxt = this.o.steps[this.idx + 1];
      const list = [];
      if (s && (!this.o.hidden || this.revealed || this.hinted)) {
        s.notes.forEach((m, i) => list.push({ m, finger: s.fingers ? s.fingers[i] : null, cls: 'target' }));
        if (s.bass != null) list.push({ m: s.bass, cls: 'hint' });
      }
      if (nxt && !this.o.hidden) nxt.notes.forEach((m) => list.push({ m, cls: 'next' }));
      this.piano.setTargets(list);
    }
    noteOn(m) {
      const s = this.o.steps[this.idx];
      if (!s) return;
      if (this.o.hidden && PT.audio.isBusy()) return;
      const ok = s.pcs ? s.pcs.includes(T.pc(m)) : s.notes.includes(m);
      if (ok) {
        this.got.add(s.pcs ? T.pc(m) : m);
        const need = s.pcs ? s.pcs.length : s.notes.length;
        if (this.got.size >= need) this.completeStep();
      } else {
        // A late note of the chord just completed (rolled chord) is not a mistake.
        const pv = this.prevStep;
        if (pv && now() - this.prevAt < 600 && (pv.pcs ? pv.pcs.includes(T.pc(m)) : pv.notes.includes(m))) return;
        this.errors++;
        this.stepErr++;
        this.piano.flash(m, 'bad');
        if (this.o.hidden && this.stepErr >= 3 && !this.hinted) this.hint();
      }
    }
    noteOff() {}
    completeStep() {
      const s = this.o.steps[this.idx];
      s.notes.forEach((m) => this.piano.flash(m, 'good'));
      this.times.push(now());
      this.prevStep = s.notes.length > 1 || s.pcs ? s : null;
      this.prevAt = now();
      this.idx++;
      this.got = new Set();
      this.stepErr = 0;
      this.hinted = false;
      // For chord steps, notes still held that belong to the next chord count already.
      const nx = this.o.steps[this.idx];
      if (nx && nx.pcs) PT.input.held.forEach((m) => nx.pcs.includes(T.pc(m)) && this.got.add(T.pc(m)));
      if (this.o.hidden) {
        const { end } = this.phraseOf(this.idx - 1);
        if (this.idx === end && this.idx < this.o.steps.length) {
          PT.audio.ding();
          PT.store.addXp(4);
          PT.bus.emit('unit', { ok: true });
          this.revealed = false;
          this.renderStrip();
          this.showTargets();
          setTimeout(() => this.listen(), 900);
          return;
        }
      }
      if (this.idx >= this.o.steps.length) return this.finishRep();
      this.renderStrip();
      this.showTargets();
    }
    finishRep() {
      const o = this.o, st = this.st;
      if (o.hidden) {
        const total = o.steps.length;
        const acc = Math.round((total / (total + this.errors)) * 100);
        PT.store.log(o.id, { acc, err: this.errors });
        PT.store.addXp(20);
        PT.bus.emit('unit', { ok: true });
        if (acc >= 90) st.good = (st.good || 0) + 1;
        PT.audio.ding();
        this.msg.textContent = `🎉 Whole song by ear! Accuracy ${acc}%. Press Restart to go again — fewer wrong notes each time.`;
        toast('Song complete by ear! +20 XP', 'good');
        st.clean = (st.clean || 0) + (this.errors === 0 ? 1 : 0);
        this.idx = 0; this.errors = 0; this.times = []; this.revealed = false;
        PT.store.save();
        setTimeout(() => { this.renderStrip(); this.showTargets(); }, 1500);
        return;
      }
      // Tempo & evenness from gaps between notes, normalised by note length.
      const durs = o.steps.map((s) => s.dur || 1);
      const gaps = [];
      for (let i = 1; i < this.times.length; i++) gaps.push((this.times[i] - this.times[i - 1]) / durs[i - 1]);
      const g = gaps.length > 2 ? gaps : [1000];
      const bpm = Math.round(60000 / mean(g));
      const even = Math.max(0, Math.round((1 - sd(g) / mean(g)) * 100));
      const clean = this.errors === 0;
      st.reps++;
      this.sBpm.set(bpm);
      this.sEven.set(even + '%');
      PT.store.log(o.id, { bpm, even, err: this.errors, clean: clean ? 1 : 0, cbpm: clean ? bpm : undefined });
      PT.bus.emit('unit', { ok: clean });
      if (clean) {
        st.clean++;
        PT.store.addXp(3);
        if (bpm > st.best) { st.best = bpm; this.sBest.set(bpm); }
        if (bpm >= st.goal * 0.93 && even >= 65) {
          st.hits++; st.misses = 0;
          PT.audio.ding();
          if (st.hits >= 3) {
            st.goal += 4; st.hits = 0;
            PT.store.addXp(15);
            toast(`Goal reached! New goal: ${st.goal} BPM (+15 XP)`, 'good');
            this.metro.bpm = st.goal;
          } else toast(`Clean rep ✓ (${st.hits}/3)`, 'good');
        } else {
          st.hits = 0;
          this.msgFor(bpm < st.goal * 0.93 ? `Clean! Now a little faster — goal ${st.goal} BPM.` : 'Clean, but uneven. Try to make every note the same length (use the metronome).');
        }
      } else {
        st.hits = 0;
        st.misses++;
        this.msgFor(`${this.errors} wrong note${this.errors > 1 ? 's' : ''}. Slow down — accuracy first, speed comes by itself.`);
        if (st.misses >= 4 && st.goal > 30) {
          st.goal = Math.max(30, st.goal - 4); st.misses = 0;
          toast(`Goal lowered to ${st.goal} BPM — that's smart practice, not failure.`);
          this.metro.bpm = st.goal;
        }
      }
      this.sReps.set(st.hits);
      this.sGoal.set(st.goal);
      PT.store.save();
      this.idx = 0; this.errors = 0; this.times = [];
      this.renderStrip(); this.showTargets();
    }
    msgFor(t) { this.msg.textContent = t; }
    listen() {
      const o = this.o;
      let start = 0, end = o.steps.length;
      if (o.hidden) ({ start, end } = this.phraseOf(this.idx));
      const beat = o.hidden ? 0.5 : 60 / Math.max(40, this.st.goal);
      let t = 0;
      const ev = [];
      for (let i = start; i < end; i++) {
        const s = o.steps[i];
        s.notes.forEach((m) => ev.push({ m, t, d: (s.dur || 1) * beat * 0.92 }));
        t += (s.dur || 1) * beat;
      }
      PT.audio.play(ev);
    }
    hint() { this.hinted = true; this.showTargets(); }
    reveal() { this.revealed = true; this.renderStrip(); this.showTargets(); }
    tempo(d) {
      this.st.goal = Math.max(30, Math.min(200, this.st.goal + d));
      this.st.hits = 0;
      this.metro.bpm = this.st.goal;
      this.sGoal.set(this.st.goal);
      this.sReps.set(0);
      PT.store.save();
    }
    toggleMetro() {
      if (this.metro.running) this.metro.stop(); else { this.metro.bpm = this.st.goal; this.metro.start(); }
      this.metroBtn.textContent = '♩ Metronome: ' + (this.metro.running ? 'on' : 'off');
    }
    restart() { this.idx = 0; this.errors = 0; this.times = []; this.got = new Set(); this.revealed = false; this.renderStrip(); this.showTargets(); if (this.o.hidden) this.listen(); }
    destroy() { this.metro.stop(); }
  }

  // ---- Builders for sequence drills ----
  const FIVE = {
    C: { name: 'C', rh: 60, deg: [0, 2, 4, 5, 7] },
    G: { name: 'G', rh: 67, deg: [0, 2, 4, 5, 7] },
    F: { name: 'F', rh: 65, deg: [0, 2, 4, 5, 7] },
    D: { name: 'D', rh: 62, deg: [0, 2, 4, 5, 7] },
    Am: { name: 'A minor', rh: 57, deg: [0, 2, 3, 5, 7] },
    Dm: { name: 'D minor', rh: 62, deg: [0, 2, 3, 5, 7] },
  };
  const PATTERNS = [
    { id: 'updown', name: 'Up & down (1-2-3-4-5-4-3-2-1)', f: [1, 2, 3, 4, 5, 4, 3, 2, 1], tip: 'The classic. Keep fingers curved like holding a ball. Wrist loose.' },
    { id: 'pairs', name: 'Neighbour pairs (1-2-1-2, 2-3-2-3 …)', f: [1, 2, 1, 2, 2, 3, 2, 3, 3, 4, 3, 4, 4, 5, 4, 5], tip: 'Each pair trains two fingers to move independently.' },
    { id: 'weak', name: 'Weak fingers 4-5 (and 3-4)', f: [3, 4, 3, 4, 3, 4, 4, 5, 4, 5, 4, 5], tip: 'Fingers 4 and 5 are weakest for everyone. Go slow; lift each finger clearly.' },
    { id: 'thumb', name: 'Thumb anchor (1-2-1-3-1-4-1-5)', f: [1, 2, 1, 3, 1, 4, 1, 5, 1], tip: 'Thumb keeps coming home; other fingers reach out.' },
    { id: 'thirds', name: 'Skips (1-3, 2-4, 3-5)', f: [1, 3, 2, 4, 3, 5, 5, 3, 4, 2, 3, 1], tip: 'Skipping a finger is the start of playing chords.' },
    { id: 'alankar1', name: 'Alankar: Sa Re Ga, Re Ga Ma, …', f: [1, 2, 3, 2, 3, 4, 3, 4, 5, 5, 4, 3, 4, 3, 2, 3, 2, 1], tip: 'The classic Indian palta. Say the sargam names aloud as you play.' },
    { id: 'alankar2', name: 'Alankar: Sa Re Ga Ma, Re Ga Ma Pa', f: [1, 2, 3, 4, 2, 3, 4, 5, 5, 4, 3, 2, 4, 3, 2, 1], tip: 'Groups of four. Keep it even — like a clock ticking.' },
    { id: 'triad', name: 'Broken chord (1-3-5-3-1)', f: [1, 3, 5, 3, 1, 3, 5, 3, 1], tip: 'This is a C chord spread out. You will use this shape everywhere.' },
  ];

  function patternDrill(p) {
    const pat = PATTERNS.find((x) => x.id === p.pattern) || PATTERNS[0];
    const pos = FIVE[p.pos] || FIVE.C;
    const hand = p.hand || S().hand || 'R';
    const rhNote = (f) => pos.rh + pos.deg[f - 1];
    const lhNote = (f) => pos.rh - 12 + pos.deg[5 - f]; // LH: pinky on the tonic an octave lower
    const steps = pat.f.map((f) => {
      if (hand === 'R') return { notes: [rhNote(f)], fingers: [f], hand: 'R' };
      if (hand === 'L') return { notes: [lhNote(f)], fingers: [f], hand: 'L' };
      // Both hands, mirror: same finger number in each hand (contrary motion).
      return { notes: [lhNote(f), rhNote(f)], fingers: [f, f], hand: 'B', label: 'L' + f + '+R' + f };
    });
    const handName = { R: 'right hand', L: 'left hand', B: 'both hands (mirror)' }[hand];
    return new SequenceDrill({
      id: `pattern:${pat.id}:${p.pos || 'C'}:${hand}`,
      title: `${pat.name} — ${pos.name} position, ${handName}`,
      tip: pat.tip + (hand === 'L' ? ' Left hand: pinky (5) on the lower note, thumb (1) on top.' : '') + (hand === 'B' ? ' Both hands use the SAME finger number at the same time.' : ''),
      steps, bpmStart: 50, tonic: T.pc(pos.rh), range: [pos.rh - 17, pos.rh + 19],
    });
  }

  function scaleDrill(p) {
    const sc = T.SCALES.find((s) => s.id === p.scale) || T.SCALES[0];
    const hand = p.hand || S().hand || 'R';
    const tonic = hand === 'L' ? sc.tonic - 12 : sc.tonic;
    const up = T.scaleNotes(tonic, sc.steps);
    const fu = hand === 'L' ? sc.lh : sc.rh;
    const notes = up.concat(up.slice(0, -1).reverse());
    const fingers = fu.concat(fu.slice(0, -1).reverse());
    const steps = notes.map((m, i) => ({ notes: [m], fingers: [fingers[i]], hand }));
    return new SequenceDrill({
      id: `scale:${sc.id}:${hand}`,
      title: `${sc.name} scale — ${hand === 'L' ? 'left' : 'right'} hand, one octave`,
      tip: hand === 'L'
        ? 'Going up, finger 3 crosses OVER the thumb. Going down, the thumb tucks UNDER finger 3.'
        : 'Going up, the thumb tucks UNDER finger 3 (or 4 in F). Going down, finger 3 crosses OVER the thumb. Keep the wrist level.',
      steps, bpmStart: 50, tonic: T.pc(sc.tonic), range: [tonic - 7, tonic + 19],
    });
  }

  function songDrill(p) {
    const song = PT.SONGS.find((s) => s.id === p.song) || PT.SONGS[0];
    const phrases = PT.parseSong(song.text);
    const steps = phrases.flat();
    const starts = [];
    let n = 0;
    phrases.forEach((ph) => { starts.push(n); n += ph.length; });
    const ear = p.mode === 'ear';
    return new SequenceDrill({
      id: `song:${song.id}:${ear ? 'ear' : 'read'}`,
      title: song.title + (ear ? ' — by ear' : ''),
      tip: ear ? 'No notes shown! The app plays one phrase; you find it. Wrong notes are fine — that IS the practice. 3 misses = a hint.' : song.tip,
      steps, phrases: starts, hidden: ear, bpmStart: 60, tonic: song.tonic, range: [48, 84],
    });
  }

  function progressionDrill(p) {
    let chords;
    let title;
    if (p.chords) {
      chords = p.chords.split(',').map(T.parseChord).filter(Boolean);
      title = 'Chord sheet: ' + chords.map((c) => c.name).join(' – ');
    } else {
      const prog = T.PROGRESSIONS.find((x) => x.id === p.prog) || T.PROGRESSIONS[0];
      const key = T.parsePc(p.key || 'C');
      chords = T.chordsInKey(key, prog.romans);
      title = `${prog.name} in ${T.noteName(key, T.FLAT_KEYS.has(key))}: ` + chords.map((c) => c.name).join(' – ');
    }
    let prev = null;
    const steps = chords.map((c) => {
      const v = p.smooth === '0' ? T.voicing(c) : T.voiceLead(prev, c);
      prev = v;
      return { notes: v, pcs: c.pcs, fingers: T.chordFingers(v.length), label: c.name + (c.approx ? '*' : ''), bass: 36 + 12 + c.bass - (c.bass > 4 ? 12 : 0), hand: 'R' };
    });
    return new SequenceDrill({
      id: p.chords ? 'prog:sheet' : `prog:${p.prog || 'pop'}:${p.key || 'C'}`,
      title,
      tip: 'Any inversion or octave counts — the app checks the note NAMES. Shapes shown are "smooth" voicings (hand barely moves). Grey key = optional bass note for your left hand.' + (chords.some((c) => c.approx) ? ' (* = simplified chord)' : ''),
      steps, bpmStart: 30, range: [36, 84],
    });
  }

  // ===================================================================
  // Note finder: learn the keyboard map.
  // ===================================================================
  const NF_LEVELS = [
    { name: 'C, D, E', pcs: [0, 2, 4] },
    { name: 'C D E F G', pcs: [0, 2, 4, 5, 7] },
    { name: 'All white keys', pcs: [0, 2, 4, 5, 7, 9, 11] },
    { name: 'Black keys (sharps/flats)', pcs: [1, 3, 6, 8, 10] },
    { name: 'All 12 notes', pcs: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
    { name: 'Exact octave (C3–C5 white keys)', exact: true },
  ];
  class NoteFinder {
    constructor(p) {
      this.st = PT.store.drill('notefinder', { level: 0 });
      if (p.level != null) this.st.level = +p.level;
      this.title = 'Find the note';
      this.ROUND = 15;
    }
    mount(panel, piano) {
      this.piano = piano;
      piano.setRange(36, 96);
      this.big = h('div.big');
      this.sub = h('div.msg');
      this.sCount = stat('this round', '0/' + this.ROUND);
      this.sRt = stat('avg time (s)');
      this.sAcc = stat('accuracy');
      this.lvlSel = h('select', { onchange: (e) => { this.st.level = +e.target.value; PT.store.save(); this.newRound(); } },
        NF_LEVELS.map((l, i) => h('option', { value: i, selected: i === this.st.level }, `Level ${i + 1}: ${l.name}`)));
      panel.append(
        h('h2', 'Find the note'),
        h('p.tip', 'Landmarks: C is just LEFT of each group of 2 black keys. F is just LEFT of each group of 3. Any C counts (unless the level says exact).'),
        h('div.row', this.lvlSel, h('button', { onclick: () => this.newRound() }, '↺ New round')),
        h('div.stats', this.sCount.el, this.sRt.el, this.sAcc.el),
        this.big, this.sub,
      );
      this.newRound();
    }
    newRound() {
      this.n = 0; this.rts = []; this.wrong = 0; this.firstTry = 0;
      this.next();
    }
    next() {
      clearTimeout(this.hintT);
      const L = NF_LEVELS[this.st.level];
      let target;
      do {
        if (L.exact) {
          const whites = []; for (let m = 48; m <= 72; m++) if (!T.isBlack(m)) whites.push(m);
          target = { m: pick(whites) };
        } else target = { pc: pick(L.pcs) };
      } while (this.target && JSON.stringify(target) === JSON.stringify(this.target));
      this.target = target;
      this.missed = false;
      this.t0 = now();
      const name = target.m != null ? T.noteNameOct(target.m) : T.noteName(target.pc) + (T.isBlack(target.pc) ? ' / ' + T.noteName(target.pc, true) : '');
      this.big.textContent = name;
      this.sub.textContent = S().labels === 'sargam' || S().labels === 'both' ? `(in C: ${T.SARGAM[target.pc ?? T.pc(target.m)]})` : (target.m != null ? 'Press exactly this key (C4 = middle C)' : 'Press it — any octave');
      this.piano.clear();
      this.hintT = setTimeout(() => this.showHint(), 4000);
      this.sCount.set(`${this.n}/${this.ROUND}`);
    }
    showHint() {
      const list = [];
      for (let m = this.piano.lo; m <= this.piano.hi; m++) if (this.matches(m)) list.push({ m, cls: 'hint' });
      this.piano.setTargets(list);
      this.missed = true;
    }
    matches(m) { return this.target.m != null ? m === this.target.m : T.pc(m) === this.target.pc; }
    noteOn(m) {
      if (!this.target) return;
      if (this.matches(m)) {
        const rt = (now() - this.t0) / 1000;
        this.piano.flash(m, 'good');
        if (!this.missed) { this.rts.push(rt); this.firstTry++; }
        PT.bus.emit('unit', { ok: !this.missed });
        this.n++;
        PT.store.addXp(1);
        this.sRt.set(this.rts.length ? mean(this.rts).toFixed(2) : '–');
        this.sAcc.set(Math.round((this.firstTry / this.n) * 100) + '%');
        if (this.n >= this.ROUND) return this.finish();
        this.next();
      } else {
        this.piano.flash(m, 'bad');
        this.wrong++;
        this.missed = true;
      }
    }
    noteOff() {}
    finish() {
      clearTimeout(this.hintT);
      const rt = this.rts.length ? mean(this.rts) : 9;
      const acc = Math.round((this.firstTry / this.n) * 100);
      PT.store.log('notefinder', { rt: +rt.toFixed(2), acc, lvl: this.st.level + 1 });
      PT.store.addXp(10);
      let msg = `Round done: ${rt.toFixed(2)} s average, ${acc}% first try.`;
      if (acc >= 90 && rt < 2 && this.st.level < NF_LEVELS.length - 1) {
        this.st.level++;
        this.lvlSel.value = this.st.level;
        msg += ' ⬆ Level up!';
        toast('Level up: ' + NF_LEVELS[this.st.level].name, 'good');
      } else if (acc >= 90) msg += ' Get under 2.0 s to level up.';
      PT.store.save();
      this.big.textContent = '✓';
      this.sub.textContent = msg + ' Next round starts in 3 s…';
      this.target = null;
      this.hintT = setTimeout(() => this.newRound(), 3000);
    }
    destroy() { clearTimeout(this.hintT); }
  }

  // ===================================================================
  // Chord shapes: see a chord name, play it (any inversion).
  // ===================================================================
  const CH_LEVELS = [
    ['C', 'F', 'G'],
    ['Am', 'Dm', 'Em'],
    ['D', 'A', 'E'],
    ['Bb', 'Eb', 'Ab', 'Db', 'F#', 'B'],
    ['Bm', 'F#m', 'C#m', 'Gm', 'Cm', 'Fm'],
    ['G7', 'C7', 'D7', 'A7', 'E7'],
    ['Cmaj7', 'Fmaj7', 'Am7', 'Dm7', 'Em7'],
    ['Csus4', 'Dsus4', 'Gsus2', 'Asus2', 'Bdim'],
  ];
  class ChordShapes {
    constructor(p) {
      this.st = PT.store.drill('chords', { level: 0, stats: {} });
      if (p.level != null) this.st.level = +p.level;
      this.title = 'Chord shapes';
      this.ROUND = 12;
    }
    pool() { return CH_LEVELS.slice(0, this.st.level + 1).flat(); }
    mount(panel, piano) {
      this.piano = piano;
      piano.setRange(48, 84);
      this.big = h('div.big');
      this.sub = h('div.msg');
      this.sN = stat('this round', '0/' + this.ROUND);
      this.sT = stat('avg time (s)');
      this.poolEl = h('div.pool');
      this.lvlSel = h('select', { onchange: (e) => { this.st.level = +e.target.value; PT.store.save(); this.newRound(); } },
        CH_LEVELS.map((l, i) => h('option', { value: i, selected: i === this.st.level }, `Level ${i + 1}: + ${l.join(' ')}`)));
      panel.append(
        h('h2', 'Chord shapes'),
        h('p.tip', 'Major chord = root + 4 half-steps + 3 half-steps. Minor = root + 3 + 4. Any inversion or octave is accepted. Use fingers 1-3-5. The shape appears if you are new to a chord or stuck for 3 seconds.'),
        h('div.row', this.lvlSel, h('button', { onclick: () => this.newRound() }, '↺ New round'), h('button', { onclick: () => this.chord && PT.audio.chord(T.voicing(this.chord)) }, '▶ Hear it')),
        h('div.stats', this.sN.el, this.sT.el),
        this.big, this.sub, this.poolEl,
      );
      this.newRound();
    }
    renderPool() {
      this.poolEl.innerHTML = '';
      this.pool().forEach((n) => {
        const s = this.st.stats[n];
        const ok = s && s.n >= 3 && s.avg < 3000;
        this.poolEl.append(h('span.pchip' + (ok ? '.ok' : ''), { title: s ? `${s.n} times, avg ${(s.avg / 1000).toFixed(1)} s` : 'new' }, n, s ? h('small', ' ' + (s.avg / 1000).toFixed(1) + 's') : null));
      });
    }
    newRound() { this.n = 0; this.times = []; this.renderPool(); this.next(); }
    next() {
      clearTimeout(this.hintT);
      const pool = this.pool();
      // Weighted: slow or new chords come up more often.
      const w = pool.map((n) => { const s = this.st.stats[n]; return n === (this.chord && this.chord.original) ? 0 : !s || s.n < 3 ? 4 : 1 + s.avg / 1500; });
      let r = Math.random() * w.reduce((a, b) => a + b, 0), i = 0;
      while ((r -= w[i]) > 0) i++;
      this.chord = T.parseChord(pool[Math.min(i, pool.length - 1)]);
      this.waitRelease = false;
      this.wrong = false;
      this.big.textContent = this.chord.name;
      this.sub.textContent = this.chord.type.name + ' chord — notes: ' + this.chord.pcs.map((p) => T.noteName(p, this.chord.flats)).join(' ');
      const s = this.st.stats[this.chord.original];
      this.piano.clear();
      if (!s || s.n < 2) this.showShape(); else this.hintT = setTimeout(() => this.showShape(), 3000);
      this.t0 = now();
      this.sN.set(`${this.n}/${this.ROUND}`);
    }
    showShape() {
      const v = T.voicing(this.chord);
      const f = T.chordFingers(v.length);
      this.piano.setTargets(v.map((m, i) => ({ m, finger: f[i] })));
    }
    noteOn(m) {
      if (!this.chord || this.waitRelease) return;
      const pcs = new Set([...PT.input.held].map(T.pc));
      if (!this.chord.pcs.includes(T.pc(m))) { this.piano.flash(m, 'bad'); this.wrong = true; return; }
      const want = this.chord.pcs;
      if (want.every((p) => pcs.has(p)) && [...pcs].every((p) => want.includes(p))) {
        const ms = now() - this.t0;
        [...PT.input.held].forEach((x) => this.piano.flash(x, 'good', 600));
        const key = this.chord.original;
        const s = (this.st.stats[key] = this.st.stats[key] || { n: 0, avg: ms });
        s.n++;
        s.avg = s.n === 1 ? ms : s.avg * 0.6 + ms * 0.4; // recent attempts count more
        this.times.push(ms);
        this.n++;
        PT.bus.emit('unit', { ok: true });
        PT.store.addXp(this.wrong ? 1 : 2);
        this.sT.set((mean(this.times) / 1000).toFixed(2));
        this.waitRelease = true;
        this.sub.textContent = `✓ ${(ms / 1000).toFixed(1)} s — now lift your hand off the keys`;
        if (PT.input.held.size === 0) this.afterRelease();
      }
    }
    noteOff() { if (this.waitRelease && PT.input.held.size === 0) this.afterRelease(); }
    afterRelease() {
      this.waitRelease = false;
      if (this.n >= this.ROUND) return this.finish();
      this.renderPool();
      this.next();
    }
    finish() {
      const ct = mean(this.times) / 1000;
      PT.store.log('chords', { ct: +ct.toFixed(2), lvl: this.st.level + 1 });
      PT.store.addXp(10);
      const pool = this.pool();
      const mastered = pool.every((n) => { const s = this.st.stats[n]; return s && s.n >= 3 && s.avg < 3000; });
      let msg = `Round done — average ${ct.toFixed(2)} s per chord.`;
      if (mastered && this.st.level < CH_LEVELS.length - 1) {
        this.st.level++;
        this.lvlSel.value = this.st.level;
        msg += ' ⬆ All chords under 3 s — new chords unlocked!';
        toast('New chords: ' + CH_LEVELS[this.st.level].join(' '), 'good');
      } else msg += ' Get every chord under 3 s (green) to unlock more.';
      PT.store.save();
      this.big.textContent = '✓';
      this.sub.textContent = msg;
      this.chord = null;
      this.piano.clear();
      this.renderPool();
      this.hintT = setTimeout(() => this.newRound(), 3500);
    }
    destroy() { clearTimeout(this.hintT); }
  }

  // ===================================================================
  // One-minute chord changes: how many switches between two chords in 60 s?
  // ===================================================================
  const PAIRS = ['C-G', 'C-F', 'G-Am', 'Am-F', 'F-G', 'C-Am', 'Dm-G', 'Em-Am', 'G-D', 'D-A', 'Am-Em', 'G-Em', 'F-Dm', 'C-Dm'];
  class MinuteChanges {
    constructor(p) {
      this.pair = p.pair || PAIRS[0];
      this.st = PT.store.drill('changes', { best: {} });
      this.title = 'One-minute changes';
    }
    mount(panel, piano) {
      this.piano = piano;
      piano.setRange(48, 84);
      this.sel = h('select', { onchange: (e) => { this.pair = e.target.value; this.reset(); } }, PAIRS.map((p) => h('option', { value: p, selected: p === this.pair }, p.replace('-', ' ↔ '))));
      this.big = h('div.big');
      this.sub = h('div.msg');
      this.sCount = stat('changes', '0');
      this.sTime = stat('time left', '1:00');
      this.sBest = stat('your best');
      panel.append(
        h('h2', 'One-minute changes'),
        h('p.tip', 'Switching chords fast is THE skill for playing songs from chord sheets. Alternate between two chords for 60 seconds. The clock starts on your first chord. Beat your best!'),
        h('div.row', this.sel, h('button', { onclick: () => this.reset() }, '↺ Reset')),
        h('div.stats', this.sCount.el, this.sTime.el, this.sBest.el),
        this.big, this.sub,
      );
      this.reset();
    }
    reset() {
      clearInterval(this.timer);
      const [a, b] = this.pair.split('-').map(T.parseChord);
      const va = T.voicing(a), vb = T.voiceLead(va, b);
      this.chords = [{ c: a, v: va }, { c: b, v: vb }];
      this.which = 0; this.count = 0; this.t0 = null; this.done = false;
      this.sCount.set(0); this.sTime.set('1:00');
      this.sBest.set(this.st.best[this.pair] || '–');
      this.show();
    }
    show() {
      const cur = this.chords[this.which];
      const nxt = this.chords[1 - this.which];
      this.big.textContent = cur.c.name;
      this.sub.textContent = this.done ? '' : `then ${nxt.c.name}`;
      const f = T.chordFingers(cur.v.length);
      this.piano.setTargets([...cur.v.map((m, i) => ({ m, finger: f[i] })), ...nxt.v.map((m) => ({ m, cls: 'next' }))]);
    }
    noteOn(m) {
      if (this.done) return;
      const cur = this.chords[this.which].c;
      if (!cur.pcs.includes(T.pc(m))) { this.piano.flash(m, 'bad'); return; }
      const pcs = new Set([...PT.input.held].map(T.pc));
      if (cur.pcs.every((p) => pcs.has(p)) && [...pcs].every((p) => cur.pcs.includes(p))) {
        [...PT.input.held].forEach((x) => this.piano.flash(x, 'good'));
        if (!this.t0) { this.t0 = now(); this.timer = setInterval(() => this.tick(), 200); } else this.count++;
        this.sCount.set(this.count);
        this.which = 1 - this.which;
        this.show();
      }
    }
    noteOff() {}
    tick() {
      const left = 60 - (now() - this.t0) / 1000;
      this.sTime.set(fmtTime(left));
      if (left <= 0) {
        clearInterval(this.timer);
        this.done = true;
        const prev = this.st.best[this.pair] || 0;
        if (this.count > prev) { this.st.best[this.pair] = this.count; toast(`New record: ${this.count} changes! 🎉`, 'good'); }
        PT.store.log('changes', { changes: this.count, pair: this.pair });
        PT.bus.emit('unit', { ok: true });
        PT.store.addXp(10 + this.count);
        PT.store.save();
        PT.audio.ding();
        this.big.textContent = this.count + ' changes';
        this.sub.textContent = prev ? `Previous best: ${prev}. Press Reset to go again.` : 'First score saved. Press Reset to go again.';
        this.piano.clear();
      }
    }
    destroy() { clearInterval(this.timer); }
  }

  // ===================================================================
  // Ear: Echo — hear a short melody, play it back. The core "play by ear" skill.
  // ===================================================================
  const ECHO_LEVELS = [
    { name: 'Find one note: Sa Re Ga (C D E)', pool: [0, 1, 2], len: 1 },
    { name: 'Find one note: Sa to Pa (C–G)', pool: [0, 1, 2, 3, 4], len: 1 },
    { name: 'Find one note: whole scale', pool: [0, 1, 2, 3, 4, 5, 6, 7], len: 1 },
    { name: '2 notes, Sa to Pa', pool: [0, 1, 2, 3, 4], len: 2 },
    { name: '2 notes, whole scale', pool: [0, 1, 2, 3, 4, 5, 6, 7], len: 2 },
    { name: '3 notes', pool: [0, 1, 2, 3, 4, 5, 6, 7], len: 3 },
    { name: '3 notes, lower notes too', pool: [-3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7], len: 3 },
    { name: '3 notes, different keys', pool: [0, 1, 2, 3, 4, 5, 6, 7], len: 3, keys: true },
    { name: '4 notes, different keys', pool: [-3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9], len: 4, keys: true },
    { name: '5 notes', pool: [-3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9], len: 5, keys: true },
    { name: '6 notes — real melody length', pool: [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], len: 6, keys: true },
  ];
  const KEY_TONICS = [60, 55, 65, 62, 57, 58, 63]; // C G F D A Bb Eb
  const degMidi = (tonic, d) => tonic + T.MAJOR[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);

  // Adaptive level helper: last results at this level decide up/down.
  function adapt(st, ok, max) {
    st.recent = (st.recent || []).concat(ok ? 1 : 0).slice(-6);
    const r = st.recent;
    if (r.length >= 5 && r.slice(-5).reduce((a, b) => a + b) >= 4 && st.level < max) { st.level++; st.recent = []; return 1; }
    if (r.length >= 5 && r.slice(-5).reduce((a, b) => a + b) <= 1 && st.level > 0) { st.level--; st.recent = []; return -1; }
    return 0;
  }

  class Echo {
    constructor(p) {
      this.st = PT.store.drill('echo', { level: 0, anyOctave: true });
      if (p.level != null) this.st.level = +p.level;
      this.title = 'Echo (play by ear)';
    }
    mount(panel, piano) {
      this.piano = piano;
      piano.setRange(43, 84);
      this.big = h('div.big');
      this.sub = h('div.msg');
      this.dots = h('div.dots');
      this.sLvl = stat('level');
      this.sOk = stat('first-try today', '0');
      this.okToday = 0;
      this.lvlSel = h('select', { onchange: (e) => { this.st.level = +e.target.value; this.st.recent = []; PT.store.save(); this.nextItem(); } },
        ECHO_LEVELS.map((l, i) => h('option', { value: i }, `Level ${i + 1}: ${l.name}`)));
      const oct = h('label.check', h('input', { type: 'checkbox', checked: this.st.anyOctave, onchange: (e) => { this.st.anyOctave = e.target.checked; PT.store.save(); } }), ' any octave counts');
      panel.append(
        h('h2', 'Echo — hear it, play it back'),
        h('p.tip', 'First you hear the home chord (Sa / C), then a little tune. Hunt for it on the keys — guessing and searching is exactly how your ear learns. Tip: sing it first, then ask "higher or lower than the last note?"'),
        h('div.row', this.lvlSel, oct),
        h('div.row',
          h('button.primary', { onclick: () => this.play(true) }, '▶ Replay (R)'),
          h('button', { onclick: () => this.play(false) }, '▶ Just the tune'),
          h('button', { onclick: () => this.showAnswer() }, '👀 Show me'),
          h('button', { onclick: () => this.nextItem() }, '⏭ New tune (N)')),
        h('div.stats', this.sLvl.el, this.sOk.el),
        this.big, this.dots, this.sub,
      );
      this.keyH = (e) => {
        if (e.target.closest('input,textarea,select')) return;
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        if (e.key === 'r') this.play(true);
        if (e.key === 'n') this.nextItem();
      };
      window.addEventListener('keydown', this.keyH);
      this.nextItem();
    }
    nextItem() {
      clearTimeout(this.tm);
      const L = ECHO_LEVELS[this.st.level];
      this.lvlSel.value = this.st.level;
      this.sLvl.set(this.st.level + 1);
      this.tonic = L.keys ? pick(KEY_TONICS) : 60;
      this.toneName = PT.audio.earTone();
      this.piano.tonic = T.pc(this.tonic);
      this.piano.relabel();
      const lo = Math.min(...L.pool), hi = Math.max(...L.pool);
      const starts = L.pool.filter((x) => [0, 2, 4, 7].includes(x));
      let d = L.len > 1 && Math.random() < 0.6 ? pick(starts) : pick(L.pool);
      const degs = [d];
      while (degs.length < L.len) {
        const r = Math.random();
        let step = r < 0.6 ? pick([-1, 1]) : r < 0.85 ? pick([-2, 2]) : pick([-4, -3, 3, 4]);
        let nd = d + step;
        if (nd < lo || nd > hi) nd = d - step;
        nd = Math.max(lo, Math.min(hi, nd));
        if (nd === d && L.len > 1) nd = d + (d < hi ? 1 : -1);
        degs.push(nd);
        d = nd;
      }
      this.notes = degs.map((x) => degMidi(this.tonic, x));
      this.pos = 0; this.tries = 0; this.failed = false; this.wrongHere = 0;
      this.piano.clear();
      this.renderDots();
      this.big.textContent = L.len === 1 ? 'Find this note' : `Play back ${L.len} notes`;
      if (this.toneName) this.big.append(h('small.tonetag', ' 🎷 ' + this.toneName));
      this.sub.textContent = 'Listen…';
      this.tm = setTimeout(() => this.play(true), 400);
    }
    renderDots() {
      this.dots.innerHTML = '';
      this.notes.forEach((m, i) => this.dots.append(h('span.dot' + (i < this.pos ? '.on' : ''), i < this.pos || this.failed ? this.name(m) : '')));
    }
    name(m) { return S().labels === 'sargam' ? T.sargam(m, this.tonic) : T.noteName(m, T.FLAT_KEYS.has(T.pc(this.tonic))); }
    play(withRef) {
      const t = this.tonic;
      let start = 0;
      if (withRef) {
        PT.audio.chord([t - 12, t, t + 4, t + 7], 0.9);
        PT.audio.play([{ m: t, t: 1.0, d: 0.6 }]);
        start = 1.9;
      }
      PT.audio.melody(this.notes, 0.6, start);
      this.sub.textContent = 'Listen…';
      clearTimeout(this.tm2);
      this.tm2 = setTimeout(() => (this.sub.textContent = this.notes.length === 1 ? 'Your turn — find it! (Home note Sa = ' + T.noteName(t) + ')' : 'Your turn — play it back.'), (start + this.notes.length * 0.6) * 1000);
    }
    showAnswer() {
      this.failed = true;
      this.renderDots();
      this.piano.setTargets(this.notes.map((m, i) => ({ m, finger: i + 1 })));
      this.play(false);
    }
    noteOn(m) {
      if (!this.notes || PT.audio.isBusy()) return;
      const want = this.notes[this.pos];
      const ok = this.st.anyOctave ? T.pc(m) === T.pc(want) : m === want;
      if (ok) {
        this.piano.flash(m, 'good');
        this.pos++;
        this.renderDots();
        if (this.pos >= this.notes.length) this.success();
      } else {
        this.piano.flash(m, 'bad');
        if (this.notes.length === 1) {
          this.wrongHere++;
          this.sub.textContent = (m < want ? 'Higher ↑' : 'Lower ↓') + (this.wrongHere >= 4 ? ' (try "Show me" if stuck)' : '');
          if (this.wrongHere === 1) this.tries++;
        } else {
          this.tries++;
          this.pos = 0;
          this.renderDots();
          this.sub.textContent = this.tries >= 3 ? 'Tough one! Here it is — copy it.' : `Not quite (try ${this.tries + 1}/3). Start again from the first note. Higher or lower?`;
          if (this.tries >= 3) this.showAnswer();
          else setTimeout(() => this.play(false), 600);
        }
      }
    }
    noteOff() {}
    success() {
      const first = this.tries === 0 && !this.failed;
      PT.audio.ding();
      if (first) { this.okToday++; this.sOk.set(this.okToday); }
      PT.store.addXp(first ? 3 + this.notes.length : 1);
      PT.store.log('echo', { lvl: this.st.level + 1, ok: first ? 1 : 0, tries: this.tries });
      PT.bus.emit('unit', { ok: !this.failed });
      const ch = this.failed ? 0 : adapt(this.st, first, ECHO_LEVELS.length - 1);
      if (this.failed) this.st.recent = (this.st.recent || []).concat(0).slice(-6);
      if (ch > 0) toast('Ear level up! ' + ECHO_LEVELS[this.st.level].name, 'good');
      if (ch < 0) toast('Stepping back one level to build confidence 👍');
      PT.store.save();
      this.big.textContent = first ? '✓ First try!' : '✓ Got it';
      this.sub.textContent = '';
      this.notes = null;
      this.tm = setTimeout(() => this.nextItem(), 1200);
    }
    destroy() { clearTimeout(this.tm); clearTimeout(this.tm2); window.removeEventListener('keydown', this.keyH); PT.audio.promptTone = null; }
  }

  // ===================================================================
  // Ear: multiple-choice quizzes (scale degree, interval, chord quality).
  // ===================================================================
  class Quiz {
    constructor(kind, p) {
      this.kind = kind;
      this.st = PT.store.drill('ear:' + kind, { level: 0 });
      if (p.level != null) this.st.level = +p.level;
      this.cfg = QUIZZES[kind];
      this.title = this.cfg.title;
    }
    mount(panel, piano) {
      this.piano = piano;
      piano.setRange(43, 84);
      this.big = h('div.big');
      this.sub = h('div.msg');
      this.choices = h('div.choices');
      this.sLvl = stat('level');
      this.sAcc = stat('correct this session');
      this.right = 0; this.total = 0;
      panel.append(
        h('h2', this.cfg.title),
        h('p.tip', this.cfg.tip),
        h('div.row', h('button.primary', { onclick: () => this.play() }, '▶ Replay'), h('button', { onclick: () => this.next() }, '⏭ Skip')),
        h('div.stats', this.sLvl.el, this.sAcc.el),
        this.big, this.choices, this.sub,
      );
      this.next();
    }
    next() {
      clearTimeout(this.tm);
      this.answered = false;
      this.q = this.cfg.make(this.st.level, this.piano);
      const toneName = PT.audio.earTone();
      this.piano.tonic = T.pc(this.q.tonic || 60);
      this.piano.relabel();
      this.piano.clear();
      this.sLvl.set(this.st.level + 1);
      this.big.textContent = this.cfg.prompt;
      if (toneName) this.big.append(h('small.tonetag', ' 🎷 ' + toneName));
      this.sub.textContent = '';
      this.choices.innerHTML = '';
      this.q.options.forEach((o) => this.choices.append(h('button.choice', { onclick: () => this.answer(o.id) }, o.label)));
      this.tm = setTimeout(() => this.play(), 300);
    }
    play() { this.q.play(); }
    noteOn(m) {
      // You can answer by playing too (scale degrees).
      if (this.cfg.byKey && !this.answered && !PT.audio.isBusy()) {
        const id = this.cfg.byKey(this.q, m);
        if (id != null && this.q.options.some((o) => o.id === id)) this.answer(id);
      }
    }
    noteOff() {}
    answer(id) {
      if (this.answered) return;
      this.answered = true;
      const ok = id === this.q.answer;
      this.total++; if (ok) this.right++;
      this.sAcc.set(`${this.right}/${this.total}`);
      [...this.choices.children].forEach((b, i) => {
        const o = this.q.options[i];
        if (o.id === this.q.answer) b.classList.add('right');
        else if (o.id === id) b.classList.add('wrong');
      });
      if (ok) PT.audio.ding(); else PT.audio.buzz();
      PT.store.addXp(ok ? 2 : 0);
      PT.store.log('ear:' + this.kind, { ok: ok ? 1 : 0, lvl: this.st.level + 1 });
      PT.bus.emit('unit', { ok });
      const ch = adapt(this.st, ok, this.cfg.levels - 1);
      if (ch > 0) toast('Level up! New answers added.', 'good');
      PT.store.save();
      this.big.textContent = ok ? '✓ Correct' : '✗ It was: ' + this.q.options.find((o) => o.id === this.q.answer).label;
      this.sub.textContent = this.q.explain || '';
      if (this.q.after) this.q.after();
      this.tm = setTimeout(() => this.next(), ok ? 1800 : 3500);
    }
    destroy() { clearTimeout(this.tm); PT.audio.promptTone = null; }
  }

  const degName = (d, tonic) => {
    const m = degMidi(tonic, d);
    const mode = S().labels;
    const sa = T.sargam(m, tonic), sol = T.solfege(m, tonic);
    return mode === 'sargam' ? sa : mode === 'both' ? `${sa} / ${sol}` : `${d + 1} · ${sol} · ${sa}`;
  };
  const QUIZZES = {
    degree: {
      title: 'Which note of the scale?',
      prompt: 'Which scale note was that?',
      tip: 'You hear a short chord pattern that sets "home" (Sa), then one note. Every note has a feeling: Sa = rest, Ga = bright, Pa = strong, Ni = "wants to go up to Sa". After you answer, the note walks home so you feel its pull. This is how you learn to hear melodies.',
      levels: 5,
      make(level) {
        const sets = [[0, 2, 4], [0, 1, 2, 4], [0, 1, 2, 3, 4], [0, 1, 2, 3, 4, 5, 6], [0, 1, 2, 3, 4, 5, 6]];
        const tonic = level >= 4 ? pick(KEY_TONICS) : 60;
        const set = sets[level];
        const d = pick(set);
        const target = degMidi(tonic, d);
        const cadence = () => {
          const I = [tonic - 12, tonic, tonic + 4, tonic + 7], IV = [tonic - 7, tonic + 5, tonic + 9, tonic + 12], V = [tonic - 5, tonic + 2, tonic + 7, tonic + 11];
          [I, IV, V, I].forEach((c, i) => PT.audio.chord(c, 0.5, i * 0.55));
          return 2.4;
        };
        const walk = d === 0 ? [target] : d <= 3 ? Array.from({ length: d + 1 }, (_, i) => degMidi(tonic, d - i)) : Array.from({ length: 8 - d }, (_, i) => degMidi(tonic, d + i));
        return {
          tonic, answer: d,
          options: set.map((x) => ({ id: x, label: degName(x, tonic) })),
          play() { const t = cadence(); PT.audio.play([{ m: target, t, d: 1 }]); },
          after() { PT.audio.melody(walk, 0.4, 0.2); },
          explain: 'Hear how it walks home to Sa. You can also answer by pressing the note on the keyboard.',
        };
      },
      byKey(q, m) { const r = T.pc(m - q.tonic); const d = T.MAJOR.indexOf(r); return d >= 0 ? d : null; },
    },
    interval: {
      title: 'Intervals (distance between two notes)',
      prompt: 'How far apart?',
      tip: 'Two notes play. Name the jump. Each interval is linked to a famous song start — use it to remember. Intervals tell you how far to move your finger when you copy a melody.',
      levels: 10,
      make(level, piano) {
        const order = [12, 7, 4, 5, 2, 3, 9, 1, 10, 11, 8, 6];
        const set = order.slice(0, 3 + level);
        const semis = pick(set);
        const down = level >= 4 && Math.random() < 0.35;
        const low = 52 + Math.floor(Math.random() * 12);
        const a = down ? low + semis : low, b = down ? low : low + semis;
        const iv = T.INTERVALS.find((x) => x.semis === semis);
        return {
          tonic: a, answer: semis,
          options: set.slice().sort((x, y) => x - y).map((s) => ({ id: s, label: T.INTERVALS.find((x) => x.semis === s).name })),
          play() { PT.audio.melody([a, b], 0.75); },
          explain: `${iv.name} ${down ? 'down' : 'up'} — like "${down ? iv.down : iv.up}". (${semis} half-steps: ${T.noteName(a)} → ${T.noteName(b)})`,
          after() { piano.setTargets([{ m: a, finger: 1 }, { m: b, finger: 2 }]); },
        };
      },
    },
    quality: {
      title: 'Chord colour: major or minor?',
      prompt: 'What kind of chord?',
      tip: 'Major usually sounds bright/happy, minor sounds sad/serious. Recognising this lets you guess the chords of a song much faster.',
      levels: 4,
      make(level, piano) {
        const sets = [['', 'm'], ['', 'm', '7'], ['', 'm', '7', 'dim', 'aug'], ['', 'm', '7', 'maj7', 'm7', 'dim', 'sus4']];
        const set = sets[level];
        const id = pick(set);
        const root = 53 + Math.floor(Math.random() * 10);
        const ch = T.parseChord(T.noteName(root) + id);
        const notes = ch.type.iv.map((i) => root + i);
        return {
          tonic: root, answer: id,
          options: set.map((x) => ({ id: x, label: T.CHORD_TYPES.find((t) => t.id === x).name })),
          play() { PT.audio.chord(notes, 1.3); PT.audio.melody(notes, 0.3, 1.5); },
          after() { piano.setTargets(notes.map((m) => ({ m }))); },
          explain: `${ch.name} — notes ${notes.map((m) => T.noteName(m)).join(' ')}`,
        };
      },
    },
  };

  // ===================================================================
  // Registry
  // ===================================================================
  PT.PATTERNS = PATTERNS;
  PT.FIVE = FIVE;
  PT.ECHO_LEVELS = ECHO_LEVELS;
  PT.NF_LEVELS = NF_LEVELS;
  PT.CH_LEVELS = CH_LEVELS;
  PT.PAIRS = PAIRS;
  PT.drills = {
    notefinder: { group: 'keys', name: 'Find the note', desc: 'Learn where every note lives. Builds speed + keyboard map.', make: (p) => new NoteFinder(p) },
    pattern: { group: 'fingers', name: 'Five-finger patterns', desc: 'Finger independence & control with an adaptive tempo goal.', make: patternDrill },
    scale: { group: 'fingers', name: 'Scales', desc: 'Thumb-under technique — the key to moving across the keyboard.', make: scaleDrill },
    chords: { group: 'chords', name: 'Chord shapes', desc: 'See a chord name → play it. Unlocks new chords as you get fast.', make: (p) => new ChordShapes(p) },
    changes: { group: 'chords', name: 'One-minute changes', desc: 'Switch between two chords as many times as you can in 60 s.', make: (p) => new MinuteChanges(p) },
    prog: { group: 'chords', name: 'Progressions', desc: 'Play the 4-chord loops behind thousands of songs.', make: progressionDrill },
    echo: { group: 'ears', name: 'Echo (play by ear)', desc: 'Hear a little tune, find it on the keys. The #1 skill for playing songs without sheets.', make: (p) => new Echo(p) },
    degree: { group: 'ears', name: 'Scale-note feeling', desc: 'Recognise Sa, Re, Ga … by their feeling in a key.', make: (p) => new Quiz('degree', p) },
    interval: { group: 'ears', name: 'Intervals', desc: 'Hear the distance between notes, with song references.', make: (p) => new Quiz('interval', p) },
    quality: { group: 'ears', name: 'Major / minor', desc: 'Hear the colour of a chord.', make: (p) => new Quiz('quality', p) },
    song: { group: 'songs', name: 'Songs', desc: 'Play real melodies with guidance, then by ear.', make: songDrill },
  };
})();
