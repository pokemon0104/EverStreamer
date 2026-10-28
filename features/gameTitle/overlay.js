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

  /**
   * 文字の装飾(同じ文字を重ねて表現。外側ほど太い縁取りを下に敷く)
   * L.fill        塗り { type:'solid'|'gradient', color, angle, stops:['#fff 0%', …], texture:{id,blend}, gloss:0〜1 }
   * L.accent      [[ ]] で囲んだ部分の塗り(同じ形)。L.accent2 は {{ }} で囲んだ部分
   * L.strokes     縁取り(内側→外側、何本でも)。L.round=true で角の丸い縁取り
   * L.glow / L.shadow / L.extrude(立体の厚み) / L.band(マーカー線) / L.skew
   * L.perLine     グラデーションを行ごとにかける(大きな文字)
   */
  const ring = (w, c) => {
    // 角の丸い縁取り:同じ文字を円周上にずらして重ねる(-webkit-text-stroke は角がとがるため)
    const out = [];
    const n0 = Math.max(16, Math.min(64, Math.round(w * 5)));
    for (const [f, n] of [[1, n0], [0.7, Math.round(n0 * 0.7)], [0.4, Math.round(n0 * 0.45)]]) {
      for (let k = 0; k < n; k++) { const a = (Math.PI * 2 * k) / n; out.push(`${(Math.cos(a) * w * f / BASE).toFixed(4)}em ${(Math.sin(a) * w * f / BASE).toFixed(4)}em 0 ${c}`); }
    }
    return out.join(',');
  };
  /** 塗りの CSS(単色・グラデーション・質感・ツヤ) */
  OV.textFillCss = function (f, perLine) {
    f = f || { type: 'solid', color: '#fff' };
    const tex = f.texture && f.texture.id && f.texture.id !== 'none' ? f.texture : null;
    const te = tex ? ((((OV.catalogs || {}).textDesigns || {}).textures || []).find((t) => t.id === tex.id) || null) : null;
    const bright = tex ? Math.max(-0.9, Math.min(0.9, Number(tex.bright) || 0)) : 0;
    const gloss = Number(f.gloss) || 0;
    const base = f.type === 'gradient'
      ? `linear-gradient(${Number(f.angle) || 180}deg, ${(f.stops && f.stops.length > 1 ? f.stops : ['#fff', '#ccc']).join(', ')})`
      : null;
    if (!base && !tex && !gloss) return `color:${f.color || '#fff'}`;
    const layers = [];
    const blends = [];
    const sizes = [];
    const poss = [];
    const add = (l, b, s, pos) => { layers.push(l); blends.push(b); sizes.push(s); poss.push(pos || 'center'); };
    if (gloss) { const a = Math.min(1, gloss); add(`linear-gradient(180deg, rgba(255,255,255,${(0.65 * a).toFixed(2)}) 0%, rgba(255,255,255,${(0.18 * a).toFixed(2)}) 47%, rgba(255,255,255,0) 48%)`, 'normal', '100% 100%'); }
    if (tex) {
      // 明るさ:白(または黒)を薄く重ねる
      if (bright) { const c = bright > 0 ? '255,255,255' : '0,0,0'; add(`linear-gradient(rgba(${c},${Math.abs(bright).toFixed(2)}), rgba(${c},${Math.abs(bright).toFixed(2)}))`, 'normal', '100% 100%'); }
      // 画像の質感(写真)は、文字の大きさに対して決まった大きさで敷く(「大きさ」で調整)。コードで作った質感は、文字の範囲いっぱいに伸ばす
      const sc = Math.max(0.2, Math.min(6, Number(tex.scale) || 1));
      const url = `url("/text-textures/${encodeURIComponent((te && te.file) || `${tex.id}.png`)}")`;
      const size = te && te.photo ? `max(${(10 * sc).toFixed(2)}em, 100%) auto` : '100% 100%';
      const pc = (v) => Math.max(0, Math.min(100, v == null || v === '' ? 50 : Number(v)));
      const pos = te && te.photo ? `${pc(tex.x)}% ${pc(tex.y)}%` : 'center';
      // メリハリ:同じ画像を「乗算」で重ねて、暗いところをより暗く(稲妻・雲などの明るい部分が目立つ)
      const n = Math.max(0, Math.min(3, Math.round(Number(tex.contrast) || 0)));
      for (let i = 0; i < n; i++) add(url, 'multiply', size, pos);
      add(url, tex.blend || 'multiply', size, pos);
    }
    add(base || `linear-gradient(${f.color || '#fff'}, ${f.color || '#fff'})`, 'normal', '100% 100%');
    return `background:${layers.join(', ')};background-size:${sizes.join(', ')};background-position:${poss.join(', ')};background-blend-mode:${blends.join(', ')};-webkit-background-clip:text;background-clip:text;color:transparent;-webkit-text-fill-color:transparent${perLine ? ';-webkit-box-decoration-break:clone;box-decoration-break:clone' : ''}`;
  };

  /** ドット風(ピクセル化)の SVG フィルター。ブロックの大きさは文字の大きさに合わせて OV.fixPixelFilters で決める */
  let pxSeq = 0;
  const pxFilter = (id, em) => `<svg class="gt-pxf" data-em="${Number(em).toFixed(4)}" width="0" height="0" aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden"><filter id="${id}" x="-20%" y="-30%" width="140%" height="160%" color-interpolation-filters="sRGB"><feFlood x="3" y="3" width="1" height="1"/><feComposite x="0" y="0" width="6" height="6"/><feTile result="t"/><feComposite in="SourceGraphic" in2="t" operator="in"/><feMorphology operator="dilate" radius="3"/></filter></svg>`;
  OV.fixPixelFilters = function (root) {
    if (!root) return;
    root.querySelectorAll('svg.gt-pxf').forEach((svg) => {
      const t = svg.closest('.gt-title') || svg.parentElement;
      const fs = parseFloat(getComputedStyle(t).fontSize) || 48;
      const B = Math.max(2, Math.round(fs * Number(svg.dataset.em || 0.05)));
      // 画面を縮小して表示しているとき(管理画面のプレビュー、OBS のブラウザソースが 1920x1080 でないとき)は、
      // 1マスをサンプルする点が実際の1ピクセルより小さくなって消えてしまう。点を、実際の1ピクセル以上の大きさにする
      const w = t.offsetWidth;
      const sc = w > 0 ? Math.min(1, Math.max(0.05, t.getBoundingClientRect().width / w)) : 1;
      const d = Math.max(1, Math.ceil(1 / sc)); // サンプルする点の大きさ
      const r = Math.max(1, Math.round(B - d) / 2); // 点をふくらませる量(0 にすると、ブラウザは文字ごと消してしまうので、最小 1)
      const T = d + 2 * r; // 1マスの大きさ
      const key = `${B}|${d}`;
      if (svg.dataset.b === key) return;
      svg.dataset.b = key;
      const [flood, comp, , , morph] = svg.querySelectorAll('filter > *');
      flood.setAttribute('x', r); flood.setAttribute('y', r);
      flood.setAttribute('width', d); flood.setAttribute('height', d);
      comp.setAttribute('width', T); comp.setAttribute('height', T);
      morph.setAttribute('radius', r.toFixed(2));
    });
  };

  // ---- 文字ごとの大きさ・色 ----
  // [[ ]] = 色1 / {{ }} = 色2 / << >> = 大きく / (( )) = 小さく(重ねて使える。例:[[<<108>>星]])
  const MARK_RE = /(\[\[|\]\]|\{\{|\}\}|<<|>>|\(\(|\)\))/;
  const HIRA = /[ぁ-ゟ]/;
  const KATA = /[ァ-ヺー-ヿｦ-ﾟ]/;
  const DIGIT = /[0-9０-９]/;
  /** 文字列を「同じ色・同じ大きさ」のまとまりに分ける */
  OV.textRuns = function (raw, L) {
    const cs = L.charSize || null;
    const useAcc = !!(L.accent || L.accent2 || L.stripMarks);
    const useSize = !!(cs || L.stripMarks);
    const big = cs && Number(cs.big) > 0 ? Number(cs.big) : 1.35;
    const small = cs && Number(cs.small) > 0 ? Number(cs.small) : 0.7;
    const runs = [];
    const st = { a1: 0, a2: 0, big: 0, small: 0 };
    const push = (ch, acc, size) => {
      const last = runs[runs.length - 1];
      if (last && last.acc === acc && last.size === size) last.text += ch;
      else runs.push({ text: ch, acc, size });
    };
    for (const part of String(raw || '').split(MARK_RE)) {
      if (part === '') continue;
      if (useAcc && (part === '[[' || part === ']]' || part === '{{' || part === '}}')) {
        const k = part[0] === '[' || part[0] === ']' ? 'a1' : 'a2';
        st[k] = part === '[[' || part === '{{' ? st[k] + 1 : Math.max(0, st[k] - 1);
        continue;
      }
      if (useSize && (part === '<<' || part === '>>' || part === '((' || part === '))')) {
        const k = part[0] === '<' || part[0] === '>' ? 'big' : 'small';
        st[k] = part === '<<' || part === '((' ? st[k] + 1 : Math.max(0, st[k] - 1);
        continue;
      }
      const acc = st.a1 ? 'a1' : st.a2 ? 'a2' : '';
      for (const ch of part) {
        let size = 1;
        if (st.big) size = big;
        else if (st.small) size = small;
        else if (cs) {
          if (cs.digits && DIGIT.test(ch)) size = big;
          else if ((cs.auto === 'hira' || cs.auto === 'kana') && HIRA.test(ch)) size = small;
          else if (cs.auto === 'kana' && KATA.test(ch)) size = small;
        }
        push(ch, acc, size);
      }
    }
    return runs;
  };

  OV.titleTextHtml = function (text, L) {
    const raw = String(text || '');
    const runs = OV.textRuns(raw, L);
    const plain = runs.map((r) => r.text).join('');
    const sized = runs.some((r) => r.size !== 1);
    const colored = runs.some((r) => r.acc);
    const sz = (r) => (r.size !== 1 ? `font-size:${r.size}em;` : '');
    // 縁取り・光の層:大きさだけそろえる(色はそれぞれの層の色)
    const t = sized ? runs.map((r) => (r.size !== 1 ? `<span style="${sz(r)}">${esc(r.text)}</span>` : esc(r.text))).join('') : esc(plain);
    const strokes = (L.strokes || []).filter((s) => Number(s.width) > 0);
    let cum = 0;
    const widths = strokes.map((s) => (cum += Number(s.width)));
    const layers = [];
    if (L.band && L.band.color) {
      const top = 100 - Math.max(5, Math.min(100, Number(L.band.height) || 45));
      layers.push(`<span class="gt-l gt-band" aria-hidden="true"><span style="${esc(`color:transparent;background:linear-gradient(transparent ${top}%, ${L.band.color} ${top}%);-webkit-box-decoration-break:clone;box-decoration-break:clone`)}">${t}</span></span>`);
    }
    if (L.glow && Number(L.glow.size) > 0) {
      const c = L.glow.color;
      const base = L.round ? `text-shadow:${ring(cum + 0.5, c)},0 0 ${em(L.glow.size)} ${c},0 0 ${em(L.glow.size * 2.2)} ${c}` : `-webkit-text-stroke:${em(cum * 2 + 1)} ${c};text-shadow:0 0 ${em(L.glow.size)} ${c},0 0 ${em(L.glow.size * 2.2)} ${c}`;
      layers.push(`<span class="gt-l" aria-hidden="true" style="${esc(`color:${c};${base}`)}">${t}</span>`);
    }
    for (let i = strokes.length - 1; i >= 0; i--) {
      const c = strokes[i].color;
      const st = L.round ? `text-shadow:${ring(widths[i], c)}` : `-webkit-text-stroke:${em(widths[i] * 2)} ${c}`;
      layers.push(`<span class="gt-l" aria-hidden="true" style="${esc(`color:${c};${st}`)}">${t}</span>`);
    }
    const f = L.fill || { type: 'solid', color: '#fff' };
    if (colored || sized || L.perLine) {
      // まとまりごとに塗る([[ ]] / {{ }} の部分は別の塗り)。グラデーションは、まとまりごとにかかる
      const html = runs.map((r) => {
        const fill = r.acc === 'a1' && L.accent ? L.accent : r.acc === 'a2' && L.accent2 ? L.accent2 : f;
        return `<span style="${esc(sz(r) + OV.textFillCss(fill, true))}">${esc(r.text)}</span>`;
      }).join('');
      layers.push(`<span class="gt-fill">${html}</span>`);
    } else {
      layers.push(`<span class="gt-fill" style="${esc(OV.textFillCss(f, false))}">${t}</span>`);
    }
    const outer = [];
    const fx = [];
    if (L.extrude && (Number(L.extrude.x) || Number(L.extrude.y))) {
      // 立体の厚み:影を倍々に重ねて、すき間のない厚みにする
      const x = Number(L.extrude.x) || 0;
      const y = Number(L.extrude.y) || 0;
      for (const k of [1, 2, 4, 8, 16]) fx.push(`drop-shadow(${em((x * k) / 31)} ${em((y * k) / 31)} 0 ${L.extrude.color || '#000'})`);
    }
    if (L.shadow) fx.push(`drop-shadow(${em(L.shadow.x)} ${em(L.shadow.y)} ${em(L.shadow.blur)} ${L.shadow.color})`);
    let pxSvg = '';
    if (L.pixel && Number(L.pixel.em) > 0) {
      const id = `gtpx${++pxSeq}`;
      pxSvg = pxFilter(id, L.pixel.em);
      fx.push(`url(#${id})`);
    }
    if (fx.length) outer.push(`filter:${fx.join(' ')}`);
    if (L.skew) outer.push(`transform:skewX(${Number(L.skew)}deg)`);
    const titleStyle = `font-family:${fontStack(L.font, L.fallbackFont)};font-weight:${L.weight || 400};font-style:${L.italic ? 'italic' : 'normal'};letter-spacing:${Number(L.letterSpacing) || 0.02}em`;
    return `<div class="gt-title" style="${esc(titleStyle)}">${pxSvg}<span class="gt-layers" style="${esc(outer.join(';'))}">${layers.join('')}</span></div>`;
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
