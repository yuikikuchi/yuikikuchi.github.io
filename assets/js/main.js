/* ==========================================================================
   METASYSTEM — ポートフォリオ
   ライブラリなし。ページは index.html に全部書いてあり、ここでは
   「左のツリーでえらんだ1ページだけを出す」ようにしている。
   JavaScript がないときは、全部のページが上から順に並ぶ。
   ========================================================================== */
(() => {
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const icon = (name) => `<svg class="i" aria-hidden="true"><use href="#i-${name}"/></svg>`;

  const main = $('#main');
  const side = $('#side');
  const pages = $$('.page');
  const files = $$('.file', side);
  const dirs = $$('.dir', side);
  if (!main || !side || !pages.length) return;

  const byId = new Map(pages.map((p) => [p.id, p]));
  const fileOf = new Map(files.map((a) => [a.hash.slice(1), a]));
  const order = files.map((a) => a.hash.slice(1));      // ツリーの上からの順
  const titleOf = (id) => $('.title', byId.get(id)).firstChild.textContent.trim();
  const SITE = document.title;

  // 読んだページは、ブラウザに覚えておく
  let read = new Set();
  try { read = new Set(JSON.parse(localStorage.getItem('ms-read') || '[]').filter((id) => byId.has(id))); } catch (e) { /* 読めなくても動く */ }
  const save = () => { try { localStorage.setItem('ms-read', JSON.stringify(Array.from(read))); } catch (e) { /* 保存できなくても動く */ } };

  let current = '';
  const steppers = {};   // ページの id → 工程・ステップの図の操作

  /* ───────── フォルダ：押すと開閉する。はじめは、いまのページのフォルダだけ開けておく ───────── */
  const openDir = (d, open) => { d.classList.toggle('is-open', open); $('.dir__btn', d).setAttribute('aria-expanded', String(open)); };
  dirs.forEach((d) => {
    openDir(d, false);
    $('.dir__btn', d).addEventListener('click', () => openDir(d, !d.classList.contains('is-open')));
  });

  /* ───────── 各ページに「どのフォルダの何番目か」と「戻る・次へ」を足す ───────── */
  pages.forEach((p) => {
    const a = fileOf.get(p.id);
    const d = a.closest('.dir');
    const siblings = $$('.file', d);
    const crumb = $('.crumb', p);
    if (crumb) crumb.textContent = `${$('.dir__btn span', d).textContent} / ${siblings.indexOf(a) + 1} of ${siblings.length}`;

    const i = order.indexOf(p.id);
    const note = $('.note', p);
    const nav = document.createElement('nav');
    nav.className = 'nav';
    nav.setAttribute('aria-label', '前後のページ');
    nav.innerHTML =
      `<a class="btn" data-back href="#${order[i - 1] || ''}"${i === 0 ? ' aria-disabled="true" tabindex="-1"' : ''}>${icon('left')}戻る</a>` +
      `<a class="btn btn--go" data-next href="#${order[i + 1] || order[0]}"><span></span>${icon('right')}</a>`;
    note.appendChild(nav);
    const keys = document.createElement('p');
    keys.className = 'keys';
    keys.innerHTML = '<kbd>←</kbd><kbd>→</kbd><span>で前後へ</span>';
    note.appendChild(keys);
    p._next = order[i + 1] ? `次へ：${titleOf(order[i + 1])}` : '最初のページへ';
    $('[data-next] span', nav).textContent = p._next;
  });

  /* ───────── 対応工程の図：工程を進めるごとに、システムが組み上がっていく ─────────
     等角（アイソメトリック）の図を、座標から計算して SVG に描く。座標は（x＝右下へ、y＝左下へ、z＝上へ）のマス目。
     要素につける印：
       data-in="n"    n 番目の工程から出る        data-only="n"  n 番目の工程のときだけ出る
       data-solid="n" n 番目から実線（それまでは「設計中」の青い破線）   data-hot="n m"  その工程のとき、オレンジで強調 */
  const viz = (() => {
    const box = $('[data-viz]');
    const svg = box && $('.viz__svg', box);
    if (!svg) return null;
    const U = 20, C = U * 0.866, S = U * 0.5, OX = 380, OY = 24;
    const P = (x, y, z = 0) => [OX + (x - y) * C, OY + (x + y) * S - z * U];
    const r1 = (n) => Math.round(n * 10) / 10;
    const pts = (a) => a.map((p) => `${r1(p[0])},${r1(p[1])}`).join(' ');
    const poly = (a, cls) => `<polygon class="${cls}" points="${pts(a)}"/>`;
    // 箱：上の面・左下を向く面・右下を向く面
    const cube = (x, y, z, w, d, h) =>
      poly([P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)], 'f-top') +
      poly([P(x, y + d, z + h), P(x + w, y + d, z + h), P(x + w, y + d, z), P(x, y + d, z)], 'f-l') +
      poly([P(x + w, y, z + h), P(x + w, y + d, z + h), P(x + w, y + d, z), P(x + w, y, z)], 'f-r');
    const SL = 2.6;   // 台の大きさ
    const slab = ([cx, cy]) => cube(cx - SL / 2, cy - SL / 2, 0, SL, SL, 0.45);
    // 左下を向く面（y が一定）に貼る絵。中の座標は（横＝x の1マス、下＝z の1マス）
    const onFace = (x, y, z) => { const [a, b] = P(x, y, z); return `matrix(${r1(C)} ${r1(S)} 0 ${U} ${r1(a)} ${r1(b)})`; };
    const cylinder = ([cx, cy], r, z0, z1) => {
      const [a0, b0] = P(cx, cy, z0);
      const [a1, b1] = P(cx, cy, z1);
      const rx = 1.414 * r * C;
      const ry = 1.414 * r * S;
      const band = (k) => { const b = b0 + (b1 - b0) * k; return `<path class="band" d="M${r1(a0 - rx)} ${r1(b)}A${r1(rx)} ${r1(ry)} 0 0 0 ${r1(a0 + rx)} ${r1(b)}"/>`; };
      return `<path class="f-l" d="M${r1(a1 - rx)} ${r1(b1)}L${r1(a0 - rx)} ${r1(b0)}A${r1(rx)} ${r1(ry)} 0 0 0 ${r1(a0 + rx)} ${r1(b0)}L${r1(a1 + rx)} ${r1(b1)}Z"/>` +
        band(0.36) + band(0.68) + `<ellipse class="f-top" cx="${r1(a1)}" cy="${r1(b1)}" rx="${r1(rx)}" ry="${r1(ry)}"/>`;
    };
    const person = ([cx, cy]) => {
      const [a, b] = P(cx, cy, 0.45);
      return `<path class="f-top" d="M${r1(a - 12)} ${r1(b)}V${r1(b - 12)}Q${r1(a - 12)} ${r1(b - 24)} ${r1(a)} ${r1(b - 24)}Q${r1(a + 12)} ${r1(b - 24)} ${r1(a + 12)} ${r1(b - 12)}V${r1(b)}Z"/>` +
        `<circle class="f-top" cx="${r1(a)}" cy="${r1(b - 33)}" r="8"/>`;
    };
    // 名札。文字の幅は、半角 7.4px・全角 12.5px として見積もる
    const tw = (s) => Array.from(s).reduce((n, ch) => n + (/[ -~]/.test(ch) ? 7.4 : 12.5), 0);
    const pill = (x, y, s, attrs) => {
      const w = tw(s) + 22;
      return `<g class="pill" ${attrs || ''}><rect x="${r1(x - w / 2)}" y="${r1(y - 11)}" width="${r1(w)}" height="22" rx="11"/><text x="${r1(x)}" y="${r1(y + 4.5)}">${s}</text></g>`;
    };
    const doc = (x, y, s, attrs) =>
      `<g class="doc" ${attrs}><path class="f-top" d="M${x} ${y}h15l7 7v21h-22z"/><path class="ln" d="M${x + 15} ${y}v7h7M${x + 5} ${y + 13}h12M${x + 5} ${y + 18}h12M${x + 5} ${y + 23}h7"/>` +
      pill(x + 32 + (tw(s) + 22) / 2, y + 14, s) + '</g>';
    const check = ([a, b]) => `<g class="chk"><circle cx="${r1(a)}" cy="${r1(b)}" r="8"/><path d="M${r1(a - 3.5)} ${r1(b)}l2.5 2.6 4.6-5"/></g>`;

    // 置き場所（台の中心）
    const AT = { client: [4.58, 19.02], screen: [5.7, 10.9], app: [7.32, 3.28], db: [15.81, 0.8], ops: [19.0, 8.6] };
    // 地面の線。台の縁から縁まで（両端を 2 マスずつ縮める）
    const seg = (A, B) => {
      const dx = B[0] - A[0];
      const dy = B[1] - A[1];
      const L = Math.hypot(dx, dy);
      const a = P(A[0] + (dx / L) * 2, A[1] + (dy / L) * 2);
      const b = P(B[0] - (dx / L) * 2, B[1] - (dy / L) * 2);
      return { d: `M${r1(a[0])} ${r1(a[1])}L${r1(b[0])} ${r1(b[1])}`, mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] };
    };
    const L1 = seg(AT.client, AT.screen);
    const L2 = seg(AT.screen, AT.app);
    const L3 = seg(AT.app, AT.db);
    const LM = seg(AT.ops, AT.app);
    const packets = (s, n) => Array.from({ length: n }, (_, k) =>
      `<circle class="pk" r="4.5"><animateMotion dur="1.8s" repeatCount="indefinite" begin="${(-k * 1.8 / n).toFixed(2)}s" path="${s.d}"/></circle>`).join('');

    // 方眼（地面）
    let grid = '';
    for (let i = -20; i <= 45; i += 1) {
      const a = P(i, -20); const b = P(i, 45); const c = P(-20, i); const d = P(45, i);
      grid += `M${r1(a[0])} ${r1(a[1])}L${r1(b[0])} ${r1(b[1])}M${r1(c[0])} ${r1(c[1])}L${r1(d[0])} ${r1(d[1])}`;
    }

    // アプリの部品（4つの箱）と、ラック
    const [ax, ay] = AT.app;
    const parts = [[-1.05, -1.05, 1.5], [0.15, -1.05, 1.1], [-1.05, 0.15, 1.1], [0.15, 0.15, 0.7]];
    const [ox, oy] = AT.ops;

    svg.insertAdjacentHTML('beforeend',
      '<defs>' +
        '<marker id="vArr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#1e1c19"/></marker>' +
        '<marker id="vArrB" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#6f9fea"/></marker>' +
      '</defs>' +
      `<path class="grid" d="${grid}"/>` +

      // 地面の線と、流れるデータ
      `<path class="link" d="${L1.d}" data-in="2" data-solid="4" data-hot="5"/>` +
      `<path class="link" d="${L2.d}" data-in="3" data-solid="4" data-hot="5"/>` +
      `<path class="link" d="${L3.d}" data-in="3" data-solid="4" data-hot="5"/>` +
      `<path class="mon" d="${LM.d}" data-in="6"/>` +
      `<g data-in="5">${packets(L1, 2)}${packets(L2, 2)}${packets(L3, 2)}</g>` +
      `<g data-in="5">${[L1, L2, L3].map((l) => check([l.mid[0] + 14, l.mid[1] - 14])).join('')}</g>` +

      // 物（奥から手前へ）
      `<g data-in="3" data-solid="4" data-hot="3 4">${slab(AT.app)}${parts.map(([dx, dy, h]) => cube(ax + dx, ay + dy, 0.45, 0.9, 0.9, h)).join('')}</g>` +
      `<g data-in="3" data-solid="4" data-hot="3">${slab(AT.db)}${cylinder(AT.db, 0.95, 0.45, 2.2)}</g>` +
      `<g data-in="2" data-hot="2">${slab(AT.screen)}` +
        `${cube(AT.screen[0] - 0.15, AT.screen[1] - 0.15, 0.45, 0.3, 0.3, 0.45)}` +
        `${cube(AT.screen[0] - 1.1, AT.screen[1] + 0.2, 0.9, 2.2, 0.15, 1.6)}` +
        `<g transform="${onFace(AT.screen[0] - 1.1, AT.screen[1] + 0.35, 2.5)}">` +
          '<path class="scr" d="M0.12 0.12H2.08V1.48H0.12Z"/>' +
          '<path class="wf" pathLength="1" d="M0.26 0.26H1.94V0.42H0.26Z"/>' +
          '<path class="wf" pathLength="1" d="M0.26 0.56H0.98V1.32H0.26Z"/>' +
          '<path class="wf" pathLength="1" d="M1.12 0.62H1.94M1.12 0.84H1.84M1.12 1.06H1.6"/>' +
          '<path class="wf" pathLength="1" d="M1.12 1.18H1.6V1.32H1.12Z"/>' +
        '</g></g>' +
      `<g data-in="1" data-hot="1">${slab(AT.client)}${person(AT.client)}</g>` +
      `<g data-in="6" data-hot="6">${slab(AT.ops)}${cube(ox - 0.6, oy - 0.6, 0.45, 1.2, 1.2, 2.2)}` +
        `<g transform="${onFace(ox - 0.6, oy + 0.6, 2.65)}">` +
          '<path class="scr" d="M0.12 0.18H1.08V0.92H0.12Z"/>' +
          '<path class="pulse" pathLength="1" d="M0.18 0.62H0.42L0.52 0.3L0.66 0.86L0.76 0.55H1.02"/>' +
          '<path class="ln" d="M0.14 1.25H0.7M0.14 1.55H0.7M0.14 1.85H0.7"/>' +
          '<circle class="lamp" cx="0.95" cy="1.25" r="0.08"/><circle class="lamp lamp--2" cx="0.95" cy="1.55" r="0.08"/><circle class="lamp lamp--3" cx="0.95" cy="1.85" r="0.08"/>' +
        '</g></g>' +

      // その工程のときだけ出るもの
      (() => { const [hx, hy] = P(AT.client[0], AT.client[1], 0.45); const bx = hx + 16; const by = hy - 83;
        return `<g data-only="1"><g class="bubble"><path d="M${r1(bx)} ${r1(by)}h56a6 6 0 0 1 6 6v16a6 6 0 0 1-6 6h-40l-10 9 2-9h-8a6 6 0 0 1-6-6v-16a6 6 0 0 1 6-6z"/>` +
          [0, 1, 2].map((k) => `<circle class="td" cx="${r1(bx + 16 + k * 12)}" cy="${r1(by + 14)}" r="3" style="animation-delay:${k * 0.2}s"/>`).join('') + '</g></g>'; })() +
      doc(196, 214, '要件定義書', 'data-only="1"') +
      doc(150, 112, '外部設計書', 'data-only="2"') +
      doc(520, 44, '詳細設計書', 'data-only="3"') +
      '<g data-only="4" class="code"><rect class="f-top" x="250" y="26" width="132" height="76" rx="6"/><path class="ln" d="M250 40H382"/>' +
        '<circle class="dotb" cx="259" cy="33" r="2.2"/><circle class="dotb" cx="267" cy="33" r="2.2"/><circle class="dotb" cx="275" cy="33" r="2.2"/>' +
        [[56, 0], [88, 0.25], [70, 0.5], [44, 0.75], [64, 1]].map(([w, dl], k) => `<rect class="cl" x="${k === 2 || k === 3 ? 272 : 260}" y="${48 + k * 10}" width="${w}" height="4" rx="2" style="animation-delay:${dl}s"/>`).join('') +
      '</g>' +
      `<g data-in="4">${parts.map(([dx, dy, h]) => check([P(ax + dx + 0.45, ay + dy + 0.45, 0.45 + h)[0], P(ax + dx + 0.45, ay + dy + 0.45, 0.45 + h)[1] - 2])).join('')}</g>` +
      (() => { const [a, b] = P(ox, oy, 2.65); const cy = b - 26;
        return `<g data-in="6"><g class="spin"><path class="ln" d="M${r1(a + 11)} ${r1(cy)}A11 11 0 1 1 ${r1(a)} ${r1(cy - 11)}"/><path class="ln" d="M${r1(a - 4)} ${r1(cy - 15)}L${r1(a)} ${r1(cy - 11)}L${r1(a - 4)} ${r1(cy - 7)}"/></g></g>`; })() +

      // 名札
      pill(130, 304, 'お客さま', 'data-in="1" data-hot="1"') +
      pill(290, 234, '画面', 'data-in="2" data-hot="2 5"') +
      pill(450, 50, 'アプリ', 'data-in="3" data-hot="3 4 5"') +
      pill(640, 234, 'DB', 'data-in="3" data-hot="3 5"') +
      pill(560, 344, '運用・監視', 'data-in="6" data-hot="6"'));

    const els = $$('[data-in],[data-only],[data-solid],[data-hot]', svg);
    const tiles = $$('.viz__tiles li', box).map((li) => ({
      li,
      b: $('b', li),
      vals: li.dataset.v.split('|').map((s) => { const [n, t] = s.split(':'); return [Number(n), t]; })
    }));
    // 狭い画面では、いまの工程のまわりに寄る（横の長さ、縦はその 2/3）
    const FULL = [0, 0, 760, 370];
    const FOCUS = [[190, 240, 300], [250, 190, 300], [545, 140, 330], [380, 105, 300], [385, 175, 640], [520, 245, 330]];
    let vb = FULL.slice();
    let anim = 0;
    let cur = 0;
    const narrow = () => box.clientWidth > 0 && box.clientWidth < 560;   // 0 ＝ ページが隠れている（開いたときに測り直す）
    const target = (k) => {
      if (!narrow()) return FULL;
      const [cx, cy, w] = FOCUS[k - 1];
      return [cx - w / 2, cy - w / 3, w, (w * 2) / 3];
    };
    const applyVB = () => svg.setAttribute('viewBox', vb.map(r1).join(' '));
    function camera(k, instant) {
      box.classList.toggle('is-narrow', narrow());
      const to = target(k);
      const from = vb.slice();
      cancelAnimationFrame(anim);
      if (instant || still()) { vb = to; applyVB(); return; }
      const t0 = performance.now();
      const tick = (now) => {
        const t = Math.min(1, (now - t0) / 650);
        const e = 1 - Math.pow(1 - t, 3);
        vb = from.map((v, j) => v + (to[j] - v) * e);
        applyVB();
        if (t < 1) anim = requestAnimationFrame(tick);
      };
      anim = requestAnimationFrame(tick);
    }

    function set(i, replay) {
      const k = i + 1;
      const fresh = [];
      els.forEach((el) => {
        const d = el.dataset;
        const show = (!d.in || k >= Number(d.in)) && (!d.only || k === Number(d.only));
        el.classList.toggle('is-out', !show);
        el.classList.toggle('is-draft', !!d.solid && k < Number(d.solid));
        el.classList.toggle('is-hot', !!d.hot && d.hot.split(' ').includes(String(k)));
        el.classList.remove('is-new');
        if (show && (Number(d.in) === k || Number(d.only) === k || Number(d.solid) === k)) fresh.push(el);
      });
      // 出てきたものに、もう一度アニメーションをかける（クラスを外して、描き直させてから付ける）
      if (fresh.length && (replay || k !== cur)) { void svg.getBoundingClientRect(); fresh.forEach((el) => el.classList.add('is-new')); }
      tiles.forEach((t) => {
        let v = '—';
        let isNew = false;
        t.vals.forEach(([n, txt]) => { if (k >= n) v = txt; if (k === n) isNew = true; });
        t.b.textContent = v;
        t.li.classList.toggle('is-done', v !== '—');
        t.li.classList.toggle('is-new', isNew);
      });
      // 狭い画面では成果物の欄が横に流れるので、いまの成果物が見える位置まで送る
      const strip = $('.viz__tiles', box);
      const nowTile = $('.is-new', strip);
      if (nowTile && strip.scrollWidth > strip.clientWidth) strip.scrollTo({ left: nowTile.offsetLeft - 12, behavior: still() ? 'auto' : 'smooth' });
      camera(k, cur === 0);
      cur = k;
    }

    // もう一度・一時停止
    const replayBtn = $('[data-replay]', box);
    const pauseBtn = $('[data-pause]', box);
    const pause = (on) => {
      box.classList.toggle('is-paused', on);
      pauseBtn.setAttribute('aria-pressed', String(on));
      $('use', pauseBtn).setAttribute('href', on ? '#i-play' : '#i-pause');
      $('span', pauseBtn).textContent = on ? '再生' : '一時停止';
      if (on) svg.pauseAnimations(); else svg.unpauseAnimations();
    };
    replayBtn.addEventListener('click', () => { pause(false); set(cur - 1, true); });
    pauseBtn.addEventListener('click', () => pause(!box.classList.contains('is-paused')));
    if (still()) svg.pauseAnimations();
    addEventListener('resize', () => camera(cur, true));

    const page = box.closest('.page');
    $('[data-steps]', page).addEventListener('step', (e) => set(e.detail));
    page._onShow = () => { camera(cur, true); set(cur - 1, true); };
    return { set };
  })();

  /* ───────── 工程・ステップの図：1つずつ進む。右のパネルに、その説明を出す ───────── */
  $$('[data-steps]').forEach((pipe) => {
    const page = pipe.closest('.page');
    const items = $$('li', pipe);
    const panel = $('[data-step-panel]', page);
    const unit = pipe.dataset.unit || 'STEP';
    const now = $('[data-steps-now]', page);
    const label = $('.note__top span', panel);
    const tag = $('.tag', panel);
    const head = $('h2', panel);
    const body = $('p:not([class])', panel);
    const back = $('[data-back]', page);
    const next = $('[data-next]', page);
    const last = items.length - 1;
    const pageBack = back.getAttribute('href');
    let i = 0;

    function set(k) {
      i = clamp(k, 0, last);
      items.forEach((li, n) => { li.classList.toggle('is-on', n === i); li.classList.toggle('is-done', n < i); });
      pipe.style.setProperty('--p', String(i / last));
      label.textContent = `${unit} ${i + 1} / ${items.length}`;
      tag.textContent = items[i].dataset.tag || '';
      head.textContent = $('b', items[i]).textContent;
      body.textContent = $('p', items[i]).textContent;
      // 図の途中では、ボタンは図を進める。端まで来たら、前後のページへ
      $('span', next).textContent = i < last ? `次へ：${$('b', items[i + 1]).textContent}` : page._next;
      const first = i === 0 && pageBack === '#';
      back.toggleAttribute('aria-disabled', first);
      if (first) back.setAttribute('tabindex', '-1'); else back.removeAttribute('tabindex');
      if (now) now.textContent = `${unit} ${i + 1} / ${items.length}：${$('b', items[i]).textContent}`;
      pipe.dispatchEvent(new CustomEvent('step', { detail: i }));   // 工程の図が聞いている
    }
    const api = {
      next() { if (i < last) { set(i + 1); return true; } return false; },
      prev() { if (i > 0) { set(i - 1); return true; } return false; }
    };
    items.forEach((li, n) => li.addEventListener('click', () => set(n)));
    next.addEventListener('click', (e) => { if (api.next()) e.preventDefault(); });
    back.addEventListener('click', (e) => { if (api.prev()) e.preventDefault(); });
    steppers[page.id] = api;
    set(0);
  });

  /* ───────── ツリーと進み具合の表示をそろえる ───────── */
  const tabs = $$('.tabs a');
  function paint() {
    files.forEach((a) => {
      const id = a.hash.slice(1);
      a.classList.toggle('is-on', id === current);
      a.classList.toggle('is-read', read.has(id));
      if (id === current) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    dirs.forEach((d) => {
      const ids = $$('.file', d).map((a) => a.hash.slice(1));
      $('em', d).textContent = `${ids.filter((id) => read.has(id)).length}/${ids.length}`;
    });
    const dir = current ? fileOf.get(current).closest('.dir').dataset.dir : '';
    tabs.forEach((t) => t.classList.toggle('is-on', t.dataset.tab === dir));
    const n = read.size;
    const bar = $('#progBar');
    const num = $('#progNum');
    if (bar) bar.style.width = `${(n / order.length) * 100}%`;
    if (num) num.textContent = `${n} / ${order.length}`;
  }

  /* ───────── ページを切りかえる ───────── */
  function show(id, first) {
    if (!byId.has(id)) id = order[0];
    if (id === current) return;
    current = id;
    pages.forEach((p) => p.classList.toggle('is-on', p.id === id));
    read.add(id);
    save();
    openDir(fileOf.get(id).closest('.dir'), true);
    paint();
    document.title = id === order[0] ? SITE : `${titleOf(id)}｜METASYSTEM`;
    const page = byId.get(id);
    if (page._onShow) page._onShow();   // 工程の図：見えたときに、アニメーションをかけ直す
    if (!first) {
      window.scrollTo(0, 0);
      fileOf.get(id).scrollIntoView({ block: 'nearest' });
      main.focus({ preventScroll: true });
    }
  }
  addEventListener('hashchange', () => show(location.hash.slice(1)));

  /* ───────── スマホ：ツリーを引き出しにする ───────── */
  const menu = $('#menu');
  const shade = $('#shade');
  function drawer(open) {
    side.classList.toggle('is-open', open);
    if (menu) { menu.setAttribute('aria-expanded', String(open)); menu.setAttribute('aria-label', open ? 'ページの一覧を閉じる' : 'ページの一覧を開く'); }
  }
  if (menu) menu.addEventListener('click', () => drawer(!side.classList.contains('is-open')));
  if (shade) shade.addEventListener('click', () => drawer(false));
  side.addEventListener('click', (e) => { if (e.target.closest('.file')) drawer(false); });

  /* ───────── キーボード：← → で前後へ（図のあるページでは、まず図を進める） ───────── */
  addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.key === 'Escape') { drawer(false); return; }
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    if (e.target.closest && e.target.closest('input, textarea, select, .deck__track')) return;
    const fwd = e.key === 'ArrowRight';
    const st = steppers[current];
    if (st && (fwd ? st.next() : st.prev())) { e.preventDefault(); return; }
    const to = order[order.indexOf(current) + (fwd ? 1 : -1)];
    if (!to) return;
    e.preventDefault();
    location.hash = '#' + to;
  });

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
    const go = (i) => track.scrollTo({ left: clamp(i, 0, last) * step(), behavior: still() ? 'auto' : 'smooth' });
    const marks = slides.map((_, i) => {
      const m = document.createElement('i');
      m.addEventListener('click', () => go(i));
      ticks.appendChild(m);
      return m;
    });
    function sync() {
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
      requestAnimationFrame(() => { queued = false; sync(); });
    }, { passive: true });
    // 幅が変わっても、同じ1枚にとどまる
    addEventListener('resize', () => { track.scrollTo({ left: Math.max(0, index) * step(), behavior: 'auto' }); });
    sync();
  })();

  /* ───────── メールアドレスのコピー ───────── */
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

  show(location.hash.slice(1) || order[0], true);
})();
