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

  /* ───────── 工程・ステップの図：1つずつ進む。右のパネルに、その説明を出す ───────── */
  $$('[data-steps]').forEach((pipe) => {
    const page = pipe.closest('.page');
    const items = $$('li', pipe);
    const panel = $('[data-step-panel]', page);
    const unit = pipe.dataset.unit || 'STEP';
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
