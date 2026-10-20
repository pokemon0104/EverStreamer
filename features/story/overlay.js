/* あらすじ:トランジション付きで登場し、文字を演出しながら表示して、退場する */
(function () {
  'use strict';
  const { esc, clamp, fontStack, hexToRgba } = OV.util;

  // ---- 文章 → ページ(サーバーの pagesOf と同じ規則:--- だけの行で区切る) ----
  OV.storyPages = (text) => String(text || '').replace(/\r\n?/g, '\n').split(/\n[ \t]*-{3,}[ \t]*(?:\n|$)/)
    .map((p) => p.replace(/^\n+|\n+$/g, '')).filter((p) => p.trim());
  const inline = (t) => (OV.richInline ? OV.richInline(t) : esc(t));
  const pageHtml = (text) => String(text || '').split('\n')
    .map((ln) => (ln.trim() ? `<div class="st-line">${inline(ln)}</div>` : '<div class="st-gap"></div>')).join('');

  // ---- 表示する場所(縦画面は縦画面の設定) ----
  OV.storyArea = (S) => {
    const v = S.storyView || {};
    const full = { x: 0, y: 0, w: OV.W, h: OV.H };
    if (v.area === 'custom') return { x: Number(v.x) || 0, y: Number(v.y) || 0, w: Math.max(100, Number(v.w) || 800), h: Math.max(80, Number(v.h) || 400) };
    if (v.area === 'game' || v.area === 'gameBottom') {
      const r = OV.gameWindowRect ? OV.gameWindowRect(S) : full;
      return v.area === 'gameBottom' ? { x: r.x, y: Math.round(r.y + r.h * 0.55), w: r.w, h: Math.round(r.h * 0.45) } : r;
    }
    return full;
  };

  // ---- 文字の影(縁取り・影・光) ----
  function textShadow(d) {
    const parts = [];
    const sw = Number(d.strokeWidth) || 0;
    if (sw > 0) {
      const n = sw > 3 ? 24 : 16;
      for (let i = 0; i < n; i++) {
        const a = (Math.PI * 2 * i) / n;
        parts.push(`${(Math.cos(a) * sw).toFixed(2)}px ${(Math.sin(a) * sw).toFixed(2)}px 0 ${d.strokeColor || '#000'}`);
      }
    }
    if (Number(d.shadowBlur) > 0 || Number(d.shadowY) > 0) parts.push(`0 ${Number(d.shadowY) || 0}px ${Number(d.shadowBlur) || 0}px ${d.shadowColor || '#000'}`);
    const g = Number(d.glow) || 0;
    if (g > 0) parts.push(`0 0 ${g}px ${d.glowColor || '#fff'}`, `0 0 ${g * 2.2}px ${d.glowColor || '#fff'}`);
    return parts.length ? parts.join(',') : 'none';
  }

  /** デザインを要素に当てる(オーバーレイと、管理画面のデザイン見本で共通) */
  OV.applyStoryDesign = function (box, d, scale) {
    const s = box.style;
    s.setProperty('--st-s', String(scale || 1));
    s.setProperty('--st-size', `${Number(d.size) || 36}px`);
    s.setProperty('--st-tsize', `${Number(d.titleSize) || 44}px`);
    s.setProperty('--st-pad', `${Number(d.padding) || 0}px`);
    s.setProperty('--st-font', fontStack(d.font));
    s.setProperty('--st-tfont', fontStack(d.titleFont || d.font));
    s.setProperty('--st-color', d.color || '#fff');
    s.setProperty('--st-tcolor', d.titleColor || d.color || '#fff');
    s.setProperty('--st-lh', String(Number(d.lineHeight) || 1.7));
    s.setProperty('--st-ls', `${Number(d.letterSpacing) || 0}em`);
    s.setProperty('--st-fw', d.bold ? '700' : '400');
    s.setProperty('--st-shadow', textShadow(d));
    s.setProperty('--st-bg', d.boxImage ? d.boxImage : (d.boxColor || '#000'));
    s.setProperty('--st-bg-a', String(d.boxImage ? 1 : clamp(d.boxAlpha == null ? 0.9 : Number(d.boxAlpha), 0, 1)));
    s.setProperty('--st-radius', `${Number(d.radius) || 0}px`);
    const bw = Number(d.borderWidth) || 0;
    s.setProperty('--st-border', !d.borderStyle || d.borderStyle === 'none' || bw <= 0 ? 'none' : `${bw}px ${d.borderStyle} ${d.borderColor || '#fff'}`);
    s.setProperty('--st-bshadow', d.boxShadow ? '0 14px 44px rgba(0,0,0,.55)' : 'none');
    s.setProperty('--st-align', d.align || 'left');
    box.dataset.deco = d.titleDeco || 'none';
  };
  OV.storyTitleHtml = (title, d) => {
    const t = inline(title);
    return (d.titleDeco === 'brackets') ? `『${t}』` : t;
  };

  // ---- 登場・退場のしかた(Web Animations) ----
  const KF = {
    fade: [{ opacity: 0 }, { opacity: 1 }],
    slideUp: [{ opacity: 0, transform: 'translateY(90px)' }, { opacity: 1, transform: 'translateY(0)' }],
    slideDown: [{ opacity: 0, transform: 'translateY(-90px)' }, { opacity: 1, transform: 'translateY(0)' }],
    slideLeft: [{ opacity: 0, transform: 'translateX(140px)' }, { opacity: 1, transform: 'translateX(0)' }],
    zoom: [{ opacity: 0, transform: 'scale(.78)' }, { opacity: 1, transform: 'scale(1)' }],
    zoomOut: [{ opacity: 0, transform: 'scale(1.28)' }, { opacity: 1, transform: 'scale(1)' }],
    blur: [{ opacity: 0, filter: 'blur(22px)' }, { opacity: 1, filter: 'blur(0px)' }],
    wipe: [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)' }],
    curtain: [{ clipPath: 'inset(0 50% 0 50%)' }, { clipPath: 'inset(0 0% 0 0%)' }],
    shutter: [{ clipPath: 'inset(50% 0 50% 0)' }, { clipPath: 'inset(0% 0 0% 0)' }],
    iris: [{ clipPath: 'circle(0% at 50% 50%)' }, { clipPath: 'circle(75% at 50% 50%)' }],
    window: [{ opacity: 0, transform: 'scale(.02,.05)' }, { opacity: 1, transform: 'scale(1,.05)', offset: 0.45 }, { opacity: 1, transform: 'scale(1,1)' }],
    cinema: [{ opacity: 0, filter: 'blur(8px)' }, { opacity: 1, filter: 'blur(0px)' }],
  };
  // 登場するとき、文字の演出を始めるまでの待ち時間の割合
  const TEXT_START = { window: 1, iris: 0.7, wipe: 0.7, curtain: 0.7, shutter: 0.7, none: 0 };

  function play(e, el, frames, opt) {
    if (!el || !frames || !el.animate) return null;
    const a = el.animate(frames, { fill: 'both', ...opt });
    e.anims.push(a);
    return a;
  }
  function enterAnims(e, c) {
    const ms = c.enter === 'none' ? 0 : c.enterMs;
    play(e, e.back, [{ opacity: 0 }, { opacity: 1 }], { duration: Math.max(1, ms * 0.8), easing: 'ease-out' });
    if (c.enter === 'none') return;
    play(e, e.box, KF[c.enter] || KF.fade, { duration: ms, easing: 'cubic-bezier(.2,.8,.2,1)' });
    if (c.enter === 'window') play(e, e.inner, [{ opacity: 0 }, { opacity: 1 }], { duration: ms * 0.35, delay: ms * 0.75, easing: 'ease-out' });
    if (c.enter === 'cinema') {
      play(e, e.bars, [{ transform: 'scaleY(0)' }, { transform: 'scaleY(1)' }], { duration: ms * 0.7, easing: 'cubic-bezier(.2,.8,.2,1)' });
      const ls = `${Number((c.design || {}).letterSpacing) || 0}em`;
      play(e, e.inner, [{ letterSpacing: '0.7em', opacity: 0 }, { letterSpacing: ls, opacity: 1 }], { duration: ms * 1.2, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
  }
  function exitAnims(e, c) {
    const ms = c.exit === 'none' ? 1 : c.exitMs;
    const rev = (k) => [...k].reverse().map((f) => { const o = { ...f }; if ('offset' in o) o.offset = 1 - o.offset; return o; });
    if (c.exit !== 'none') {
      play(e, e.box, rev(KF[c.exit] || KF.fade), { duration: ms, easing: 'cubic-bezier(.6,0,.8,.4)' });
      if (c.exit === 'cinema') play(e, e.bars, [{ transform: 'scaleY(1)' }, { transform: 'scaleY(0)' }], { duration: ms, delay: ms * 0.3, easing: 'ease-in' });
    }
    play(e, e.back, [{ opacity: 1 }, { opacity: 0 }], { duration: ms, delay: c.exit === 'none' ? 0 : ms * 0.25, easing: 'ease-in' });
    clearTimeout(e.hideTimer);
    e.hideTimer = setTimeout(() => { if (e.phase === 'out') e.layer.classList.remove('on'); }, ms * 1.25 + 50);
  }

  // ---- 文字の出し方 ----
  function wrapChars(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    let i = 0;
    for (const n of nodes) {
      const frag = document.createDocumentFragment();
      for (const ch of n.textContent) {
        const sp = document.createElement('span');
        sp.className = 'st-ch';
        sp.textContent = ch;
        if (ch.trim()) sp.style.setProperty('--i', String(i++));
        else sp.style.setProperty('--i', String(i));
        frag.appendChild(sp);
      }
      n.parentNode.replaceChild(frag, n);
    }
    return i;
  }
  function textEffect(e, c, delayMs) {
    const pg = e.page;
    pg.className = `st-page fx-${c.textFx}`;
    pg.style.setProperty('--st-d0', `${Math.round(delayMs)}ms`);
    if (c.textFx === 'type' || c.textFx === 'charFade') {
      wrapChars(pg);
      pg.style.setProperty('--st-cps', `${Math.round(1000 / c.typeSpeed)}ms`);
    } else if (c.textFx === 'lines') {
      [...pg.querySelectorAll('.st-line')].forEach((l, i) => l.style.setProperty('--li', String(i)));
      pg.style.setProperty('--st-ld', `${c.lineDelay}ms`);
    }
  }

  // ---- はみ出すときは文字を縮める ----
  function fit(e) {
    let k = 1;
    e.box.style.setProperty('--st-k', '1');
    const max = e.frame.clientHeight;
    for (let i = 0; i < 14 && e.box.scrollHeight > max + 1 && k > 0.35; i++) {
      k -= 0.05;
      e.box.style.setProperty('--st-k', k.toFixed(2));
    }
  }

  // ---- ページの中身 ----
  function fillPage(e, S, c, idx, delayMs) {
    const g = S.game || {};
    const pages = OV.storyPages(g.story);
    e.pageText = pages[idx] || '';
    e.page.innerHTML = pageHtml(e.pageText);
    e.title.innerHTML = c.showTitle !== false && g.storyTitle ? OV.storyTitleHtml(g.storyTitle, c.design || {}) : '';
    e.title.style.display = e.title.innerHTML ? '' : 'none';
    e.counter.textContent = pages.length > 1 ? `${idx + 1} / ${pages.length}` : '';
    fit(e);
    textEffect(e, c, delayMs);
  }
  function fillScroll(e, S, c) {
    const g = S.game || {};
    const pages = OV.storyPages(g.story);
    e.title.innerHTML = c.showTitle !== false && g.storyTitle ? OV.storyTitleHtml(g.storyTitle, c.design || {}) : '';
    e.title.style.display = e.title.innerHTML ? '' : 'none';
    e.page.className = 'st-page';
    e.page.innerHTML = pages.map(pageHtml).join('<div class="st-gap big"></div>');
    e.counter.textContent = '';
    e.box.style.setProperty('--st-k', '1');
    // 中身を、枠の下から上へ(crawl は奥へ)流す
    requestAnimationFrame(() => {
      const H = e.frame.clientHeight;
      const ch = e.inner.scrollHeight;
      const crawl = c.scrollStyle === 'crawl';
      // crawl:文字の面を奥へ倒して(rotateX)、その面の上を奥へ流す。遠近感は .st-box の perspective で付ける
      // 回転の軸は枠の下の線(手前)にする。軸より上の文字ほど奥へ遠ざかる
      e.inner.style.transformOrigin = crawl ? `50% ${H}px` : '';
      const tf = (y) => (crawl ? `rotateX(30deg) translateY(${y}px)` : `translateY(${y}px)`);
      e.scrollAnim = play(e, e.inner, [{ transform: tf(H) }, { transform: tf(-ch - (crawl ? H * 2.2 : 0)) }],
        { duration: c.scrollSec * 1000, delay: c.enter === 'none' ? 0 : c.enterMs * 0.5, easing: 'linear' });
      if (e.paused && e.scrollAnim) e.scrollAnim.pause();
    });
  }

  // ---- 見た目と場所 ----
  function layout(e, S) {
    const c = S.story || {};
    const v = S.storyView || {};
    const d = c.design || {};
    const a = OV.storyArea(S);
    const m = Number(v.margin) || 0;
    Object.assign(e.back.style, { left: `${a.x}px`, top: `${a.y}px`, width: `${a.w}px`, height: `${a.h}px`,
      background: hexToRgba(d.backdropColor || '#000', clamp(Number(d.dim) || 0, 0, 1)),
      backdropFilter: Number(d.backdropBlur) > 0 ? `blur(${Number(d.backdropBlur)}px)` : 'none' });
    Object.assign(e.frame.style, { left: `${a.x + m}px`, top: `${a.y + m}px`, width: `${Math.max(50, a.w - m * 2)}px`, height: `${Math.max(50, a.h - m * 2)}px` });
    Object.assign(e.bars.style, { left: `${a.x}px`, top: `${a.y}px`, width: `${a.w}px`, height: `${a.h}px` });
    e.frame.dataset.valign = c.mode === 'scroll' ? 'stretch' : (d.valign || 'center');
    const bw = Number(v.boxWidth) || Number(d.boxWidth) || 70;
    e.box.style.width = `${clamp(bw, 10, 100)}%`;
    OV.applyStoryDesign(e.box, d, Number(v.scale) || 1);
    e.box.classList.toggle('is-scroll', c.mode === 'scroll');
    e.box.classList.toggle('is-crawl', c.mode === 'scroll' && c.scrollStyle === 'crawl');
    e.frame.classList.toggle('is-crawl', c.mode === 'scroll' && c.scrollStyle === 'crawl');
    e.bars.style.display = (c.enter === 'cinema' || c.exit === 'cinema') ? '' : 'none';
  }

  function cleanup(e) {
    e.anims.forEach((a) => { try { a.cancel(); } catch { /* ignore */ } });
    e.anims = [];
    e.scrollAnim = null;
    e.inner.style.transformOrigin = '';
    clearTimeout(e.hideTimer);
    e.layer.classList.remove('on', 'paused');
    e.page.innerHTML = '';
    e.token = '';
    e.phase = '';
  }

  function render(e, S) {
    const p = OV.storyLocal || S.storyPlay || {};
    const c = S.story || {};
    e.stage.classList.toggle('st-hide-ui', !!(p.active && c.hideUi && p.phase !== 'out'));
    if (!p.active) { if (e.token) cleanup(e); return; }
    const sig = JSON.stringify([c, S.storyView, OV.storyArea(S)]);
    if (sig !== e.sig) { e.sig = sig; layout(e, S); }
    if (p.token !== e.token) {
      cleanup(e);
      e.token = p.token;
      e.phase = 'show';
      e.pageNo = p.page || 0;
      e.paused = !!p.paused;
      e.layer.classList.add('on');
      layout(e, S);
      if (c.mode === 'scroll') fillScroll(e, S, c);
      else fillPage(e, S, c, e.pageNo, (c.enter === 'none' ? 0 : c.enterMs * (TEXT_START[c.enter] == null ? 0.55 : TEXT_START[c.enter])));
      enterAnims(e, c);
      e.storySig = (S.game || {}).story;
    } else if (p.phase === 'out' && e.phase !== 'out') {
      e.phase = 'out';
      e.layer.classList.remove('paused');
      if (e.scrollAnim) e.scrollAnim.play();
      exitAnims(e, c);
      return;
    } else if (c.mode !== 'scroll' && p.page !== e.pageNo && e.phase === 'show') {
      turnPage(e, S, c, p.page);
    } else if ((S.game || {}).story !== e.storySig && e.phase === 'show' && c.mode !== 'scroll') {
      // 表示中に文章を直した:演出なしで差し替える
      e.storySig = (S.game || {}).story;
      fillPage(e, S, { ...c, textFx: 'none' }, e.pageNo, 0);
    }
    if (!!p.paused !== e.paused) {
      e.paused = !!p.paused;
      e.layer.classList.toggle('paused', e.paused);
      if (e.scrollAnim) { if (e.paused) e.scrollAnim.pause(); else e.scrollAnim.play(); }
    }
  }

  const PAGE_OUT = {
    fade: [{ opacity: 1 }, { opacity: 0 }],
    slide: [{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: 'translateX(-70px)' }],
    up: [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-50px)' }],
  };
  const PAGE_IN = {
    fade: [{ opacity: 0 }, { opacity: 1 }],
    slide: [{ opacity: 0, transform: 'translateX(70px)' }, { opacity: 1, transform: 'translateX(0)' }],
    up: [{ opacity: 0, transform: 'translateY(50px)' }, { opacity: 1, transform: 'translateY(0)' }],
  };
  function turnPage(e, S, c, to) {
    e.pageNo = to;
    const tok = e.token;
    const out = PAGE_OUT[c.pageFx];
    const swap = () => {
      if (e.token !== tok) return;
      fillPage(e, S, c, to, 250);
      if (PAGE_IN[c.pageFx]) play(e, e.inner, PAGE_IN[c.pageFx], { duration: 450, easing: 'ease-out' });
    };
    if (!out) { swap(); return; }
    const a = play(e, e.inner, out, { duration: 380, easing: 'ease-in' });
    if (a) a.onfinish = swap; else swap();
  }

  const entries = [];
  OV.storyRefresh = () => entries.forEach((e) => render(e, OV.state));
  OV.registerLayer({
    mount(stage) {
      const layer = document.createElement('div');
      layer.className = 'st-layer';
      layer.innerHTML = '<div class="st-back"></div><div class="st-bars"><i></i><i></i></div><div class="st-frame"><div class="st-box"><div class="st-inner"><div class="st-title"></div><div class="st-page"></div></div><div class="st-counter"></div></div></div>';
      stage.appendChild(layer);
      const q = (s) => layer.querySelector(s);
      entries.push({ stage, layer, back: q('.st-back'), bars: q('.st-bars'), frame: q('.st-frame'), box: q('.st-box'), inner: q('.st-inner'), title: q('.st-title'), page: q('.st-page'), counter: q('.st-counter'), anims: [], token: '', sig: '' });
    },
    update(S, stage) {
      const e = entries.find((x) => x.stage === stage);
      if (e) render(e, S);
    },
  });
  OV.onMessage('core:catalog', () => entries.forEach((e) => { e.sig = ''; }));
})();
