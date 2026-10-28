/* パネル一覧タブと、全パネル共通のインスペクタ(サイズ・スタイル・枠・文字装飾・アニメーション) */
(function () {
  'use strict';
  const { h } = UI;
  const { fontStack } = OV.util;
  const SIZE_KEYS = ['headingSize', 'bodySize', 'numberSize', 'lineHeight', 'letterSpacing', 'padding'];
  const EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 3l18 18"/><path d="M10.6 5.1A11 11 0 0 1 12 5c7 0 11 7 11 7a18 18 0 0 1-3.2 4M6.1 6.1A18 18 0 0 0 1 12s4 7 11 7a10.7 10.7 0 0 0 5.9-1.8"/></svg>';
  const ANIMS = [['fade', 'フェード'], ['slideLeft', '左からスライド'], ['slideRight', '右からスライド'], ['slideUp', '下からスライド'], ['slideDown', '上からスライド'], ['pop', 'ポップイン'], ['zoom', 'ズーム'], ['shine', 'フェード+きらっと光る'], ['none', 'なし']];
  const fontOptions = () => (OV.catalogs.fonts || []).map((f) => [f.family, f.label || f.family]);

  // ---------------- パネル一覧 ----------------
  ADM.registerTab({
    id: 'panels',
    label: 'パネル',
    order: 10,
    sig: () => JSON.stringify((OV.state.panels || []).map((p) => [p.id, p.name, p.visible, p.placement, p.pairWithNext, p.type, p.fill, p.type === 'group' ? (p.data || {}).members : 0])) + ADM.selectedId + (((OV.state.layout || {}).container || {}).enabled !== false) + JSON.stringify(OV.state.screens || {}),
    build(root) {
      const types = Object.values(OV.panelTypes);
      let addType = 'text';
      const sel = h('select', { onchange: (e) => { addType = e.target.value; } }, types.map((t) => h('option', { value: t.type }, t.label)));
      const typeOpts = [...sel.options];
      typeOpts.forEach((o) => { if (o.value === 'group') o.remove(); }); // グループは下のボタンで作る
      root.append(h('div', { class: 'row' }, sel, UI.button('+ パネルを追加', () => ADM.send('panels:add', { type: addType }), 'primary')));
      const cands = ADM.groupCandidates ? ADM.groupCandidates() : [];
      root.append(h('div', { class: 'row', style: { marginTop: '6px' } },
        UI.button(cands.length >= 2 ? `+ ${cands.map((p) => p.name).join('・')} を横一列にまとめる` : '+ グループを作る(横一列にまとめる)', () => ADM.createGroup(cands.length >= 2 ? cands.map((p) => p.id) : [], cands.length >= 2 ? '数値のグループ' : 'グループ'), 'small')));

      const panels = OV.state.panels || [];
      const gmap = OV.groupMap(panels);
      const contList = h('ul', { class: 'plist' });
      const freeList = h('ul', { class: 'plist' });
      let dragId = null;
      const item = (p, sub) => {
        const li = h('li', {
          class: `pitem${sub ? ' sub' : ''}${p.id === ADM.selectedId ? ' on' : ''}${p.visible === false ? ' hidden' : ''}`,
          draggable: sub ? 'false' : 'true',
          onclick: () => ADM.select(p.id),
        });
        const eye = h('button', { type: 'button', class: 'eye', title: p.visible === false ? '表示する' : '隠す', html: p.visible === false ? EYE_OFF : EYE });
        eye.addEventListener('click', (e) => { e.stopPropagation(); ADM.patchPanel(p.id, { visible: p.visible === false }); });
        li.append(...[h('span', { class: 'grip', title: 'ドラッグで並べ替え' }, '⠿'), eye, h('span', { class: 'pname' }, p.name),
          h('span', { class: 'chip' }, ADM.typeLabel(p.type)),
          p.pairWithNext && p.placement !== 'free' && !sub && p.type !== 'group' ? h('span', { class: 'chip pair', title: '次のパネルと横並び' }, '横並び') : null,
          p.type === 'group' ? h('span', { class: 'chip grp', title: '中のパネルを横一列に並べます' }, `${panels.filter((x) => gmap.get(x.id) === p.id).length}個`) : null,
          p.fill ? h('span', { class: 'chip', title: '残りのスペースを埋める' }, '伸縮') : null,
          (OV.panelHiders || []).some((fn) => fn(p)) ? h('span', { class: 'chip off', title: '「コメント連動」タブの「出す画面」で、この画面には出さない設定になっています' }, 'この画面は出さない') : null].filter(Boolean));
        if (sub) return li; // グループの中の並び順は、グループの設定で変える
        li.addEventListener('dragstart', (e) => { dragId = p.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', p.id); });
        li.addEventListener('dragover', (e) => {
          if (!dragId || dragId === p.id) return;
          e.preventDefault();
          const r = li.getBoundingClientRect();
          const after = e.clientY > r.top + r.height / 2;
          li.classList.toggle('drop-after', after);
          li.classList.toggle('drop-before', !after);
        });
        li.addEventListener('dragleave', () => li.classList.remove('drop-after', 'drop-before'));
        li.addEventListener('drop', (e) => {
          e.preventDefault();
          const after = li.classList.contains('drop-after');
          li.classList.remove('drop-after', 'drop-before');
          if (!dragId || dragId === p.id) return;
          const ids = panels.map((x) => x.id).filter((x) => x !== dragId);
          const i = ids.indexOf(p.id) + (after ? 1 : 0);
          ids.splice(i, 0, dragId);
          ADM.send('panels:reorder', { ids });
          dragId = null;
        });
        li.addEventListener('dragend', () => { dragId = null; });
        return li;
      };
      // グループの中のパネルは、グループの下に字下げして並べる
      const put = (list, p) => {
        list.append(item(p));
        if (p.type === 'group') ((p.data || {}).members || []).filter((m) => gmap.get(m) === p.id).forEach((m) => { const mp = panels.find((x) => x.id === m); if (mp) list.append(item(mp, true)); });
      };
      panels.filter((p) => p.placement !== 'free' && !gmap.has(p.id)).forEach((p) => put(contList, p));
      panels.filter((p) => p.placement === 'free' && !gmap.has(p.id)).forEach((p) => put(freeList, p));
      root.append(h('div', { class: 'plist-sep' }, 'サイドバー内(上から順・ドラッグで並べ替え)'), contList);
      if (((OV.state.layout || {}).container || {}).enabled === false && contList.children.length) {
        root.append(h('div', { class: 'note-box' }, 'サイドバーが非表示のため、サイドバー内のパネルは表示されていません。パネルの「配置」を自由配置にするか、レイアウトタブでサイドバーを表示してください。'));
      }
      root.append(h('div', { class: 'plist-sep' }, '自由配置(プレビュー上でドラッグ移動)'), freeList.children.length ? freeList : h('div', { class: 'hint' }, 'なし。パネルの「配置」で自由配置にできます。'));
      const p = ADM.selected();
      if (p) {
        root.append(h('div', { class: 'row', style: { marginTop: '12px' } },
          UI.button('選択中を複製', () => ADM.send('panels:duplicate', { id: p.id })),
          UI.button('選択中を削除', () => { if (confirm(`「${p.name}」を削除しますか?`)) ADM.send('panels:remove', { id: p.id }); }, 'danger')));
      }
    },
  });

  // ---------------- 共通インスペクタ ----------------
  function styleSwatch(st) {
    const L = Object.assign({}, OV.resolveTokens((OV.catalogs.styles || {}).base || {}), OV.resolveTokens(st.look || {}));
    const sw = h('div', { class: 'style-sw' }, 'あA12');
    sw.style.background = L.bgImage || L.bgColor;
    sw.style.color = L.textColor;
    sw.style.fontFamily = fontStack(L.font);
    const bw = Math.min(4, Number(L.borderWidth) || 0);
    sw.style.border = `${bw}px ${L.borderStyle || 'solid'} ${L.borderColor}`;
    sw.style.borderRadius = `${Math.min(8, Number(L.radius) || 0)}px`;
    if (L.glowStrength) sw.style.textShadow = `0 0 6px ${L.glowColor}`;
    if (L.borderTitle) {
      // 見出しが枠線の上に乗るスタイル:見本にも小さなラベルを出す
      sw.style.position = 'relative';
      sw.style.overflow = 'visible';
      const lg = h('span', { class: 'style-sw-lg' }, '名前');
      lg.style.background = L.bgColor || '#000';
      lg.style.color = L.headingColor || L.textColor;
      if (L.borderTitleAlign === 'center') { lg.style.left = '50%'; lg.style.transform = 'translate(-50%, -50%)'; }
      else if (L.borderTitleAlign === 'right') lg.style.right = '6px';
      else lg.style.left = '6px';
      sw.append(lg);
    }
    return sw;
  }

  ADM.buildInspector = function (root, id) {
    const P = () => ADM.panel(id) || {};
    const L = () => OV.effectiveLook(P());
    const lk = (k) => ({ get: () => L()[k], set: (v) => ADM.patchPanel(id, { look: { [k]: v } }) });
    const pk = (k) => ({ get: () => P()[k], set: (v) => ADM.patchPanel(id, { [k]: v }) });
    const p = P();
    const t = OV.panelTypes[p.type] || {};
    const sz = t.sizeLabels || {};
    const isFree = () => P().placement === 'free';
    const grp = () => (OV.groupOf ? OV.groupOf(id) : null);
    const noLook = !!t.noLook;

    // 見出し
    root.append(h('div', { class: 'insp-head' },
      h('div', { class: 'type' }, ADM.typeLabel(p.type)),
      UI.text({ label: 'パネル名', ...pk('name') }),
      h('div', { class: 'row' },
        UI.toggle({ label: '表示する', get: () => P().visible !== false, set: (v) => ADM.patchPanel(id, { visible: v }) }),
        h('span', { style: { flex: 1 } }),
        UI.button('複製', () => ADM.send('panels:duplicate', { id }), 'small'),
        UI.button('削除', () => { if (confirm(`「${P().name}」を削除しますか?`)) ADM.send('panels:remove', { id }); }, 'small danger'))));

    // 種別ごとの内容
    const ins = ADM.inspectors[p.type];
    if (ins) {
      const body = h('div');
      ins.build(body, id);
      root.append(UI.section(`content-${p.type}`, ins.title || '内容', body));
    }

    // グループの中のパネル:位置と大きさはグループで決まる
    root.append(UI.when(() => !!grp(), h('div', { class: 'note-box' },
      (() => { const msg = h('div'); return UI.bind(msg, () => { const g = grp(); msg.textContent = g ? `このパネルはグループ「${g.name}」に入っています。位置・大きさ・高さはグループで決まります。` : ''; }); })(),
      h('div', { class: 'row', style: { marginTop: '6px' } },
        UI.button('グループの設定を開く', () => { const g = grp(); if (g) ADM.select(g.id); }, 'small primary'),
        UI.button('グループから外す', () => { const g = grp(); if (g) ADM.send('panelGroup:setMembers', { id: g.id, members: ((g.data || {}).members || []).filter((x) => x !== id) }); }, 'small')))));

    // 配置とサイズ
    const placeSec = UI.section('place', '配置とサイズ',
      UI.seg({ label: '配置', options: [['container', 'サイドバー内'], ['free', '自由配置']], ...pk('placement') }),
      UI.when(isFree, h('div', null,
        UI.num({ label: 'X', min: 0, max: OV.W, step: 1, unit: 'px', ...pk('x') }),
        UI.num({ label: 'Y', min: 0, max: OV.H, step: 1, unit: 'px', ...pk('y') }),
        UI.num({ label: '幅', min: 80, max: OV.W, step: 1, unit: 'px', ...pk('w') }))),
      UI.when(() => !isFree(), h('div', null,
        UI.seg({ label: '幅', options: [['auto', '自動'], ['fixed', '固定']], ...pk('widthMode') }),
        UI.when(() => P().widthMode === 'fixed', UI.num({ label: '幅(px)', min: 80, max: OV.W, step: 1, unit: 'px', ...pk('w') })))),
      UI.seg({ label: '高さ', options: [['auto', '自動(文字量に合わせる)'], ['fixed', '固定']], ...pk('heightMode') }),
      UI.when(() => P().heightMode === 'fixed', UI.num({ label: '高さ(px)', min: 40, max: OV.H, step: 1, unit: 'px', ...pk('h') })),
      h('p', { class: 'hint' }, '固定の高さに収まらない文字は、自動で縮小されます(はみ出しません)。'),
      UI.when(() => !isFree(), h('div', null,
        UI.toggle({ label: '次のパネルと横並びにする', ...pk('pairWithNext') }),
        UI.toggle({ label: '残りのスペースを埋める(伸縮)', ...pk('fill') }),
        UI.when(() => P().fill, UI.num({ label: '最小の高さ', min: 40, max: 600, step: 1, unit: 'px', ...pk('fillMin') })))));
    root.append(UI.when(() => !grp(), placeSec));
    if (noLook) {
      // グループ:文字・枠・スタイルは、中のパネルごとに設定する
      root.append(UI.section('anim', '表示・非表示のアニメーション',
        UI.select({ label: '種類', options: ANIMS, get: () => (P().anim || {}).type, set: (v) => ADM.patchPanel(id, { anim: { type: v } }) }),
        UI.num({ label: '時間', min: 0, max: 1500, step: 50, unit: 'ms', get: () => (P().anim || {}).ms, set: (v) => ADM.patchPanel(id, { anim: { ms: v } }) })));
      return;
    }

    // 文字サイズと余白
    root.append(UI.section('size', '文字サイズと余白',
      UI.num({ label: sz.headingSize || '見出し', min: 10, max: 120, step: 1, unit: 'px', ...lk('headingSize') }),
      UI.num({ label: sz.bodySize || '本文', min: 8, max: 80, step: 1, unit: 'px', ...lk('bodySize') }),
      p.type === 'number' ? UI.num({ label: sz.numberSize || '数字', min: 12, max: 200, step: 1, unit: 'px', ...lk('numberSize') }) : null,
      UI.num({ label: '行間', min: 1, max: 2.4, step: 0.05, unit: '倍', ...lk('lineHeight') }),
      UI.num({ label: '文字間隔', min: -0.05, max: 0.4, step: 0.01, unit: 'em', ...lk('letterSpacing') }),
      UI.num({ label: '内側余白', min: 0, max: 60, step: 1, unit: 'px', ...lk('padding') }),
      h('div', { class: 'row end' }, UI.button('サイズをスタイルの初期値に戻す', () => ADM.send('panels:resetLook', { id, keys: SIZE_KEYS }), 'small'))));

    // スタイル
    const grid = h('div', { class: 'style-grid' });
    // 先頭は「テンプレートに合わせる」
    const styles = [...(OV.templateStyle ? [OV.templateStyle()] : []), ...((OV.catalogs.styles || {}).styles || [])];
    const btns = styles.map((st) => {
      const b = h('button', { type: 'button', class: 'style-btn', onclick: () => ADM.send('panels:setStyle', { id, styleId: st.id }) }, styleSwatch(st), h('span', { class: 'nm' }, st.name));
      b.dataset.id = st.id;
      grid.append(b);
      return b;
    });
    // ゲーム枠と同じデザインのスタイル
    const fgrid = h('div', { class: 'style-grid' });
    for (const st of (OV.frameStyles ? OV.frameStyles() : [])) {
      const sw = styleSwatch(st);
      sw.style.border = 'none';
      sw.style.position = 'relative';
      sw.style.borderRadius = `${Math.min(10, Number(st.look.radius) || 0)}px`;
      const dec = h('div', { class: 'ov-gframe' });
      sw.append(dec);
      OV.frameDecorate(dec, st.look.gameFrame, Math.min(1, (st.look.gfScale || 1) * 0.5), Math.min(10, Number(st.look.radius) || 0));
      const b = h('button', { type: 'button', class: 'style-btn', onclick: () => ADM.send('panels:setStyle', { id, styleId: st.id }) }, sw, h('span', { class: 'nm' }, st.name));
      b.dataset.id = st.id;
      btns.push(b);
      fgrid.append(b);
    }
    UI.bind(grid, () => btns.forEach((b) => b.classList.toggle('on', b.dataset.id === P().styleId)));
    root.append(UI.section('style', 'スタイル', grid,
      h('h3', { class: 'h' }, 'ゲーム枠と同じスタイル'),
      h('p', { class: 'hint' }, 'ゲーム枠タブの「枠の種類」と同じデザインです。「ゲーム枠に合わせる(自動)」にすると、ゲーム枠を切り替えたとき、パネルも一緒に切り替わります。'),
      fgrid,
      h('p', { class: 'hint' }, '選ぶと枠・背景・文字装飾がまとめて切り替わります(文字サイズは維持)。その後の個別調整は下の項目で。'),
      h('div', { class: 'row' },
        UI.button('全パネルにこのスタイル', () => { if (confirm('すべてのパネルを同じスタイルにしますか?')) ADM.send('panels:setStyle', { all: true, styleId: P().styleId }); }, 'small'),
        UI.button('個別調整をすべて戻す', () => ADM.send('panels:resetLook', { id }), 'small'))));

    // 見出しを枠線の上に重ねる(ウィンドウ風)
    const btOn = () => !!L().borderTitle;
    root.append(UI.section('btitle', '見出しを枠線の上に重ねる',
      h('p', { class: 'hint' }, 'ゲームのウィンドウのように、見出しを枠線の上に乗せて表示します。どのスタイル・どの枠にも使えます(見出しのあるパネルが対象です)。'),
      UI.toggle({ label: '見出しを枠線の上に重ねる', ...lk('borderTitle') }),
      UI.when(btOn, h('div', null,
        UI.seg({ label: '位置', options: [['left', '左'], ['center', '中央'], ['right', '右']], ...lk('borderTitleAlign') }),
        UI.when(() => L().borderTitleAlign !== 'center', UI.num({ label: '端からの距離', min: 0, max: 200, step: 1, unit: 'px', ...lk('borderTitleInset') })),
        UI.num({ label: '大きさ', min: 0.5, max: 2, step: 0.05, unit: '倍', ...lk('borderTitleScale') }),
        UI.num({ label: '文字の左右の余白', min: 0, max: 1.5, step: 0.05, unit: 'em', ...lk('borderTitlePad') }),
        UI.seg({ label: '文字のうしろ', options: [['auto', 'パネルの背景色'], ['color', '色を指定'], ['none', 'なし(線が透ける)']], ...lk('borderTitleBgMode') }),
        UI.when(() => L().borderTitleBgMode === 'color', UI.color({ label: 'うしろの色', ...lk('borderTitleBgColor') })))),
      h('p', { class: 'hint' }, '文字のうしろを塗りつぶして、枠線を切り取ったように見せます。見出しの文字・大きさ・色は、ふだんの見出しと同じ設定を使います。'),
      h('div', { class: 'row' },
        UI.button('全パネルをこの設定にする', () => {
          const cur = L();
          const keys = ['borderTitle', 'borderTitleAlign', 'borderTitleInset', 'borderTitleScale', 'borderTitlePad', 'borderTitleBgMode', 'borderTitleBgColor'];
          const patch = {};
          keys.forEach((k) => { if (cur[k] !== undefined) patch[k] = cur[k]; });
          if (confirm(`すべてのパネルで「見出しを枠線の上に重ねる」を${cur.borderTitle ? 'オン' : 'オフ'}にしますか?`)) ADM.send('panels:setLookAll', { patch });
        }, 'small'))));

    // 枠と背景
    root.append(UI.section('frame', '枠と背景',
      UI.color({ label: '背景色', ...lk('bgColor'), alpha: lk('bgAlpha') }),
      UI.text({ label: 'グラデーション', placeholder: 'linear-gradient(180deg, #123 0%, #456 100%)', ...lk('bgImage') }),
      h('div', { class: 'row end' }, UI.button('グラデーションを使わない', () => ADM.patchPanel(id, { look: { bgImage: '' } }), 'small')),
      UI.select({ label: '枠線', options: [['solid', '実線'], ['double', '二重線'], ['dashed', '破線'], ['none', 'なし']], ...lk('borderStyle') }),
      UI.num({ label: '枠の太さ', min: 0, max: 16, step: 1, unit: 'px', ...lk('borderWidth') }),
      UI.color({ label: '枠の色', ...lk('borderColor') }),
      UI.num({ label: '角丸', min: 0, max: 40, step: 1, unit: 'px', ...lk('radius') }),
      UI.color({ label: '内側ライン', ...lk('insetColor') }),
      UI.when(() => !!L().insetColor, UI.num({ label: 'ラインの太さ', min: 1, max: 10, step: 1, unit: 'px', ...lk('insetWidth') })),
      h('div', { class: 'row end' }, UI.button('内側ラインなし', () => ADM.patchPanel(id, { look: { insetColor: '' } }), 'small')),
      UI.num({ label: '影のぼかし', min: 0, max: 40, step: 1, unit: 'px', ...lk('shadowBlur') }),
      UI.num({ label: '影の下ずれ', min: 0, max: 20, step: 1, unit: 'px', ...lk('shadowY') }),
      UI.color({ label: '影の色', ...lk('shadowColor'), alpha: lk('shadowAlpha') })));

    // 文字装飾
    root.append(UI.section('text', '文字装飾',
      UI.select({ label: 'フォント', options: fontOptions, ...lk('font') }),
      UI.select({ label: '見出しフォント', options: () => [['', '本文と同じ'], ...fontOptions()], ...lk('headingFont') }),
      UI.toggle({ label: '太字', ...lk('bold') }),
      UI.color({ label: '文字色', ...lk('textColor') }),
      UI.color({ label: '見出しの色', ...lk('headingColor') }),
      UI.color({ label: '数字の色', ...lk('numberColor') }),
      UI.num({ label: '縁取りの太さ', min: 0, max: 8, step: 0.5, unit: 'px', ...lk('strokeWidth') }),
      UI.color({ label: '縁取りの色', ...lk('strokeColor') }),
      UI.num({ label: 'グローの強さ', min: 0, max: 30, step: 1, unit: 'px', ...lk('glowStrength') }),
      UI.color({ label: 'グローの色', ...lk('glowColor') }),
      UI.text({ label: '文字の影', placeholder: '2px 2px 0 #000', ...lk('textShadow') })));

    // アニメーション
    const animGet = (k) => () => (P().anim || {})[k];
    root.append(UI.section('anim', '表示・非表示のアニメーション',
      UI.select({ label: '種類', options: ANIMS, get: animGet('type'), set: (v) => ADM.patchPanel(id, { anim: { type: v } }) }),
      UI.num({ label: '時間', min: 0, max: 1500, step: 50, unit: 'ms', get: animGet('ms'), set: (v) => ADM.patchPanel(id, { anim: { ms: v } }) }),
      h('div', { class: 'row end' }, UI.button('動きを確認(隠して→表示)', () => {
        ADM.patchPanel(id, { visible: false });
        setTimeout(() => ADM.patchPanel(id, { visible: true }), ((P().anim || {}).ms || 350) + 250);
      }, 'small'))));
  };
  ['frame', 'text', 'anim'].forEach((k) => UI.setDefaultOpen(k, false));
})();
