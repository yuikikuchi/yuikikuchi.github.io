/* ==========================================================================
   METASYSTEM — ページごとの図（等角＝アイソメトリックの絵）
   main.js の「ページの図」が、ここの SCENES を読んで SVG に描き、動かす。

   座標：x＝右下へ、y＝左下へ、z＝上へ のマス目（1マス＝20px）。at(横px, 縦px) で、画面の位置からマス目に直せる。
   要素につける印（main.js が、場面＝フェーズごとにクラスを付け外しする）
     data-in="n"     n 番目の場面から出る          data-only="n"   n 番目の場面だけ出る
     data-solid="n"  n 番目から実線（それまでは「設計中」の青い破線）
     data-hot="n m"  その場面のとき、オレンジで強調   data-pop="n"    その場面に入ったとき、ぽんと出し直す
   場面の数は、items（ページの中の、対応する項目）か labels の数。sync: 'steps' のページは、工程の図（data-steps）に合わせて進む。
   ========================================================================== */
(function () {
  'use strict';

  const W = 760;
  const r1 = (n) => Math.round(n * 10) / 10;

  /* ───────── 絵の部品 ───────── */
  function makeLib(OY) {
    const U = 20;
    const C = U * 0.866;
    const S = U * 0.5;
    const OX = W / 2;
    const P = (x, y, z = 0) => [OX + (x - y) * C, OY + (x + y) * S - z * U];
    const at = (sx, sy) => { const a = (sx - OX) / C; const b = (sy - OY) / S; return [(a + b) / 2, (b - a) / 2]; };
    const Sc = (c, z = 0) => P(c[0], c[1], z);
    const add = (c, dx, dy) => [c[0] + dx, c[1] + dy];
    const A = (a) => (a ? ` ${a}` : '');
    const g = (a, inner) => `<g${A(a)}>${inner}</g>`;
    const pts = (arr) => arr.map((p) => `${r1(p[0])},${r1(p[1])}`).join(' ');
    const poly = (arr, cls) => `<polygon class="${cls}" points="${pts(arr)}"/>`;
    const seq = (i, step = 0.1) => `class="seq" style="--d:${(i * step).toFixed(2)}s"`;

    // 箱：上の面・左下を向く面・右下を向く面
    const cube = (x, y, z, w, d, h) =>
      poly([P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)], 'f-top') +
      poly([P(x, y + d, z + h), P(x + w, y + d, z + h), P(x + w, y + d, z), P(x, y + d, z)], 'f-l') +
      poly([P(x + w, y, z + h), P(x + w, y + d, z + h), P(x + w, y + d, z), P(x + w, y, z)], 'f-r');
    const box = (c, w, d, h, z = 0) => cube(c[0] - w / 2, c[1] - d / 2, z, w, d, h);
    const slab = (c, s = 2.6) => box(c, s, s, 0.45);
    // 左下を向く面（y が一定）に貼る絵。中の座標は（横＝x の1マス、下＝z の1マス）
    const face = (x, y, z) => { const [a, b] = P(x, y, z); return `matrix(${r1(C)} ${r1(S)} 0 ${U} ${r1(a)} ${r1(b)})`; };
    const onBox = (c, w, d, ztop, inner) => `<g transform="${face(c[0] - w / 2, c[1] + d / 2, ztop)}">${inner}</g>`;
    const cyl = (c, r, z0, z1) => {
      const [a0, b0] = Sc(c, z0);
      const [a1, b1] = Sc(c, z1);
      const rx = 1.414 * r * C;
      const ry = 1.414 * r * S;
      const band = (k) => { const b = b0 + (b1 - b0) * k; return `<path class="band" d="M${r1(a0 - rx)} ${r1(b)}A${r1(rx)} ${r1(ry)} 0 0 0 ${r1(a0 + rx)} ${r1(b)}"/>`; };
      return `<path class="f-l" d="M${r1(a1 - rx)} ${r1(b1)}L${r1(a0 - rx)} ${r1(b0)}A${r1(rx)} ${r1(ry)} 0 0 0 ${r1(a0 + rx)} ${r1(b0)}L${r1(a1 + rx)} ${r1(b1)}Z"/>` +
        band(0.36) + band(0.68) + `<ellipse class="f-top" cx="${r1(a1)}" cy="${r1(b1)}" rx="${r1(rx)}" ry="${r1(ry)}"/>`;
    };
    // 人（平らな絵）。k は大きさ
    const personAt = (a, b, k = 1) =>
      `<path class="f-top" d="M${r1(a - 12 * k)} ${r1(b)}V${r1(b - 12 * k)}Q${r1(a - 12 * k)} ${r1(b - 24 * k)} ${r1(a)} ${r1(b - 24 * k)}Q${r1(a + 12 * k)} ${r1(b - 24 * k)} ${r1(a + 12 * k)} ${r1(b - 12 * k)}V${r1(b)}Z"/>` +
      `<circle class="f-top" cx="${r1(a)}" cy="${r1(b - 33 * k)}" r="${r1(8 * k)}"/>`;
    const person = (c, z = 0.45, k = 1) => { const [a, b] = Sc(c, z); return personAt(a, b, k); };

    // 名札。文字の幅は、半角 7.4px・全角 12.5px として見積もる
    const tw = (s) => Array.from(s).reduce((n, ch) => n + (/[ -~]/.test(ch) ? 7.4 : 12.5), 0);
    const pill = (x, y, s, a) => { const w = tw(s) + 22; return g(`class="pill"${A(a)}`, `<rect x="${r1(x - w / 2)}" y="${r1(y - 11)}" width="${r1(w)}" height="22" rx="11"/><text x="${r1(x)}" y="${r1(y + 4.5)}">${s}</text>`); };
    const under = (c, s, a, size = 2.6) => { const [x, y] = Sc(c); return pill(x, y + size * 10 + 17, s, a); };

    // 地面の線。台の縁から縁まで（両端を縮める）
    const seg = (A0, B0, t0 = 2, t1 = 2) => {
      const dx = B0[0] - A0[0];
      const dy = B0[1] - A0[1];
      const L = Math.hypot(dx, dy);
      const a = P(A0[0] + (dx / L) * t0, A0[1] + (dy / L) * t0);
      const b = P(B0[0] - (dx / L) * t1, B0[1] - (dy / L) * t1);
      return { d: `M${r1(a[0])} ${r1(a[1])}L${r1(b[0])} ${r1(b[1])}`, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], a, b };
    };
    const line = (s, a, cls = 'link') => `<path class="${cls}" d="${s.d}"${A(a)}/>`;
    const packets = (s, n = 2, dur = 1.8, rev) => Array.from({ length: n }, (_, k) =>
      `<circle class="pk" r="4.5"><animateMotion dur="${dur}s" repeatCount="indefinite" begin="${(-k * dur / n).toFixed(2)}s" path="${s.d || s}"${rev ? ' keyPoints="1;0" keyTimes="0;1" calcMode="linear"' : ''}/></circle>`).join('');
    // 線に沿って、絵を動かす（絵は原点のまわりに描く）
    const mover = (d, inner, dur = 2.2, begin = 0, a) =>
      g(a, `<g>${inner}<animateMotion dur="${dur}s" repeatCount="indefinite" begin="${(-begin).toFixed(2)}s" path="${d}"/></g>`);
    const arc = (a, b, lift = 60) => `M${r1(a[0])} ${r1(a[1])}Q${r1((a[0] + b[0]) / 2)} ${r1(Math.min(a[1], b[1]) - lift)} ${r1(b[0])} ${r1(b[1])}`;

    /* 平らな絵（x, y を中心に描く） */
    const miniCube = () => '<polygon class="f-top" points="0,-8 9,-3 0,2 -9,-3"/><polygon class="f-l" points="-9,-3 0,2 0,12 -9,7"/><polygon class="f-r" points="9,-3 0,2 0,12 9,7"/>';
    const docIcon = (x, y) => `<path class="f-top" d="M${r1(x)} ${r1(y)}h15l7 7v21h-22z"/><path class="ln" d="M${r1(x + 15)} ${r1(y)}v7h7M${r1(x + 5)} ${r1(y + 13)}h12M${r1(x + 5)} ${r1(y + 18)}h12M${r1(x + 5)} ${r1(y + 23)}h7"/>`;
    const docMini = () => docIcon(-11, -14);
    const doc = (x, y, s, a) => g(`class="doc"${A(a)}`, docIcon(x, y) + pill(x + 32 + (tw(s) + 22) / 2, y + 14, s));
    const check = (x, y, a) => g(`class="chk"${A(a)}`, `<circle cx="${r1(x)}" cy="${r1(y)}" r="8"/><path d="M${r1(x - 3.5)} ${r1(y)}l2.5 2.6 4.6-5"/>`);
    const cloud = (x, y, a) => g(a, `<path class="f-top" d="M${r1(x - 30)} ${r1(y + 14)}H${r1(x + 30)}A13 13 0 0 0 ${r1(x + 32)} ${r1(y - 11)}A18 18 0 0 0 ${r1(x - 2)} ${r1(y - 20)}A14 14 0 0 0 ${r1(x - 28)} ${r1(y - 10)}A12 12 0 0 0 ${r1(x - 30)} ${r1(y + 14)}Z"/>`);
    const pin = (x, y, a) => g(a, `<path class="f-top" d="M${r1(x)} ${r1(y + 14)}C${r1(x - 4)} ${r1(y + 6)} ${r1(x - 11)} ${r1(y + 1)} ${r1(x - 11)} ${r1(y - 7)}A11 11 0 1 1 ${r1(x + 11)} ${r1(y - 7)}C${r1(x + 11)} ${r1(y + 1)} ${r1(x + 4)} ${r1(y + 6)} ${r1(x)} ${r1(y + 14)}Z"/><circle class="hole" cx="${r1(x)}" cy="${r1(y - 7)}" r="3.5"/>`);
    const gear = (x, y, r, a) => {
      const p = [];
      for (let i = 0; i < 8; i++) {
        const t = (i / 8) * Math.PI * 2;
        [[-0.4, 0.74], [-0.2, 1], [0.2, 1], [0.4, 0.74]].forEach(([o, k]) => p.push([x + Math.cos(t + o) * r * k, y + Math.sin(t + o) * r * k]));
      }
      return g(a, `<g class="spin" style="transform-box:view-box;transform-origin:${r1(x)}px ${r1(y)}px">${poly(p, 'f-top')}<circle class="hole" cx="${r1(x)}" cy="${r1(y)}" r="${r1(r * 0.3)}"/></g>`);
    };
    const bubble = (x, y, a, delay = 0) => g(a, `<g class="bubble"><path d="M${r1(x)} ${r1(y)}h50a6 6 0 0 1 6 6v16a6 6 0 0 1-6 6h-34l-10 9 2-9h-8a6 6 0 0 1-6-6v-16a6 6 0 0 1 6-6z"/>` +
      [0, 1, 2].map((k) => `<circle class="td" cx="${r1(x + 13 + k * 12)}" cy="${r1(y + 14)}" r="3" style="animation-delay:${(delay + k * 0.2).toFixed(2)}s"/>`).join('') + '</g>');
    const flag = (x, y, a) => g(a, `<path class="ln" d="M${r1(x)} ${r1(y)}V${r1(y - 28)}"/><path class="f-top" d="M${r1(x)} ${r1(y - 28)}h20l-5 6 5 6h-20z"/>`);
    const lock = (x, y, a) => g(a, `<path class="ln" d="M${r1(x - 6)} ${r1(y - 2)}v-5a6 6 0 0 1 12 0v5"/><rect class="f-top" x="${r1(x - 10)}" y="${r1(y - 2)}" width="20" height="15" rx="2"/><path class="ln" d="M${r1(x)} ${r1(y + 3)}v4"/>`);
    const shield = (x, y, a) => g(a, `<path class="f-top" d="M${r1(x)} ${r1(y - 15)}l13 5v8c0 8-5 13-13 17c-8-4-13-9-13-17v-8z"/><path class="ln" d="M${r1(x - 5)} ${r1(y + 1)}l3.5 3.5 6.5-7"/>`);
    const envMini = () => '<rect class="f-top" x="-14" y="-10" width="28" height="20" rx="2"/><path class="ln" d="M-14 -8l14 10 14-10"/>';
    const clock = (x, y, a) => g(a, `<circle class="f-top" cx="${r1(x)}" cy="${r1(y)}" r="14"/><path class="ln" d="M${r1(x)} ${r1(y)}h6"/>` +
      `<g class="spin spin--slow" style="transform-box:view-box;transform-origin:${r1(x)}px ${r1(y)}px"><path class="ln" d="M${r1(x)} ${r1(y)}V${r1(y - 10)}"/></g>`);
    const spark = (x, y, a) => g(a, `<path class="f-top" d="M${r1(x)} ${r1(y - 15)}l4 10 10 4-10 4-4 10-4-10-10-4 10-4z"/>`);
    const loopArrow = (x, y, r = 12, a) => g(a, `<g class="spin" style="transform-box:view-box;transform-origin:${r1(x)}px ${r1(y)}px"><path class="ln ln--b" d="M${r1(x + r)} ${r1(y)}A${r} ${r} 0 1 1 ${r1(x)} ${r1(y - r)}"/><path class="ln ln--b" d="M${r1(x - 4)} ${r1(y - r - 4)}L${r1(x)} ${r1(y - r)}L${r1(x - 4)} ${r1(y - r + 4)}"/></g>`);
    const alert = (x, y, a) => g(a, `<g class="blink"><path class="f-top" d="M${r1(x)} ${r1(y - 15)}L${r1(x + 15)} ${r1(y + 11)}H${r1(x - 15)}Z"/><path class="ln ln--b" d="M${r1(x)} ${r1(y - 5)}v7M${r1(x)} ${r1(y + 6)}v.5"/></g>`);
    const stop = (x, y, a) => {
      const p = Array.from({ length: 8 }, (_, i) => { const t = (i / 8) * Math.PI * 2 + Math.PI / 8; return [x + Math.cos(t) * 17, y + Math.sin(t) * 17]; });
      return g(a, `${poly(p, 'f-top')}<text class="sign" x="${r1(x)}" y="${r1(y + 4)}">停止</text>`);
    };
    const bigArrow = (x, y, a) => g(a, `<path class="f-top" d="M${r1(x - 26)} ${r1(y - 8)}H${r1(x + 4)}V${r1(y - 18)}L${r1(x + 26)} ${r1(y)}L${r1(x + 4)} ${r1(y + 18)}V${r1(y + 8)}H${r1(x - 26)}Z"/>`);
    const sliders = (x, y, a) => g(a, `<rect class="f-top" x="${r1(x - 52)}" y="${r1(y - 30)}" width="104" height="60" rx="8"/>` +
      [-14, 0, 14].map((dy, k) => `<path class="ln" d="M${r1(x - 36)} ${r1(y + dy)}H${r1(x + 36)}"/><circle class="knob" cx="${r1(x - 16 + k * 14)}" cy="${r1(y + dy)}" r="5" style="animation-delay:${(k * 0.4).toFixed(1)}s"/>`).join(''));
    const codeLines = (x, y, widths) => widths.map((w, k) => `<rect class="cl" x="${r1(x + (k % 3 === 2 ? 12 : 0))}" y="${r1(y + k * 10)}" width="${w}" height="4" rx="2" style="animation-delay:${(k * 0.25).toFixed(2)}s"/>`).join('');
    const win = (x, y, w, h, a, inner) => g(a, `<rect class="f-top" x="${r1(x)}" y="${r1(y)}" width="${w}" height="${h}" rx="6"/><path class="ln" d="M${r1(x)} ${r1(y + 14)}H${r1(x + w)}"/>` +
      [0, 1, 2].map((k) => `<circle class="dotb" cx="${r1(x + 9 + k * 8)}" cy="${r1(y + 7)}" r="2.2"/>`).join('') + (inner || ''));

    /* 立体の部品（c＝台の中心） */
    const modules = (c) => [[-1.05, -1.05, 1.5], [0.15, -1.05, 1.1], [-1.05, 0.15, 1.1], [0.15, 0.15, 0.7]]
      .map(([dx, dy, h], i) => g(seq(i, 0.12), cube(c[0] + dx, c[1] + dy, 0.45, 0.9, 0.9, h))).join('');
    const moduleTops = (c) => [[-1.05, -1.05, 1.5], [0.15, -1.05, 1.1], [-1.05, 0.15, 1.1], [0.15, 0.15, 0.7]]
      .map(([dx, dy, h]) => P(c[0] + dx + 0.45, c[1] + dy + 0.45, 0.45 + h));
    const plates = (c, n, w = 1.6, d = 1.2, t = 0.16, gap = 0.08) =>
      Array.from({ length: n }, (_, i) => g(seq(i, 0.14), box(c, w, d, t, 0.45 + i * (t + gap)))).join('');
    const monitor = (c, inner = '', w = 2.2, h = 1.6) =>
      cube(c[0] - 0.15, c[1] - 0.15, 0.45, 0.3, 0.3, 0.45) +
      cube(c[0] - w / 2, c[1] + 0.2, 0.9, w, 0.15, h) +
      `<g transform="${face(c[0] - w / 2, c[1] + 0.35, 0.9 + h)}"><path class="scr" d="M0.12 0.12H${r1(w - 0.12)}V${r1(h - 0.12)}H0.12Z"/>${inner}</g>`;
    const phone = (c, inner = '') =>
      cube(c[0] - 0.4, c[1] - 0.08, 0.45, 0.8, 0.16, 1.5) +
      `<g transform="${face(c[0] - 0.4, c[1] + 0.08, 1.95)}"><path class="scr" d="M0.09 0.12H0.71V1.36H0.09Z"/>${inner}</g>`;
    const rack = (c, h = 2.2) =>
      box(c, 1.2, 1.2, h, 0.45) +
      onBox(c, 1.2, 1.2, 0.45 + h, '<path class="ln" d="M0.14 0.35H0.7M0.14 0.75H0.7M0.14 1.15H0.7M0.14 1.55H0.7"/>' +
        '<circle class="lamp" cx="0.95" cy="0.35" r="0.08"/><circle class="lamp lamp--2" cx="0.95" cy="0.75" r="0.08"/><circle class="lamp lamp--3" cx="0.95" cy="1.15" r="0.08"/>');
    const building = (c, w = 1.6, d = 1.6, h = 2.0) => {
      let wins = '';
      for (let r = 0.3; r < h - 0.2; r += 0.5) for (let q = 0.25; q < w - 0.2; q += 0.45) wins += `<path class="win" d="M${r1(q)} ${r1(r)}h0.22v0.22h-0.22z"/>`;
      return box(c, w, d, h, 0.45) + onBox(c, w, d, 0.45 + h, wins);
    };
    const house = (c) => {
      const [x, y] = [c[0] - 0.8, c[1] - 0.8];
      const zt = 1.55;
      const zr = 2.3;
      return box(c, 1.6, 1.6, 1.1, 0.45) +
        poly([P(x, y + 0.8, zr), P(x + 1.6, y + 0.8, zr), P(x + 1.6, y + 1.6, zt), P(x, y + 1.6, zt)], 'f-l') +
        poly([P(x + 1.6, y, zt), P(x + 1.6, y + 0.8, zr), P(x + 1.6, y + 1.6, zt)], 'f-r') +
        poly([P(x, y, zt), P(x + 1.6, y, zt), P(x + 1.6, y + 0.8, zr), P(x, y + 0.8, zr)], 'f-top');
    };
    const folder = (c) => slab(c, 2.2) + g('class="bob"', cube(c[0] - 0.9, c[1] - 0.2, 0.45, 1.8, 0.4, 1.3) + cube(c[0] - 0.9, c[1] - 0.2, 1.75, 0.7, 0.4, 0.16) +
      onBox([c[0], c[1]], 1.8, 0.4, 1.75, '<path class="ln" d="M0.3 0.45H1.5M0.3 0.75H1.2"/>'));

    // 方眼（地面）。画面に入る分だけ引く
    const grid = (H) => {
      const lo = Math.floor((-OY / S - OX / C) / 2) - 2;
      const hi = Math.ceil(((H - OY) / S + OX / C) / 2) + 2;
      let d = '';
      for (let i = lo; i <= hi; i += 1) {
        const a = P(i, lo - 20); const b = P(i, hi + 20); const p = P(lo - 20, i); const q = P(hi + 20, i);
        d += `M${r1(a[0])} ${r1(a[1])}L${r1(b[0])} ${r1(b[1])}M${r1(p[0])} ${r1(p[1])}L${r1(q[0])} ${r1(q[1])}`;
      }
      return d;
    };
    const defs = () => '<defs>' +
      '<marker id="vArr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#1e1c19" stroke="none"/></marker>' +
      '<marker id="vArrB" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#6f9fea" stroke="none"/></marker>' +
      '<marker id="vArrO" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#f39c4e" stroke="none"/></marker>' +
      '</defs>';

    return {
      U, C, S, P, at, Sc, add, g, poly, seq, cube, box, slab, face, onBox, cyl, person, personAt, tw, pill, under, seg, line, packets, mover, arc,
      miniCube, docIcon, docMini, doc, check, cloud, pin, gear, bubble, flag, lock, shield, envMini, clock, spark, loopArrow, alert, stop, bigArrow,
      sliders, codeLines, win, modules, moduleTops, plates, monitor, phone, rack, building, house, folder, grid, defs
    };
  }

  // 奥から手前へ（画面の上から下へ）並べて、重なりを正しくする
  const depth = (L, list) => list.map(([c, html]) => [L.Sc(c)[1], html]).sort((a, b) => a[0] - b[0]).map((o) => o[1]).join('');

  /* ───────── ページごとの図 ───────── */
  const SCENES = {

    /* 01 このサイトについて：真ん中の人から、6つのフォルダへ */
    about: {
      h: 310, items: '.toc > li', title: 'Yui Kikuchi を中心に、6つのフォルダ（プロフィール・対応工程・実績・スキル・プロダクト・ご依頼）がつながる図',
      build(L) {
        const { at, g, slab, person, pill, under, seg, line, packets, folder } = L;
        const E = at(380, 160);
        const F = [[150, 80], [100, 180], [210, 255], [550, 255], [660, 180], [610, 80]].map(([x, y]) => at(x, y));
        const names = ['プロフィール', '対応工程', '実績', 'スキル', 'プロダクト', 'ご依頼'];
        let s = '';
        F.forEach((f, i) => { const sg = seg(E, f, 2.0, 1.8); s += line(sg, `data-hot="${i + 1}"`, 'link link--soft') + g(`data-only="${i + 1}"`, packets(sg, 2, 1.3)); });
        s += depth(L, [[E, slab(E) + person(E)]].concat(F.map((f, i) => [f, g(`data-hot="${i + 1}"`, folder(f))])));
        s += pill(380, 86, 'Yui Kikuchi');
        F.forEach((f, i) => { s += under(f, names[i], `data-hot="${i + 1}"`, 2.2); });
        return s;
      }
    },

    /* 02 自己紹介：10段の階段（10年）と、8本の旗（参画プロジェクト） */
    profile: {
      h: 300, items: '.stats--2 > li', labels: ['実務経験 10年', '参画プロジェクト 8件以上'], title: '10段の階段で実務経験10年を、8本の旗で参画プロジェクト8件以上を表した図',
      build(L) {
        const { at, P, g, cube, person, pill, flag } = L;
        const b0 = at(225, 250);
        const st = Array.from({ length: 10 }, (_, i) => ({ i, x: b0[0] + 0.45 * i, y: b0[1] - 1.5 * i, h: 0.4 + i * 0.2 }));
        const blocks = st.slice().reverse().map(({ i, x, y, h }) =>
          g(`class="seq" style="--d:${(i * 0.08).toFixed(2)}s"${i === 9 ? ' data-hot="1"' : ''}`, cube(x - 0.55, y - 0.55, 0, 1.1, 1.1, h))).join('');
        const top = st[9];
        const [tx, ty] = P(top.x, top.y, top.h);
        const flags = st.slice(1, 9).map(({ x, y, h }, k) => { const [fx, fy] = P(x, y, h); return g(`class="seq" style="--d:${(k * 0.12).toFixed(2)}s"`, flag(fx - 3, fy - 2)); }).join('');
        return g('data-pop="1"', blocks) + person([top.x, top.y], top.h) +
          g('data-in="2" data-hot="2" data-pop="2"', flags) +
          pill(tx, ty - 62, '10年', 'data-hot="1"') +
          pill(235, 150, '8件以上', 'data-in="2" data-hot="2"');
      }
    },

    /* 02 選ばれる理由：チームに加わる → 報告する → AIで速くする */
    why: {
      h: 300, items: '.cards3 > li', title: 'チームに加わり、報告をとどけ、生成AIで成果物を速くつくる流れの図',
      build(L) {
        const { at, add, Sc, g, slab, person, pill, under, seg, line, packets, mover, docMini, check, spark, monitor, plates } = L;
        const T = at(190, 175);
        const E = at(420, 175);
        const R = at(625, 112);
        const O = at(605, 245);
        const sTE = seg(T, E, 2.2, 2.0);
        const sER = seg(E, R, 2.0, 1.8);
        const sEO = seg(E, O, 2.0, 1.8);
        const kanban = '<path class="ln" d="M0.8 0.25V1.35M1.45 0.25V1.35"/><path class="kc" d="M0.25 0.32h0.42v0.2h-0.42zM0.25 0.64h0.42v0.2h-0.42zM0.92 0.32h0.42v0.2h-0.42zM1.57 0.32h0.42v0.2h-0.42z"/>';
        const team = [[-0.8, -0.6], [0.7, -0.75], [-0.1, 0.75]].map(([dx, dy]) => [add(T, dx, dy), person(add(T, dx, dy))]);
        const [ex, ey] = Sc(E, 0.45);
        return line(sTE, 'data-hot="1"', 'link link--soft') + g('data-only="1"', packets(sTE, 2, 1.6) + packets(sTE, 1, 1.6, true)) +
          line(sER, 'data-hot="2"', 'link link--soft') + g('data-only="2"', mover(sER.d, docMini(), 1.6) + mover(sER.d, docMini(), 1.6, 0.8)) +
          line(sEO, 'data-hot="3"', 'link link--soft') + g('data-only="3"', packets(sEO, 3, 0.9)) +
          g('data-hot="2"', slab(R) + monitor(R, kanban)) +
          g('data-hot="1"', slab(T, 3.4) + depth(L, team)) +
          g('data-hot="1"', slab(E) + person(E)) +
          g('data-hot="3"', slab(O) + g('data-pop="3"', plates(O, 3))) +
          g('data-only="1"', check(sTE.mid[0], sTE.mid[1] - 18) + pill(sTE.mid[0], sTE.mid[1] - 44, '規約・レビュー')) +
          g('data-only="2"', pill(sER.mid[0] - 10, sER.mid[1] - 26, '日報・週報')) +
          g('data-only="3" data-hot="3"', spark(ex + 30, ey - 58) + pill(ex + 30, ey - 90, '生成AI')) +
          under(T, 'チーム', '', 3.4) + under(E, 'Yui Kikuchi') + under(R, '報告') + under(O, '成果物');
      }
    },

    /* 03 対応可能な工程：工程を進めるごとに、システムが組み上がる（工程の図に合わせて進む） */
    process: {
      h: 370, oy: 24, sync: 'steps', title: '工程を進めるごとに、お客さまの要件から、画面・アプリ・DB・運用までが組み上がっていく図',
      focus: [[190, 240, 300], [250, 190, 300], [545, 140, 330], [380, 105, 300], [385, 175, 640], [520, 245, 330]],
      build(L) {
        const { P, cube, slab, cyl, person, pill, doc, check, seg, packets, face } = L;
        const AT = { client: [4.58, 19.02], screen: [5.7, 10.9], app: [7.32, 3.28], db: [15.81, 0.8], ops: [19.0, 8.6] };
        const L1 = seg(AT.client, AT.screen);
        const L2 = seg(AT.screen, AT.app);
        const L3 = seg(AT.app, AT.db);
        const LM = seg(AT.ops, AT.app);
        const [ax, ay] = AT.app;
        const parts = [[-1.05, -1.05, 1.5], [0.15, -1.05, 1.1], [-1.05, 0.15, 1.1], [0.15, 0.15, 0.7]];
        const [ox, oy] = AT.ops;
        const [hx, hy] = P(AT.client[0], AT.client[1], 0.45);
        const bx = hx + 16;
        const by = hy - 83;
        const [sa, sb] = P(ox, oy, 2.65);
        return `<path class="link" d="${L1.d}" data-in="2" data-solid="4" data-hot="5"/>` +
          `<path class="link" d="${L2.d}" data-in="3" data-solid="4" data-hot="5"/>` +
          `<path class="link" d="${L3.d}" data-in="3" data-solid="4" data-hot="5"/>` +
          `<path class="mon" d="${LM.d}" data-in="6"/>` +
          `<g data-in="5">${packets(L1, 2)}${packets(L2, 2)}${packets(L3, 2)}</g>` +
          `<g data-in="5">${[L1, L2, L3].map((l) => check(l.mid[0] + 14, l.mid[1] - 14)).join('')}</g>` +
          `<g data-in="3" data-solid="4" data-hot="3 4">${slab(AT.app)}${parts.map(([dx, dy, h]) => cube(ax + dx, ay + dy, 0.45, 0.9, 0.9, h)).join('')}</g>` +
          `<g data-in="3" data-solid="4" data-hot="3">${slab(AT.db)}${cyl(AT.db, 0.95, 0.45, 2.2)}</g>` +
          `<g data-in="2" data-hot="2">${slab(AT.screen)}` +
            `${cube(AT.screen[0] - 0.15, AT.screen[1] - 0.15, 0.45, 0.3, 0.3, 0.45)}` +
            `${cube(AT.screen[0] - 1.1, AT.screen[1] + 0.2, 0.9, 2.2, 0.15, 1.6)}` +
            `<g transform="${face(AT.screen[0] - 1.1, AT.screen[1] + 0.35, 2.5)}">` +
              '<path class="scr" d="M0.12 0.12H2.08V1.48H0.12Z"/>' +
              '<path class="wf" pathLength="1" d="M0.26 0.26H1.94V0.42H0.26Z"/>' +
              '<path class="wf" pathLength="1" d="M0.26 0.56H0.98V1.32H0.26Z"/>' +
              '<path class="wf" pathLength="1" d="M1.12 0.62H1.94M1.12 0.84H1.84M1.12 1.06H1.6"/>' +
              '<path class="wf" pathLength="1" d="M1.12 1.18H1.6V1.32H1.12Z"/>' +
            '</g></g>' +
          `<g data-in="1" data-hot="1">${slab(AT.client)}${person(AT.client)}</g>` +
          `<g data-in="6" data-hot="6">${slab(AT.ops)}${cube(ox - 0.6, oy - 0.6, 0.45, 1.2, 1.2, 2.2)}` +
            `<g transform="${face(ox - 0.6, oy + 0.6, 2.65)}">` +
              '<path class="scr" d="M0.12 0.18H1.08V0.92H0.12Z"/>' +
              '<path class="pulse" pathLength="1" d="M0.18 0.62H0.42L0.52 0.3L0.66 0.86L0.76 0.55H1.02"/>' +
              '<path class="ln" d="M0.14 1.25H0.7M0.14 1.55H0.7M0.14 1.85H0.7"/>' +
              '<circle class="lamp" cx="0.95" cy="1.25" r="0.08"/><circle class="lamp lamp--2" cx="0.95" cy="1.55" r="0.08"/><circle class="lamp lamp--3" cx="0.95" cy="1.85" r="0.08"/>' +
            '</g></g>' +
          `<g data-only="1"><g class="bubble"><path d="M${bx} ${by}h56a6 6 0 0 1 6 6v16a6 6 0 0 1-6 6h-40l-10 9 2-9h-8a6 6 0 0 1-6-6v-16a6 6 0 0 1 6-6z"/>` +
            [0, 1, 2].map((k) => `<circle class="td" cx="${Math.round(bx + 16 + k * 12)}" cy="${Math.round(by + 14)}" r="3" style="animation-delay:${k * 0.2}s"/>`).join('') + '</g></g>' +
          doc(196, 214, '要件定義書', 'data-only="1"') +
          doc(150, 112, '外部設計書', 'data-only="2"') +
          doc(520, 44, '詳細設計書', 'data-only="3"') +
          '<g data-only="4" class="code"><rect class="f-top" x="250" y="26" width="132" height="76" rx="6"/><path class="ln" d="M250 40H382"/>' +
            '<circle class="dotb" cx="259" cy="33" r="2.2"/><circle class="dotb" cx="267" cy="33" r="2.2"/><circle class="dotb" cx="275" cy="33" r="2.2"/>' +
            [[56, 0], [88, 0.25], [70, 0.5], [44, 0.75], [64, 1]].map(([w, dl], k) => `<rect class="cl" x="${k === 2 || k === 3 ? 272 : 260}" y="${48 + k * 10}" width="${w}" height="4" rx="2" style="animation-delay:${dl}s"/>`).join('') +
          '</g>' +
          `<g data-in="4">${parts.map(([dx, dy, h]) => { const [cx, cy] = P(ax + dx + 0.45, ay + dy + 0.45, 0.45 + h); return check(cx, cy - 2); }).join('')}</g>` +
          `<g data-in="6"><g class="spin" style="transform-box:view-box;transform-origin:${Math.round(sa)}px ${Math.round(sb - 26)}px"><path class="ln ln--b" d="M${Math.round(sa + 11)} ${Math.round(sb - 26)}A11 11 0 1 1 ${Math.round(sa)} ${Math.round(sb - 37)}"/><path class="ln ln--b" d="M${Math.round(sa - 4)} ${Math.round(sb - 41)}L${Math.round(sa)} ${Math.round(sb - 37)}L${Math.round(sa - 4)} ${Math.round(sb - 33)}"/></g></g>` +
          pill(130, 304, 'お客さま', 'data-in="1" data-hot="1"') +
          pill(290, 234, '画面', 'data-in="2" data-hot="2 5"') +
          pill(450, 50, 'アプリ', 'data-in="3" data-hot="3 4 5"') +
          pill(640, 234, 'DB', 'data-in="3" data-hot="3 5"') +
          pill(560, 344, '運用・監視', 'data-in="6" data-hot="6"');
      }
    },

    /* 04 上流工程：ホスト → 新システム・クラウド・新DB。要件定義書と RFP をつくる */
    upstream: {
      h: 320, items: '.works > li', title: 'ホストから、新システム・クラウド・新しいDBへ移す上流工程の図',
      build(L) {
        const { at, Sc, g, slab, box, onBox, cyl, plates, modules, cloud, pill, under, seg, line, packets, mover, arc, miniCube, personAt, doc } = L;
        const H0 = at(150, 185);
        const D = at(320, 262);
        const M = at(480, 145);
        const N = at(640, 220);
        const sHM = seg(H0, M, 2.2, 2.0);
        const sHN = seg(H0, N, 2.2, 2.0);
        const [hx, hy] = Sc(H0, 2.85);
        const lift = arc([hx + 8, hy - 4], [612, 72], 40);
        const hostFace = '<path class="ln" d="M0.22 0.3H1.48M0.22 0.6H1.48M0.22 0.9H1.48M0.22 1.2H1.48"/><circle class="lamp" cx="0.35" cy="1.8" r="0.09"/><circle class="lamp lamp--2" cx="0.65" cy="1.8" r="0.09"/><circle class="lamp lamp--3" cx="0.95" cy="1.8" r="0.09"/>';
        const crowd = [[262, 250], [282, 238], [362, 242], [384, 256]].map(([x, y], i) => `<g ${L.seq(i, 0.1)}>${personAt(x, y, 0.55)}</g>`).join('');
        return line(sHM, 'data-hot="2"', 'link link--soft') +
          line(sHN, 'data-hot="4"', 'link link--soft') + g('data-only="4"', packets(sHN, 3, 1.6)) +
          cloud(612, 62, 'data-hot="3"') +
          g('data-solid="2" data-hot="2"', slab(M) + modules(M)) +
          g('data-hot="1 3"', slab(H0) + box(H0, 1.7, 1.7, 2.4, 0.45) + onBox(H0, 1.7, 1.7, 2.85, hostFace)) +
          g('data-hot="4"', slab(N) + cyl(N, 0.95, 0.45, 2.1)) +
          g('data-hot="1"', slab(D) + g('data-pop="1"', plates(D, 3))) +
          g('data-only="1"', crowd + pill(322, 176, '100名規模の体制')) +
          g('data-only="2"', doc(535, 40, '設計書')) +
          g('data-only="3"', mover(lift, miniCube(), 1.8) + pill(530, 30, 'PoC')) +
          g('data-only="4"', pill(sHN.mid[0] + 40, sHN.mid[1] - 22, '移行方式・切替手順')) +
          under(H0, 'ホスト') + under(D, '要件定義書・RFP') + under(M, '新システム', 'data-hot="2"') + under(N, '新DB', 'data-hot="4"') +
          pill(612, 98, 'クラウド', 'data-hot="3"');
      }
    },

    /* 04 開発・テスト：EC → 業務システム → サーバー。テストの消化率 */
    dev: {
      h: 300, items: '.works > li', title: 'ECの業務システムをつくり、改修し、サーバーへ自動でデプロイし、テストする図',
      build(L) {
        const { at, g, slab, building, modules, moduleTops, monitor, rack, pill, under, seg, line, packets, check, gear, cube } = L;
        const Sh = at(140, 190);
        const Ap = at(335, 140);
        const T = at(480, 250);
        const Sv = at(620, 165);
        const sSA = seg(Sh, Ap);
        const sAS = seg(Ap, Sv);
        const sAT = seg(Ap, T);
        const tops = moduleTops(Ap);
        const testFace = '<path class="track" d="M0.25 0.35H2.15V0.55H0.25Z"/><path class="grow" d="M0.25 0.35H1.8V0.55H0.25Z"/>' +
          '<path class="ln" d="M0.55 0.85H1.6M0.55 1.1H1.4"/><path class="tick" d="M0.25 0.85l0.08 0.08 0.14-0.14M0.25 1.1l0.08 0.08 0.14-0.14"/>';
        return line(sSA, 'data-hot="1"', 'link link--soft') +
          line(sAS, 'data-hot="3"', 'link link--soft') + g('data-only="3"', packets(sAS, 3, 1.4)) +
          line(sAT, 'data-hot="4"', 'link link--soft') +
          g('data-hot="1 2"', slab(Ap) + g('data-pop="1"', modules(Ap))) +
          g('data-only="2"', g('class="leave"', cube(Ap[0] + 0.15, Ap[1] - 1.05, 1.9, 0.9, 0.9, 0.5)) + tops.map(([x, y]) => check(x, y - 2)).join('')) +
          g('data-hot="3"', slab(Sv) + rack(Sv)) +
          g('data-hot="1"', slab(Sh) + building(Sh, 1.8, 1.6, 1.4)) +
          g('data-hot="4"', slab(T) + monitor(T, g('data-pop="4"', testFace), 2.4, 1.5)) +
          g('data-only="3"', gear(520, 72, 16) + pill(520, 104, '自動デプロイ')) +
          g('data-only="4"', pill(530, 168, 'テスト消化率')) +
          under(Sh, 'EC') + under(Ap, '業務システム') + under(T, 'テスト') + under(Sv, 'サーバー');
      }
    },

    /* 04 保守・運用：障害の復旧、リリース、手順書、監視 */
    ops: {
      h: 300, items: '.works > li', title: '本番サーバーの障害対応・リリース・手順書・監視をまわす図',
      build(L) {
        const { at, Sc, g, slab, box, rack, plates, monitor, pill, under, seg, line, mover, miniCube, alert, check, loopArrow } = L;
        const Pk = at(130, 225);
        const Sv = at(320, 165);
        const Dc = at(515, 235);
        const Mn = at(620, 112);
        const sPS = seg(Pk, Sv);
        const sSD = seg(Sv, Dc);
        const sMS = seg(Mn, Sv, 1.8, 2.0);
        const [sx, sy] = Sc(Sv, 2.65);
        const pulse = '<path class="pulse" pathLength="1" d="M0.2 0.85H0.7L0.85 0.35L1.05 1.25L1.2 0.7H2.0"/>';
        return line(sPS, 'data-hot="2"', 'link link--soft') + g('data-only="2"', mover(sPS.d, miniCube(), 1.5)) +
          line(sSD, 'data-hot="3"', 'link link--soft') +
          `<path class="mon" d="${sMS.d}" data-hot="4"/>` +
          g('data-hot="4"', slab(Mn) + monitor(Mn, pulse)) +
          g('data-hot="1"', slab(Sv) + rack(Sv)) +
          g('data-hot="2"', slab(Pk) + box(Pk, 1.3, 1.3, 1.0, 0.45)) +
          g('data-hot="3"', slab(Dc) + g('data-pop="3"', plates(Dc, 4))) +
          g('data-only="1"', alert(sx, sy - 24) + g('class="late"', check(sx + 26, sy - 12)) + pill(sx - 10, sy - 58, '一次切り分け・復旧')) +
          g('data-only="2"', loopArrow(sx + 52, sy + 8, 11) + pill(sx + 52, sy - 22, '切り戻し')) +
          g('data-only="3"', pill(Sc(Dc)[0] - 20, Sc(Dc)[1] - 70, '属人化を解消')) +
          g('data-only="4"', pill(Sc(Mn)[0] - 110, Sc(Mn)[1] - 40, '死活・リソース監視')) +
          under(Pk, 'リリース') + under(Sv, '本番') + under(Dc, '手順書') + under(Mn, '監視');
      }
    },

    /* 04 参画前と参画後：左（前）と右（後）を、項目ごとに見比べる */
    impact: {
      h: 290, items: '.ba li', labels: ['設計書とソースの整合性を復元', 'テストエビデンスを規定様式で整備', '影響範囲分析で手戻りを削減', '保守手順書を整備し属人化を解消'],
      title: '参画前（左）と参画後（右）を、4つの項目ごとに見比べる図',
      build(L) {
        const { at, add, Sc, g, slab, box, person, personAt, plates, docIcon, check, loopArrow, bigArrow, under, pill } = L;
        const Lb = at(200, 165);
        const Rb = at(560, 165);
        const [lx, ly] = Sc(Lb, 0.45);
        const [rx, ry] = Sc(Rb, 0.45);
        const left = [
          g('class="ghost"', `<g transform="rotate(-14 ${lx - 34} ${ly - 46})">${docIcon(lx - 45, ly - 60)}</g>` + box(add(Lb, 0.9, -0.5), 1.0, 1.0, 1.0, 0.45)) + `<path class="ln ln--dash" d="M${lx - 14} ${ly - 40}L${lx + 10} ${ly - 30}"/>` + pill(lx, ly - 96, 'ずれている'),
          g('class="ghost"', box(Lb, 1.4, 1.4, 1.1, 0.45)) + `<text class="q" x="${lx}" y="${ly - 22}">?</text>` + pill(lx, ly - 80, '証跡がない'),
          loopArrow(lx - 18, ly - 38, 12) + loopArrow(lx + 18, ly - 30, 12) + pill(lx, ly - 80, '手戻り'),
          person(Lb) + g('class="ghost"', [0, 1, 2, 3].map((k) => box(add(Lb, 0, 0), 0.7, 0.7, 0.4, 2.2 + k * 0.42)).join('')) + pill(lx + 70, ly - 60, 'ひとりで抱える')
        ];
        const right = [
          docIcon(rx - 45, ry - 60) + box(add(Rb, 0.9, -0.5), 1.0, 1.0, 1.0, 0.45) + `<path class="ln" d="M${rx - 22} ${ry - 40}L${rx + 10} ${ry - 30}"/>` + check(rx - 2, ry - 72),
          plates(Rb, 3, 1.4, 1.1) + check(rx + 30, ry - 44),
          bigArrow(rx, ry - 30) + check(rx + 36, ry - 52),
          docIcon(rx - 11, ry - 72) + [[-0.9, 0.6], [0.2, 0.9], [0.9, -0.2]].map(([dx, dy]) => { const [a, b] = Sc(add(Rb, dx, dy), 0.45); return personAt(a, b, 0.6); }).join('') + check(rx + 30, ry - 66)
        ];
        return g('', slab(Lb, 3.8)) + g('', slab(Rb, 3.8)) + bigArrow(380, 150, 'class="mid"') +
          left.map((h, i) => g(`data-only="${i + 1}" class="before"`, h)).join('') +
          right.map((h, i) => g(`data-only="${i + 1}" data-hot="${i + 1}"`, h)).join('') +
          under(Lb, '参画前', '', 3.8) + under(Rb, '参画後', 'data-hot="1 2 3 4"', 3.8);
      }
    },

    /* 05 使用技術：言語・FW・DB・インフラの4層と、ツール・開発手法 */
    stack: {
      h: 300, items: '.stack > div', title: '言語・フレームワーク・DB・インフラを4層に重ね、ツールと開発手法を添えた図',
      build(L) {
        const { at, Sc, g, box, tw, pill, slab, monitor, loopArrow, C } = L;
        const c0 = at(290, 238);
        const names = ['インフラ', 'DB', 'フレームワーク', '言語'];
        const [sx, sy] = Sc(c0);
        let layers = '';
        let labels = '';
        names.forEach((nm, b) => {
          const z = b * 1.15;
          const ph = 4 - b;
          layers += g(`class="lift" data-hot="${ph}"`, box(c0, 3.6, 3.6, 0.45, z));
          const ly = sy - (z + 0.45) * 20;
          labels += pill(sx + 3.6 * C + 26 + (tw(nm) + 22) / 2, ly, nm, `data-hot="${ph}"`);
        });
        const T = at(565, 225);
        const kanban = '<path class="ln" d="M0.8 0.25V1.35M1.45 0.25V1.35"/><path class="kc" d="M0.25 0.32h0.42v0.2h-0.42zM0.25 0.64h0.42v0.2h-0.42zM0.92 0.32h0.42v0.2h-0.42zM1.57 0.32h0.42v0.2h-0.42z"/>';
        return layers + labels +
          g('data-hot="5"', slab(T) + monitor(T, kanban)) + L.under(T, 'ツール', 'data-hot="5"') +
          g('data-hot="6"', loopArrow(560, 72, 13) + loopArrow(612, 72, 13)) + pill(586, 108, '開発手法', 'data-hot="6"') +
          pill(560, 40, 'WF', 'data-only="6"') + pill(612, 40, 'アジャイル', 'data-only="6"');
      }
    },

    /* 05 AI駆動開発：ハーネスの枠の中のエージェントが、解析・コード・ドキュメントをつくる */
    ai: {
      h: 310, items: '.works > li', title: 'ハーネスの枠の中で動くAIエージェントが、既存コードを解析し、コードとドキュメントをつくる図',
      build(L) {
        const { at, add, P, Sc, g, slab, box, onBox, poly, monitor, plates, pill, under, seg, line, packets, check, doc, codeLines } = L;
        const Ag = at(380, 165);
        const Lg = at(120, 215);
        const Ed = at(625, 112);
        const Dc = at(615, 250);
        const corners = [[-2.5, -2.5], [2.5, -2.5], [2.5, 2.5], [-2.5, 2.5]].map(([dx, dy]) => add(Ag, dx, dy));
        const frame = poly(corners.map((c) => P(c[0], c[1], 0.05)), 'frame');
        const nodes = corners.map((c) => box(c, 0.55, 0.55, 0.55)).join('');
        const sLA = seg(Lg, Ag, 2.0, 3.0);
        const sAE = seg(Ag, Ed, 3.0, 1.8);
        const sAD = seg(Ag, Dc, 3.0, 2.0);
        const inward = corners.map((c) => packets(seg(c, Ag, 0.4, 1.4), 1, 1.2)).join('');
        const legacyFace = '<path class="ln" d="M0.2 0.3H1.0M0.35 0.55H1.1M0.35 0.8H0.9M0.2 1.05H1.0"/>';
        const [ex, ey] = Sc(Ed, 2.5);
        const [lx, ly] = Sc(Lg, 1.6);
        return g('data-hot="1"', frame) + g('data-hot="1"', nodes) + g('data-only="1"', inward) +
          line(sLA, 'data-hot="2"', 'link link--soft') + g('data-only="2"', packets(sLA, 2, 1.4)) +
          line(sAE, 'data-hot="3"', 'link link--soft') + g('data-only="3"', packets(sAE, 2, 1.4)) +
          line(sAD, 'data-hot="4"', 'link link--soft') + g('data-only="4"', packets(sAD, 2, 1.4)) +
          g('data-hot="3"', slab(Ed) + monitor(Ed, `<g transform="scale(0.0425)">${codeLines(8, 7, [26, 34, 20, 28])}</g>`)) +
          g('data-hot="1 2 3 4"', slab(Ag) + box(Ag, 1.2, 1.2, 1.2, 0.45) + onBox(Ag, 1.2, 1.2, 1.65, '<text class="ai" x="0.6" y="0.78">AI</text>')) +
          g('data-hot="2"', slab(Lg) + box(Lg, 1.4, 1.4, 1.15, 0.45) + onBox(Lg, 1.4, 1.4, 1.6, legacyFace)) +
          g('data-hot="4"', slab(Dc) + g('data-pop="4"', plates(Dc, 3))) +
          g('data-only="1"', pill(380, 94, '読ませるもの') + pill(512, 168, '道具') + pill(380, 248, '権限') + pill(246, 168, '検証')) +
          g('data-only="2"', doc(lx - 30, ly - 80, '仕様書')) +
          g('data-only="3"', g('class="late"', check(ex + 52, ey - 6)) + pill(ex - 20, ey - 30, 'セルフレビュー')) +
          g('data-only="4"', pill(Sc(Dc)[0] - 10, Sc(Dc)[1] - 66, '議事録・報告書・手順書')) +
          under(Lg, '既存コード') + under(Ed, 'コード') + under(Dc, 'ドキュメント');
      }
    },

    /* 05 情報管理・セキュリティ：NDA、VPN でつなぐ、証跡を残す */
    security: {
      h: 320, items: '.cards3 > li', title: 'NDAを結び、客先の規定に沿ってVPNでつなぎ、作業の証跡を残す図',
      build(L) {
        const { at, Sc, g, slab, building, monitor, plates, pill, under, seg, line, packets, lock, shield, doc, check, codeLines } = L;
        const E = at(165, 200);
        const Cl = at(590, 150);
        const Lg = at(390, 255);
        const sEC = seg(E, Cl, 2.0, 2.0);
        const sEL = seg(E, Lg, 2.0, 1.9);
        const [ex, ey] = Sc(E, 2.2);
        return `<path class="tunnel" d="${sEC.d}" data-hot="2"/>` + line(sEC, 'data-hot="2"', 'link link--soft') + g('data-only="2"', packets(sEC, 3, 1.6)) +
          line(sEL, 'data-hot="3"', 'link link--soft') +
          g('data-hot="1"', slab(Cl) + building(Cl, 1.8, 1.8, 2.2)) +
          g('data-hot="2"', slab(E) + monitor(E, `<g transform="scale(0.0425)">${codeLines(8, 7, [26, 18, 30])}</g>`, 1.8, 1.2)) +
          g('data-hot="3"', slab(Lg) + g('data-pop="3"', plates(Lg, 5, 1.6, 1.2, 0.12, 0.06))) +
          g('data-only="1"', lock(372, 86) + doc(394, 70, 'NDA')) +
          g('data-only="2"', shield(ex + 4, ey - 40) + pill(sEC.mid[0], sEC.mid[1] - 30, 'VPN・作業端末')) +
          g('data-only="3"', g('class="late"', check(Sc(Lg)[0] + 40, Sc(Lg)[1] - 50)) + pill(Sc(Lg)[0] - 10, Sc(Lg)[1] - 82, '作業ログ・レビュー記録')) +
          under(E, '作業端末') + under(Cl, 'お客さま', 'data-hot="1"') + under(Lg, '証跡', 'data-hot="3"');
      }
    },

    /* 06 WORKURU：配置を決める → 本人に通知 → 打刻・日報が返ってくる */
    workuru: {
      h: 300, labels: ['配置を決める', '本人のアプリに通知', '打刻・日報が届く'], title: '管理者が配置を決めると、メンバーのアプリに通知が届き、打刻と日報が返ってくる図',
      build(L) {
        const { at, add, Sc, g, slab, monitor, phone, pill, under, seg, line, packets, check, docIcon } = L;
        const B = at(230, 170);
        const Ph = at(560, 175);
        const s1 = seg(B, Ph, 2.4, 2.4);
        let cells = '<path class="ln" d="M0.2 0.3H2.6"/>';
        let k = 0;
        for (let r = 0; r < 3; r++) for (let q = 0; q < 4; q++) { cells += `<path class="cell seq" style="--d:${(k * 0.08).toFixed(2)}s" d="M${(0.25 + q * 0.6).toFixed(2)} ${(0.45 + r * 0.42).toFixed(2)}h0.48v0.3h-0.48z"/>`; k += 1; }
        const phoneInner = '<path class="ln" d="M0.2 0.35H0.6M0.2 0.55H0.5"/><path class="cta" d="M0.18 1.0H0.62V1.22H0.18Z"/>';
        const phones = [[-0.9, 0.9], [0, 0], [0.9, -0.9]].map(([dx, dy]) => [add(Ph, dx, dy), phone(add(Ph, dx, dy), phoneInner)]);
        const [bx, by] = Sc(B, 2.7);
        const [px, py] = Sc(Ph, 2.0);
        return line(s1, 'data-hot="2 3"', 'link link--soft') + g('data-only="2"', packets(s1, 3, 1.4)) + g('data-only="3"', packets(s1, 3, 1.4, true)) +
          g('data-hot="1 3"', slab(B, 3.2) + monitor(B, g('data-pop="1"', cells), 2.8, 1.9)) +
          g('data-hot="2"', slab(Ph, 3.4) + phones.map((p) => p[1]).join('')) +
          g('data-only="2"', pill(px, py - 46, '通知が届く')) +
          g('data-only="3"', g('class="late"', check(bx + 70, by - 8)) + docIcon(bx + 84, by - 30) + pill(bx + 30, by - 50, '打刻・日報・写真')) +
          under(B, '管理者（配置ボード）', '', 3.2) + under(Ph, 'メンバー', '', 3.4);
      }
    },

    /* 06 ペットナビ：データ元 → 自動更新 → DB → Web・アプリ → 地図 */
    petnavi: {
      h: 330, labels: ['データを自動で更新', 'Web とアプリに反映', '地図から探す'], title: 'データ元から自動でDBを更新し、Webとアプリ、地図に反映する図',
      build(L) {
        const { at, add, P, Sc, g, slab, box, cyl, monitor, phone, pin, gear, pill, under, seg, line, packets, codeLines } = L;
        const Sr = at(120, 150);
        const Db = at(320, 228);
        const Ou = at(520, 150);
        const Mp = at(625, 262);
        const s1 = seg(Sr, Db);
        const s2 = seg(Db, Ou);
        const s3 = seg(Ou, Mp, 2.0, 2.3);
        const srcs = [[-0.6, -0.5], [0.6, -0.4], [-0.1, 0.6]].map(([dx, dy]) => box(add(Sr, dx, dy), 0.8, 0.8, 0.8, 0.45)).join('');
        const plate = (() => {
          const [x, y] = [Mp[0] - 1.7, Mp[1] - 1.7];
          let d = '';
          for (let i = 1; i < 4; i++) { const a = P(x + i * 0.85, y, 0.2); const b = P(x + i * 0.85, y + 3.4, 0.2); const p = P(x, y + i * 0.85, 0.2); const q = P(x + 3.4, y + i * 0.85, 0.2); d += `M${r1(a[0])} ${r1(a[1])}L${r1(b[0])} ${r1(b[1])}M${r1(p[0])} ${r1(p[1])}L${r1(q[0])} ${r1(q[1])}`; }
          return box(Mp, 3.4, 3.4, 0.2) + `<path class="ln ln--thin" d="${d}"/>`;
        })();
        const pins = [[-0.8, -0.6], [0.7, -0.9], [0.2, 0.5], [-0.9, 0.8], [1.0, 0.6]].map(([dx, dy], i) => { const [x, y] = P(Mp[0] + dx, Mp[1] + dy, 0.2); return `<g ${L.seq(i, 0.15)}>${pin(x, y - 14)}</g>`; }).join('');
        return line(s1, 'data-hot="1"', 'link link--soft') + g('data-only="1"', packets(s1, 3, 1.6)) +
          line(s2, 'data-hot="2"', 'link link--soft') + g('data-only="2"', packets(s2, 3, 1.4)) +
          line(s3, 'data-hot="3"', 'link link--soft') +
          g('data-hot="1"', slab(Sr) + srcs) +
          g('data-hot="2"', slab(Ou, 3.0) + monitor(add(Ou, -0.35, 0.15), `<g transform="scale(0.0425)">${codeLines(6, 6, [18, 24, 14])}</g>`, 1.6, 1.2) + phone(add(Ou, 0.95, -0.55))) +
          g('data-hot="1 2"', slab(Db) + cyl(Db, 0.95, 0.45, 2.0)) +
          g('data-hot="3"', plate + g('data-pop="3"', pins)) +
          g('data-hot="1"', gear(232, 118, 18)) + pill(232, 152, '自動更新', 'data-hot="1"') +
          g('data-only="1"', pill(232, 82, '毎月・毎週・毎日')) +
          g('data-only="2"', pill(Sc(Ou)[0], Sc(Ou)[1] - 92, '同じデータを読む')) +
          under(Sr, 'データ元') + under(Db, 'DB') + under(Ou, 'Web・アプリ', '', 3.0) + under(Mp, '地図', 'data-hot="3"', 3.4);
      }
    },

    /* 06 smaholic：各チェーン → 週1回の同期 → 店舗データ → 静的ページ → サイト。異常なら止める */
    smaholic: {
      h: 300, labels: ['週1回、自動で同期', 'ページを書き出して配信', '異常なら反映せずに知らせる'], title: '各チェーンの店舗一覧を週1回同期し、静的ページを書き出して配信し、異常なら止めて知らせる図',
      build(L) {
        const { at, add, Sc, g, slab, building, plates, monitor, gear, stop, mover, envMini, pill, under, seg, line, packets, codeLines } = L;
        const Ch = at(125, 175);
        const Dt = at(330, 230);
        const Pg = at(505, 145);
        const Wb = at(640, 230);
        const s1 = seg(Ch, Dt);
        const s2 = seg(Dt, Pg);
        const s3 = seg(Pg, Wb);
        const shops = [[-0.75, -0.6], [0.7, -0.6], [0, 0.7]].map(([dx, dy]) => [add(Ch, dx, dy), building(add(Ch, dx, dy), 0.8, 0.8, 1.0)]);
        const sheets = Array.from({ length: 4 }, (_, i) => g(L.seq(i, 0.12), L.box(add(Pg, -0.2 + i * 0.14, 0.2 - i * 0.14), 1.6, 1.1, 0.1, 0.45 + i * 0.26))).join('');
        const [gx, gy] = [290, 95];
        return line(s1, 'data-hot="1"', 'link link--soft') + g('data-only="1"', packets(s1, 3, 1.5)) +
          line(s2, 'data-hot="2"', 'link link--soft') + g('data-only="2"', packets(s2, 2, 1.3)) +
          line(s3, 'data-hot="2"', 'link link--soft') + g('data-only="2"', packets(s3, 2, 1.3)) +
          g('data-hot="2"', slab(Pg) + g('data-pop="2"', sheets)) +
          g('data-hot="1"', slab(Ch, 3.0) + L.g('', shops.sort((a, b) => Sc(a[0])[1] - Sc(b[0])[1]).map((s) => s[1]).join(''))) +
          g('data-hot="1"', slab(Dt) + plates(Dt, 3)) +
          g('data-hot="2"', slab(Wb) + monitor(Wb, `<g transform="scale(0.0425)">${codeLines(8, 7, [24, 30, 18, 26])}</g>`)) +
          g('data-hot="1 3"', gear(gx, gy, 18)) + pill(gx, gy + 34, '週1回 同期', 'data-hot="1"') +
          g('data-only="3"', stop(gx + 34, gy - 18) + mover(`M${gx + 50} ${gy - 30}L${gx + 170} ${gy - 60}`, envMini(), 1.6) + pill(gx + 150, gy - 22, '反映をやめて、メール')) +
          under(Ch, '各チェーン', '', 3.0) + under(Dt, '店舗データ') + under(Pg, '静的ページ') + under(Wb, 'smaholic.com');
      }
    },

    /* 06 じゃ〜なる：1つのプログラム → 4地域のサイト。ボットが記事を足し、アプリも同じ記事を読む */
    journal: {
      h: 300, labels: ['1つのプログラムで4サイト', 'ニュースボットが記事を追加', 'アプリも同じ記事を読む'], title: '1つのプログラムで4地域のサイトを動かし、ボットが記事を足し、アプリも同じ記事を読む図',
      build(L) {
        const { at, add, Sc, g, slab, box, onBox, cyl, monitor, phone, clock, pill, under, seg, line, packets, mover, docMini, codeLines } = L;
        const Bt = at(115, 215);
        const Pr = at(270, 125);
        const Db = at(385, 245);
        const St = at(565, 120);
        const Ph = at(645, 245);
        const s1 = seg(Pr, St, 2.0, 2.6);
        const s2 = seg(Bt, Db);
        const s3 = seg(Db, Ph);
        const s4 = seg(Pr, Db);
        const sites = [[-0.85, -0.85], [0.85, -0.85], [-0.85, 0.85], [0.85, 0.85]].map(([dx, dy]) => [add(St, dx, dy), monitor(add(St, dx, dy), '', 1.1, 0.8)]);
        const bot = box(Bt, 1.2, 1.2, 0.9, 0.45) + box(Bt, 0.8, 0.8, 0.5, 1.35) + onBox(Bt, 0.8, 0.8, 1.85, '<circle class="eye" cx="0.25" cy="0.25" r="0.07"/><circle class="eye" cx="0.55" cy="0.25" r="0.07"/>');
        const [bx, by] = Sc(Bt, 2.0);
        return line(s4, '', 'link link--soft') +
          line(s1, 'data-hot="1"', 'link link--soft') + g('data-only="1"', packets(s1, 4, 1.6)) +
          line(s2, 'data-hot="2"', 'link link--soft') + g('data-only="2"', mover(s2.d, docMini(), 1.6) + mover(s2.d, docMini(), 1.6, 0.8)) +
          line(s3, 'data-hot="3"', 'link link--soft') + g('data-only="3"', packets(s3, 3, 1.3)) +
          g('data-hot="1"', slab(St, 3.6) + sites.sort((a, b) => Sc(a[0])[1] - Sc(b[0])[1]).map((s) => s[1]).join('')) +
          g('data-hot="1"', slab(Pr) + box(Pr, 1.3, 1.3, 1.2, 0.45) + onBox(Pr, 1.3, 1.3, 1.65, `<g transform="scale(0.05)">${codeLines(4, 4, [14, 18, 10, 16])}</g>`)) +
          g('data-hot="2"', slab(Bt) + bot) +
          g('data-hot="2 3"', slab(Db) + cyl(Db, 0.95, 0.45, 2.0)) +
          g('data-hot="3"', slab(Ph) + phone(Ph, '<path class="ln" d="M0.2 0.35H0.6M0.2 0.55H0.6M0.2 0.75H0.45"/>')) +
          g('data-only="2"', clock(bx + 40, by - 30) + pill(bx + 40, by - 62, '毎日 8:00・15:00')) +
          under(Bt, 'ニュースボット') + under(Pr, 'プログラム') + under(Db, 'DB') + under(St, '置賜・村山・最上・庄内', '', 3.6) + under(Ph, 'アプリ');
      }
    },

    /* 07 契約形態・稼働条件：項目ごとに、まわりの絵が入れかわる */
    terms: {
      h: 310, items: '.spec > div', title: '契約形態・商流・稼働形態・進捗報告を、項目ごとに表した図',
      build(L) {
        const { at, add, Sc, g, slab, box, building, house, monitor, person, pill, under, seg, line, packets, mover, docMini, doc } = L;
        const E = at(380, 170);
        const B1 = at(105, 110);
        const B2 = at(185, 235);
        const Cr = at(650, 175);
        const Ho = at(170, 180);
        const Of = at(600, 180);
        const Bd = at(615, 150);
        const s12 = seg(B1, B2, 1.8, 1.8);
        const s2E = seg(B2, E, 1.8, 2.0);
        const sCE = seg(Cr, E, 1.8, 2.0);
        const sEB = seg(E, Bd, 2.0, 1.8);
        const days = [0, 1, 2, 3, 4].map((i) => g(L.seq(i, 0.1), box(at(300 + i * 40, 270), 0.9, 0.9, 0.5))).join('');
        const kanban = '<path class="ln" d="M0.8 0.25V1.35M1.45 0.25V1.35"/><path class="kc" d="M0.25 0.32h0.42v0.2h-0.42zM0.25 0.64h0.42v0.2h-0.42zM0.92 0.32h0.42v0.2h-0.42zM1.57 0.32h0.42v0.2h-0.42z"/>';
        return g('data-only="2"', line(s12, '', 'link') + line(s2E, '', 'link') + line(sCE, '', 'link link--hot') + packets(s2E, 2, 1.4) + packets(sCE, 2, 1.4)) +
          g('data-only="4"', line(sEB, '', 'link link--hot') + mover(sEB.d, docMini(), 1.6) + mover(sEB.d, docMini(), 1.6, 0.8)) +
          g('data-only="2"', slab(B1) + building(B1, 1.4, 1.4, 1.5) + slab(B2) + building(B2, 1.4, 1.4, 1.2)) +
          g('data-only="3" data-hot="3"', slab(Ho) + house(Ho)) +
          g('data-only="3" class="before"', slab(Of) + building(Of, 1.6, 1.6, 2.0)) +
          g('data-only="4" data-hot="4"', slab(Bd) + monitor(Bd, kanban)) +
          g('data-only="2" data-hot="2"', slab(Cr) + building(Cr, 1.6, 1.6, 2.0)) +
          g('data-hot="1 2 3 4"', slab(E) + person(E)) +
          g('data-only="1" data-pop="1"', `<g ${L.seq(0)}>${doc(160, 60, 'SES')}</g><g ${L.seq(1)}>${doc(318, 34, '準委任')}</g><g ${L.seq(2)}>${doc(500, 60, '一括請負')}</g>`) +
          g('data-only="2"', pill(78, 252, '商流が深くても可') + pill(sCE.mid[0] + 10, sCE.mid[1] - 26, '直接契約も相談可') + under(Cr, 'お客さま')) +
          g('data-only="3" data-pop="3"', days) + g('data-only="3"', pill(380, 296, '週5日〜・月140h〜') + under(Ho, 'リモート中心', 'data-hot="3"') + under(Of, '客先常駐も相談可')) +
          g('data-only="4"', pill(sEB.mid[0] - 10, sEB.mid[1] - 28, '日報・週報') + under(Bd, 'Backlog・Redmine・JIRA')) +
          under(E, 'Yui Kikuchi');
      }
    },

    /* 07 ご発注までの流れ：スキルシート → 面談 → 条件調整 → 稼働開始（工程の図に合わせて進む） */
    flow: {
      h: 280, sync: 'steps', title: 'スキルシートの提出から、面談・条件調整を経て、稼働開始までの図',
      build(L) {
        const { at, Sc, g, slab, person, pill, under, seg, line, packets, mover, arc, docMini, bubble, sliders, flag } = L;
        const E = at(190, 185);
        const Cl = at(570, 185);
        const s1 = seg(E, Cl, 2.2, 2.2);
        const [ex, ey] = Sc(E, 2.4);
        const [cx, cy] = Sc(Cl, 2.4);
        return line(s1, 'data-hot="4"', 'link link--soft') + g('data-only="4"', packets(s1, 2, 1.6) + packets(s1, 2, 1.6, true)) +
          g('data-hot="1 2 4"', slab(E) + person(E)) +
          g('data-hot="2 4"', slab(Cl) + person(Cl)) +
          g('data-only="1"', mover(arc([ex + 20, ey], [cx - 20, cy], 70), docMini(), 2.2) + pill(380, 56, 'スキルシート')) +
          g('data-only="2"', bubble(ex + 14, ey - 46) + bubble(cx - 70, cy - 46, '', 0.6) + pill(380, 120, 'オンライン／対面')) +
          g('data-only="3" data-hot="3"', sliders(380, 105)) + g('data-only="3"', pill(380, 156, '契約形態・稼働条件')) +
          g('data-only="4" data-hot="4"', flag(372, 150)) + g('data-only="4"', pill(380, 96, '稼働開始')) +
          under(E, 'Yui Kikuchi') + under(Cl, 'お客さま');
      }
    },

    /* 07 お問い合わせ：メールがとどく、GitHub を見る */
    contact: {
      h: 280, items: '.contacts > li', title: 'あなたから Yui Kikuchi へメールがとどき、GitHub のコードも見られる図',
      build(L) {
        const { at, Sc, g, slab, person, pill, under, mover, arc, envMini, win, codeLines } = L;
        const Y = at(190, 190);
        const M = at(570, 190);
        const [yx, yy] = Sc(Y, 2.4);
        const [mx, my] = Sc(M, 2.4);
        return g('data-hot="2"', slab(Y) + person(Y)) +
          g('data-hot="1"', slab(M) + person(M)) +
          g('data-only="1"', mover(arc([yx + 20, yy], [mx - 20, my], 80), envMini(), 2.0) + mover(arc([yx + 20, yy], [mx - 20, my], 80), envMini(), 2.0, 1.0) + pill(380, 50, 'yui.kikuchi@yahoo.com')) +
          g('data-only="2" data-hot="2"', win(300, 40, 160, 84, '', codeLines(312, 64, [70, 96, 52, 84, 60]))) +
          g('data-only="2"', pill(380, 146, 'github.com/yuikikuchi')) +
          under(Y, 'あなた') + under(M, 'Yui Kikuchi');
      }
    }
  };

  window.MS_VIZ = { W, makeLib, SCENES };
})();
