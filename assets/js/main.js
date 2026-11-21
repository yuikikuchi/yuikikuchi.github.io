/* ==========================================================================
   METASYSTEM — 総合結線図
   ライブラリなし。線はすべて、DOM の位置から計算して SVG に描いている。
   スクロールの位置が「通電の先頭」になり、そこまでの線に色が入る。
   ========================================================================== */
(() => {
  'use strict';

  const root = document.documentElement;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const f1 = (n) => Math.round(n * 10) / 10;

  const sheet = $('#sheet');
  const back = $('#wiresBack');
  const front = $('#wiresFront');
  const wm = $('#wm');
  if (!sheet || !back || !front || !wm) return;

  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let still = motion.matches;

  // 幹線の並び（左から）。IC の左のピン → 上のレーン → 左の幹線、の順に対応させると線が交差しない。
  const IDS = ['gnd', 'hitl', 'mem', 'eval', 'guard', 'tool', 'ctx'];
  const HEAD = 0.78;      // 通電の先頭は、画面の上から 78% の高さ
  const SIDE = 3;         // 横へ走る線は、縦の3倍の速さで通電する
  const INTRO = { dur: 1500, gap: 90 };

  let paths = [];         // { wire, kind, i, segs, len, hero, fixed, cur, live, dim, on[], gs[], owner }
  let owners = new Map(); // 端子の持ち主（行・箱）→ そこへ入る線
  let sheetTop = 0;
  let introAt = 0;
  let raf = 0;
  let traced = null;
  let lastW = 0;
  let lastH = 0;
  let CAP = 0.69;         // 大文字の高さ ÷ 文字サイズ（フォントを読んだあとに測り直す）
  const LS = 0.035;       // ワードマークの字間（CSS の .wm の letter-spacing と対）
  const BEAR = { M: [0.07, 0.07], S: [0.04, 0.04], A: [0.01, 0.01] };   // 文字の左・右の余白（em）。これも測り直す

  /* ───────── ワードマークを幅いっぱいに合わせる ───────── */
  function fitWordmark() {
    const lines = $$('.wm__line', wm);
    const stack = matchMedia('(max-width: 899px)').matches;   // これより狭いと、1行では文字が線に埋もれる
    wm.classList.toggle('wm--stack', stack);
    const box = wm.parentElement;
    const bs = getComputedStyle(box);
    const avail = box.clientWidth - parseFloat(bs.paddingLeft) - parseFloat(bs.paddingRight);
    if (!(avail > 0)) return;
    // 文字の左右には余白があるので、そのぶんだけ大きくして、インクの端を本文の端にそろえる
    const fit = (w100, first, last) => f1((100 * avail) / (w100 - 100 * (BEAR[first][0] + BEAR[last][1] - LS))) + 'px';
    if (stack) {
      wm.style.fontSize = '';
      [['M', 'A'], ['S', 'M']].forEach(([first, last], i) => {
        const l = lines[i];
        l.style.marginLeft = f1(-BEAR[first][0] * 1000) / 1000 + 'em';
        l.style.fontSize = '100px';
        l.style.fontSize = fit(l.getBoundingClientRect().width, first, last);
      });
    } else {
      lines.forEach((l) => { l.style.fontSize = ''; l.style.marginLeft = ''; });
      lines[0].style.marginLeft = f1(-BEAR.M[0] * 1000) / 1000 + 'em';
      wm.style.fontSize = '100px';
      wm.style.fontSize = fit(lines.reduce((s, l) => s + l.getBoundingClientRect().width, 0), 'M', 'M');
    }
  }

  function measureCap() {
    try {
      const cs = getComputedStyle(wm);
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.font = `${cs.fontWeight} 200px ${cs.fontFamily}`;
      const m = ctx.measureText('M');
      if (m.actualBoundingBoxAscent > 60) CAP = m.actualBoundingBoxAscent / 200;
      for (const ch of Object.keys(BEAR)) {
        const g = ctx.measureText(ch);
        const l = -g.actualBoundingBoxLeft / 200;
        const r = (g.width - g.actualBoundingBoxRight) / 200;
        if (Math.abs(l) < 0.2 && Math.abs(r) < 0.2) BEAR[ch] = [l, r];
      }
    } catch (e) { /* 測れなければ既定の値のまま */ }
  }

  /* ───────── 直角に曲がる線を、角を丸めて組む ─────────
     戻り値の segs は「縦に下りる区間」と「横・角の区間」の並び。通電の長さの計算に使う。 */
  function route(raw, r) {
    const pts = raw.filter((p, i) => i === 0 || Math.hypot(p[0] - raw[i - 1][0], p[1] - raw[i - 1][1]) > 0.5);
    const segs = [];
    const marks = [0];   // 各頂点までの長さ
    const cuts = [0];    // 各頂点までの区間の数
    let d = `M${f1(pts[0][0])} ${f1(pts[0][1])}`;
    let len = 0;
    let cur = pts[0];
    const line = (a, b) => {
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (l < 0.05) return;
      const down = Math.abs(b[0] - a[0]) < 0.05 && b[1] > a[1];
      segs.push({ v: down, y: a[1], len: l, x0: a[0], y0: a[1], x1: b[0], y1: b[1] });
      len += l;
      d += `L${f1(b[0])} ${f1(b[1])}`;
    };
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      const n = pts[i + 1];
      if (!n) { line(cur, p); marks.push(len); cuts.push(segs.length); break; }
      const a = pts[i - 1];
      const l1 = Math.hypot(p[0] - a[0], p[1] - a[1]);
      const l2 = Math.hypot(n[0] - p[0], n[1] - p[1]);
      const rr = Math.min(r, l1 / 2, l2 / 2);
      const u1 = [(p[0] - a[0]) / l1, (p[1] - a[1]) / l1];
      const u2 = [(n[0] - p[0]) / l2, (n[1] - p[1]) / l2];
      const s = [p[0] - u1[0] * rr, p[1] - u1[1] * rr];
      const e = [p[0] + u2[0] * rr, p[1] + u2[1] * rr];
      line(cur, s);
      const sweep = u1[0] * u2[1] - u1[1] * u2[0] > 0 ? 1 : 0;
      d += `A${f1(rr)} ${f1(rr)} 0 0 ${sweep} ${f1(e[0])} ${f1(e[1])}`;
      const arc = (Math.PI * rr) / 2;
      const cx = s[0] + u2[0] * rr;
      const cy = s[1] + u2[1] * rr;
      const a0 = Math.atan2(s[1] - cy, s[0] - cx);
      let da = Math.atan2(e[1] - cy, e[0] - cx) - a0;
      if (da > Math.PI) da -= 2 * Math.PI; else if (da < -Math.PI) da += 2 * Math.PI;
      segs.push({ v: false, y: Math.min(s[1], e[1]), len: arc, arc: true, cx, cy, r: rr, a0, da });
      len += arc;
      marks.push(len);
      cuts.push(segs.length);
      cur = e;
    }
    return { d, segs, len, marks, cuts };
  }

  // 通電の先頭が h（図面の上からの距離）にあるとき、この線の何 px まで色が入るか
  // 先頭から p.fixed 個の区間（ヒーローの中）は、スクロールに関係なく通電している
  function powered(p, h) {
    let s = 0;
    for (let i = 0; i < p.segs.length; i++) {
      const g = p.segs[i];
      s += i < p.fixed ? g.len : g.v ? clamp(h - g.y, 0, g.len) : clamp((h - g.y) * SIDE, 0, g.len);
    }
    return s;
  }

  // 線の上の、始点から s px の位置と向き
  function pointAt(p, s) {
    for (const g of p.segs) {
      if (s <= g.len) {
        if (g.arc) {
          const a = g.a0 + (g.da * s) / g.len;
          const k = g.da > 0 ? 1 : -1;
          return [g.cx + Math.cos(a) * g.r, g.cy + Math.sin(a) * g.r, -Math.sin(a) * k, Math.cos(a) * k];
        }
        const dx = (g.x1 - g.x0) / g.len;
        const dy = (g.y1 - g.y0) / g.len;
        return [g.x0 + dx * s, g.y0 + dy * s, dx, dy];
      }
      s -= g.len;
    }
    return null;
  }

  /* ───────── 光の粒：通電している線の上を流れる ─────────
     SVG の線をアニメーションさせると、線の外接する四角（ほぼ画面全体）を毎フレーム塗り直すことになって重い。
     そこで、粒だけを小さなキャンバスに描く。
       trunk … 左の余白（幹線と枝）。画面に固定
       back  … ワードマークのまわり。文字の「下」
       over  … 同じ場所。文字の「上」（線が文字の上を通る所の粒だけ） */
  const pulses = (() => {
    const PERIOD = 260;   // 粒と粒の間隔
    const SPEED = 100;    // 速さ（px／秒）
    const HALF = 4.5;     // 粒の長さの半分
    const els = { trunk: $('#pulseTrunk'), back: $('#pulseBack'), over: $('#pulseOver') };
    if (!els.trunk || !els.back || !els.over) return { place() {}, ink() {}, run() {}, fast() {} };
    const cx = { trunk: els.trunk.getContext('2d'), back: els.back.getContext('2d'), over: els.over.getContext('2d') };
    let dpr = 1, split = 0, hero = { x: 0, y: 0, w: 0, h: 0 }, vh = 0, lw = 2;
    let glint = '#fff', glintGnd = '#F2EFE6';
    let travel = 0, last = 0, id = 0, speed = 1, drew = { trunk: false, back: false, over: false };
    // 描画が追いつかない環境（GPU なしのリモートデスクトップなど）では、粒を描く回数を自動で減らす
    let ema = 16.7, slow = 0, quick = 0, stride = 1, count = 0;

    function size(c, ctx, w, h) {
      c.style.width = w + 'px'; c.style.height = h + 'px';
      c.width = Math.max(1, Math.round(w * dpr)); c.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineCap = 'round';
    }
    function tall() {
      vh = innerHeight;
      size(els.trunk, cx.trunk, split, vh);
    }
    // 配線を引き直すたびに、キャンバスの位置と大きさを合わせる
    function place(o) {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      split = Math.round(o.split);
      lw = Math.max(1.2, o.WW * 0.42);
      els.trunk.style.left = Math.round(o.sr.left) + 'px';
      tall();
      hero = { x: split, y: Math.floor(o.top), w: Math.max(1, Math.ceil(o.W - split)), h: Math.max(1, Math.ceil(o.bottom - o.top)) };
      for (const k of ['back', 'over']) {
        els[k].style.left = hero.x + 'px'; els[k].style.top = hero.y + 'px';
        size(els[k], cx[k], hero.w, hero.h);
      }
      run();
    }
    function ink() {
      glintGnd = getComputedStyle(root).getPropertyValue('--paper').trim() || glintGnd;
    }
    function clear(k, w, h) { if (drew[k]) { cx[k].clearRect(0, 0, w, h); drew[k] = false; } }
    function dash(k, p, x, y, dx, dy) {
      const c = cx[k];
      c.strokeStyle = p.wire === 'gnd' ? glintGnd : glint;
      c.beginPath();
      c.moveTo(x - dx * HALF, y - dy * HALF);
      c.lineTo(x + dx * HALF, y + dy * HALF);
      c.stroke();
      drew[k] = true;
    }
    function tick(now) {
      id = 0;
      const dt = Math.min(64, now - (last || now));
      last = now;
      travel += (dt / 1000) * SPEED * speed;
      ema += (dt - ema) * 0.06;
      slow = ema > 27 ? slow + dt : 0;
      quick = ema < 19 ? quick + dt : 0;
      if (slow > 2000 && stride < 4) { stride *= 2; slow = 0; }          // 60 → 30 → 15 回／秒
      else if (quick > 5000 && stride > 1) { stride /= 2; quick = 0; }
      if (count++ % stride) { id = requestAnimationFrame(tick); return; }
      const top = scrollY - sheetTop;          // 画面の上の端（図面の座標）
      const heroSeen = top < hero.y + hero.h && top + vh > hero.y;
      clear('trunk', split, vh);
      clear('back', hero.w, hero.h);
      clear('over', hero.w, hero.h);
      for (const k of ['trunk', 'back', 'over']) { cx[k].lineWidth = lw; cx[k].globalAlpha = 0.9; }
      for (const p of paths) {
        if (p.dim || p.cur < 12) continue;
        if (p.kind === 'tap' && !p.live) continue;
        const end = p.cur - HALF - 1;
        for (let s = (travel + p.i * 97 + (p.kind === 'tap' ? 40 : 0)) % PERIOD; s < end; s += PERIOD) {
          if (s < HALF) continue;
          const q = pointAt(p, s);
          if (!q) break;
          const x = q[0], y = q[1];
          if (x < split) {
            if (y > top - 12 && y < top + vh + 12) dash('trunk', p, x, y - top, q[2], q[3]);
          } else if (heroSeen) {
            // ワードマークの中：この線が上を通る文字の所だけ、手前のキャンバスに描く
            let over = false;
            if (p.over && y > p.top && y < p.bottom) for (const l of p.over) if (x >= l.l && x <= l.r) { over = true; break; }
            dash(over ? 'over' : 'back', p, x - hero.x, y - hero.y, q[2], q[3]);
          }
        }
      }
      if (!still && !document.hidden) id = requestAnimationFrame(tick);
    }
    function run() {
      if (still) { drew = { trunk: true, back: true, over: true }; clear('trunk', split, vh); clear('back', hero.w, hero.h); clear('over', hero.w, hero.h); return; }
      if (!id && !document.hidden) { last = 0; id = requestAnimationFrame(tick); }
    }
    addEventListener('resize', () => { if (innerHeight !== vh) tall(); });
    document.addEventListener('visibilitychange', run);
    return { place, ink, run, fast(v) { speed = v ? 2 : 1; } };
  })();

  /* ───────── 配線を描く ───────── */
  function layout() {
    fitWordmark();

    const sr = sheet.getBoundingClientRect();
    const W = sr.width;
    const H = sr.height;
    sheetTop = sr.top + scrollY;
    lastW = Math.round(W);
    lastH = Math.round(H);

    const cs = getComputedStyle(root);
    const num = (n) => parseFloat(cs.getPropertyValue(n)) || 0;
    const TX = num('--trunk-x');
    const P = num('--pitch');
    const WW = num('--wire');
    const EDGE = 0.6 + WW * 0.4;                              // ふちの線
    const CASE = Math.min(6, 2 * P - 2 * WW - EDGE - 0.2);    // 交差する所のすき間（となりの線にかからない幅まで）
    const R = WW * 2 + 1;                                     // 角の丸み
    const tx = (i) => TX + i * P + WW / 2;

    const pos = (el) => {
      const r = el.getBoundingClientRect();
      return { l: r.left - sr.left, t: r.top - sr.top, r: r.right - sr.left, b: r.bottom - sr.top, w: r.width, h: r.height, cx: r.left - sr.left + r.width / 2, cy: r.top - sr.top + r.height / 2 };
    };

    // ワードマークのレーン：線が文字の中を横切る高さ
    const lines = $$('.wm__line', wm).map((l) => {
      const fs = parseFloat(getComputedStyle(l).fontSize);
      return { base: pos($('.wm__base', l)).b, cap: fs * CAP, letters: $$('.wm__c', l).map(pos) };
    });
    const stacked = Math.abs(lines[0].base - lines[1].base) > 4;
    const lanes = [];
    const spread = (line, letters, n, from, to) => {
      for (let k = 0; k < n; k++) {
        const f = n === 1 ? 0.5 : from + ((to - from) * k) / (n - 1);
        lanes.push({ y: line.base - line.cap + line.cap * f, top: line.base - line.cap * 1.25, bottom: line.base + line.cap * 0.25, letters });
      }
    };
    if (stacked) {
      spread(lines[0], lines[0].letters, 4, 0.15, 0.85);
      spread(lines[1], lines[1].letters, 3, 0.2, 0.8);
    } else {
      spread(lines[0], lines[0].letters.concat(lines[1].letters), 7, 0.11, 0.89);
    }

    const pins = IDS.map((id) => pos($(`.ic__pins [data-pin="${id}"]`)));
    const ends = {};
    $$('.term[data-end]').forEach((t) => { ends[t.dataset.end] = { p: pos(t), el: t }; });

    paths = [];
    owners = new Map();
    const own = (el, p) => {
      if (!el) return;
      p.owner = el;
      if (!owners.has(el)) owners.set(el, []);
      owners.get(el).push(p);
    };

    const wire = (cls, id, d, k, gap = CASE) =>
      `<g class="wire ${cls} w-${id}" data-k="${k}">` +
      `<path class="w-case" d="${d}" stroke-width="${WW + gap}"/>` +
      `<path class="w-edge" d="${d}" stroke-width="${WW + EDGE}"/>` +
      `<path class="w-off" d="${d}" stroke-width="${WW}"/>` +
      `<path class="w-on" d="${d}" stroke-width="${WW}" stroke-dasharray="0 99999"/>` +
      `</g>`;

    let b = '';
    let fdefs = '';
    let fbody = '';

    // 幹線：IC のピン → ワードマークを横切る → 左の余白を下りる → 行き先の端子
    IDS.forEach((id, i) => {
      const pin = pins[i];
      const lane = lanes[i];
      const x = tx(i);
      const head = [[pin.cx, pin.b], [pin.cx, lane.y], [x, lane.y]];
      const e = ends[id];
      const pts = head.concat(e ? [[x, e.p.cy], [e.p.l + 2, e.p.cy]] : [[x, H - 24]]);
      const r = route(pts, R);
      const k = paths.length;
      const over = lane.letters.filter((_, j) => (i + j) % 2 === 0);   // この線が「上」を通る文字
      const p = { wire: id, kind: 'trunk', i, segs: r.segs, len: r.len, hero: r.marks[2] || 0, fixed: r.cuts[2] || 0, cur: -1, live: false, dim: false, on: [], gs: [], over, top: lane.top, bottom: lane.bottom };
      paths.push(p);
      if (e) own(e.el.closest('[data-live]'), p);
      b += wire('trunk', id, r.d, k);

      // 手前のレイヤー：1文字おきに、線が文字の「上」を通る
      const hr = route(head.concat([[x, lane.y + 70]]), R);
      const rects = over
        .map((l) => `<rect x="${f1(l.l)}" y="${f1(lane.top)}" width="${f1(l.w)}" height="${f1(lane.bottom - lane.top)}"/>`)
        .join('');
      fdefs += `<clipPath id="weave${i}">${rects}</clipPath>`;
      // 文字の上では、線のまわりのすき間を細くする（文字を切り刻まない）
      fbody += `<g clip-path="url(#weave${i})">${wire('trunk over', id, hr.d, k, EDGE + 2)}</g>`;
    });

    // 枝：幹線から、各セクションの端子へ
    let dots = '';
    $$('.term[data-tap]').forEach((t) => {
      const id = t.dataset.tap;
      const i = IDS.indexOf(id);
      if (i < 0) return;
      const tp = pos(t);
      const x = tx(i);
      const r = route([[x, tp.cy], [tp.l + 2, tp.cy]], R);
      const k = paths.length;
      const p = { wire: id, kind: 'tap', i, segs: r.segs, len: r.len, hero: 0, fixed: 0, cur: -1, live: false, dim: false, on: [], gs: [] };
      paths.push(p);
      own(t.closest('[data-live]'), p);
      b += wire('tap', id, r.d, k);
      dots += `<circle class="dot" cx="${f1(x)}" cy="${f1(tp.cy)}" r="${f1(Math.max(3, WW * 0.88))}"/>`;
    });

    back.innerHTML = b + dots;
    front.innerHTML = `<defs>${fdefs}</defs>${fbody}`;
    pulses.place({ sr, W, WW, split: num('--gutter') + 70, top: Math.min(...pins.map((q) => q.b)) - 4, bottom: Math.max(...lanes.map((l) => l.bottom)) + 90 });

    $$('g.wire', sheet).forEach((g) => {
      const p = paths[+g.dataset.k];
      if (!p) return;
      p.gs.push(g);
      p.on.push($('.w-on', g));
    });

    if (traced) trace(traced);
    owners.forEach((_, el) => el.classList.remove('is-live'));
    frame(performance.now());
  }

  /* ───────── スクロール → 通電 ───────── */
  const secs = $$('main > section[id]');
  const pinLinks = new Map($$('.pinout a').map((a) => [a.getAttribute('href').slice(1), a]));
  const meter = $('#meter');
  let lastMeter = -1;
  let lastSec = '';

  function frame(now) {
    raf = 0;
    const vh = innerHeight;
    const sy = scrollY;
    const max = Math.max(1, root.scrollHeight - vh);

    let h = sy + vh * HEAD - sheetTop;
    const rem = max - sy;
    const tail = vh * 0.7;
    if (rem < tail) h += (1 - rem / tail) * vh * 0.6;   // 最後は、図面の下の端まで届かせる
    if (still) h = 1e7;

    let t = Infinity;
    if (introAt) {
      t = now - introAt;
      if (t > INTRO.dur + INTRO.gap * IDS.length + 60) {
        introAt = 0;
        t = Infinity;
      }
    }

    for (const p of paths) {
      let L = powered(p, h);
      if (t !== Infinity && p.kind === 'trunk') {
        const k = clamp((t - p.i * INTRO.gap) / INTRO.dur, 0, 1);
        const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
        L = Math.min(L, e * (p.hero + vh));
      }
      if (Math.abs(L - p.cur) < 0.4) continue;
      p.cur = L;
      const full = L >= p.len - 0.6;
      const v = full ? 'none' : `${f1(L)} ${Math.ceil(p.len) + 40}`;
      for (const el of p.on) el.setAttribute('stroke-dasharray', v);
      if (full !== p.live) {
        p.live = full;
        for (const g of p.gs) g.classList.toggle('is-live', full);
      }
    }

    owners.forEach((list, el) => {
      const live = list.every((p) => p.live);
      if (live !== el.classList.contains('is-live')) el.classList.toggle('is-live', live);
    });

    const pct = still ? 100 : Math.round(clamp(sy / max, 0, 1) * 100);
    if (meter && pct !== lastMeter) { lastMeter = pct; meter.textContent = String(pct).padStart(3, '0'); }

    let curId = '';
    for (const s of secs) if (s.getBoundingClientRect().top <= vh * 0.5) curId = s.id;
    if (curId !== lastSec) {
      lastSec = curId;
      pinLinks.forEach((a, id) => {
        const on = id === curId;
        a.classList.toggle('is-on', on);
        if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
      });
    }

    if (introAt) request();
  }
  const request = () => { if (!raf) raf = requestAnimationFrame(frame); };

  /* ───────── 回路の追跡：指した行の線だけを残す ───────── */
  function trace(ids) {
    traced = ids;
    for (const p of paths) {
      p.dim = !!ids && !ids.includes(p.wire);
      for (const g of p.gs) g.classList.toggle('is-dim', p.dim);
    }
  }
  $$('[data-trace]').forEach((el) => {
    const ids = el.dataset.trace.split(/\s+/);
    el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') trace(ids); });
    el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') trace(null); });
  });

  /* ───────── 現れ方（見出しなど） ───────── */
  const rvs = $$('.rv');
  if ('IntersectionObserver' in window && !still) {
    const io = new IntersectionObserver((list) => {
      list.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -14% 0px', threshold: 0.08 });
    rvs.forEach((el) => io.observe(el));
  } else {
    rvs.forEach((el) => el.classList.add('in'));
  }

  /* ───────── IC の中：確率的なノイズ ───────── */
  const noise = (() => {
    const c = $('#noise');
    const ic = $('#ic');
    if (!c || !ic) return { size() {}, ink() {}, run() {} };
    const ctx = c.getContext('2d');
    const GLYPHS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモ0123456789{}[]()<>=+-*/#%&?!;:'.split('');
    const pick = () => GLYPHS[(Math.random() * GLYPHS.length) | 0];
    const tempEl = $('#temp');
    let w = 0, h = 0, cell = 11, cols = 0, rows = 0, cells = [];
    let color = '#131518';
    let temp = 0.1;
    let seen = true;
    let last = 0;
    let id = 0;

    function size() {
      const r = c.getBoundingClientRect();
      if (!r.width) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width; h = r.height;
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cell = w < 130 ? 9 : 11;
      cols = Math.ceil(w / cell); rows = Math.ceil(h / cell);
      cells = Array.from({ length: cols * rows }, () => ({ g: pick(), a: Math.random() }));
      draw(true);
    }
    // all が真なら全部、偽なら「温度」の確率で選ばれたマスだけを描き直す
    function draw(all) {
      if (all) ctx.clearRect(0, 0, w, h);
      ctx.font = `${cell - 1}px "IBM Plex Mono", ui-monospace, monospace`;
      ctx.textBaseline = 'top';
      ctx.fillStyle = color;
      for (let i = 0; i < cells.length; i++) {
        const k = cells[i];
        const x = (i % cols) * cell;
        const y = ((i / cols) | 0) * cell;
        if (!all) {
          if (Math.random() >= temp) continue;
          k.g = pick(); k.a = Math.random();
          ctx.clearRect(x, y, cell, cell);
        }
        ctx.globalAlpha = 0.12 + k.a * 0.6;
        ctx.fillText(k.g, x + 1, y + 1);
      }
      ctx.globalAlpha = 1;
    }
    function tick(now) {
      id = 0;
      if (now - last > 85) { last = now; draw(false); }
      if (seen && !still) id = requestAnimationFrame(tick);
    }
    const run = () => { if (!id && seen && !still) id = requestAnimationFrame(tick); };
    function ink() {
      color = getComputedStyle(root).getPropertyValue('--ink').trim() || color;
      draw(true);
    }
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((l) => { seen = l[0].isIntersecting; run(); }).observe(c);
    }
    const body = $('.ic__body', ic);
    body.addEventListener('pointerenter', () => { temp = 0.55; if (tempEl) tempEl.textContent = 'T=1.5'; });
    body.addEventListener('pointerleave', () => { temp = 0.1; if (tempEl) tempEl.textContent = 'T=0.7'; });
    return { size, ink, run };
  })();

  /* ───────── 配色の切り替え ───────── */
  const themeBtn = $('#theme');
  const dark = matchMedia('(prefers-color-scheme: dark)');
  const isDark = () => {
    const t = root.getAttribute('data-theme');
    return t ? t === 'dark' : dark.matches;
  };
  function syncTheme() {
    const d = isDark();
    $$('meta[name="theme-color"]').forEach((m) => { m.removeAttribute('media'); m.setAttribute('content', d ? '#0B0E13' : '#F2EFE6'); });
    if (themeBtn) themeBtn.setAttribute('aria-pressed', String(d));
    noise.ink();
    pulses.ink();
  }
  if (themeBtn) {
    themeBtn.addEventListener('click', () => {
      const next = isDark() ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('ms-theme', next); } catch (e) { /* 保存できなくても動く */ }
      syncTheme();
    });
  }
  dark.addEventListener('change', syncTheme);

  /* ───────── WORKURU の紹介資料：前・次、キーボードの ← →、枚数、目盛り ─────────
     めくる動きそのものは CSS の scroll-snap。ここは、いま何枚目かを読んで表示をそろえるだけ */
  (() => {
    const deck = $('[data-deck]');
    if (!deck) return;
    const track = $('.deck__track', deck);
    const slides = $$('.deck__slide', deck);
    const cur = $('[data-cur]', deck);
    const prev = $('[data-prev]', deck);
    const next = $('[data-next]', deck);
    const ticks = $('[data-ticks]', deck);
    const cap = $('[data-cap]', deck);
    if (!track || !slides.length || !cur || !prev || !next || !ticks || !cap) return;
    const last = slides.length - 1;
    // 見出しは画像の alt から（先頭の「3枚目：」と、末尾のかっこ書きの補足は外す。sync-workuru-deck.sh の first と同じきまり）
    const titles = slides.map((s) => (($('img', s) || {}).alt || '').replace(/^\d+枚目[：:]\s*/, '').replace(/（[^（）]*）$/, ''));
    let index = -1;

    // 1枚の幅とすき間（スライドどうしの左端の差）
    const step = () => (slides.length > 1 ? slides[1].offsetLeft - slides[0].offsetLeft : slides[0].offsetWidth) || 1;
    const go = (i) => track.scrollTo({ left: clamp(i, 0, last) * step(), behavior: still ? 'auto' : 'smooth' });
    const marks = slides.map((_, i) => {
      const m = document.createElement('i');
      m.addEventListener('click', () => go(i));
      ticks.appendChild(m);
      return m;
    });
    function show() {
      const i = clamp(Math.round(track.scrollLeft / step()), 0, last);
      if (i === index) return;
      index = i;
      cur.textContent = String(i + 1).padStart(2, '0');
      cap.textContent = titles[i];
      prev.disabled = i === 0;
      next.disabled = i === last;
      marks.forEach((m, k) => { m.classList.toggle('is-on', k === i); m.classList.toggle('is-past', k < i); });
    }

    prev.addEventListener('click', () => go(index - 1));
    next.addEventListener('click', () => go(index + 1));
    track.addEventListener('keydown', (e) => {
      const to = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: last }[e.key];
      if (to === undefined) return;
      e.preventDefault();
      go(to);
    });
    let queued = false;
    track.addEventListener('scroll', () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; show(); });
    }, { passive: true });
    // 幅が変わっても、同じ1枚にとどまる
    addEventListener('resize', () => { track.scrollTo({ left: Math.max(0, index) * step(), behavior: 'auto' }); });
    show();
  })();

  /* ───────── アドレスのコピー ───────── */
  (() => {
    const btn = $('#copy');
    if (!btn) return;
    const label = $('span', btn);
    const base = label.textContent;
    btn.addEventListener('click', async () => {
      const text = btn.dataset.copy;
      let ok = false;
      try { await navigator.clipboard.writeText(text); ok = true; } catch (e) {
        const ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(ta); ta.select();
        try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
        ta.remove();
      }
      label.textContent = ok ? 'コピーしました' : 'コピーできませんでした';
      setTimeout(() => { label.textContent = base; }, 1800);
    });
  })();

  /* ───────── 空き端子とプラグ：ケーブルはひもの物理で動く ───────── */
  const bench = (() => {
    const el = $('#bench');
    const plug = $('#plug');
    const socket = $('#socket');
    if (!el || !plug || !socket) return { measure() {} };
    const cable = $$('.bench__svg path', el);
    const statusText = $('#benchStatus span');
    const hint = $('.bench__hint', el);
    const hintOpen = hint ? hint.textContent : '';
    const N = 22;        // ひもの節の数
    const INSERT = 15;   // 挿さる深さ
    const SNAP = 34;     // この距離まで近づくと吸い込まれる
    const SLACK = 1.07;  // ケーブルのたるみ。画面の外から繰り出されるので、長さはプラグの位置で決まる
    let W = 0, H = 0, pw = 0, ph = 0, floor = 0, seg = 0;
    let S = { x: 0, y: 0 }, R = { x: 0, y: 0 }, A = { x: 0, y: 0 };
    let pos = { x: 0, y: 0 };
    let pts = [];
    let connected = false;
    let drag = null;
    let glide = null;
    let awake = 0;
    let seen = false;
    let id = 0;
    let dragEnd = 0;

    function setConnected(v) {
      if (v === connected) return;
      connected = v;
      root.classList.toggle('is-connected', v);
      pulses.fast(v);
      plug.setAttribute('aria-pressed', String(v));
      if (statusText) statusText.textContent = v ? '導通 OK — CONNECTED' : '未接続 — OPEN';
      if (hint) hint.textContent = v ? 'もう一度クリックするか、引き抜くと外れます。' : hintOpen;
    }

    function measure() {
      W = el.clientWidth; H = el.clientHeight;
      if (!W) return;
      pw = plug.offsetWidth; ph = plug.offsetHeight;
      floor = H - 5;
      S = { x: socket.offsetLeft + socket.offsetWidth - INSERT + pw / 2, y: socket.offsetTop + socket.offsetHeight / 2 };
      R = { x: Math.min(S.x + clamp(W * 0.2, 110, 230), W - pw / 2 - 8), y: H - ph / 2 };
      // ケーブルは画面の右の外から来る（あなたのプロジェクトは、図面の外にある）
      A = { x: Math.max(W + 20, root.clientWidth - el.getBoundingClientRect().left + 40), y: H * 0.3 };
      pos = connected ? { x: S.x, y: S.y } : { x: R.x, y: R.y };
      const tx = pos.x + pw / 2 + 4;
      pts = Array.from({ length: N }, (_, i) => {
        const k = i / (N - 1);
        const x = tx + (A.x - tx) * k;
        const y = pos.y + (A.y - pos.y) * k;
        return { x, y, px: x, py: y };
      });
      glide = null;
      for (let i = 0; i < 160; i++) step();   // 先に落ち着かせておく
      draw();
      wake();
    }

    function step() {
      const tx = pos.x + pw / 2 + 4;
      const ty = pos.y;
      seg = (Math.hypot(A.x - tx, A.y - ty) * SLACK) / (N - 1);
      for (let i = 1; i < N - 1; i++) {
        const p = pts[i];
        const onFloor = p.y >= floor - 0.5;
        const vx = (p.x - p.px) * (onFloor ? 0.7 : 0.965);
        const vy = (p.y - p.py) * 0.965;
        p.px = p.x; p.py = p.y;
        p.x += vx; p.y += vy + 0.6;
      }
      for (let k = 0; k < 16; k++) {
        pts[0].x = tx; pts[0].y = ty;
        pts[N - 1].x = A.x; pts[N - 1].y = A.y;
        for (let i = 0; i < N - 1; i++) {
          const a = pts[i], b = pts[i + 1];
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.hypot(dx, dy) || 1e-6;
          const diff = (d - seg) / d;
          const fa = i === 0 ? 0 : i === N - 2 ? 1 : 0.5;
          a.x += dx * diff * fa; a.y += dy * diff * fa;
          b.x -= dx * diff * (1 - fa); b.y -= dy * diff * (1 - fa);
        }
        // 1つ飛ばしの節が近づきすぎないようにして、ケーブルの「こし」を出す
        for (let i = 1; i < N - 3; i++) {
          const a = pts[i], b = pts[i + 2];
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.hypot(dx, dy) || 1e-6;
          const min = seg * 1.82;
          if (d < min) {
            const diff = ((d - min) / d) * 0.5;
            a.x += dx * diff; a.y += dy * diff;
            b.x -= dx * diff; b.y -= dy * diff;
          }
        }
        for (let i = 1; i < N - 1; i++) if (pts[i].y > floor) pts[i].y = floor;
      }
      pts[0].x = tx; pts[0].y = ty;
    }

    function draw() {
      let d = `M${f1(pts[0].x - 6)} ${f1(pts[0].y)}L${f1(pts[0].x)} ${f1(pts[0].y)}`;
      for (let i = 1; i < N - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        d += `Q${f1(a.x)} ${f1(a.y)} ${f1((a.x + b.x) / 2)} ${f1((a.y + b.y) / 2)}`;
      }
      d += `L${f1(pts[N - 1].x)} ${f1(pts[N - 1].y)}`;
      for (const c of cable) c.setAttribute('d', d);
      plug.style.transform = `translate3d(${f1(pos.x - pw / 2)}px, ${f1(pos.y - ph / 2)}px, 0)`;
    }

    function loop(now) {
      id = 0;
      if (glide) {
        const k = clamp((now - glide.t0) / glide.dur, 0, 1);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        pos.x = glide.from.x + (glide.to.x - glide.from.x) * e;
        pos.y = glide.from.y + (glide.to.y - glide.from.y) * e - Math.sin(k * Math.PI) * glide.lift;
        if (k >= 1) { const cb = glide.cb; glide = null; if (cb) cb(); }
        awake = 200;
      }
      step();
      draw();
      if (seen && (drag || glide || awake-- > 0)) id = requestAnimationFrame(loop);
    }
    function wake() { awake = 200; if (!id && seen) id = requestAnimationFrame(loop); }
    function go(to, cb) {
      glide = { from: { x: pos.x, y: pos.y }, to, t0: performance.now(), dur: 460, lift: 14, cb };
      wake();
    }
    function toggle() {
      if (connected) { setConnected(false); go(R); } else go(S, () => setConnected(true));
    }

    plug.addEventListener('pointerdown', (e) => {
      if (e.button) return;
      const b = el.getBoundingClientRect();
      drag = { id: e.pointerId, ox: e.clientX - b.left - pos.x, oy: e.clientY - b.top - pos.y, sx: e.clientX, sy: e.clientY, moved: false };
      try { plug.setPointerCapture(e.pointerId); } catch (err) { /* 取れなくても動く */ }
      glide = null;
      wake();
    });
    plug.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 5) return;
      drag.moved = true;
      const b = el.getBoundingClientRect();
      let x = clamp(e.clientX - b.left - drag.ox, S.x, W - pw / 2);
      let y = clamp(e.clientY - b.top - drag.oy, ph / 2, H - ph / 2);
      const near = Math.hypot(x - S.x, y - S.y) < SNAP;
      if (near) { x = S.x; y = S.y; }
      pos.x = x; pos.y = y;
      setConnected(near);
      wake();
    });
    const release = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const moved = drag.moved;
      drag = null;
      if (moved) { dragEnd = performance.now(); if (!connected) go(R); }
    };
    plug.addEventListener('pointerup', release);
    plug.addEventListener('pointercancel', release);
    plug.addEventListener('click', () => {
      if (performance.now() - dragEnd < 300) return;   // ドラッグの直後のクリックは数えない
      toggle();
    });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver((l) => { seen = l[0].isIntersecting; if (seen) wake(); }, { rootMargin: '120px' }).observe(el);
    } else { seen = true; }

    return { measure };
  })();

  /* ───────── 起動 ───────── */
  let timer = 0;
  function relayout() {
    layout();
    noise.size();
    bench.measure();
  }
  function onResize() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const r = sheet.getBoundingClientRect();
      if (Math.round(r.width) === lastW && Math.round(r.height) === lastH) return;
      relayout();
    }, 140);
  }

  function start() {
    measureCap();
    relayout();
    syncTheme();
    root.classList.add('is-ready');
    if (!still && scrollY < 40) {
      introAt = performance.now() + 250;
      for (const p of paths) p.cur = -1;
      frame(performance.now());
    }
    addEventListener('scroll', request, { passive: true });
    addEventListener('resize', onResize);
    if ('ResizeObserver' in window) new ResizeObserver(onResize).observe(sheet);
    noise.run();
  }

  motion.addEventListener('change', () => { still = motion.matches; relayout(); });

  const fontsReady = document.fonts && document.fonts.load
    ? Promise.all([document.fonts.load('900 40px Archivo', 'METASYSTEM'), document.fonts.ready])
    : Promise.resolve();
  Promise.race([fontsReady, new Promise((r) => setTimeout(r, 1800))]).catch(() => {}).then(start);
  // あとから読み終わった書体で行の高さが変わっても、ResizeObserver が線を引き直す

  /* ───────── 図面の裏書き ───────── */
  try {
    console.log(
      '%c METASYSTEM %c 総合結線図 MS-001\n\n' +
      '  [MODEL]─┬─ L  CTX ───┐\n' +
      '          ├─ Y  TOOL ──┤\n' +
      '          ├─ R  GUARD ─┤\n' +
      '          ├─ G  EVAL ──┼──▶ [ YOUR PROJECT ]\n' +
      '          ├─ V  MEM ───┤\n' +
      '          ├─ O  HITL ──┘\n' +
      '          └─ B  GND ──⏚  10 years of SI\n\n' +
      '  ソースまで読む方とは、話が早そうです。 → yui.kikuchi@yahoo.com',
      'background:#131518;color:#F2EFE6;font-weight:bold;padding:2px 6px', 'color:inherit'
    );
  } catch (e) { /* なくても困らない */ }
})();
