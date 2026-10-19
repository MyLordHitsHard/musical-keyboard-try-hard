// Music theory helpers: note names, sargam, chords, scales, keys.
(function () {
  const PT = (window.PT = window.PT || {});

  const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  // Lowercase = komal (flat), "Ma'" = tivra (sharp) Ma.
  const SARGAM = ['Sa', 're', 'Re', 'ga', 'Ga', 'ma', "Ma'", 'Pa', 'dha', 'Dha', 'ni', 'Ni'];
  const SOLFEGE = ['Do', 'Ra', 'Re', 'Me', 'Mi', 'Fa', 'Fi', 'Sol', 'Le', 'La', 'Te', 'Ti'];
  const LETTER_PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const FLAT_KEYS = new Set([5, 10, 3, 8, 1]); // F, Bb, Eb, Ab, Db

  const pc = (m) => ((m % 12) + 12) % 12;
  const isBlack = (m) => [1, 3, 6, 8, 10].includes(pc(m));
  const noteName = (m, flats) => (flats ? FLATS : SHARPS)[pc(m)];
  const octaveOf = (m) => Math.floor(m / 12) - 1;
  const noteNameOct = (m, flats) => noteName(m, flats) + octaveOf(m);
  const sargam = (m, tonic = 0) => SARGAM[pc(m - tonic)];
  const solfege = (m, tonic = 0) => SOLFEGE[pc(m - tonic)];
  const freq = (m) => 440 * Math.pow(2, (m - 69) / 12);

  function parsePc(s) {
    const mt = /^([A-Ga-g])([#b♯♭]?)/.exec(s.trim());
    if (!mt) return null;
    let p = LETTER_PC[mt[1].toUpperCase()];
    if (mt[2] === '#' || mt[2] === '♯') p += 1;
    if (mt[2] === 'b' || mt[2] === '♭') p -= 1;
    return pc(p);
  }

  // "C#4" -> 61
  function parseNote(s) {
    const mt = /^([A-G][#b]?)(-?\d)$/.exec(s.trim());
    if (!mt) return null;
    return parsePc(mt[1]) + (parseInt(mt[2], 10) + 1) * 12;
  }

  // ---- Chords ----
  // Ordered roughly by how common they are (used to rank chord detection).
  const CHORD_TYPES = [
    { id: '', name: 'major', iv: [0, 4, 7], alias: ['maj', 'M', 'major'] },
    { id: 'm', name: 'minor', iv: [0, 3, 7], alias: ['min', '-', 'mi', 'minor'] },
    { id: '7', name: 'dominant 7th', iv: [0, 4, 7, 10], alias: ['dom7', 'dom'] },
    { id: 'm7', name: 'minor 7th', iv: [0, 3, 7, 10], alias: ['min7', '-7', 'mi7'] },
    { id: 'maj7', name: 'major 7th', iv: [0, 4, 7, 11], alias: ['M7', 'Δ', 'Δ7', 'ma7', 'j7'] },
    { id: 'sus4', name: 'suspended 4th', iv: [0, 5, 7], alias: ['sus'] },
    { id: 'sus2', name: 'suspended 2nd', iv: [0, 2, 7], alias: [] },
    { id: '5', name: 'power chord', iv: [0, 7], alias: [] },
    { id: 'dim', name: 'diminished', iv: [0, 3, 6], alias: ['°', 'o', 'mb5'] },
    { id: 'aug', name: 'augmented', iv: [0, 4, 8], alias: ['+', '#5'] },
    { id: '6', name: 'major 6th', iv: [0, 4, 7, 9], alias: ['maj6', 'M6'] },
    { id: 'm6', name: 'minor 6th', iv: [0, 3, 7, 9], alias: ['min6', '-6'] },
    { id: 'add9', name: 'add 9', iv: [0, 4, 7, 14], alias: ['add2', '2'] },
    { id: 'madd9', name: 'minor add 9', iv: [0, 3, 7, 14], alias: ['madd2', 'm(add9)'] },
    { id: '7sus4', name: '7 sus4', iv: [0, 5, 7, 10], alias: ['7sus'] },
    { id: 'dim7', name: 'diminished 7th', iv: [0, 3, 6, 9], alias: ['°7', 'o7'] },
    { id: 'm7b5', name: 'half-diminished', iv: [0, 3, 6, 10], alias: ['ø', 'ø7', 'min7b5', '-7b5'] },
    { id: 'mmaj7', name: 'minor-major 7th', iv: [0, 3, 7, 11], alias: ['m(maj7)', 'mM7', 'minmaj7'] },
    { id: '9', name: 'dominant 9th', iv: [0, 4, 7, 10, 14], alias: [] },
    { id: 'maj9', name: 'major 9th', iv: [0, 4, 7, 11, 14], alias: ['M9'] },
    { id: 'm9', name: 'minor 9th', iv: [0, 3, 7, 10, 14], alias: ['min9', '-9'] },
  ];
  const SUFFIX = {};
  CHORD_TYPES.forEach((t) => {
    SUFFIX[t.id] = t;
    t.alias.forEach((a) => (SUFFIX[a] = t));
  });

  const CHORD_RE = /^([A-G])([#b♯♭]?)([^/\s]*)(?:\/([A-G][#b♯♭]?))?$/;

  // Parse "F#m7/A" -> { root, type, pcs, bass, name, approx }
  function parseChord(str) {
    const s = str.trim();
    const mt = CHORD_RE.exec(s);
    if (!mt) return null;
    const root = parsePc(mt[1] + mt[2]);
    let suf = mt[3];
    let type = SUFFIX[suf];
    let approx = false;
    if (!type) {
      // Unknown extension (e.g. 7b9, 13, 11): fall back to the closest simple chord.
      const isMinor = /^(m|min|-)(?!aj)/.test(suf);
      if (/^(m|min|-)?(7|9|11|13)/.test(suf)) type = SUFFIX[isMinor ? 'm7' : '7'];
      else type = SUFFIX[isMinor ? 'm' : ''];
      approx = true;
      if (!/^[0-9a-zA-Z#b+°ø()-]*$/.test(suf)) return null;
    }
    const bass = mt[4] ? parsePc(mt[4]) : root;
    const flats = mt[2] === 'b' || mt[2] === '♭' ? true : mt[2] ? false : FLAT_KEYS.has(root);
    const name = noteName(root, flats) + type.id + (bass !== root ? '/' + noteName(bass, flats) : '');
    return {
      root, type, bass, approx, flats, name,
      pcs: [...new Set(type.iv.map((i) => pc(root + i)))],
      original: str.trim(),
    };
  }

  function chordName(root, typeId, flats) {
    return noteName(root, flats === undefined ? FLAT_KEYS.has(root) : flats) + typeId;
  }

  // Right-hand root-position voicing, centred around middle C.
  function voicing(chord, opts = {}) {
    const base = (opts.octave ?? 4) * 12 + 12; // C4 = 60
    let root = base + chord.root;
    if (chord.root >= 7) root -= 12; // keep G..B below middle C so the hand stays central
    const notes = chord.type.iv.map((i) => root + (i > 12 ? i - 12 : i)).sort((a, b) => a - b);
    return [...new Set(notes)];
  }

  // Choose the inversion closest to the previous chord (smooth "voice leading").
  function voiceLead(prev, chord, lo = 53, hi = 79) {
    if (!prev || !prev.length) return voicing(chord);
    const base = voicing(chord);
    const cands = [];
    for (let shift = -24; shift <= 24; shift += 12) {
      for (let inv = 0; inv < base.length; inv++) {
        const v = base.map((n, i) => (i < inv ? n + 12 : n) + shift).sort((a, b) => a - b);
        if (v[0] >= lo && v[v.length - 1] <= hi) cands.push(v);
      }
    }
    if (!cands.length) return base;
    const pAvg = prev.reduce((a, b) => a + b, 0) / prev.length;
    const cost = (v) => {
      let c = 0;
      v.forEach((n) => (c += Math.min(...prev.map((p) => Math.abs(p - n)))));
      const avg = v.reduce((a, b) => a + b, 0) / v.length;
      return c + Math.abs(avg - pAvg) * 0.5 + Math.abs(avg - 64) * 0.15;
    };
    cands.sort((a, b) => cost(a) - cost(b));
    return cands[0];
  }

  function chordFingers(n) {
    return { 1: [1], 2: [1, 5], 3: [1, 3, 5], 4: [1, 2, 3, 5], 5: [1, 2, 3, 4, 5] }[n] || [];
  }

  // Name the chord formed by a set of MIDI notes ('' if none).
  function detectChord(midis) {
    if (!midis || midis.length < 2) return '';
    const sorted = [...midis].sort((a, b) => a - b);
    const pcs = [...new Set(sorted.map(pc))];
    const bass = pc(sorted[0]);
    const key = (arr) => [...arr].sort((a, b) => a - b).join(',');
    const target = key(pcs);
    let best = null;
    for (const root of pcs) {
      CHORD_TYPES.forEach((t, rank) => {
        const cp = [...new Set(t.iv.map((i) => pc(root + i)))];
        if (key(cp) === target) {
          const score = rank + (root === bass ? 0 : 3);
          if (!best || score < best.score) best = { root, t, score };
        }
      });
    }
    if (!best) return '';
    const flats = FLAT_KEYS.has(best.root);
    let nm = noteName(best.root, flats) + best.t.id;
    if (best.root !== bass) nm += '/' + noteName(bass, flats);
    return nm;
  }

  // ---- Scales & keys ----
  const MAJOR = [0, 2, 4, 5, 7, 9, 11];
  const MINOR = [0, 2, 3, 5, 7, 8, 10];

  // Beginner-friendly one-octave scales with standard fingering (ascending, 8 notes).
  const SCALES = [
    { id: 'C', name: 'C major', tonic: 60, steps: MAJOR, rh: [1, 2, 3, 1, 2, 3, 4, 5], lh: [5, 4, 3, 2, 1, 3, 2, 1] },
    { id: 'G', name: 'G major', tonic: 55, steps: MAJOR, rh: [1, 2, 3, 1, 2, 3, 4, 5], lh: [5, 4, 3, 2, 1, 3, 2, 1] },
    { id: 'D', name: 'D major', tonic: 62, steps: MAJOR, rh: [1, 2, 3, 1, 2, 3, 4, 5], lh: [5, 4, 3, 2, 1, 3, 2, 1] },
    { id: 'A', name: 'A major', tonic: 57, steps: MAJOR, rh: [1, 2, 3, 1, 2, 3, 4, 5], lh: [5, 4, 3, 2, 1, 3, 2, 1] },
    { id: 'E', name: 'E major', tonic: 64, steps: MAJOR, rh: [1, 2, 3, 1, 2, 3, 4, 5], lh: [5, 4, 3, 2, 1, 3, 2, 1] },
    { id: 'F', name: 'F major', tonic: 65, steps: MAJOR, rh: [1, 2, 3, 4, 1, 2, 3, 4], lh: [5, 4, 3, 2, 1, 3, 2, 1] },
    { id: 'Am', name: 'A minor', tonic: 57, steps: MINOR, rh: [1, 2, 3, 1, 2, 3, 4, 5], lh: [5, 4, 3, 2, 1, 3, 2, 1] },
    { id: 'Em', name: 'E minor', tonic: 64, steps: MINOR, rh: [1, 2, 3, 1, 2, 3, 4, 5], lh: [5, 4, 3, 2, 1, 3, 2, 1] },
    { id: 'Dm', name: 'D minor', tonic: 62, steps: MINOR, rh: [1, 2, 3, 1, 2, 3, 4, 5], lh: [5, 4, 3, 2, 1, 3, 2, 1] },
  ];

  function scaleNotes(tonic, steps) {
    return [...steps.map((s) => tonic + s), tonic + 12];
  }

  // Diatonic chords from roman numerals in a major key.
  const ROMAN = { I: [0, ''], ii: [2, 'm'], iii: [4, 'm'], IV: [5, ''], V: [7, ''], vi: [9, 'm'], 'vii°': [11, 'dim'], V7: [7, '7'], bVII: [10, ''] };
  function chordsInKey(keyPc, romans) {
    return romans.map((r) => {
      const [iv, t] = ROMAN[r];
      const root = pc(keyPc + iv);
      return parseChord(chordName(root, t, FLAT_KEYS.has(keyPc)));
    });
  }
  const PROGRESSIONS = [
    { id: 'pop', name: 'I – V – vi – IV (the "4 chord" pop song)', romans: ['I', 'V', 'vi', 'IV'] },
    { id: '50s', name: 'I – vi – IV – V (50s / Bollywood ballad)', romans: ['I', 'vi', 'IV', 'V'] },
    { id: 'sad', name: 'vi – IV – I – V (emotional pop)', romans: ['vi', 'IV', 'I', 'V'] },
    { id: 'blues', name: 'I – IV – I – V (simple blues/rock)', romans: ['I', 'IV', 'I', 'V'] },
    { id: 'jazz', name: 'ii – V – I (jazz)', romans: ['ii', 'V7', 'I', 'I'] },
    { id: 'three', name: 'I – IV – V – I (classic three-chord)', romans: ['I', 'IV', 'V', 'I'] },
  ];

  // Guess the key from a histogram of pitch classes (counts[0..11]).
  // Krumhansl-Kessler key profiles correlated against the histogram.
  const KK_MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const KK_MIN = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
  function corr(a, b) {
    const n = a.length, ma = a.reduce((x, y) => x + y) / n, mb = b.reduce((x, y) => x + y) / n;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < n; i++) { num += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
    return da && db ? num / Math.sqrt(da * db) : 0;
  }
  function guessKeys(counts) {
    const res = [];
    for (let k = 0; k < 12; k++) {
      const rot = counts.map((_, i) => counts[(i + k) % 12]);
      res.push({ tonic: k, minor: false, score: corr(rot, KK_MAJ) });
      res.push({ tonic: k, minor: true, score: corr(rot, KK_MIN) });
    }
    return res.sort((a, b) => b.score - a.score).map((r) => ({
      ...r,
      name: noteName(r.tonic, FLAT_KEYS.has(r.minor ? pc(r.tonic + 3) : r.tonic)) + (r.minor ? ' minor' : ' major'),
    }));
  }
  function keyChords(tonic, minor) {
    const maj = minor ? pc(tonic + 3) : tonic;
    const ch = chordsInKey(maj, ['I', 'ii', 'iii', 'IV', 'V', 'vi']);
    return minor ? [ch[5], ch[3], ch[0], ch[1], ch[4], ch[2]] : ch; // put the minor tonic first
  }

  // Pull chord symbols out of a pasted chord sheet (lyrics with chords).
  const TOKEN_RE = /^[A-G][#b]?(?:m|min|maj|M|dim|aug|sus|add|°|ø|\+|-)?(?:\d{1,2})?(?:sus[24]?|add\d{1,2}|maj\d|b5|#5|b9|#9|#11|b13|\(maj7\)|\(add9\))*(?:\/[A-G][#b]?)?$/;
  function extractChords(text) {
    const out = [];
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      // [C]lyrics style
      const bracketed = [...line.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1].trim());
      if (bracketed.length) {
        bracketed.forEach((t) => TOKEN_RE.test(t) && out.push(t));
        continue;
      }
      const tokens = line.split(/[\s|,]+/).filter(Boolean);
      const chordTokens = tokens.filter((t) => TOKEN_RE.test(t.replace(/[.:*]+$/, '')));
      // A line counts as a "chord line" if most of its words are chords (avoids the word "A").
      if (chordTokens.length && chordTokens.length / tokens.length >= 0.6) {
        chordTokens.forEach((t) => out.push(t.replace(/[.:*]+$/, '')));
      }
    }
    return out.map(parseChord).filter(Boolean);
  }

  function transposeChord(ch, semis) {
    const root = pc(ch.root + semis);
    const bass = pc(ch.bass + semis);
    const flats = FLAT_KEYS.has(root);
    const name = noteName(root, flats) + ch.type.id + (bass !== root ? '/' + noteName(bass, flats) : '');
    return parseChord(name);
  }

  const INTERVALS = [
    { semis: 1, short: 'm2', name: 'minor 2nd', up: 'Jaws theme', down: 'Für Elise (start)' },
    { semis: 2, short: 'M2', name: 'major 2nd', up: 'Happy Birthday ("Hap-py BIRTH")', down: 'Mary Had a Little Lamb' },
    { semis: 3, short: 'm3', name: 'minor 3rd', up: 'Greensleeves', down: 'Hey Jude ("Hey Jude")' },
    { semis: 4, short: 'M3', name: 'major 3rd', up: 'When the Saints ("Oh when")', down: 'Swing Low, Sweet Chariot' },
    { semis: 5, short: 'P4', name: 'perfect 4th', up: 'Here Comes the Bride', down: 'O Come All Ye Faithful' },
    { semis: 6, short: 'TT', name: 'tritone', up: 'The Simpsons ("The Simp-")', down: 'YYZ (Rush)' },
    { semis: 7, short: 'P5', name: 'perfect 5th', up: 'Twinkle Twinkle ("Twin-kle twin")', down: 'Flintstones ("Flint-stones")' },
    { semis: 8, short: 'm6', name: 'minor 6th', up: 'The Entertainer (3rd-4th note)', down: 'Love Story theme' },
    { semis: 9, short: 'M6', name: 'major 6th', up: 'My Bonnie Lies Over the Ocean', down: 'Nobody Knows the Trouble' },
    { semis: 10, short: 'm7', name: 'minor 7th', up: 'Star Trek original theme', down: 'Watermelon Man' },
    { semis: 11, short: 'M7', name: 'major 7th', up: 'Take On Me (chorus jump)', down: 'I Love You (Cole Porter)' },
    { semis: 12, short: 'P8', name: 'octave', up: 'Somewhere Over the Rainbow', down: 'Willow Weep for Me' },
  ];

  Object.assign(PT, {
    theory: {
      SHARPS, FLATS, SARGAM, SOLFEGE, MAJOR, MINOR, SCALES, CHORD_TYPES, PROGRESSIONS, INTERVALS, FLAT_KEYS,
      pc, isBlack, noteName, noteNameOct, octaveOf, sargam, solfege, freq, parsePc, parseNote,
      parseChord, chordName, voicing, voiceLead, chordFingers, detectChord,
      scaleNotes, chordsInKey, guessKeys, keyChords, extractChords, transposeChord,
    },
  });
})();
