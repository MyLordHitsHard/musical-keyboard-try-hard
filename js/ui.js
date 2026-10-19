// UI helpers: DOM builder, on-screen piano, toasts, charts.
(function () {
  const PT = window.PT;
  const T = PT.theory;

  // h('div.card#id', {onclick, style}, children...)
  function h(sel, attrs, ...kids) {
    if (attrs == null || typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs)) {
      if (attrs != null) kids.unshift(attrs);
      attrs = {};
    }
    const [, tag = 'div', rest = ''] = /^([a-z0-9]*)(.*)$/i.exec(sel);
    const el = document.createElement(tag || 'div');
    (rest.match(/[.#][^.#]+/g) || []).forEach((p) => (p[0] === '.' ? el.classList.add(p.slice(1)) : (el.id = p.slice(1))));
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'html') el.innerHTML = v;
      else if (k in el && k !== 'list') el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    kids.flat(Infinity).forEach((c) => c != null && c !== false && el.append(c instanceof Node ? c : document.createTextNode(String(c))));
    return el;
  }

  function toast(msg, kind = '') {
    const box = document.getElementById('toasts');
    const t = h('div.toast' + (kind ? '.' + kind : ''), msg);
    box.append(t);
    setTimeout(() => t.classList.add('out'), 2200);
    setTimeout(() => t.remove(), 2700);
  }

  function labelFor(m, mode, tonic = 0) {
    const s = PT.store.settings;
    mode = mode || s.labels;
    if (mode === 'none') return T.pc(m) === 0 ? 'C' + T.octaveOf(m) : '';
    if (mode === 'sargam') return T.sargam(m, tonic);
    if (mode === 'both') return T.noteName(m) + '\n' + T.sargam(m, tonic);
    return T.pc(m) === 0 ? 'C' + T.octaveOf(m) : T.noteName(m);
  }

  // ---------------- On-screen piano ----------------
  class Piano {
    constructor(container, lo = 36, hi = 96) {
      this.container = container;
      this.tonic = 0;
      this.labelMode = null;
      this.keys = new Map();
      this.targets = new Map();
      this.setRange(lo, hi);
      this.unsub = [
        PT.bus.on('noteon', (m) => this.press(m, true)),
        PT.bus.on('noteoff', (m) => this.press(m, false)),
        PT.bus.on('settings', (k) => k === 'labels' && this.relabel()),
      ];
    }
    setRange(lo, hi) {
      while (T.isBlack(lo)) lo--;
      while (T.isBlack(hi)) hi++;
      this.lo = lo; this.hi = hi;
      this.render();
    }
    render() {
      const c = this.container;
      c.innerHTML = '';
      c.classList.add('piano');
      this.keys.clear();
      let whites = 0;
      for (let m = this.lo; m <= this.hi; m++) if (!T.isBlack(m)) whites++;
      const w = 100 / whites;
      let wi = 0;
      for (let m = this.lo; m <= this.hi; m++) {
        const black = T.isBlack(m);
        const k = h('div.key' + (black ? '.black' : '.white'), { 'data-m': m });
        if (black) {
          k.style.left = (wi * w - w * 0.3) + '%';
          k.style.width = w * 0.6 + '%';
        } else {
          k.style.left = wi * w + '%';
          k.style.width = w + '%';
          wi++;
        }
        k.append(h('span.lbl'), h('span.fing'));
        k.addEventListener('pointerdown', (e) => { e.preventDefault(); k.setPointerCapture(e.pointerId); PT.input.virtualOn(m); });
        const up = () => PT.input.virtualOff(m);
        k.addEventListener('pointerup', up);
        k.addEventListener('pointercancel', up);
        if (PT.input.held.has(m)) k.classList.add('down');
        c.append(k);
        this.keys.set(m, k);
      }
      this.relabel();
      this.setTargets(this.targets);
    }
    relabel() {
      this.keys.forEach((k, m) => (k.querySelector('.lbl').textContent = labelFor(m, this.labelMode, this.tonic)));
    }
    press(m, on) {
      const k = this.keys.get(m);
      if (k) k.classList.toggle('down', on);
    }
    // targets: Map or array of {m, finger, cls}
    setTargets(list) {
      this.keys.forEach((k) => {
        k.classList.remove('target', 'next', 'scale', 'hint', 'tonic');
        k.querySelector('.fing').textContent = '';
      });
      const map = new Map();
      (list instanceof Map ? [...list.values()] : list || []).forEach((t) => map.set(t.m + ':' + (t.cls || 'target'), t));
      this.targets = map;
      map.forEach((t) => {
        const k = this.keys.get(t.m);
        if (!k) return;
        k.classList.add(t.cls || 'target');
        if (t.finger && PT.store.settings.showFingers && (t.cls || 'target') === 'target') k.querySelector('.fing').textContent = t.finger;
      });
    }
    clear() { this.setTargets([]); }
    flash(m, cls = 'good', ms = 350) {
      const k = this.keys.get(m);
      if (!k) return;
      k.classList.remove('good', 'bad');
      void k.offsetWidth;
      k.classList.add(cls);
      clearTimeout(k._ft);
      k._ft = setTimeout(() => k.classList.remove(cls), ms);
    }
    destroy() { this.unsub.forEach((u) => u()); this.container.innerHTML = ''; }
  }

  // ---------------- Charts ----------------
  function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  // points: [{x: 'YYYY-MM-DD', y}] ; opts: {type:'line'|'bar', unit, lowerBetter, color}
  function chart(canvas, points, opts = {}) {
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth || 300, H = canvas.clientHeight || 160;
    canvas.width = W * dpr; canvas.height = H * dpr;
    const g = canvas.getContext('2d');
    g.scale(dpr, dpr);
    g.clearRect(0, 0, W, H);
    const fg = cssVar('--muted'), grid = cssVar('--line'), col = opts.color || cssVar('--accent');
    g.font = '11px system-ui, sans-serif';
    if (!points.length) {
      g.fillStyle = fg;
      g.textAlign = 'center';
      g.fillText('No data yet — practise and this fills in', W / 2, H / 2);
      return;
    }
    const pad = { l: 36, r: 10, t: 10, b: 22 };
    const ys = points.map((p) => p.y);
    let ymin = opts.zero ? 0 : Math.min(...ys), ymax = Math.max(...ys);
    if (ymin === ymax) { ymin = ymin * 0.8; ymax = ymax * 1.2 || 1; }
    const span = ymax - ymin;
    ymin = opts.zero ? 0 : ymin - span * 0.1; ymax += span * 0.1;
    const X = (i) => pad.l + (points.length === 1 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (points.length - 1));
    const Y = (v) => pad.t + (1 - (v - ymin) / (ymax - ymin)) * (H - pad.t - pad.b);
    g.strokeStyle = grid; g.fillStyle = fg; g.lineWidth = 1; g.textAlign = 'right';
    for (let i = 0; i <= 3; i++) {
      const v = ymin + ((ymax - ymin) * i) / 3, y = Y(v);
      g.beginPath(); g.moveTo(pad.l, y); g.lineTo(W - pad.r, y); g.stroke();
      g.fillText(fmt(v), pad.l - 4, y + 3);
    }
    g.textAlign = 'center';
    const every = Math.ceil(points.length / 6);
    points.forEach((p, i) => { if (i % every === 0 || i === points.length - 1) g.fillText(p.x.slice(5), X(i), H - 6); });
    if (opts.type === 'bar') {
      const bw = Math.max(3, Math.min(22, ((W - pad.l - pad.r) / points.length) * 0.6));
      g.fillStyle = col;
      points.forEach((p, i) => g.fillRect(X(i) - bw / 2, Y(p.y), bw, Y(ymin) - Y(p.y)));
    } else {
      g.strokeStyle = col; g.lineWidth = 2; g.beginPath();
      points.forEach((p, i) => (i ? g.lineTo(X(i), Y(p.y)) : g.moveTo(X(i), Y(p.y))));
      g.stroke();
      g.fillStyle = col;
      points.forEach((p, i) => { g.beginPath(); g.arc(X(i), Y(p.y), 3, 0, 7); g.fill(); });
    }
    function fmt(v) { return Math.abs(v) >= 100 ? Math.round(v) : Math.abs(v) >= 10 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100; }
  }

  // Aggregate history entries into per-day values.
  function daily(drillPrefix, field, how = 'avg', filter) {
    const by = {};
    PT.store.state.history.forEach((e) => {
      if (!e.d.startsWith(drillPrefix) || e[field] == null || (filter && !filter(e))) return;
      const d = new Date(e.t);
      const k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      (by[k] = by[k] || []).push(e[field]);
    });
    return Object.keys(by).sort().map((k) => {
      const a = by[k];
      const y = how === 'max' ? Math.max(...a) : how === 'min' ? Math.min(...a) : how === 'sum' ? a.reduce((x, y) => x + y, 0) : a.reduce((x, y) => x + y, 0) / a.length;
      return { x: k, y };
    });
  }

  function fmtTime(sec) {
    sec = Math.max(0, Math.round(sec));
    return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  }

  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };

  PT.ui = { h, toast, Piano, chart, daily, fmtTime, labelFor, shuffle, pick, mean, sd };
})();
