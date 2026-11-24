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

  /* ───────── ページの図：scenes.js の SCENES を描いて、場面ごとに動かす ─────────
     ふつうのページは、場面が自動で進み（items で指定した項目も、いっしょに光る）、
     sync: 'steps' のページは、工程の図（data-steps）に合わせて進む。
     狭い画面では、いまの場面のまわりに寄る（focus があればそれ、なければ光っているものの範囲） */
  const VIZ = window.MS_VIZ;
  const CTL = '<p class="viz__ctl">' +
    '<button class="btn btn--sm" type="button" data-replay><svg class="i"><use href="#i-replay"/></svg>もう一度</button>' +
    '<button class="btn btn--sm" type="button" data-pause aria-pressed="false"><svg class="i"><use href="#i-pause"/></svg><span>一時停止</span></button></p>';
  function makeViz(box) {
    const def = VIZ && VIZ.SCENES[box.dataset.viz];
    if (!def) return null;
    const page = box.closest('.page');
    const W = VIZ.W;
    const H = def.h || 300;
    const L = VIZ.makeLib(def.oy || 0);
    let svg = $('.viz__svg', box);
    if (!svg) {
      box.insertAdjacentHTML('afterbegin', `<svg class="viz__svg" role="img" aria-label="${def.title}"></svg>`);
      svg = $('.viz__svg', box);
    }
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.insertAdjacentHTML('beforeend', L.defs() + `<path class="grid" d="${L.grid(H)}"/>` + def.build(L));
    if (!$('.viz__foot', box)) box.insertAdjacentHTML('beforeend', `<div class="viz__foot"><p class="viz__cap" aria-live="polite"><b></b><span></span></p>${CTL}</div>`);

    const steps = def.sync ? $('[data-steps]', page) : null;
    const items = def.items ? $$(def.items, page) : [];
    const labels = steps ? $$('li b', steps).map((b) => b.textContent.trim()) :
      (def.labels || items.map((it) => ($('h2, dt, small, b', it) || it).textContent.trim()));
    const n = labels.length;
    const els = $$('[data-in],[data-only],[data-solid],[data-hot],[data-pop]', svg);
    const tiles = $$('.viz__tiles li', box).map((li) => ({ li, b: $('b', li), vals: li.dataset.v.split('|').map((s) => { const [k, t] = s.split(':'); return [Number(k), t]; }) }));
    const cap = $('.viz__cap', box);
    const unitOf = steps ? (steps.dataset.unit || 'STEP') : '';
    let cur = 0;
    let visible = false;
    let timer = 0;

    /* カメラ */
    let vb = [0, 0, W, H];
    let anim = 0;
    const narrow = () => box.clientWidth > 0 && box.clientWidth < 560;   // 0 ＝ ページが隠れている（開いたときに測り直す）
    const frame = (x, y, w, h) => {
      const cx = x + w / 2;
      const cy = y + h / 2;
      let fw = Math.max(w + 56, 320);
      let fh = h + 56;
      if (fw / fh < 1.5) fw = fh * 1.5; else fh = fw / 1.5;
      if (fw > W) { fw = W; fh = W / 1.5; }
      const fx = clamp(cx - fw / 2, 0, W - fw);
      const fy = fh >= H ? (H - fh) / 2 : clamp(cy - fh / 2, 0, H - fh);
      return [fx, fy, fw, fh];
    };
    const target = (k) => {
      if (!narrow()) return [0, 0, W, H];
      if (def.focus) { const [cx, cy, w] = def.focus[k - 1]; return [cx - w / 2, cy - w / 3, w, (w * 2) / 3]; }
      const hits = $$(`.is-hot, [data-only="${k}"]`, svg).filter((el) => !el.closest('.is-out'));
      if (!hits.length) return [0, 0, W, H];
      let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
      hits.forEach((el) => { const r = el.getBBox(); if (!r.width && !r.height) return; x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.width); y1 = Math.max(y1, r.y + r.height); });
      return x0 === Infinity ? [0, 0, W, H] : frame(x0, y0, x1 - x0, y1 - y0);
    };
    const applyVB = () => svg.setAttribute('viewBox', vb.map((v) => Math.round(v * 10) / 10).join(' '));
    function camera(k, instant) {
      const nar = narrow();
      box.classList.toggle('is-narrow', nar);
      svg.style.aspectRatio = nar ? '3 / 2' : `${W} / ${H}`;
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

    /* 場面を切りかえる（k は 1 から） */
    function go(k, replay) {
      const fresh = [];
      els.forEach((el) => {
        const d = el.dataset;
        const show = (!d.in || k >= Number(d.in)) && (!d.only || k === Number(d.only));
        el.classList.toggle('is-out', !show);
        el.classList.toggle('is-draft', !!d.solid && k < Number(d.solid));
        el.classList.toggle('is-hot', !!d.hot && d.hot.split(' ').includes(String(k)));
        el.classList.remove('is-new');
        if (show && [d.in, d.only, d.solid, d.pop].some((v) => Number(v) === k)) fresh.push(el);
      });
      // 出てきたものに、もう一度アニメーションをかける（クラスを外して、描き直させてから付ける）
      // 一時停止中は、止まったままの動き（透明のまま）にならないよう、出し直しはしない
      if (fresh.length && (replay || k !== cur) && !box.classList.contains('is-paused')) { void svg.getBoundingClientRect(); fresh.forEach((el) => el.classList.add('is-new')); }
      items.forEach((it, i) => it.classList.toggle('is-lit', i === k - 1));
      if (cap) { $('b', cap).textContent = `${steps ? `${unitOf} ` : ''}${k} / ${n}`; $('span', cap).textContent = labels[k - 1] || ''; }
      tiles.forEach((t) => {
        let v = '—';
        let isNew = false;
        t.vals.forEach(([m, txt]) => { if (k >= m) v = txt; if (k === m) isNew = true; });
        t.b.textContent = v;
        t.li.classList.toggle('is-done', v !== '—');
        t.li.classList.toggle('is-new', isNew);
      });
      // 狭い画面では成果物の欄が横に流れるので、いまの成果物が見える位置まで送る
      const strip = $('.viz__tiles', box);
      const nowTile = strip && $('.is-new', strip);
      if (nowTile && strip.scrollWidth > strip.clientWidth) strip.scrollTo({ left: nowTile.offsetLeft - 12, behavior: still() ? 'auto' : 'smooth' });
      camera(k, cur === 0 || !visible);
      cur = k;
    }

    /* 自動で進む・止める */
    const paused = () => box.classList.contains('is-paused');
    const stopTimer = () => { clearInterval(timer); timer = 0; };
    const play = () => {
      stopTimer();
      if (steps || !visible || paused() || still() || n < 2) return;
      timer = setInterval(() => go((cur % n) + 1), def.dur || 3600);
    };
    const replayBtn = $('[data-replay]', box);
    const pauseBtn = $('[data-pause]', box);
    const pause = (on) => {
      box.classList.toggle('is-paused', on);
      pauseBtn.setAttribute('aria-pressed', String(on));
      $('use', pauseBtn).setAttribute('href', on ? '#i-play' : '#i-pause');
      $('span', pauseBtn).textContent = on ? '再生' : '一時停止';
      if (on || still()) svg.pauseAnimations(); else svg.unpauseAnimations();
      if (on) stopTimer(); else play();
    };
    replayBtn.addEventListener('click', () => { pause(false); go(steps ? cur : 1, true); play(); });
    pauseBtn.addEventListener('click', () => pause(!paused()));
    // 項目を押すと、その場面へ（リンクやボタンを押したときは、そちらを優先）
    items.forEach((it, i) => {
      if (it.matches('a') || $('a', it) === it.firstElementChild && it.children.length === 1) return;
      it.classList.add('is-pickable');
      it.addEventListener('click', (e) => { if (e.target.closest('a, button')) return; go(i + 1); play(); });
    });
    if (steps) steps.addEventListener('step', (e) => go(e.detail + 1));
    addEventListener('resize', () => { if (visible) camera(cur, true); });
    svg.pauseAnimations();
    go(1);
    box._go = (k) => { go(k); play(); };   // 場面を直接えらぶ（確かめるとき用）

    return {
      enter() {
        visible = true;
        if (!paused() && !still()) svg.unpauseAnimations();
        camera(cur, true);
        go(cur, true);
        play();
      },
      leave() { visible = false; stopTimer(); svg.pauseAnimations(); }
    };
  }
  $$('[data-viz]').forEach((box) => { const v = makeViz(box); if (v) box.closest('.page')._viz = v; });


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
    if (current && byId.get(current)._viz) byId.get(current)._viz.leave();   // 図：隠れるページは止める
    current = id;
    pages.forEach((p) => p.classList.toggle('is-on', p.id === id));
    read.add(id);
    save();
    openDir(fileOf.get(id).closest('.dir'), true);
    paint();
    document.title = id === order[0] ? SITE : `${titleOf(id)}｜METASYSTEM`;
    if (byId.get(id)._viz) byId.get(id)._viz.enter();   // 図：見えたときに、アニメーションをかけ直す
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
