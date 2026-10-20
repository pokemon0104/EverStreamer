/* ゲームタイトルパネル:配信中バッジ・経過時間+タイトル(方式A テキスト / 方式B ロゴ) */
(function () {
  'use strict';
  const { esc, fontStack } = OV.util;
  const BASE = 48; // 見た目セットの太さ・グロー・影は 48px 基準 → em に換算して文字サイズに比例させる
  const em = (v) => `${((Number(v) || 0) / BASE).toFixed(4)}em`;
  const FALLBACK_LOOK = { font: 'Noto Sans JP', weight: 900, fill: { type: 'solid', color: '#ffffff' }, strokes: [{ color: '#000000', width: 4 }] };

  // tpl = テンプレートのタイトル文字(features/theme)
  // big = お祝い・感謝など、暗い幕の上に大きく出す文字(テンプレートに titleBig があればそれ)
  OV.templateLook = (big) => { const v = OV.tplValue ? ((big && OV.tplValue('titleBig')) || OV.tplValue('title')) : null; return v ? Object.assign({ name: 'テンプレートに合わせる' }, v, { id: 'tpl' }) : null; };
  OV.lookById = (id, big) => (id === 'tpl' && OV.templateLook && OV.templateLook(big)) || ((OV.catalogs.looks || []).find((l) => l.id === id)) || (OV.catalogs.looks || [])[0] || FALLBACK_LOOK;

  /** 多重縁取りは同じ文字を重ねて表現(外側ほど太い縁取りを下に敷く) */
  OV.titleTextHtml = function (text, L) {
    const t = esc(text || '');
    const strokes = (L.strokes || []).filter((s) => Number(s.width) > 0);
    let cum = 0;
    const widths = strokes.map((s) => (cum += Number(s.width)));
    const layers = [];
    if (L.glow && Number(L.glow.size) > 0) {
      const c = L.glow.color;
      layers.push(`<span class="gt-l" aria-hidden="true" style="${esc(`color:${c};-webkit-text-stroke:${em(cum * 2 + 1)} ${c};text-shadow:0 0 ${em(L.glow.size)} ${c},0 0 ${em(L.glow.size * 2.2)} ${c}`)}">${t}</span>`);
    }
    for (let i = strokes.length - 1; i >= 0; i--) {
      const c = strokes[i].color;
      layers.push(`<span class="gt-l" aria-hidden="true" style="${esc(`color:${c};-webkit-text-stroke:${em(widths[i] * 2)} ${c}`)}">${t}</span>`);
    }
    const f = L.fill || { type: 'solid', color: '#fff' };
    const fillStyle = f.type === 'gradient'
      ? `background:linear-gradient(${Number(f.angle) || 180}deg, ${(f.stops || ['#fff', '#ccc']).join(', ')});-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent`
      : `color:${f.color || '#fff'}`;
    layers.push(`<span class="gt-fill" style="${esc(fillStyle)}">${t}</span>`);
    const outer = [];
    if (L.shadow) outer.push(`filter:drop-shadow(${em(L.shadow.x)} ${em(L.shadow.y)} ${em(L.shadow.blur)} ${L.shadow.color})`);
    if (L.skew) outer.push(`transform:skewX(${Number(L.skew)}deg)`);
    const titleStyle = `font-family:${fontStack(L.font, L.fallbackFont)};font-weight:${L.weight || 400};font-style:${L.italic ? 'italic' : 'normal'};letter-spacing:${Number(L.letterSpacing) || 0.02}em`;
    return `<div class="gt-title" style="${esc(titleStyle)}"><span class="gt-layers" style="${esc(outer.join(';'))}">${layers.join('')}</span></div>`;
  };

  function logoHtml(g, d) {
    const fx = [];
    if (g.logoShadow) fx.push('drop-shadow(0 4px 6px rgba(0,0,0,.75))');
    if (g.logoGlow) fx.push(`drop-shadow(0 0 6px ${g.logoGlowColor || '#fff'}) drop-shadow(0 0 14px ${g.logoGlowColor || '#fff'})`);
    const style = `max-height:calc(${Number(d.logoMaxHeight) || 110}px * var(--k));filter:${fx.join(' ') || 'none'}`;
    return `<img class="gt-logo" src="/logos/${encodeURIComponent(g.logo)}" alt="${esc(g.title || '')}" style="${esc(style)}">`;
  }

  OV.registerPanelType('gameTitle', {
    label: 'ゲームタイトル',
    sizeLabels: { headingSize: 'タイトル', bodySize: 'LIVE・時間', numberSize: '(未使用)' },
    deps: (S) => [S.game, S.theme, OV.catalogs.looks, OV.catalogs.templates, OV.timerRunning ? OV.timerRunning() : false],
    render(el, p) {
      const S = OV.state;
      const g = S.game || {};
      const d = p.data || {};
      const pos = 'status';
      const labelHtml = '';
      const running = OV.timerRunning ? OV.timerRunning() : false;

      const status = [];
      if (d.showLive) status.push(`<span class="gt-live ${running ? 'on' : 'off'}"><i></i>${esc(running ? d.liveText || 'LIVE' : d.offText || 'OFFLINE')}</span>`);
      if (labelHtml && pos === 'status') status.push(`<span class="gt-hws">${labelHtml}</span>`);
      if (d.showTimer) status.push(`<span class="gt-timer" data-elapsed>${OV.elapsedText ? OV.elapsedText() : '00:00:00'}</span>`);

      const useLogo = g.method === 'logo' && g.logo;
      const title = useLogo ? logoHtml(g, d) : OV.titleTextHtml(g.title, OV.lookById(g.lookId));
      const side = labelHtml && pos !== 'status' ? `<span class="gt-hws gt-hws-main">${labelHtml}</span>` : '';
      const align = d.align === 'center' ? 'center' : 'left';
      el.innerHTML = (status.length ? `<div class="gt-status">${status.join('')}</div>` : '')
        + `<div class="gt-main pos-${esc(pos)} align-${align}">${side}<div class="gt-titlebox">${title}</div></div>`;
    },
    /** 長いタイトルは1行に収まるよう自動で縮小。縮めすぎになる場合は2行以上に折り返す */
    layoutFit(el) {
      const main = el.querySelector('.gt-main');
      const box = el.querySelector('.gt-titlebox');
      const title = el.querySelector('.gt-title');
      const line = el.querySelector('.gt-layers');
      if (!main || !box) return;
      main.style.setProperty('--tfit', '1');
      if (!line || !title) return;
      title.classList.remove('wrap');
      const fits = () => line.offsetWidth <= box.clientWidth + 1;
      if (fits()) return;
      const MIN = 0.55; // これより小さくなるなら折り返す
      main.style.setProperty('--tfit', String(MIN));
      if (!fits()) {
        title.classList.add('wrap');
        main.style.setProperty('--tfit', String(MIN + 0.1));
        return;
      }
      let lo = MIN;
      let hi = 1;
      for (let i = 0; i < 7; i++) {
        const mid = (lo + hi) / 2;
        main.style.setProperty('--tfit', mid.toFixed(4));
        if (fits()) lo = mid; else hi = mid;
      }
      main.style.setProperty('--tfit', lo.toFixed(4));
    },
    shouldShine(p, S, n) {
      const g = S.game || {};
      const key = JSON.stringify([g.title, g.method, g.lookId, g.logo]);
      const changed = n.gkey && n.gkey !== key;
      n.gkey = key;
      return changed && p.data && p.data.shineOnChange !== false;
    },
  });

  // ---- ゲームロゴ(ロゴ画像だけを、枠いっぱいに大きく表示) ----
  OV.registerPanelType('gameLogo', {
    label: 'ゲームロゴ',
    sizeLabels: { headingSize: 'ロゴがないときの文字', bodySize: '(未使用)', numberSize: '(未使用)' },
    deps: (S, p) => [S.game && S.game.logo, S.game && S.game.title, S.game && S.game.lookId, OV.catalogs.looks, p && p.heightMode],
    render(el, p) {
      const g = OV.state.game || {};
      const d = p.data || {};
      const file = d.source === 'file' ? d.file : g.logo;
      const ah = { left: 'flex-start', right: 'flex-end' }[d.align] || 'center';
      const av = { top: 'flex-start', bottom: 'flex-end' }[d.valign] || 'center';
      el.style.justifyContent = av;
      let inner = '';
      if (file) {
        const fx = [];
        if (d.shadow !== false) fx.push('drop-shadow(0 4px 6px rgba(0,0,0,.75))');
        if (d.glow) fx.push(`drop-shadow(0 0 6px ${d.glowColor || '#fff'}) drop-shadow(0 0 14px ${d.glowColor || '#fff'})`);
        inner = `<img class="gl-img" src="/logos/${encodeURIComponent(file)}" alt="${esc(g.title || '')}" style="${esc(`filter:${fx.join(' ') || 'none'};object-position:${d.align || 'center'} ${d.valign || 'center'}${p.heightMode === 'fixed' ? '' : `;height:auto;max-height:calc(${Number(d.maxHeight) || 200}px * var(--k))`}`)}">`;
      } else if (d.fallback !== 'none') {
        inner = `<div class="gl-text" style="text-align:${esc(d.align || 'center')}">${OV.titleTextHtml(g.title, OV.lookById(g.lookId)).replace('gt-title', 'gt-title gl-title')}</div>`;
      } else if (OV.role === 'admin') {
        inner = `<div class="gl-empty">${OV.t('ロゴ未設定')}</div>`;
      }
      el.innerHTML = `<div class="gl-box" style="justify-content:${ah};align-items:${av}">${inner}</div>`;
    },
    /** ロゴがなくタイトル文字のときは、まず1行に収まるよう縮め、縮めすぎるなら折り返す */
    layoutFit(el) {
      const box = el.querySelector('.gl-text');
      const title = el.querySelector('.gl-title');
      const line = el.querySelector('.gl-title .gt-layers');
      if (!box || !title || !line) return;
      box.style.setProperty('--tfit', '1');
      title.classList.add('one');
      const fits = () => line.offsetWidth <= box.clientWidth + 1;
      if (fits()) return;
      const MIN = 0.75; // これより小さくなるなら、2行以上に折り返して大きく見せる
      box.style.setProperty('--tfit', String(MIN));
      if (!fits()) { title.classList.remove('one'); box.style.setProperty('--tfit', '1'); return; }
      let lo = MIN;
      let hi = 1;
      for (let i = 0; i < 7; i++) {
        const mid = (lo + hi) / 2;
        box.style.setProperty('--tfit', mid.toFixed(4));
        if (fits()) lo = mid; else hi = mid;
      }
      box.style.setProperty('--tfit', lo.toFixed(4));
    },
    shouldShine(p, S, n) {
      const g = S.game || {};
      const key = JSON.stringify([g.logo, g.title, g.lookId]);
      const changed = n.glkey && n.glkey !== key;
      n.glkey = key;
      return changed && p.data && p.data.shineOnChange !== false;
    },
  });
})();
