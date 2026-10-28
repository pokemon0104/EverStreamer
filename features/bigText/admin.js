/* 大きな文字パネルの設定 + テキストデザインのギャラリー */
(function () {
  'use strict';
  const { h } = UI;
  const { clone, deepMerge } = OV.util;
  const fontOptions = () => (OV.catalogs.fonts || []).map((f) => [f.family, f.label || f.family]);
  const TD = () => OV.catalogs.textDesigns || { types: [], categories: [], textures: [] };
  const TU = () => OV.catalogs.textDesignsUser || { favorites: [], recent: [], mine: [] };
  const baseSize = () => Number(TD().baseSize) || 120;

  // ---- デザイン(見た目)の扱い ----
  /** ギャラリーのデザインに書いていない装飾は「なし」にする(前のデザインの装飾が残らないように) */
  const DEFAULT_LOOK = {
    font: 'Noto Sans JP', bold: true, italic: false, skew: 0, letterSpacing: 0.02,
    fillType: 'solid', color: '#ffffff', color2: '#ffd84a', angle: 180, stops: null,
    gloss: { on: false, strength: 1 }, texture: { id: 'none', blend: 'multiply', bright: 0, scale: 1, contrast: 0, x: 50, y: 50 },
    accent: { on: false, fillType: 'solid', color: '#ff3030', color2: '#aa0000', angle: 180 },
    accent2: { on: false, fillType: 'solid', color: '#2a8aff', color2: '#0040c0', angle: 180 },
    stroke1: { on: false, color: '#000000', width: 4 }, stroke2: { on: false, color: '#ffffff', width: 4 }, stroke3: { on: false, color: '#000000', width: 4 },
    roundStroke: true,
    glow: { on: false, color: '#ffffff', size: 12 },
    shadow: { on: false, color: '#000000', alpha: 0.6, x: 4, y: 6, blur: 0 },
    extrude: { on: false, color: '#000000', x: 5, y: 6 },
    band: { on: false, color: '#e8203a', height: 45 },
    deco: { type: 'none', color: '#e8102a', edge: '', pad: 0.45 },
    pixel: { on: false, size: 5 },
    charSize: { auto: 'none', digits: false, big: 1.35, small: 0.7 },
  };
  const LOOK_KEYS = Object.keys(DEFAULT_LOOK);
  const fullLook = (look) => deepMerge(clone(DEFAULT_LOOK), clone(look || {}));
  /** 太さ・影など px の値を、文字の大きさに合わせて拡大縮小 */
  const scaleLook = (L, f) => {
    const r = (v) => Math.round(Number(v || 0) * f * 10) / 10;
    for (const k of ['stroke1', 'stroke2', 'stroke3']) if (L[k]) L[k].width = Math.max(0.5, r(L[k].width));
    if (L.glow) L.glow.size = r(L.glow.size);
    if (L.shadow) { L.shadow.x = r(L.shadow.x); L.shadow.y = r(L.shadow.y); L.shadow.blur = r(L.shadow.blur); }
    if (L.extrude) { L.extrude.x = r(L.extrude.x); L.extrude.y = r(L.extrude.y); }
    if (L.pixel) L.pixel.size = Math.max(1, r(L.pixel.size));
    return L;
  };
  const allVariants = () => {
    const list = [];
    for (const t of TD().types || []) for (const v of t.variants || []) list.push({ ...v, type: t });
    for (const m of TU().mine || []) list.push({ ...m, src: 'マイデザイン', mine: true, type: { id: 'mine', name: 'マイデザイン', variants: [] } });
    return list;
  };
  const variantById = (id) => allVariants().find((v) => v.id === id);
  /** 表示用:デザインを、指定の大きさの「大きな文字」の設定にする */
  const designData = (v, size, texOverride) => {
    const L = scaleLook(fullLook(v.look), size / baseSize());
    if (texOverride) L.texture = { id: texOverride, blend: (v.look.texture && v.look.texture.blend) || 'multiply' };
    return { ...L, size };
  };
  /** プレビュー用の HTML(サムネイル) */
  const thumbHtml = (v, size, text, texOverride) => {
    const d = designData(v, size, texOverride);
    const inner = OV.titleTextHtml(text, OV.bigTextLook(d));
    const deco = OV.bigTextDeco(d.deco);
    return `<div class="t-bigText"><div class="bt" style="font-size:${size}px;line-height:1.15;text-align:center">${deco ? `<span class="bt-dw">${deco}${inner}</span>` : inner}</div></div>`;
  };
  const userApi = (body) => fetch('/api/text-designs/user', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then((r) => r.json()).then((j) => { if (j.error) ADM.toast(j.error, 'error'); return j; })
    .catch(() => ADM.toast('保存できませんでした', 'error'));

  const fontRefText = (ref) => {
    if (!ref) return '';
    return `元のフォント:${ref.name}${ref.kind ? `(${ref.kind})` : ''} → このツールでは ${ref.alt || '近い書体'} で表示`;
  };
  const hasFont = (fam) => (OV.catalogs.fonts || []).some((f) => f.family === fam);

  // ======== 適用・ひとつ前に戻す・おまかせ ========
  const hist = {}; // パネルごとの、適用前の見た目(新しい順)
  const SNAP_KEYS = () => [...LOOK_KEYS, 'designRef', 'text'];
  const snapshot = (d) => Object.fromEntries(SNAP_KEYS().map((k) => [k, d[k] === undefined ? null : clone(d[k])]));
  /** デザインを適用する(適用前の見た目を「ひとつ前に戻す」用に覚えておく) */
  function applyDesign(panelId, v, texId, opts = {}) {
    const p = ADM.panel(panelId);
    if (!p) return;
    (hist[panelId] = hist[panelId] || []).unshift(snapshot(p.data || {}));
    hist[panelId].length = Math.min(hist[panelId].length, 30);
    const size = Math.max(8, Number(p.data.size) || 110);
    const L = designData(v, size, texId || '');
    delete L.size;
    const patch = { ...L, stops: L.stops || null };
    patch.designRef = { id: v.id, name: v.name, src: v.src || null, type: (v.type && v.type.name) || null, fontRef: v.fontRef || null, note: v.note || null };
    if (opts.withText && v.sample) patch.text = v.sample;
    ADM.patchPanel(panelId, { data: patch });
    if (!v.mine) userApi({ op: 'recent', id: v.id });
    ADM.toast(opts.random ? `おまかせ:「${v.name}」(${v.id})にしました` : `「${v.name}」を適用しました`);
  }
  const canUndo = (panelId) => !!(hist[panelId] && hist[panelId].length);
  function undoDesign(panelId) {
    const prev = (hist[panelId] || []).shift();
    if (!prev) { ADM.toast('戻せる見た目がありません'); return; }
    // 1つ前に無かった項目は消す(null)。入れ子の設定は丸ごと置き換える
    const cur = (ADM.panel(panelId) || {}).data || {};
    const clear = Object.fromEntries(SNAP_KEYS().filter((k) => cur[k] && typeof cur[k] === 'object' && !Array.isArray(cur[k])).map((k) => [k, null]));
    ADM.patchPanel(panelId, { data: clear });
    ADM.patchPanel(panelId, { data: prev });
    ADM.toast('ひとつ前の見た目に戻しました');
  }
  const themeList = () => TD().themes || [];
  /** テーマ(またはギャラリーの表示中の一覧)から、今と違うデザインを1つ選ぶ */
  function pickRandom(themeId, curId) {
    let list;
    if (themeId && themeId.startsWith('type:')) {
      const t = (TD().types || []).find((x) => x.id === themeId.slice(5));
      list = t ? t.variants.map((v) => ({ ...v, type: t })) : [];
    } else if (themeId === 'fav') list = TU().favorites.map(variantById).filter(Boolean);
    else if (themeId === 'mine') list = allVariants().filter((v) => v.mine);
    else {
      const th = themeList().find((t) => t.id === themeId);
      list = th ? th.ids.map(variantById).filter(Boolean) : allVariants().filter((v) => !v.mine);
    }
    if (list.length > 1) list = list.filter((v) => v.id !== curId);
    return list.length ? list[Math.floor(Math.random() * list.length)] : null;
  }
  function randomDesign(panelId, themeId, opts = {}) {
    const p = ADM.panel(panelId);
    const v = pickRandom(themeId, p && p.data.designRef && p.data.designRef.id);
    if (!v) { ADM.toast('選べるデザインがありません'); return; }
    applyDesign(panelId, v, '', { ...opts, random: true });
  }

  // ======== ギャラリー ========
  const G = { view: 'all', q: '', sel: {}, tex: {}, useMine: false, withText: false, openDd: null };
  try { const s = JSON.parse(localStorage.getItem('tdg') || '{}'); G.useMine = !!s.useMine; G.withText = !!s.withText; G.sel = s.sel || {}; } catch { /* ignore */ }
  const saveG = () => { try { localStorage.setItem('tdg', JSON.stringify({ useMine: G.useMine, withText: G.withText, sel: G.sel })); } catch { /* ignore */ } };

  function openGallery(panelId) {
    const P = () => ADM.panel(panelId) || { data: {} };
    const back = h('div', { class: 'tdg-back', onclick: (e) => { if (e.target === back) close(); } });
    const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') { if (G.openDd) { G.openDd = null; renderMain(); } else close(); } };
    document.addEventListener('keydown', onKey);

    const nav = h('nav', { class: 'tdg-nav' });
    const main = h('div', { class: 'tdg-main' });
    const search = h('input', { type: 'search', class: 'tdg-q', placeholder: '名前・色・番号・フォント名で検索(例:金、ネオン、C2、ユールカ)', value: G.q });
    search.addEventListener('input', () => { G.q = search.value.trim(); renderMain(); });
    const optMine = h('label', { class: 'tdg-opt' }, h('input', { type: 'checkbox', checked: G.useMine, onchange: (e) => { G.useMine = e.target.checked; saveG(); renderMain(); } }), '見本を今の文字で表示');
    const optText = h('label', { class: 'tdg-opt' }, h('input', { type: 'checkbox', checked: G.withText, onchange: (e) => { G.withText = e.target.checked; saveG(); } }), '適用するとき、見本の文字も入れる');
    const total = (TD().types || []).reduce((n, t) => n + (t.variants || []).length, 0);
    // おまかせ:左で選んでいるテーマ・種類の中から、ランダムに1つ適用する
    const viewTheme = () => (G.view.startsWith('theme:') ? G.view.slice(6) : G.view.startsWith('type:') || G.view === 'fav' || G.view === 'mine' ? G.view : '');
    const rndBtn = UI.button('🎲 おまかせ', () => { randomDesign(panelId, viewTheme(), { withText: G.withText }); close(); }, 'primary small');
    rndBtn.title = '左で選んでいるテーマ(または種類)の中から、ランダムに1つ選んで適用します';
    const modal = h('div', { class: 'tdg', role: 'dialog', 'aria-label': 'テキストデザインを選ぶ' },
      h('div', { class: 'tdg-head' },
        h('b', null, `テキストデザイン(${total}種)`), search, optMine, optText,
        rndBtn,
        UI.button('閉じる', close, 'small')),
      h('div', { class: 'tdg-body' }, nav, main),
      h('div', { class: 'tdg-foot' }, '見本をクリックすると、そのデザインを適用します。迷ったら「🎲 おまかせ」で、左で選んでいるテーマの中からランダムに選べます。色違いは「配色」、炎・氷などの模様は「質感」で選べます。太さや影は、今の文字の大きさに合わせて自動で調整します。'));
    back.append(modal);
    document.body.append(back);
    search.focus();

    const curText = () => {
      const t = String(P().data.text || '').trim();
      return t || 'ここに文字';
    };
    const sampleOf = (v) => (G.useMine ? curText() : v.sample || v.name);
    const thumbSize = (text, base) => {
      const lines = String(text).replace(/\[\[|\]\]|\{\{|\}\}/g, '').split('\n');
      const len = Math.max(...lines.map((l) => [...l].length), 1);
      return Math.max(12, Math.min(base, Math.floor((base * 2.9) / Math.max(len, 1)), Math.floor((base * 1.55) / lines.length)));
    };

    function apply(v, texId) {
      applyDesign(panelId, v, texId, { withText: G.withText });
      close();
    }

    // ---- 左の一覧 ----
    function renderNav() {
      const u = TU();
      const items = [['all', 'すべて', total], ['fav', '★ お気に入り', u.favorites.length], ['recent', '最近使った', u.recent.length], ['mine', 'マイデザイン', u.mine.length]];
      nav.innerHTML = '';
      for (const [id, label, n] of items) nav.append(navItem(id, label, n));
      if (themeList().length) {
        nav.append(h('div', { class: 'tdg-cat' }, 'テーマ別のおすすめ'));
        for (const t of themeList()) nav.append(navItem(`theme:${t.id}`, t.name, t.ids.length, true));
        nav.append(h('div', { class: 'tdg-cat' }, '種類'));
      }
      for (const c of TD().categories || []) {
        const types = (TD().types || []).filter((t) => t.category === c.id);
        if (!types.length) continue;
        nav.append(h('div', { class: 'tdg-cat' }, c.name));
        for (const t of types) nav.append(navItem(`type:${t.id}`, t.name, t.variants.length, true));
      }
    }
    function navItem(id, label, n, sub) {
      return h('button', { type: 'button', class: `tdg-ni${sub ? ' sub' : ''}${G.view === id ? ' on' : ''}`, onclick: () => { G.view = id; G.openDd = null; renderNav(); renderMain(); main.scrollTop = 0; } }, h('span', null, label), h('i', null, String(n)));
    }

    // ---- カード ----
    const match = (v, q) => {
      if (!q) return true;
      const hay = [v.name, v.id, v.sample, v.type && v.type.name, v.type && v.type.desc, v.src, v.fontRef && v.fontRef.name, v.fontRef && v.fontRef.alt, v.look && v.look.font].join(' ').toLowerCase();
      return q.toLowerCase().split(/\s+/).every((w) => hay.includes(w) || (w === '金' && /gold|金/.test(hay)));
    };
    function card(key, title, variants, opts = {}) {
      const vid = variants.some((v) => v.id === G.sel[key]) ? G.sel[key] : variants[0].id;
      const v = variants.find((x) => x.id === vid);
      const tex = G.tex[key] || '';
      const fav = TU().favorites.includes(v.id);
      const text = sampleOf(v);
      const th = h('button', { type: 'button', class: 'tdg-th', title: 'クリックで適用', html: thumbHtml(v, thumbSize(text, 66), text, tex), onclick: () => apply(v, tex) });
      const star = h('button', { type: 'button', class: `tdg-star${fav ? ' on' : ''}`, title: fav ? 'お気に入りから外す' : 'お気に入りに追加', onclick: () => userApi({ op: 'fav', id: v.id, on: !fav }) }, '★');
      const ddBtn = h('button', { type: 'button', class: `tdg-dd${G.openDd === key ? ' open' : ''}`, disabled: variants.length < 2, onclick: () => { G.openDd = G.openDd === key ? null : key; renderMain(); } },
        h('span', null, h('em', null, '配色'), `${v.name}`, h('small', null, v.id)), h('span', null, variants.length > 1 ? '▾' : ''));
      const texSel = h('select', { class: 'tdg-tex', title: '質感(模様)', onchange: (e) => { G.tex[key] = e.target.value; renderMain(); } },
        h('option', { value: '' }, '質感:配色のまま'),
        ...(TD().textures || []).map((t) => h('option', { value: t.id, selected: tex === t.id }, `質感:${t.name}`)));
      const c = h('div', { class: `tdg-card${G.openDd === key ? ' raised' : ''}` },
        th,
        h('div', { class: 'tdg-row' }, h('b', null, title), variants.length > 1 ? h('span', { class: 'tdg-n' }, `${variants.length}配色`) : null, h('span', { class: 'tdg-sp' }), star),
        h('div', { class: 'tdg-row' }, ddBtn, texSel),
        h('div', { class: 'tdg-meta' }, v.src || '', v.fontRef ? h('div', { class: 'tdg-font' }, fontRefText(v.fontRef)) : null, v.note ? h('div', { class: 'tdg-note' }, v.note) : null),
        opts.mine ? h('div', { class: 'tdg-row' },
          UI.button('名前を変える', () => { const n = prompt('名前', v.name); if (n) userApi({ op: 'rename', id: v.id, name: n }); }, 'small'),
          UI.button('削除', () => { if (confirm(`「${v.name}」を削除しますか?`)) userApi({ op: 'delete', id: v.id }); }, 'small danger')) : null);
      if (G.openDd === key) {
        const list = h('div', { class: 'tdg-list' });
        for (const x of variants) {
          list.append(h('button', {
            type: 'button', class: `tdg-it${x.id === v.id ? ' on' : ''}`,
            onclick: () => { G.sel[key] = x.id; G.openDd = null; saveG(); renderMain(); },
          }, h('span', { class: 'tdg-mini', html: thumbHtml(x, thumbSize(sampleOf(x), 26), sampleOf(x), tex) }), h('span', null, x.name), h('small', null, x.id)));
        }
        c.append(list);
      }
      return c;
    }
    function renderMain() { renderMainInner(); OV.fixPixelFilters(main); }
    function renderMainInner() {
      main.innerHTML = '';
      const u = TU();
      const q = G.q;
      const grid = h('div', { class: 'tdg-grid' });
      const single = (list, opts) => list.forEach((v) => grid.append(card(`v:${v.id}`, v.name, [v], opts)));
      if (G.view.startsWith('theme:')) {
        const th = themeList().find((t) => t.id === G.view.slice(6));
        const list = th ? th.ids.map(variantById).filter(Boolean).filter((v) => match(v, q)) : [];
        if (!list.length) { main.append(h('p', { class: 'tdg-empty' }, '見つかりませんでした。')); return; }
        main.append(h('div', { class: 'tdg-typehead' }, h('b', null, th.name), ` のおすすめ ${list.length}種。右上の「🎲 おまかせ」で、この中からランダムに選べます。`));
        single(list);
      } else if (G.view === 'fav' || G.view === 'recent' || G.view === 'mine') {
        const ids = G.view === 'mine' ? u.mine.map((m) => m.id) : u[G.view === 'fav' ? 'favorites' : 'recent'];
        const list = ids.map(variantById).filter(Boolean).filter((v) => match(v, q));
        if (!list.length) {
          main.append(h('p', { class: 'tdg-empty' }, G.view === 'fav' ? 'まだありません。カードの ★ を押すと、ここに集まります。'
            : G.view === 'recent' ? 'まだありません。デザインを適用すると、ここに並びます。'
              : 'まだありません。右の設定で見た目を作り、「今の見た目をマイデザインに保存」で追加できます。'));
          return;
        }
        single(list, { mine: G.view === 'mine' });
      } else {
        let types = TD().types || [];
        if (G.view.startsWith('type:')) types = types.filter((t) => t.id === G.view.slice(5));
        let shown = 0;
        for (const t of types) {
          const vs = t.variants.map((v) => ({ ...v, type: t })).filter((v) => match(v, q));
          if (!vs.length) continue;
          shown += vs.length;
          grid.append(card(`t:${t.id}`, t.name, vs));
        }
        if (!shown) { main.append(h('p', { class: 'tdg-empty' }, '見つかりませんでした。')); return; }
        if (G.view.startsWith('type:') && types[0]) {
          const t = types[0];
          main.append(h('div', { class: 'tdg-typehead' }, h('b', null, t.name), ` ${t.desc || ''}`, t.fontHint ? h('div', { class: 'tdg-font' }, t.fontHint) : null));
          // 型を選んだときは、配色をすべて並べて見比べられるようにする
          const all = h('div', { class: 'tdg-grid' });
          t.variants.map((v) => ({ ...v, type: t })).filter((v) => match(v, q)).forEach((v) => all.append(card(`v:${v.id}`, v.name, [v])));
          main.append(all);
          return;
        }
      }
      main.append(grid);
    }
    renderNav();
    renderMain();
    // お気に入りなどが変わったら描き直す
    UI.bind(back, () => {
      const key = JSON.stringify([TU(), (TD().types || []).length]);
      if (back.dataset.k && back.dataset.k !== key) { renderNav(); renderMain(); }
      back.dataset.k = key;
    });
  }

  // ======== 設定画面 ========
  ADM.registerInspector('bigText', {
    title: '大きな文字',
    build(root, id) {
      const D = () => (ADM.panel(id) || {}).data || {};
      const setD = (patch) => ADM.patchPanel(id, { data: patch });
      const dk = (k) => ({ get: () => D()[k], set: (v) => setD({ [k]: v }) });
      // 古いパネルに無い項目は、初期値を補って読み書きする
      const sub = (o, k) => ({
        get: () => { const x = (D()[o] || {})[k]; return x === undefined && DEFAULT_LOOK[o] ? DEFAULT_LOOK[o][k] : x; },
        set: (v) => setD({ [o]: { ...(DEFAULT_LOOK[o] || {}), ...(D()[o] || {}), [k]: v } }),
      });
      const onOf = (o) => () => !!(D()[o] || {}).on;

      // ---- 選んだデザインと参考フォント ----
      const refBox = h('div', { class: 'tdg-ref' });
      UI.bind(refBox, () => {
        const r = D().designRef;
        const key = JSON.stringify([r, D().font, (OV.catalogs.fonts || []).length]);
        if (refBox.dataset.k === key) return;
        refBox.dataset.k = key;
        refBox.innerHTML = '';
        if (!r) { refBox.append(h('div', { class: 'hint' }, 'ギャラリーから選ぶと、ここに名前と参考フォントが出ます。')); return; }
        refBox.append(h('div', null, h('b', null, r.name), r.type ? ` / ${r.type}` : '', r.src ? h('div', { class: 'hint' }, r.src) : null));
        if (r.fontRef) {
          refBox.append(h('div', { class: 'tdg-font' }, fontRefText(r.fontRef)));
          if (hasFont(r.fontRef.name)) {
            if (D().font !== r.fontRef.name) refBox.append(UI.button(`元のフォント「${r.fontRef.name}」に切り替える`, () => setD({ font: r.fontRef.name, bold: false }), 'small'));
          } else {
            refBox.append(h('div', { class: 'hint' }, `「${r.fontRef.name}」を PC に入れて「フォント」タブで登録すると、ここから切り替えられます。`));
          }
        }
        if (r.note) refBox.append(h('div', { class: 'hint' }, r.note));
      });
      const saveMine = () => {
        const d = D();
        const name = prompt('マイデザインの名前', (d.designRef && d.designRef.name) || String(d.text || 'マイデザイン').split('\n')[0].slice(0, 20));
        if (!name) return;
        const look = {};
        for (const k of LOOK_KEYS) if (d[k] !== undefined) look[k] = clone(d[k]);
        scaleLook(look, baseSize() / Math.max(8, Number(d.size) || 110));
        userApi({ op: 'save', name, sample: String(d.text || name).slice(0, 40), look, fontRef: (d.designRef && d.designRef.fontRef) || null })
          .then((j) => { if (j && j.ok) ADM.toast(`「${name}」をマイデザインに保存しました`); });
      };

      // ---- グラデーションの色(何色でも) ----
      const curStops = () => {
        const d = D();
        return Array.isArray(d.stops) && d.stops.length > 1 ? d.stops : [{ color: d.color || '#ffffff', pos: 0 }, { color: d.color2 || '#ffd84a', pos: 100 }];
      };
      const writeStops = (a) => setD({ stops: a, color: a[0].color, color2: a[a.length - 1].color });
      const stopsBox = h('div', { class: 'tdg-stops' });
      const bar = h('div', { class: 'tdg-bar' });
      UI.bind(stopsBox, () => {
        const s = curStops();
        bar.style.background = `linear-gradient(90deg, ${s.map((x) => `${x.color} ${x.pos}%`).join(', ')})`;
        if (stopsBox.dataset.n === String(s.length)) return;
        stopsBox.dataset.n = String(s.length);
        stopsBox.innerHTML = '';
        s.forEach((_, i) => {
          stopsBox.append(h('div', { class: 'tdg-stop' },
            UI.color({ label: `色${i + 1}`, get: () => (curStops()[i] || {}).color, set: (v) => { const a = clone(curStops()); a[i].color = v; writeStops(a); } }),
            UI.num({ label: '位置', min: 0, max: 100, step: 1, unit: '%', get: () => (curStops()[i] || {}).pos, set: (v) => { const a = clone(curStops()); a[i].pos = v; writeStops(a); } }),
            s.length > 2 ? UI.button('この色を消す', () => { const a = clone(curStops()); a.splice(i, 1); writeStops(a); }, 'small') : null));
        });
      });
      const addStop = () => {
        const a = clone(curStops());
        const last = a[a.length - 1];
        const prev = a[a.length - 2];
        a.splice(a.length - 1, 0, { color: prev.color, pos: Math.round((prev.pos + last.pos) / 2) });
        writeStops(a);
      };

      const accentUi = (key, label) => h('div', null,
        UI.toggle({ label, ...sub(key, 'on') }),
        UI.when(onOf(key), h('div', null,
          UI.seg({ label: '塗り', options: [['solid', '単色'], ['gradient', 'グラデーション']], ...sub(key, 'fillType') }),
          UI.color({ label: '色1', ...sub(key, 'color') }),
          UI.when(() => (D()[key] || {}).fillType === 'gradient', h('div', null,
            UI.color({ label: '色2', ...sub(key, 'color2') }),
            UI.num({ label: '向き', min: 0, max: 360, step: 15, unit: '度', ...sub(key, 'angle') }))))));

      // 文字の欄:選んだ部分を記号で囲むボタンつき
      const markEditor = () => {
        const ta = h('textarea', { rows: 3, placeholder: '改行で行が分かれます。文字を選んで下のボタンを押すと、その部分だけ大きさや色を変えられます' });
        ta.addEventListener('input', () => setD({ text: ta.value }));
        const wrapSel = (open, close) => {
          const v = ta.value;
          let a = ta.selectionStart;
          let b = ta.selectionEnd;
          if (a === b) { ADM.toast('先に、変えたい文字を選んでください'); ta.focus(); return; }
          ta.value = v.slice(0, a) + open + v.slice(a, b) + close + v.slice(b);
          ta.focus();
          ta.setSelectionRange(a + open.length, b + open.length);
          setD({ text: ta.value });
        };
        const unwrap = () => {
          const v = ta.value;
          let a = ta.selectionStart;
          let b = ta.selectionEnd;
          if (a === b) { a = 0; b = v.length; }
          const mid = v.slice(a, b).replace(/\[\[|\]\]|\{\{|\}\}|<<|>>|\(\(|\)\)/g, '');
          ta.value = v.slice(0, a) + mid + v.slice(b);
          ta.focus();
          ta.setSelectionRange(a, a + mid.length);
          setD({ text: ta.value });
        };
        const keep = (e) => e.preventDefault(); // ボタンを押しても、文字の選択を外さない
        const btn = (label, fn, title) => { const b = UI.button(label, fn, 'small'); b.title = title; b.addEventListener('mousedown', keep); return b; };
        const row = h('div', { class: 'f f-col' }, h('span', { class: 'f-l' }, '文字'), ta,
          h('div', { class: 'row bt-marks' },
            btn('大きく', () => wrapSel('<<', '>>'), '選んだ文字を << >> で囲みます'),
            btn('小さく', () => wrapSel('((', '))'), '選んだ文字を (( )) で囲みます'),
            btn('色1', () => { wrapSel('[[', ']]'); if (!(D().accent || {}).on) setD({ accent: { on: true } }); }, '選んだ文字を [[ ]] で囲みます(「部分の色」の色1)'),
            btn('色2', () => { wrapSel('{{', '}}'); if (!(D().accent2 || {}).on) setD({ accent2: { on: true } }); }, '選んだ文字を {{ }} で囲みます(「部分の色」の色2)'),
            btn('記号を外す', unwrap, '選んだ部分(選んでいなければ全部)の記号を外します')));
        return UI.bind(row, () => { if (document.activeElement !== ta) ta.value = D().text ?? ''; });
      };

      // おまかせ(ランダム)とテーマ
      const themeSel = h('select', { title: 'おまかせで選ぶテーマ', onchange: (e) => { try { localStorage.setItem('tdgTheme', e.target.value); } catch { /* ignore */ } } });
      const fillThemes = () => {
        let cur = '';
        try { cur = localStorage.getItem('tdgTheme') || ''; } catch { /* ignore */ }
        themeSel.innerHTML = '';
        themeSel.append(h('option', { value: '' }, 'テーマ:すべて'), h('option', { value: 'fav' }, 'テーマ:★ お気に入り'),
          ...themeList().map((t) => h('option', { value: t.id }, `テーマ:${t.name}`)));
        themeSel.value = [...themeSel.options].some((o) => o.value === cur) ? cur : '';
      };
      UI.bind(themeSel, () => { const k = String(themeList().length); if (themeSel.dataset.k !== k) { themeSel.dataset.k = k; fillThemes(); } });
      const undoBtn = UI.button('ひとつ前に戻す', () => undoDesign(id), 'small');
      UI.bind(undoBtn, () => { undoBtn.disabled = !canUndo(id); });
      const rndRow = h('div', { class: 'row bt-rnd' },
        UI.button('🎲 おまかせ', () => { randomDesign(id, themeSel.value); }, 'primary small'), themeSel, undoBtn);
      const rndHint = h('p', { class: 'hint' }, '「おまかせ」を押すたびに、選んだテーマの中からランダムにデザインが変わります。気に入らなければもう一度押すか、「ひとつ前に戻す」で戻せます。文字はそのままです。');

      const total = () => (TD().types || []).reduce((n, t) => n + (t.variants || []).length, 0);
      const galleryBtn = UI.button('デザインを選ぶ', () => openGallery(id), 'primary');
      UI.bind(galleryBtn, () => { galleryBtn.textContent = `デザインを選ぶ(${total()}種)`; });

      root.append(
        markEditor(),
        h('h3', { class: 'h' }, 'デザイン'),
        h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '6px' } }, galleryBtn, UI.button('今の見た目をマイデザインに保存', saveMine, 'small')),
        rndRow, rndHint,
        refBox,

        h('h3', { class: 'h' }, '文字'),
        UI.select({ label: 'フォント', options: fontOptions, ...dk('font') }),
        h('p', { class: 'hint' }, 'PC のフォントや、ダウンロードしたフォントは「フォント」タブで追加すると、ここで選べます。'),
        UI.num({ label: '大きさ', min: 16, max: 400, step: 2, unit: 'px', ...dk('size') }),
        UI.toggle({ label: '太字', get: () => D().bold !== false, set: (v) => setD({ bold: v }) }),
        UI.toggle({ label: '斜体', ...dk('italic') }),
        UI.num({ label: '傾き', min: -30, max: 30, step: 1, unit: '度', ...dk('skew') }),
        UI.seg({ label: '揃え', options: [['left', '左'], ['center', '中央'], ['right', '右']], ...dk('align') }),
        UI.toggle({ label: '縦書き', ...dk('vertical') }),
        UI.num({ label: '行間', min: 0.8, max: 2.4, step: 0.05, unit: '倍', ...dk('lineHeight') }),
        UI.num({ label: '文字間隔', min: -0.1, max: 0.6, step: 0.01, unit: 'em', ...dk('letterSpacing') }),

        h('h3', { class: 'h' }, '色'),
        UI.seg({ label: '塗り', options: [['solid', '単色'], ['gradient', 'グラデーション']], ...dk('fillType') }),
        UI.when(() => D().fillType !== 'gradient', UI.color({ label: '文字の色', ...dk('color') })),
        UI.when(() => D().fillType === 'gradient', h('div', null,
          bar, stopsBox,
          h('div', { class: 'row' }, UI.button('色を追加', addStop, 'small')),
          UI.num({ label: '向き', min: 0, max: 360, step: 15, unit: '度', ...dk('angle') }),
          h('p', { class: 'hint' }, '180度で上→下、90度で左→右に色が変わります。2つの色を同じ位置(例:49% と 50%)に置くと、境目がくっきりして金属のツヤのようになります。'))),
        UI.toggle({ label: 'ツヤ(上半分を明るく)', ...sub('gloss', 'on') }),
        UI.when(onOf('gloss'), UI.num({ label: '強さ', min: 0.1, max: 1, step: 0.05, ...sub('gloss', 'strength') })),
        UI.select({ label: '質感', options: () => (TD().textures || [{ id: 'none', name: 'なし' }]).map((t) => [t.id, t.name]), get: () => (D().texture || {}).id || 'none', set: (v) => setD({ texture: { id: v } }) }),
        UI.when(() => (D().texture || {}).id && D().texture.id !== 'none', UI.select({
          label: '重ね方',
          options: [['multiply', '色に模様を重ねる'], ['overlay', '色を残して模様を足す'], ['soft-light', 'うっすら'], ['normal', '模様そのまま']],
          get: () => (D().texture || {}).blend || 'multiply', set: (v) => setD({ texture: { blend: v } }),
        })),
        UI.when(() => (D().texture || {}).id && D().texture.id !== 'none', h('div', null,
          UI.num({ label: '質感の明るさ', min: -0.9, max: 0.9, step: 0.05, get: () => (D().texture || {}).bright || 0, set: (v) => setD({ texture: { bright: v } }) }),
          UI.seg({ label: '質感のメリハリ', options: [['0', 'ふつう'], ['1', '強め'], ['2', 'とても強め']], get: () => String(Number((D().texture || {}).contrast) || 0), set: (v) => setD({ texture: { contrast: Number(v) } }) }),
          UI.when(() => { const t = (TD().textures || []).find((x) => x.id === (D().texture || {}).id); return !!(t && t.photo); }, h('div', null,
            UI.num({ label: '質感の大きさ', min: 0.2, max: 6, step: 0.1, unit: '倍', get: () => (D().texture || {}).scale || 1, set: (v) => setD({ texture: { scale: v } }) }),
            UI.num({ label: '質感の位置(横)', min: 0, max: 100, step: 1, unit: '%', get: () => { const v = (D().texture || {}).x; return v == null ? 50 : v; }, set: (v) => setD({ texture: { x: v } }) }),
            UI.num({ label: '質感の位置(縦)', min: 0, max: 100, step: 1, unit: '%', get: () => { const v = (D().texture || {}).y; return v == null ? 50 : v; }, set: (v) => setD({ texture: { y: v } }) }))),
          h('p', { class: 'hint' }, '写真の質感は、文字が大きいほど細かく見えます。「大きさ」を小さくすると模様が細かく、大きくすると模様が大きくなります。明るすぎる・暗すぎるときは「明るさ」、稲妻や雲の光を目立たせたいときは「メリハリ」、写真のどこを使うかは「位置」で調整してください。'))),
        h('h3', { class: 'h' }, '文字ごとの大きさ'),
        UI.seg({ label: '自動で小さく', options: [['none', 'しない'], ['hira', 'ひらがな'], ['kana', 'ひらがな+カタカナ']], get: () => (D().charSize || {}).auto || 'none', set: (v) => setD({ charSize: { auto: v } }) }),
        UI.toggle({ label: '数字を自動で大きく', ...sub('charSize', 'digits') }),
        UI.num({ label: '大きくする倍率', min: 1.05, max: 2.5, step: 0.05, unit: '倍', get: () => (D().charSize || {}).big || 1.35, set: (v) => setD({ charSize: { big: v } }) }),
        UI.num({ label: '小さくする倍率', min: 0.3, max: 0.95, step: 0.05, unit: '倍', get: () => (D().charSize || {}).small || 0.7, set: (v) => setD({ charSize: { small: v } }) }),
        h('p', { class: 'hint' }, '<< >> で囲んだ部分は大きく、(( )) で囲んだ部分は小さくなります(自動より優先)。例:「3つ((の))視点((が))交錯((する))」「[[<<108>>星]]」。縁取りの太さは、文字の大きさが変わっても同じです。'),
        h('h3', { class: 'h' }, '部分の色'),
        accentUi('accent', '色1([[ ]] で囲んだ部分)'),
        accentUi('accent2', '色2({{ }} で囲んだ部分)'),
        h('p', { class: 'hint' }, '例:「[[販売]]戦略」と書くと「販売」だけ別の色になります。縁取り・光・影は全体で共通です。'),

        h('h3', { class: 'h' }, '縁取り(ストローク)'),
        ...[['stroke1', '縁取り1(内側)'], ['stroke2', '縁取り2'], ['stroke3', '縁取り3(いちばん外側)']].map(([k, label]) => h('div', null,
          UI.toggle({ label, ...sub(k, 'on') }),
          UI.when(onOf(k), h('div', null,
            UI.color({ label: '色', ...sub(k, 'color') }),
            UI.num({ label: '太さ', min: 0.5, max: 40, step: 0.5, unit: 'px', ...sub(k, 'width') }))))),
        UI.toggle({ label: '縁取りの角を丸くする', get: () => D().roundStroke !== false, set: (v) => setD({ roundStroke: v }) }),

        h('h3', { class: 'h' }, 'グロー(光)'),
        UI.toggle({ label: 'グロー', ...sub('glow', 'on') }),
        UI.when(onOf('glow'), h('div', null,
          UI.color({ label: '色', ...sub('glow', 'color') }),
          UI.num({ label: '広がり', min: 2, max: 80, step: 1, unit: 'px', ...sub('glow', 'size') }))),

        h('h3', { class: 'h' }, '影・立体'),
        UI.toggle({ label: '影', ...sub('shadow', 'on') }),
        UI.when(onOf('shadow'), h('div', null,
          UI.color({ label: '色', ...sub('shadow', 'color'), alpha: sub('shadow', 'alpha') }),
          UI.num({ label: '右へ', min: -40, max: 40, step: 1, unit: 'px', ...sub('shadow', 'x') }),
          UI.num({ label: '下へ', min: -40, max: 40, step: 1, unit: 'px', ...sub('shadow', 'y') }),
          UI.num({ label: 'ぼかし', min: 0, max: 40, step: 1, unit: 'px', ...sub('shadow', 'blur') }))),
        UI.toggle({ label: '立体の厚み(すき間なく伸びる影)', ...sub('extrude', 'on') }),
        UI.when(onOf('extrude'), h('div', null,
          UI.color({ label: '色', ...sub('extrude', 'color') }),
          UI.num({ label: '右へ', min: -30, max: 30, step: 1, unit: 'px', ...sub('extrude', 'x') }),
          UI.num({ label: '下へ', min: -30, max: 30, step: 1, unit: 'px', ...sub('extrude', 'y') }))),

        h('h3', { class: 'h' }, '文字の後ろ'),
        UI.toggle({ label: 'マーカー線(文字の下半分)', ...sub('band', 'on') }),
        UI.when(onOf('band'), h('div', null,
          UI.color({ label: '色', ...sub('band', 'color') }),
          UI.num({ label: '高さ', min: 10, max: 100, step: 5, unit: '%', ...sub('band', 'height') }))),
        UI.select({ label: '後ろの図形', options: [['none', 'なし'], ['burst', 'ギザギザ(爆発)'], ['cloud', '雲'], ['circle', '丸'], ['box', '角丸の四角']], get: () => (D().deco || {}).type || 'none', set: (v) => setD({ deco: { type: v } }) }),
        UI.when(() => (D().deco || {}).type && D().deco.type !== 'none', h('div', null,
          UI.color({ label: '図形の色', ...sub('deco', 'color') }),
          UI.color({ label: '図形のふち', ...sub('deco', 'edge') }),
          UI.num({ label: '余白', min: 0, max: 1.5, step: 0.05, unit: 'em', ...sub('deco', 'pad') }))),

        h('h3', { class: 'h' }, '動き'),
        UI.seg({ label: '動き', options: [['none', 'なし'], ['float', 'ふわふわ'], ['pulse', 'ドクン'], ['blink', '点滅'], ['shake', 'ぶるっ']], ...dk('motion') }),
        UI.when(() => D().motion && D().motion !== 'none', UI.num({ label: '速さ(1回)', min: 0.3, max: 10, step: 0.1, unit: '秒', ...dk('motionSec') })),
        h('p', { class: 'hint' }, 'プレビューでドラッグして移動、右下の角で幅を変えられます。表示/非表示のアニメーションは下の「表示・非表示のアニメーション」で選べます。'),
      );
    },
  });
  // ほかの機能からも開けるように
  ADM.openTextDesignGallery = openGallery;
  ADM.textDesignThumb = thumbHtml;
})();
