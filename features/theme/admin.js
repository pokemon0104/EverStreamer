/* クイック設定タブ・テンプレートの一覧・初回の案内 */
(function () {
  'use strict';
  const { h } = UI;
  const TH = () => OV.raw.theme || {};
  const templates = () => OV.catalogs.templates || [];
  const setTheme = (patch) => {
    Object.assign(OV.raw.theme || (OV.raw.theme = {}), patch);
    ADM.hub.send('theme:set', patch);
    ADM.changed();
  };
  const PRESET_COLORS = ['#22e4ff', '#4f6bff', '#8b5cff', '#ff3dd1', '#ff4d6d', '#ff8a00', '#ffd23a', '#2ee68a', '#14c8a8', '#ffffff'];

  // ---------- テンプレートの見本(小さな配信画面) ----------
  function panelCss(L, k) {
    const bw = Math.min(2, Number(L.borderWidth) || 0);
    const st = {
      position: 'absolute', boxSizing: 'border-box', overflow: 'hidden',
      borderRadius: `${Math.round((Number(L.radius) || 0) * k)}px`,
      border: bw > 0 && L.borderStyle !== 'none' ? `${bw}px ${L.borderStyle || 'solid'} ${L.borderColor}` : 'none',
      color: L.textColor, fontFamily: OV.util.fontStack(L.font), padding: '3px 5px',
    };
    const sh = [];
    if (Number(L.shadowBlur) || Number(L.shadowY)) sh.push(`0 ${Math.round((Number(L.shadowY) || 0) * k)}px ${Math.round((Number(L.shadowBlur) || 0) * k)}px ${OV.util.hexToRgba(L.shadowColor || '#000', L.shadowAlpha == null ? 0.5 : L.shadowAlpha)}`);
    st.boxShadow = sh.join(',') || 'none';
    return st;
  }
  function miniPanel(L, rect, k, ...kids) {
    const fill = h('div', { style: { position: 'absolute', inset: '0', background: L.bgImage || L.bgColor || 'transparent', opacity: String(L.bgAlpha == null ? 1 : L.bgAlpha) } });
    const body = h('div', { style: { position: 'relative', display: 'flex', flexDirection: 'column', gap: '2px', height: '100%' } }, ...kids);
    return h('div', { class: 'tpl-mp', style: { ...panelCss(L, k), left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px` } }, fill, body);
  }
  /** テンプレートの見本(320x180 で描いて、枠に合わせて縮める) */
  ADM.templatePreview = function (tpl) {
    const k = 320 / 1920 * 2.2; // パネルの角丸や影を、見本の大きさに合わせて縮める割合
    const L = OV.tplValue('panel', tpl) || {};
    const tk = OV.tokens(tpl);
    const tl = OV.tplValue('title', tpl) || {};
    const st = h('div', { class: 'tpl-st', style: { background: OV.tplValue('background', tpl) || tk.bg } });
    const game = { x: 10, y: 16, w: 214, h: 120 };
    const gm = h('div', { class: 'tpl-game', style: { left: `${game.x}px`, top: `${game.y}px`, width: `${game.w}px`, height: `${game.h}px` } }, 'GAME');
    const fbox = h('div', { style: { position: 'absolute', inset: '0', pointerEvents: 'none' } });
    st.append(gm, fbox);
    const fr = OV.tplValue('frame', tpl);
    if (fr && OV.renderGameFrameInto) {
      const def = Object.assign({ id: 'tpl' }, fr, { layers: (fr.layers || []).map((l) => ({ ...l, w: Math.max(1, Math.round((Number(l.w) || 0) * 0.5)) })),
        glow: fr.glow ? { ...fr.glow, blur: Math.round((Number(fr.glow.blur) || 0) * 0.4) } : undefined,
        shadow: fr.shadow ? { ...fr.shadow, blur: Math.round((Number(fr.shadow.blur) || 0) * 0.4), y: Math.round((Number(fr.shadow.y) || 0) * 0.4) } : undefined,
        corners: fr.corners ? { ...fr.corners, len: 10, w: 2, gap: 3 } : undefined, radius: Math.round((Number(fr.radius) || 0) * 0.5) });
      OV.renderGameFrameInto(fbox, { kind: 'css', def }, game, { opacity: 1 });
    }
    const titleColor = (tl.fill && (tl.fill.color || (tl.fill.stops || [])[0])) || L.headingColor;
    const tTitle = h('div', { style: { fontFamily: OV.util.fontStack(tl.font || L.headingFont || L.font), fontWeight: '900', fontSize: '10px', color: titleColor, textShadow: tl.glow ? `0 0 4px ${tl.glow.color}` : 'none', whiteSpace: 'nowrap' } }, 'GAME TITLE');
    const head = (t) => h('div', { style: { fontFamily: OV.util.fontStack(L.headingFont || L.font), fontWeight: '800', fontSize: '7px', color: L.headingColor } }, t);
    const line = (w) => h('div', { style: { height: '3px', width: w, borderRadius: '2px', background: L.textColor, opacity: '.55' } });
    const num = (n) => h('div', { style: { fontFamily: OV.util.fontStack(L.numberFont || L.font), fontWeight: '800', fontSize: '11px', color: L.numberColor, lineHeight: '1' } }, n);
    st.append(
      miniPanel(L, { x: 232, y: 16, w: 80, h: 24 }, k, tTitle),
      miniPanel(L, { x: 232, y: 46, w: 80, h: 46 }, k, head('TODAY'), line('90%'), line('70%'), line('80%')),
      miniPanel(L, { x: 232, y: 98, w: 38, h: 38 }, k, head('♥'), num('128')),
      miniPanel(L, { x: 274, y: 98, w: 38, h: 38 }, k, head('💬'), num('54')),
      h('div', { class: 'tpl-pill', style: { left: '16px', top: '146px', background: tk.accent, color: tk.onAccent } }, 'SUBSCRIBE'));
    const pv = h('div', { class: 'tpl-pv' }, st);
    const fit = () => { const s = pv.clientWidth / 320; if (s) st.style.transform = `scale(${s})`; };
    requestAnimationFrame(fit);
    new ResizeObserver(fit).observe(pv);
    return pv;
  };

  /** テンプレートの一覧(クリックで選ぶ) */
  ADM.templateGrid = function (onPick) {
    const grid = h('div', { class: 'tpl-grid' });
    const cards = templates().map((t) => {
      const b = h('button', { type: 'button', class: 'tpl-card', onclick: () => { setTheme({ templateId: t.id }); if (onPick) onPick(t); } },
        ADM.templatePreview(t),
        h('span', { class: 'tpl-nm' }, OV.tplName(t)),
        h('span', { class: 'tpl-desc' }, OV.tplName(t, 'desc')));
      b.dataset.id = t.id;
      grid.append(b);
      return b;
    });
    UI.bind(grid, () => { const cur = OV.template(); cards.forEach((b) => b.classList.toggle('on', !!cur && b.dataset.id === cur.id)); });
    return grid;
  };

  /** メインカラー・サブカラー */
  function colorRow(key, label) {
    const tk = () => OV.tokens();
    const pick = h('input', { type: 'color' });
    pick.addEventListener('input', () => setTheme({ [key]: pick.value }));
    const sw = h('div', { class: 'tpl-sw' }, ...PRESET_COLORS.map((c) => h('button', { type: 'button', class: 'tpl-swb', title: c, style: { background: c }, onclick: () => setTheme({ [key]: c }) })));
    const reset = UI.button('テンプレートの色', () => setTheme({ [key]: '' }), 'small');
    const row = h('div', { class: 'stack' }, UI.field(label, pick, reset), sw);
    return UI.bind(row, () => {
      if (document.activeElement !== pick) pick.value = tk()[key];
      reset.disabled = !TH()[key];
    });
  }

  /** OBS に登録する URL(コピーできる) */
  function urlRow(label, path, size) {
    const url = `${location.origin}${path}`;
    const input = h('input', { type: 'text', readonly: true, value: url, class: 'url-in' });
    const copy = UI.button('コピー', async () => {
      try { await navigator.clipboard.writeText(url); ADM.toast('URL をコピーしました'); } catch { input.select(); document.execCommand('copy'); ADM.toast('URL をコピーしました'); }
    }, 'small primary');
    return h('div', { class: 'stack' }, UI.field(label, input, copy), h('p', { class: 'hint' }, `OBS の「ブラウザ」ソースに貼り付けて、幅と高さを ${size} にします。`));
  }

  // ---------- 背景(クイック設定) ----------
  function quickBg() {
    const B = () => OV.state.background || {};
    const send = (patch) => ADM.send('background:update', { patch });
    const grid = h('div', { class: 'qk-bg' });
    const items = [
      { k: 'tpl', cfg: { type: 'preset', presetId: 'tpl' }, name: 'テンプレート' },
      ...(OV.catalogs.bgPresets || []).map((p) => ({ k: `p:${p.id}`, cfg: { type: 'preset', presetId: p.id }, name: p.name })),
      ...(OV.catalogs.bgUploads || []).map((f) => ({ k: `u:${f}`, cfg: { type: 'upload', upload: f, fit: 'cover' }, name: f })),
    ];
    const keyOf = (b) => (b.type === 'upload' ? `u:${b.upload}` : b.type === 'preset' ? (b.presetId === 'tpl' ? 'tpl' : `p:${b.presetId}`) : '');
    const btns = items.map((it) => {
      const b = h('button', { type: 'button', class: 'sc-bgbtn', title: it.name, onclick: () => send({ ...it.cfg, enabled: true }) }, ADM.bgSwatch ? ADM.bgSwatch(it.cfg) : h('div'));
      b.dataset.k = it.k;
      grid.append(b);
      return b;
    });
    UI.bind(grid, () => btns.forEach((b) => b.classList.toggle('on', B().enabled !== false && keyOf(B()) === b.dataset.k)));
    const file = h('input', { type: 'file', multiple: true, accept: '.png,.jpg,.jpeg,.webp,.gif,.svg,.mp4,.webm,image/*,video/*', style: { display: 'none' } });
    const add = async (files) => {
      const done = ADM.bgUpload ? await ADM.bgUpload(files) : [];
      if (done.length) { send({ type: 'upload', upload: done[done.length - 1], enabled: true }); ADM.toast('背景を追加しました'); }
    };
    file.addEventListener('change', () => { if (file.files.length) add(file.files); file.value = ''; });
    const drop = h('div', { class: 'dropzone', onclick: () => file.click() }, '自分の画像・動画をドロップ、またはクリックして選択');
    drop.addEventListener('dragover', (ev) => { ev.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (ev) => { ev.preventDefault(); drop.classList.remove('over'); if (ev.dataTransfer.files.length) add(ev.dataTransfer.files); });
    const where = h('p', { class: 'hint' });
    UI.bind(where, () => { where.textContent = OV.canvas === 'v' ? 'いまは縦画面の背景です(横画面は上の「横 16:9」で切り替えて選びます)。' : 'いまは横画面の背景です(縦画面は上の「縦 9:16」で切り替えて選びます)。'; });
    return h('div', null,
      UI.toggle({ label: '背景を表示する', get: () => B().enabled !== false, set: (v) => send({ enabled: v }) }),
      grid, drop, file, where,
      h('p', { class: 'hint' }, '開始待機・休憩・終了の背景は「場面」タブで選べます。細かい調整は詳細設定の「背景」タブで。'));
  }

  // ---------- クイック設定タブ ----------
  ADM.registerTab({
    id: 'quick',
    label: 'クイック設定',
    order: 0,
    basic: true,
    sig: () => JSON.stringify([templates().map((t) => t.id), TH().templateId, OV.canvas, ((OV.raw.game || {}).objective || []).length, OV.catalogs.bgUploads, (OV.catalogs.bgPresets || []).length]),
    build(root) {
      const P = () => OV.raw.profile || {};
      const sendProfile = (patch) => {
        const cur = OV.raw.profile || (OV.raw.profile = { name: '', sns: {} });
        if (patch.name !== undefined) cur.name = patch.name;
        if (patch.sns) Object.assign(cur.sns, patch.sns);
        ADM.hub.send('social:update', { patch });
        ADM.changed();
      };
      const G = () => OV.state.game || {};

      root.append(
        h('h3', { class: 'h qk-h' }, h('span', { class: 'qk-n' }, '1'), 'テンプレートを選ぶ'),
        h('p', { class: 'hint' }, 'パネル・ゲーム枠・背景・お願いポップアップ・あらすじの見た目が、まとめて切り替わります。'),
        ADM.templateGrid(),
        h('div', { class: 'row' }, UI.button('すべてをテンプレートに合わせ直す', () => {
          if (confirm('横・縦の両方の画面で、パネル・ゲーム枠・背景・お願いポップアップ・あらすじを、いまのテンプレートの見た目に戻しますか?(パネルの文字サイズは残ります)')) ADM.hub.send('theme:applyAll', {});
        }, 'small')),
        h('p', { class: 'hint' }, 'パネルごとにスタイルを変えたあとでも、このボタンでテンプレートの見た目にそろえられます。'),

        h('h3', { class: 'h qk-h' }, h('span', { class: 'qk-n' }, '2'), '色を選ぶ'),
        colorRow('accent', 'メインカラー'),
        colorRow('accent2', 'サブカラー'),
        h('p', { class: 'hint' }, 'テンプレートの線・光・数字などの色が変わります。'),

        h('h3', { class: 'h qk-h' }, h('span', { class: 'qk-n' }, '3'), '背景を選ぶ'),
        quickBg(),

        h('h3', { class: 'h qk-h' }, h('span', { class: 'qk-n' }, '4'), '名前とSNS'),
        UI.text({ label: '名前', placeholder: '配信者名', get: () => P().name, set: (v) => sendProfile({ name: v }) }),
        ...OV.SNS.map((s) => UI.text({ label: s.label, placeholder: s.id === 'youtube' ? '@チャンネルID' : s.id === 'discord' ? 'サーバー名や招待URL' : 'ID', get: () => (P().sns || {})[s.id], set: (v) => sendProfile({ sns: { [s.id]: v } }) })),
        h('p', { class: 'hint' }, '入力したものだけが「名前とSNS」パネルに表示されます。'),

        h('h3', { class: 'h qk-h' }, h('span', { class: 'qk-n' }, '5'), 'ゲームと今日の目標'),
        UI.text({ label: 'ゲーム名', get: () => G().title, set: (v) => ADM.patchGame({ title: v }) }));
      if (ADM.richEditor) {
        root.append(ADM.richEditor({
          getTitle: () => G().objectiveTitle, setTitle: (v) => ADM.patchGame({ objectiveTitle: v }),
          getLines: () => G().objective, setLines: (v) => ADM.patchGame({ objective: v }),
        }));
      }
      root.append(h('div', { class: 'row' },
        UI.button('ロゴ・プロファイル・目的はゲームタブへ', () => ADM.showTab('game'), 'small')));

      // ゲーム映像の場所
      const gameInfo = h('div', { class: 'note-box' });
      UI.bind(gameInfo, () => {
        const r = OV.gameWindowRect ? OV.gameWindowRect(OV.state) : null;
        gameInfo.textContent = r ? `OBS のゲーム映像(ゲームキャプチャ・映像キャプチャデバイス)は、位置 X ${r.x}・Y ${r.y}、サイズ 幅 ${r.w} × 高さ ${r.h} にすると、枠にぴったり収まります。` : '';
      });
      root.append(
        h('h3', { class: 'h qk-h' }, h('span', { class: 'qk-n' }, '6'), 'OBS に登録する'),
        urlRow('横型', '/overlay', '1920 × 1080'),
        urlRow('縦型', '/overlay-vertical', '1080 × 1920'),
        gameInfo,
        h('p', { class: 'hint' }, 'このオーバーレイは、OBS でゲーム映像より上に置きます。ゲーム映像の場所を変えるときは、詳細設定の「ゲーム枠」タブで調整できます。'),
        h('div', { class: 'row' }, UI.button('はじめての案内をもう一度見る', () => ADM.openWizard(), 'small')));
    },
  });

  // ---------- 初回の案内 ----------
  ADM.openWizard = function () {
    if (document.querySelector('.wz-back')) return;
    let step = 0;
    const back = h('div', { class: 'wz-back' });
    const box = h('div', { class: 'wz' });
    back.append(box);
    const close = (done) => { back.remove(); if (done) ADM.hub.send('theme:onboarded', { done: true }); };
    const steps = [
      () => [
        h('h2', null, 'EverStreamer へようこそ'),
        h('p', null, 'OBS の配信画面を、テンプレートを選ぶだけで作れるツールです。4つの手順で準備します。'),
        h('h3', { class: 'h' }, '言語 / Language'),
        h('div', { class: 'row' },
          UI.button('日本語', () => I18N.setLang('ja'), I18N.lang === 'ja' ? 'primary' : ''),
          UI.button('English', () => I18N.setLang('en'), I18N.lang === 'en' ? 'primary' : '')),
      ],
      () => [
        h('h2', null, 'テンプレートを選ぶ'),
        h('p', null, 'あとから何度でも変えられます。'),
        ADM.templateGrid(),
      ],
      () => [
        h('h2', null, '名前とメインカラー'),
        UI.text({ label: '名前', placeholder: '配信者名', get: () => (OV.raw.profile || {}).name, set: (v) => { (OV.raw.profile || (OV.raw.profile = { sns: {} })).name = v; ADM.hub.send('social:update', { patch: { name: v } }); ADM.changed(); } }),
        colorRow('accent', 'メインカラー'),
        h('p', { class: 'hint' }, 'X や YouTube の ID は、クイック設定タブで入力できます。'),
      ],
      () => [
        h('h2', null, 'OBS に登録する'),
        h('ol', { class: 'wz-ol' },
          h('li', null, 'OBS の「ソース」の + から「ブラウザ」を追加します。'),
          h('li', null, '下の URL を貼り付け、幅 1920・高さ 1080 にします(縦型配信は縦型の URL で 1080 × 1920)。'),
          h('li', null, 'このブラウザソースを、ゲーム映像より上に置きます。')),
        urlRow('横型', '/overlay', '1920 × 1080'),
        urlRow('縦型', '/overlay-vertical', '1080 × 1920'),
      ],
    ];
    const render = () => {
      box.textContent = '';
      const dots = h('div', { class: 'wz-dots' }, ...steps.map((_, i) => h('i', { class: i === step ? 'on' : '' })));
      const body = h('div', { class: 'wz-body' }, ...steps[step]());
      const nav = h('div', { class: 'row wz-nav' },
        UI.button('あとで', () => close(true), 'ghost'),
        h('span', { style: { flex: 1 } }),
        step > 0 ? UI.button('戻る', () => { step--; render(); }) : null,
        step < steps.length - 1 ? UI.button('次へ', () => { step++; render(); }, 'primary') : UI.button('はじめる', () => close(true), 'primary'));
      box.append(dots, body, nav);
    };
    render();
    document.body.append(back);
  };
  let checked = false;
  ADM.on('refresh', () => {
    if (checked || !OV.raw.app) return;
    checked = true;
    // オーバーレイの言語を、この管理画面の言語に合わせる(初回の案内の前なら、見本の文字も置き換わる)
    if (window.I18N && OV.raw.app.lang !== I18N.lang) ADM.hub.send('theme:lang', { lang: I18N.lang });
    if (!OV.raw.app.onboarded) setTimeout(() => ADM.openWizard(), 300);
  });

  // ---------- 言語の切り替え(上部バー) ----------
  document.addEventListener('DOMContentLoaded', () => {
    const slot = document.getElementById('lang-slot');
    if (!slot || !window.I18N) return;
    const sel = h('select', { class: 'lang-sel', title: 'Language', 'data-i18n-skip': '' }, h('option', { value: 'ja' }, '日本語'), h('option', { value: 'en' }, 'English'));
    sel.value = I18N.lang;
    sel.addEventListener('change', () => I18N.setLang(sel.value));
    slot.append(sel);
  });
})();
