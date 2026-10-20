/* あらすじタブ:文章・出し方(トランジション)・デザイン・表示する場所。上部バーに「あらすじ」ボタン */
(function () {
  'use strict';
  const { h } = UI;
  const { deepMerge, clone } = OV.util;
  const C = () => OV.state.story || {};
  const D = () => C().design || {};
  const V = () => OV.state.storyView || {};
  const G = () => OV.state.game || {};
  const PL = () => OV.storyLocal || OV.state.storyPlay || {};

  // 設定の変更:画面の表示をすぐ変えてから、サーバーへ送る
  const upd = (patch) => { deepMerge(OV.state.story, clone(patch)); ADM.send('story:update', { patch }, 'story'); ADM.changed(); };
  const updView = (patch) => { deepMerge(OV.state.storyView, clone(patch)); ADM.send('story:updateView', { patch }, 'storyView'); ADM.changed(); };
  const ck = (k) => ({ get: () => C()[k], set: (v) => upd({ [k]: v }) });
  const dk = (k) => ({ get: () => D()[k], set: (v) => upd({ design: { [k]: v } }) });
  const vk = (k) => ({ get: () => V()[k], set: (v) => updView({ [k]: v }) });

  const ENTERS = [['window', 'ウィンドウが開く'], ['fade', 'フェード'], ['slideUp', '下からスライド'], ['slideDown', '上からスライド'], ['slideLeft', '右からスライド'],
    ['zoom', 'ズームイン'], ['zoomOut', '大きい所から縮む'], ['blur', 'ぼかしから'], ['wipe', 'ワイプ(左から)'], ['curtain', 'カーテン(中央から開く)'],
    ['shutter', 'シャッター(上下に開く)'], ['iris', 'アイリス(丸く広がる)'], ['cinema', 'シネマ(黒帯+文字が集まる)'], ['none', 'なし(すぐ出す)']];
  const EXITS = ENTERS.map(([v, l]) => [v, l.replace('開く', '閉じる').replace('から', 'へ').replace('広がる', 'しぼむ').replace('集まる', '広がる').replace('すぐ出す', 'すぐ消す')]);
  const TEXTFX = [['type', 'タイプライター(1文字ずつ)'], ['charFade', '1文字ずつふわっと'], ['lines', '1行ずつ浮かび上がる'], ['blur', 'ぼかしから浮かぶ'], ['none', '演出なし']];
  const PAGEFX = [['fade', 'フェード'], ['slide', '横にスライド'], ['up', '上に流れる'], ['none', 'なし']];
  const fontOptions = () => (OV.catalogs.fonts || []).map((f) => [f.family, f.label || f.family]);

  // ---- 「プレビューだけで試す」:OBS には出さず、この管理画面のプレビューだけで再生する ----
  let lt = 0;
  const plainLen = (t) => String(t || '').replace(/\*\*|==/g, '').replace(/\s/g, '').length;
  function localPageMs(i) {
    const c = C();
    const text = OV.storyPages(G().story)[i] || '';
    let reveal = 0;
    if (c.textFx === 'type' || c.textFx === 'charFade') reveal = (plainLen(text) / c.typeSpeed) * 1000;
    else if (c.textFx === 'lines') reveal = text.split('\n').length * c.lineDelay;
    else if (c.textFx === 'blur') reveal = 1200;
    return (i === 0 ? c.enterMs : 500) + reveal + c.pageSec * 1000;
  }
  const L = {
    refresh() { if (OV.storyRefresh) OV.storyRefresh(); ADM.changed(); },
    schedule() {
      clearTimeout(lt);
      const p = OV.storyLocal;
      if (!p || !p.active || p.paused || p.phase !== 'show') return;
      const c = C();
      if (c.mode === 'scroll') { if (c.autoEnd) lt = setTimeout(() => L.end(), c.enterMs + c.scrollSec * 1000); return; }
      if (!c.auto) return;
      lt = setTimeout(() => { if (p.page < p.pages - 1) { p.page += 1; L.refresh(); L.schedule(); } else if (c.autoEnd) L.end(); }, localPageMs(p.page));
    },
    start() {
      const n = OV.storyPages(G().story).length;
      if (!n) { ADM.toast('あらすじが空です。先に文章を書いてください', 'warn'); return; }
      clearTimeout(lt);
      OV.storyLocal = { active: true, phase: 'show', token: `L${Date.now()}`, page: 0, pages: n, paused: false };
      L.refresh();
      L.schedule();
    },
    go(d) {
      const p = OV.storyLocal;
      if (!p || p.phase !== 'show') return;
      const n = p.page + d;
      if (n < 0) return;
      if (n >= p.pages) { L.end(); return; }
      p.page = n; L.refresh(); L.schedule();
    },
    pause() { const p = OV.storyLocal; if (!p || p.phase !== 'show') return; p.paused = !p.paused; L.refresh(); L.schedule(); },
    end() {
      const p = OV.storyLocal;
      if (!p || p.phase === 'out') return;
      clearTimeout(lt);
      p.phase = 'out';
      L.refresh();
      lt = setTimeout(() => { OV.storyLocal = null; L.refresh(); }, C().exitMs + 200);
    },
    hide() { clearTimeout(lt); OV.storyLocal = null; L.refresh(); },
  };
  // 操作:プレビューで試し中ならプレビューを、そうでなければ配信画面(OBS)を動かす
  const act = (name) => {
    if (OV.storyLocal) { if (name === 'next') L.go(1); else if (name === 'prev') L.go(-1); else L[name](); return; }
    ADM.send(`story:${name}`);
  };

  // ---- 上部バー ----
  ADM.registerTopbar({
    order: 28,
    build(root) {
      const btn = h('button', { type: 'button', class: 'btn small story-btn', title: 'あらすじを配信画面に表示します(表示中は「終える」で退場)' });
      btn.addEventListener('click', () => { if (OV.state.storyPlay && OV.state.storyPlay.active) ADM.send('story:end'); else ADM.send('story:start'); });
      const nx = h('button', { type: 'button', class: 'btn small', title: '次のページ', onclick: () => ADM.send('story:next') }, '次へ ▶');
      UI.bind(btn, () => {
        const p = OV.state.storyPlay || {};
        btn.textContent = p.active ? (p.phase === 'out' ? '…退場中' : '■ あらすじを終える') : '📖 あらすじ';
        btn.classList.toggle('on', !!p.active);
        nx.style.display = p.active && p.phase === 'show' && C().mode !== 'scroll' && p.pages > 1 ? '' : 'none';
      });
      root.append(btn, nx);
    },
  });

  // ---- デザインの見本 ----
  function swatch(d) {
    const pv = h('div', { class: 'sd-pv' });
    const box = h('div', { class: 'st-box' }, h('div', { class: 'st-inner' },
      h('div', { class: 'st-title', html: OV.storyTitleHtml('あらすじ', d) }),
      h('div', { class: 'st-page' }, h('div', { class: 'st-line' }, 'むかしむかし、ある王国に…'))));
    OV.applyStoryDesign(box, d, 0.2);
    pv.style.background = `linear-gradient(135deg, #2a4a8a, #7a3a8a)`;
    const back = h('div', { style: { position: 'absolute', inset: '0', background: OV.util.hexToRgba(d.backdropColor || '#000', Math.min(0.9, Number(d.dim) || 0)) } });
    pv.append(back, box);
    return pv;
  }

  ADM.registerTab({
    id: 'story',
    label: 'あらすじ',
    order: 22,
    sig: () => JSON.stringify([JSON.stringify(OV.raw.theme), (OV.catalogs.templates || []).length, (OV.catalogs.storyDesigns || []).map((x) => x.id), (OV.state.storyDesigns || []).map((x) => [x.id, x.name]), (OV.catalogs.fonts || []).length]),
    build(root) {
      // --- 操作
      const status = h('span', { class: 'st-status' });
      UI.bind(status, () => {
        const p = PL();
        const local = !!OV.storyLocal;
        status.classList.toggle('on', !!p.active);
        status.textContent = !p.active ? '表示していません'
          : `${local ? 'プレビューで試し中' : '配信画面に表示中'}${p.phase === 'out' ? '(退場中)' : ''}${C().mode !== 'scroll' && p.pages ? ` ${p.page + 1}/${p.pages}ページ` : ''}${p.paused ? '・一時停止中' : ''}`;
      });
      root.append(
        h('div', { class: 'st-ctrl' },
          UI.button('▶ 配信画面に表示', () => { if (OV.storyLocal) L.hide(); ADM.send('story:start'); }, 'primary'),
          UI.button('プレビューだけで試す', () => L.start())),
        h('div', { class: 'st-ctrl' },
          UI.button('◀ 前', () => act('prev'), 'small'),
          UI.button('次 ▶', () => act('next'), 'small'),
          UI.button('⏸ 一時停止/再開', () => act('pause'), 'small'),
          UI.button('■ 終える(退場)', () => act('end'), 'small'),
          UI.button('すぐ消す', () => act('hide'), 'small danger')),
        status,
        h('p', { class: 'hint' }, '「プレビューだけで試す」は、OBS の配信画面には出さずに、この管理画面のプレビューだけで動きを確認できます。上部バーの「📖 あらすじ」からも表示できます。'));

      // --- 文章
      root.append(
        h('h3', { class: 'h' }, 'あらすじの文章(ゲームごとに保存・横縦で共通)'),
        UI.text({ label: '見出し', get: () => G().storyTitle || '', set: (v) => ADM.patchGame({ storyTitle: v }) }),
        UI.textarea({ rows: 10, placeholder: '例:\n世界は、ある大きな戦いのあと…\n---\n(--- だけの行で、次のページに分かれます)', get: () => G().story || '', set: (v) => ADM.patchGame({ story: v }) }),
        h('p', { class: 'hint' }, '「---」だけの行でページを区切ります。**大事なところ** で強調の色、==ここ== でマーカーになります。ゲームプロファイルに自動で保存されるので、ゲームを切り替えるとあらすじも切り替わります。'));
      const pageCount = h('p', { class: 'hint' });
      UI.bind(pageCount, () => { const n = OV.storyPages(G().story).length; pageCount.textContent = n ? `いまの文章は ${n} ページです。` : 'まだ文章がありません。'; });
      root.append(pageCount);

      // --- 出し方
      const isPages = () => C().mode !== 'scroll';
      root.append(UI.section('st-anim', '出し方(登場・文字の出し方・退場)',
        UI.seg({ label: '見せ方', options: [['pages', 'ページ送り'], ['scroll', 'スクロール(エンドロール)']], get: () => C().mode || 'pages', set: (v) => upd({ mode: v }) }),
        UI.select({ label: '登場のしかた', options: ENTERS, ...ck('enter') }),
        UI.num({ label: '登場の時間', min: 0, max: 5000, step: 100, unit: 'ms', ...ck('enterMs') }),
        UI.when(isPages, h('div', null,
          UI.select({ label: '文字の出し方', options: TEXTFX, ...ck('textFx') }),
          UI.when(() => C().textFx === 'type' || C().textFx === 'charFade', UI.num({ label: '文字の速さ', min: 2, max: 80, step: 1, unit: '文字/秒', ...ck('typeSpeed') })),
          UI.when(() => C().textFx === 'lines', UI.num({ label: '行の間隔', min: 100, max: 3000, step: 50, unit: 'ms', ...ck('lineDelay') })),
          UI.select({ label: 'ページの切り替え', options: PAGEFX, ...ck('pageFx') }),
          UI.toggle({ label: '自動でページを送る', ...ck('auto') }),
          UI.when(() => C().auto, UI.num({ label: '読む時間', min: 1, max: 60, step: 1, unit: '秒', ...ck('pageSec') })),
          h('p', { class: 'hint' }, '「読む時間」は、そのページの文字がすべて出てから次へ進むまでの秒数です。自動にしないときは「次 ▶」で送ります(話すペースに合わせたいとき)。'))),
        UI.when(() => !isPages(), h('div', null,
          UI.seg({ label: '流れ方', options: [['roll', '下から上へ'], ['crawl', '奥へ流れる(宇宙風)']], get: () => C().scrollStyle || 'roll', set: (v) => upd({ scrollStyle: v }) }),
          UI.num({ label: '流れる時間', min: 5, max: 300, step: 1, unit: '秒', ...ck('scrollSec') }))),
        UI.toggle({ label: '最後まで行ったら自動で退場する', ...ck('autoEnd') }),
        UI.select({ label: '退場のしかた', options: EXITS, ...ck('exit') }),
        UI.num({ label: '退場の時間', min: 0, max: 5000, step: 100, unit: 'ms', ...ck('exitMs') }),
        UI.toggle({ label: '表示中はサイドバー・パネルを隠す', ...ck('hideUi') }),
        UI.toggle({ label: '見出しを表示する', get: () => C().showTitle !== false, set: (v) => upd({ showTitle: v }) })));

      // --- デザイン
      const presets = OV.catalogs.storyDesigns || [];
      const mine = OV.state.storyDesigns || [];
      const grid = h('div', { class: 'sd-grid' });
      const btns = [];
      const tile = (x, own) => {
        const b = h('button', { type: 'button', class: 'sd-btn', title: x.name, onclick: () => ADM.send('story:applyDesign', { id: x.id }) }, swatch({ ...D(), ...x.design }), h('span', { class: 'nm' }, own ? `★ ${x.name}` : x.name));
        if (own) {
          const del = h('button', { type: 'button', class: 'x', title: '削除' }, '×');
          del.addEventListener('click', (ev) => { ev.stopPropagation(); if (confirm(`デザイン「${x.name}」を削除しますか?`)) ADM.send('story:deleteDesign', { id: x.id }); });
          b.append(del);
        }
        b.dataset.id = x.id;
        btns.push(b);
        grid.append(b);
      };
      const tplD = OV.tplValue ? OV.tplValue('story') : null;
      if (tplD) tile({ id: 'tpl', name: 'テンプレートに合わせる', design: tplD }, false); // 先頭は「テンプレートに合わせる」
      presets.forEach((x) => tile(x, false));
      mine.forEach((x) => tile(x, true));
      UI.bind(grid, () => btns.forEach((b) => b.classList.toggle('on', b.dataset.id === C().designId)));
      const nameIn = h('input', { type: 'text', placeholder: '例:FPS用', style: { flex: 1 } });
      const cur = () => mine.find((x) => x.id === C().designId);
      const over = UI.button('選んでいる自作デザインに上書き', () => { const m = cur(); if (m) ADM.send('story:saveDesign', { overwriteId: m.id }); }, 'small');
      UI.bind(over, () => { over.style.display = cur() ? '' : 'none'; });

      root.append(UI.section('st-design', 'デザイン',
        h('p', { class: 'hint' }, '下の一覧から選ぶと、文字・枠・背景がまとめて切り替わります。その後、下の項目で自由に変えられます。気に入ったら名前を付けて保存すると、★の付いた自作デザインとして一覧に並びます。'),
        grid,
        h('div', { class: 'row', style: { marginTop: '8px' } }, nameIn, UI.button('今のデザインを保存', () => { ADM.send('story:saveDesign', { name: nameIn.value }); nameIn.value = ''; }, 'primary small')),
        h('div', { class: 'row' }, over)));

      root.append(UI.section('st-font', '文字',
        UI.select({ label: '本文のフォント', options: fontOptions, ...dk('font') }),
        UI.select({ label: '見出しのフォント', options: fontOptions, ...dk('titleFont') }),
        UI.num({ label: '本文の大きさ', min: 14, max: 120, step: 1, unit: 'px', ...dk('size') }),
        UI.num({ label: '見出しの大きさ', min: 14, max: 160, step: 1, unit: 'px', ...dk('titleSize') }),
        UI.color({ label: '本文の色', ...dk('color') }),
        UI.color({ label: '見出し・強調の色', ...dk('titleColor') }),
        UI.toggle({ label: '太字', ...dk('bold') }),
        UI.seg({ label: '揃え', options: [['left', '左'], ['center', '中央'], ['right', '右']], get: () => D().align || 'left', set: (v) => upd({ design: { align: v } }) }),
        UI.num({ label: '行間', min: 1, max: 3, step: 0.05, unit: '倍', ...dk('lineHeight') }),
        UI.num({ label: '文字間隔', min: -0.05, max: 0.5, step: 0.01, unit: 'em', ...dk('letterSpacing') }),
        UI.select({ label: '見出しの飾り', options: [['none', 'なし'], ['line', '下に線'], ['brackets', '『』で囲む'], ['ribbon', 'リボン(帯)']], ...dk('titleDeco') })));
      root.append(UI.section('st-deco', '縁取り・影・光',
        UI.num({ label: '縁取りの太さ', min: 0, max: 8, step: 0.5, unit: 'px', ...dk('strokeWidth') }),
        UI.color({ label: '縁取りの色', ...dk('strokeColor') }),
        UI.num({ label: '影のぼかし', min: 0, max: 40, step: 1, unit: 'px', ...dk('shadowBlur') }),
        UI.num({ label: '影の下ずれ', min: 0, max: 20, step: 1, unit: 'px', ...dk('shadowY') }),
        UI.color({ label: '影の色', ...dk('shadowColor') }),
        UI.num({ label: '光(グロー)', min: 0, max: 30, step: 1, unit: 'px', ...dk('glow') }),
        UI.color({ label: '光の色', ...dk('glowColor') })));
      root.append(UI.section('st-box', '枠と背景',
        UI.color({ label: '枠の中の色', ...dk('boxColor'), alpha: dk('boxAlpha') }),
        UI.text({ label: 'グラデーション', placeholder: 'linear-gradient(180deg, #123 0%, #456 100%)', ...dk('boxImage') }),
        h('div', { class: 'row end' }, UI.button('グラデーションを使わない', () => upd({ design: { boxImage: '' } }), 'small')),
        UI.select({ label: '枠線', options: [['solid', '実線'], ['double', '二重線'], ['dashed', '破線'], ['dotted', '点線'], ['none', 'なし']], ...dk('borderStyle') }),
        UI.num({ label: '枠線の太さ', min: 0, max: 24, step: 1, unit: 'px', ...dk('borderWidth') }),
        UI.color({ label: '枠線の色', ...dk('borderColor') }),
        UI.num({ label: '角丸', min: 0, max: 80, step: 1, unit: 'px', ...dk('radius') }),
        UI.num({ label: '内側の余白', min: 0, max: 160, step: 2, unit: 'px', ...dk('padding') }),
        UI.num({ label: '枠の幅', min: 20, max: 100, step: 1, unit: '%', ...dk('boxWidth') }),
        UI.toggle({ label: '枠に影を付ける', ...dk('boxShadow') }),
        UI.seg({ label: '縦の位置', options: [['top', '上'], ['center', '中央'], ['bottom', '下']], get: () => D().valign || 'center', set: (v) => upd({ design: { valign: v } }) }),
        h('h3', { class: 'h' }, 'うしろ(暗幕)'),
        UI.num({ label: '暗くする', min: 0, max: 1, step: 0.05, ...dk('dim') }),
        UI.color({ label: '暗幕の色', ...dk('backdropColor') }),
        UI.num({ label: 'ぼかす', min: 0, max: 30, step: 1, unit: 'px', ...dk('backdropBlur') })));

      // --- 表示する場所(この画面)
      root.append(UI.section('st-place', `表示する場所(${OV.canvas === 'v' ? '縦画面' : '横画面'})`,
        UI.seg({ label: '場所', options: [['full', '画面全体'], ['game', 'ゲーム映像の上'], ['gameBottom', 'ゲーム映像の下側'], ['custom', '数値で指定']], get: () => V().area || 'full', set: (v) => updView({ area: v }) }),
        UI.when(() => V().area === 'custom', h('div', null,
          UI.num({ label: 'X', min: 0, max: OV.W, step: 2, unit: 'px', ...vk('x') }),
          UI.num({ label: 'Y', min: 0, max: OV.H, step: 2, unit: 'px', ...vk('y') }),
          UI.num({ label: '幅', min: 100, max: OV.W, step: 2, unit: 'px', ...vk('w') }),
          UI.num({ label: '高さ', min: 80, max: OV.H, step: 2, unit: 'px', ...vk('h') }))),
        UI.num({ label: 'まわりの余白', min: 0, max: 300, step: 2, unit: 'px', ...vk('margin') }),
        UI.num({ label: '文字と余白の倍率', min: 0.3, max: 3, step: 0.05, unit: '倍', ...vk('scale') }),
        UI.num({ label: 'この画面だけの枠の幅', min: 0, max: 100, step: 1, unit: '%', ...vk('boxWidth') }),
        h('p', { class: 'hint' }, '横画面と縦画面で別々に決められます。「この画面だけの枠の幅」が 0 のときは、デザインの「枠の幅」を使います。文字が多くて収まらないときは、自動で縮小されます。')));
    },
  });
  ['st-font', 'st-deco', 'st-box', 'st-place'].forEach((k) => UI.setDefaultOpen(k, false));
})();
