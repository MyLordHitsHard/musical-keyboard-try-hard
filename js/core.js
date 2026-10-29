// Core services: event bus, storage/progress, audio (synth + metronome), MIDI & computer-keyboard input.
(function () {
  const PT = (window.PT = window.PT || {});
  const T = PT.theory;

  // ---------------- Event bus ----------------
  const handlers = {};
  PT.bus = {
    on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return () => PT.bus.off(ev, fn); },
    off(ev, fn) { handlers[ev] = (handlers[ev] || []).filter((f) => f !== fn); },
    emit(ev, ...a) { (handlers[ev] || []).slice().forEach((f) => { try { f(...a); } catch (e) { console.error(e); } }); },
  };

  // ---------------- Storage & progress ----------------
  const KEY = 'pianoTryHard.v1';
  const DEFAULT_SETTINGS = {
    labels: 'letters', // none | letters | sargam | both
    showFingers: true,
    appSoundForMidi: false, // your Casio already makes sound; turn on if keyboard volume is down
    promptsToKeyboard: false, // play the app's example notes through the Casio speakers
    volume: 0.7,
    metronomeVolume: 0.6,
    sessionMinutes: 15,
    hand: 'R',
    ignoreDrumChannel: true,
    tone: 'piano', // sound of the app's own synth (example tunes, computer-keyboard playing)
    earToneVariety: false, // ear training: a different tone for each question
  };
  const today = () => {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  };

  function load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(KEY)); } catch (e) { /* storage unavailable */ }
    s = s || {};
    s.settings = Object.assign({}, DEFAULT_SETTINGS, s.settings || {});
    s.xp = s.xp || 0;
    s.days = s.days || {}; // date -> { sec, xp, notes }
    s.history = s.history || []; // { t, d: drillId, ...metrics }
    s.drills = s.drills || {}; // drillId -> persistent per-drill state (levels, bests, weights)
    return s;
  }
  const state = load();
  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ }
    }, 300);
  }
  let replaced = false; // set when import/reset rewrote storage, so unload must not overwrite it
  window.addEventListener('beforeunload', () => {
    if (replaced) return;
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  });

  function day(d = today()) {
    return (state.days[d] = state.days[d] || { sec: 0, xp: 0, notes: 0 });
  }

  PT.store = {
    state, save, today, day,
    get settings() { return state.settings; },
    set(k, v) { state.settings[k] = v; save(); PT.bus.emit('settings', k, v); },
    drill(id, defaults = {}) {
      state.drills[id] = Object.assign({}, defaults, state.drills[id] || {});
      return state.drills[id];
    },
    log(drillId, metrics) {
      state.history.push(Object.assign({ t: Date.now(), d: drillId }, metrics));
      if (state.history.length > 8000) state.history.splice(0, state.history.length - 8000);
      save();
    },
    addXp(n) {
      state.xp += n;
      day().xp += n;
      save();
      PT.bus.emit('xp', state.xp, n);
    },
    level() {
      // Level n needs 60 * n^1.6 cumulative XP: quick early levels, slower later.
      let lvl = 1;
      while (state.xp >= Math.round(60 * Math.pow(lvl, 1.6))) lvl++;
      const prev = lvl === 1 ? 0 : Math.round(60 * Math.pow(lvl - 1, 1.6));
      const next = Math.round(60 * Math.pow(lvl, 1.6));
      return { lvl, into: state.xp - prev, need: next - prev };
    },
    streak() {
      let n = 0;
      const d = new Date();
      // today counts if practised; otherwise the streak is still alive from yesterday
      if (!(state.days[today()] && state.days[today()].sec >= 60)) d.setDate(d.getDate() - 1);
      for (;;) {
        const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        if (state.days[k] && state.days[k].sec >= 60) { n++; d.setDate(d.getDate() - 1); } else break;
      }
      return n;
    },
    export() { return JSON.stringify(state, null, 1); },
    import(json) {
      const s = JSON.parse(json);
      if (!s || typeof s !== 'object' || !s.settings) throw new Error('Not a progress file');
      clearTimeout(saveTimer);
      replaced = true;
      localStorage.setItem(KEY, JSON.stringify(s));
      location.reload();
    },
    reset() { clearTimeout(saveTimer); replaced = true; localStorage.removeItem(KEY); location.reload(); },
  };

  // Count "hands on keys" time: gaps under 45 s between notes count as practice.
  let lastNoteAt = 0;
  PT.bus.on('noteon', () => {
    const now = Date.now();
    const d = day();
    if (lastNoteAt && now - lastNoteAt < 45000) d.sec += (now - lastNoteAt) / 1000;
    d.notes++;
    lastNoteAt = now;
    save();
  });

  // ---------------- Audio ----------------
  let ctx = null, master = null;
  function ac() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = state.settings.volume;
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp).connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  PT.bus.on('settings', (k, v) => { if (k === 'volume' && master) master.gain.value = v; });

  // ---- Tones ----
  // p: partials [freq multiple, waveform, gain, detune cents]; env: percussive (decay) or sustained.
  // gm: General MIDI program, sent to the Casio when example tunes play through its speakers.
  const TONES = {
    piano: { name: 'Grand piano', gm: 0, p: [[1, 'triangle', 1], [2, 'sine', 0.35], [3, 'sine', 0.12], [0.5, 'sine', 0.15]], a: 0.008, decay: 3.2, bright: 6 },
    epiano: { name: 'Electric piano', gm: 4, p: [[1, 'sine', 1], [2, 'sine', 0.2], [7, 'sine', 0.06]], a: 0.005, decay: 2.6, bright: 8 },
    harmonium: { name: 'Harmonium', gm: 21, p: [[1, 'sawtooth', 0.55], [1, 'sawtooth', 0.4, 6], [2, 'square', 0.12]], a: 0.06, sustain: 0.8, release: 0.15, bright: 4 },
    organ: { name: 'Organ', gm: 16, p: [[1, 'sine', 1], [2, 'sine', 0.6], [3, 'sine', 0.35], [4, 'sine', 0.25], [0.5, 'sine', 0.5]], a: 0.01, sustain: 0.9, release: 0.08, bright: 12 },
    strings: { name: 'Strings', gm: 48, p: [[1, 'sawtooth', 0.5, -8], [1, 'sawtooth', 0.5, 8], [2, 'sawtooth', 0.12]], a: 0.25, sustain: 0.85, release: 0.5, bright: 3, vib: 0.004 },
    flute: { name: 'Flute (bansuri)', gm: 73, p: [[1, 'sine', 1], [2, 'triangle', 0.12], [3, 'sine', 0.05]], a: 0.07, sustain: 0.85, release: 0.15, bright: 6, vib: 0.006 },
    sitar: { name: 'Sitar', gm: 104, p: [[1, 'sawtooth', 0.7], [2, 'sawtooth', 0.25], [3.01, 'square', 0.1]], a: 0.004, decay: 2.8, bright: 10, bend: 0.97, buzz: true },
    guitar: { name: 'Nylon guitar', gm: 24, p: [[1, 'triangle', 1], [2, 'sawtooth', 0.15], [3, 'sine', 0.1]], a: 0.004, decay: 1.8, bright: 5, pluck: true },
    musicbox: { name: 'Music box', gm: 10, p: [[1, 'sine', 1], [4, 'sine', 0.25], [6.8, 'sine', 0.08]], a: 0.003, decay: 1.4, bright: 12 },
    synth: { name: 'Synth lead', gm: 80, p: [[1, 'square', 0.5], [1, 'sawtooth', 0.35, 7]], a: 0.01, sustain: 0.75, release: 0.1, bright: 5, vib: 0.003 },
  };

  const voices = new Map(); // midi -> {stop}
  function synthNote(m, when = 0, dur = null, vel = 0.8, toneId) {
    const tone = TONES[toneId || state.settings.tone] || TONES.piano;
    const c = ac();
    const t0 = c.currentTime + Math.max(0, when);
    const f = T.freq(m);
    const out = c.createGain();
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = Math.min(12000, f * tone.bright + 800);
    if (tone.pluck) { // plucked string: filter closes as the note dies
      lp.frequency.setValueAtTime(Math.min(12000, f * 12), t0);
      lp.frequency.exponentialRampToValueAtTime(Math.max(200, f * 1.5), t0 + 0.6);
    }
    let chain = lp;
    if (tone.buzz) { // sitar "jawari" buzz: a resonant peak high up
      const pk = c.createBiquadFilter();
      pk.type = 'peaking'; pk.frequency.value = 2800; pk.Q.value = 4; pk.gain.value = 10;
      lp.connect(pk);
      chain = pk;
    }
    out.connect(lp);
    chain.connect(master);
    const peak = 0.28 * vel;
    const end = tone.decay ? t0 + tone.decay : null;
    out.gain.setValueAtTime(0.0001, t0);
    out.gain.exponentialRampToValueAtTime(peak, t0 + tone.a);
    if (tone.decay) {
      out.gain.exponentialRampToValueAtTime(peak * 0.35, t0 + tone.a + tone.decay * 0.11);
      out.gain.exponentialRampToValueAtTime(0.0001, end);
    } else {
      out.gain.setTargetAtTime(peak * tone.sustain, t0 + tone.a, 0.1);
    }
    let lfo = null;
    if (tone.vib) {
      lfo = c.createOscillator();
      lfo.frequency.value = 5.2;
      lfo.start(t0 + 0.25);
    }
    const oscs = tone.p.map(([mult, type, g, det]) => {
      const o = c.createOscillator();
      const og = c.createGain();
      o.type = type;
      o.frequency.value = f * mult;
      if (det) o.detune.value = det;
      if (tone.bend) {
        o.frequency.setValueAtTime(f * mult * tone.bend, t0);
        o.frequency.exponentialRampToValueAtTime(f * mult, t0 + 0.07);
      }
      if (lfo) { const lg = c.createGain(); lg.gain.value = f * mult * tone.vib; lfo.connect(lg).connect(o.frequency); }
      og.gain.value = g / tone.p.length * 1.6;
      o.connect(og).connect(out);
      o.start(t0);
      if (end) o.stop(end + 0.1);
      return o;
    });
    if (lfo && end) lfo.stop(end + 0.1);
    const stop = (at) => {
      const t = Math.max(at ?? c.currentTime, t0 + 0.02);
      out.gain.cancelScheduledValues(t);
      out.gain.setTargetAtTime(0.0001, t, tone.release ? tone.release / 3 : 0.08);
      const off = t + (tone.release || 0.25) * 2 + 0.3;
      oscs.forEach((o) => { try { o.stop(off); } catch (e) { /* already stopped */ } });
      if (lfo) try { lfo.stop(off); } catch (e) { /* already stopped */ }
    };
    if (dur != null) stop(t0 + dur);
    return { stop };
  }

  function midiOut() {
    return state.settings.promptsToKeyboard && PT.input && PT.input.output;
  }
  let sentProgram = null;

  PT.audio = {
    ac,
    TONES,
    // A drill can override the tone of example tunes (e.g. ear training with random tones).
    promptTone: null,
    get now() { return ac().currentTime; },
    // Sound for live key presses (computer keyboard / mouse / optional MIDI echo).
    liveOn(m, vel = 0.8) {
      if (voices.has(m)) voices.get(m).stop();
      voices.set(m, synthNote(m, 0, null, vel));
    },
    liveOff(m) { const v = voices.get(m); if (v) { v.stop(); voices.delete(m); } },
    // Play example notes: [{m, t(sec from now), d(sec)}]. Returns total duration in seconds.
    play(events) {
      const out = midiOut();
      const tone = PT.audio.promptTone || state.settings.tone;
      let end = 0;
      if (out && sentProgram !== tone) {
        out.send([0xc0, (TONES[tone] || TONES.piano).gm]); // program change on channel 1
        sentProgram = tone;
      }
      events.forEach((e) => {
        const dur = e.d ?? 0.5;
        end = Math.max(end, e.t + dur);
        if (out) {
          const base = performance.now() + e.t * 1000;
          out.send([0x90, e.m, 90], base);
          out.send([0x80, e.m, 0], base + dur * 1000);
        } else {
          synthNote(e.m, e.t, dur, e.v ?? 0.8, tone);
        }
      });
      PT.audio.busyUntil = performance.now() + end * 1000;
      return end;
    },
    note(m, dur = 0.7) { return PT.audio.play([{ m, t: 0, d: dur }]); },
    chord(ms, dur = 1.2, t = 0) { return PT.audio.play(ms.map((m) => ({ m, t, d: dur }))); },
    melody(ms, step = 0.55, start = 0) {
      return PT.audio.play(ms.map((m, i) => ({ m, t: start + i * step, d: step * 0.95 })));
    },
    // Pick a tone for an ear-training question (random if the setting asks for variety).
    earTone() {
      if (!state.settings.earToneVariety) { PT.audio.promptTone = null; return null; }
      const ids = Object.keys(TONES);
      PT.audio.promptTone = ids[Math.floor(Math.random() * ids.length)];
      return TONES[PT.audio.promptTone].name;
    },
    busyUntil: 0,
    isBusy() { return performance.now() < PT.audio.busyUntil; },
    click(accent = false, when = 0) {
      const c = ac();
      const t = c.currentTime + when;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = 'square';
      o.frequency.value = accent ? 1760 : 1100;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25 * state.settings.metronomeVolume, t + 0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      o.connect(g).connect(master);
      o.start(t);
      o.stop(t + 0.06);
    },
    // Small reward / error sounds (kept quiet so they don't fight the keyboard).
    ding() {
      const c = ac();
      [1318.5, 1975.5].forEach((f, i) => {
        const o = c.createOscillator(), g = c.createGain(), t = c.currentTime + i * 0.07;
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.08, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
        o.connect(g).connect(master); o.start(t); o.stop(t + 0.4);
      });
    },
    buzz() {
      const c = ac();
      const o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
      o.type = 'sawtooth'; o.frequency.value = 110;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      o.connect(g).connect(master); o.start(t); o.stop(t + 0.2);
    },
  };

  // Metronome with a look-ahead scheduler so it stays steady.
  PT.Metronome = class {
    constructor(bpm = 60, beatsPerBar = 4) { this.bpm = bpm; this.beats = beatsPerBar; this.timer = null; }
    start() {
      if (this.timer) return;
      const c = ac();
      this.next = c.currentTime + 0.1;
      this.n = 0;
      this.timer = setInterval(() => {
        while (this.next < c.currentTime + 0.12) {
          PT.audio.click(this.n % this.beats === 0, this.next - c.currentTime);
          const beatAt = this.next;
          const n = this.n;
          setTimeout(() => this.onBeat && this.onBeat(n), Math.max(0, (beatAt - c.currentTime) * 1000));
          this.next += 60 / this.bpm;
          this.n++;
        }
      }, 25);
    }
    stop() { clearInterval(this.timer); this.timer = null; }
    get running() { return !!this.timer; }
  };

  // ---------------- Input: MIDI + computer keyboard + mouse ----------------
  const held = new Set();
  const input = (PT.input = {
    held,
    access: null,
    output: null,
    inputs: [],
    status: 'none', // none | unsupported | denied | waiting | connected
    lastSource: null,
  });

  function noteOn(m, vel, src) {
    if (held.has(m)) noteOff(m, src);
    held.add(m);
    input.lastSource = src;
    if (src !== 'midi' || state.settings.appSoundForMidi) PT.audio.liveOn(m, vel / 127);
    PT.bus.emit('noteon', m, vel, src);
  }
  function noteOff(m, src) {
    if (!held.has(m)) return;
    held.delete(m);
    PT.audio.liveOff(m);
    PT.bus.emit('noteoff', m, src);
  }
  input.virtualOn = (m) => { ac(); noteOn(m, 90, 'mouse'); };
  input.virtualOff = (m) => noteOff(m, 'mouse');

  function onMidiMessage(e) {
    const [st, d1, d2] = e.data;
    const type = st & 0xf0, ch = st & 0x0f;
    if (state.settings.ignoreDrumChannel && ch === 9) return; // Casio rhythm drums
    if (type === 0x90 && d2 > 0) noteOn(d1, d2, 'midi');
    else if (type === 0x80 || (type === 0x90 && d2 === 0)) noteOff(d1, 'midi');
  }

  function refreshPorts() {
    const a = input.access;
    input.inputs = [...a.inputs.values()];
    input.inputs.forEach((i) => (i.onmidimessage = onMidiMessage));
    const outs = [...a.outputs.values()];
    input.output = outs.find((o) => /casio|ct-?x/i.test(o.name)) || outs[0] || null;
    input.status = input.inputs.length ? 'connected' : 'waiting';
    PT.bus.emit('midistatus', input.status, input.inputs.map((i) => i.name));
  }

  input.connect = async function () {
    if (!navigator.requestMIDIAccess) {
      input.status = 'unsupported';
      PT.bus.emit('midistatus', input.status, []);
      return;
    }
    try {
      input.access = await navigator.requestMIDIAccess({ sysex: false });
      input.access.onstatechange = refreshPorts;
      refreshPorts();
    } catch (e) {
      input.status = 'denied';
      PT.bus.emit('midistatus', input.status, []);
    }
  };

  // Computer keyboard: A W S E D F T G Y H U J K O L P ; = C..E (two rows like a piano). Z/X = octave.
  const QWERTY = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15, ';': 16 };
  input.qwertyOctave = 60;
  const downKeys = new Map();
  window.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, textarea, select')) return;
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === 'z') { input.qwertyOctave = Math.max(36, input.qwertyOctave - 12); PT.bus.emit('qwertyoctave', input.qwertyOctave); return; }
    if (k === 'x') { input.qwertyOctave = Math.min(84, input.qwertyOctave + 12); PT.bus.emit('qwertyoctave', input.qwertyOctave); return; }
    if (k in QWERTY && !downKeys.has(k)) {
      ac();
      const m = input.qwertyOctave + QWERTY[k];
      downKeys.set(k, m);
      noteOn(m, 90, 'qwerty');
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (downKeys.has(k)) { noteOff(downKeys.get(k), 'qwerty'); downKeys.delete(k); }
  });
  window.addEventListener('blur', () => { downKeys.forEach((m) => noteOff(m, 'qwerty')); downKeys.clear(); });
})();
