/* お願いタブ:メッセージ(チャンネル登録・高評価のお願いなど)と、上部バーのすぐ出せるボタン */
(function () {
  'use strict';
  const { h } = UI;
  const { deepMerge, clone } = OV.util;
  const C = () => OV.state.callout || {};
  const SH = () => OV.calloutLocal || OV.state.calloutShow || {};
  const msgs = () => C().messages || [];
  const M = (id) => msgs().find((m) => m.id === id) || {};
  let selId = '';

  // メッセージの変更:画面をすぐ変えてから、サーバーへ送る(場所は、編集中の画面の分だけ)
  const upd = (id, patch) => {
    const m = msgs().find((x) => x.id === id);
    if (m) {
      const p = clone(patch);
      if (p.place) { m.place = m.place || {}; m.place[OV.canvas] = { ...(m.place[OV.canvas] || {}), ...p.place }; delete p.place; }
      deepMerge(m, p);
    }
    ADM.send('callout:updateMsg', { id, patch }, 'callout');
    ADM.changed();
    if (OV.calloutRefresh) OV.calloutRefresh();
  };
  const fontOptions = () => (OV.catalogs.fonts || []).map((f) => [f.family, f.label || f.family]);

  // ---- プレビューだけで試す ----
  let lt = 0;
  const local = {
    show(id) {
      clearTimeout(lt);
      const m = M(id);
      OV.calloutLocal = { active: true, phase: 'show', token: `L${Date.now()}`, id };
      OV.calloutRefresh(); ADM.changed();
      lt = setTimeout(() => local.hide(), (m.enterMs || 700) + (m.sec || 8) * 1000);
    },
    hide() {
      const p = OV.calloutLocal;
      if (!p || p.phase === 'out') return;
      clearTimeout(lt);
      p.phase = 'out';
      OV.calloutRefresh(); ADM.changed();
      lt = setTimeout(() => { OV.calloutLocal = null; OV.calloutRefresh(); ADM.changed(); }, (M(p.id).exitMs || 600) + 200);
    },
  };

  // ---- 上部バー:すぐ出せるボタン(「上部バーに出す」にしたメッセージ) ----
  ADM.registerTopbar({
    order: 29,
    build(root) {
      const wrap = h('span', { class: 'co-quick' });
      UI.bind(wrap, () => {
        const list = msgs().filter((m) => m.quick);
        const key = JSON.stringify(list.map((m) => [m.id, m.text, m.icon]));
        if (wrap.dataset.key !== key) {
          wrap.dataset.key = key;
          wrap.innerHTML = '';
          wrap.append(h('span', { class: 'tb-label' }, '📣'));
          list.forEach((m) => {
            const ic = (OV.CALLOUT_ICONS[m.icon] || {}).html || '';
            const tx = String(OV.t(m.text));
            const lab = `${/^</.test(ic) ? '' : ic}${/[\u3000-\u9fff]/.test(tx) ? tx.slice(0, 8) : tx.slice(0, 18)}`;
            const b = h('button', { type: 'button', class: 'btn small', title: `「${m.text}」を表示(表示中に押すと消す)`, onclick: () => { const s = OV.state.calloutShow || {}; if (s.active && s.id === m.id && s.phase !== 'out') ADM.send('callout:hide'); else ADM.send('callout:show', { id: m.id }); } }, lab);
            b.dataset.id = m.id;
            wrap.append(b);
          });
        }
        const s = OV.state.calloutShow || {};
        [...wrap.querySelectorAll('button')].forEach((b) => b.classList.toggle('on', !!(s.active && s.phase !== 'out' && s.id === b.dataset.id)));
      });
      root.append(wrap);
    },
  });

  // ---- デザインの見本 ----
  function swatch(d) {
    const pv = h('div', { class: 'cd-pv' });
    const box = h('div', { class: 'co-box', html: OV.calloutInner({ text: OV.t('登録お願い!'), icon: 'pointDown', iconAnim: 'none' }) });
    OV.applyCalloutDesign(box, { ...d, size: 22, padX: Math.min(16, d.padX || 0), padY: Math.min(8, d.padY || 0), borderWidth: Math.min(3, d.borderWidth || 0) });
    box.dataset.fx = ['sparkle', 'pulse', 'float', 'shake', 'wave'].includes(d.effect) ? 'none' : d.effect;
    pv.append(box);
    return pv;
  }

  // ---- 1つのメッセージの編集欄 ----
  function editor(id) {
    const root = h('div');
    const m = () => M(id);
    const D = () => m().design || {};
    const mk = (k) => ({ get: () => m()[k], set: (v) => upd(id, { [k]: v }) });
    const dk = (k) => ({ get: () => D()[k], set: (v) => upd(id, { design: { [k]: v } }) });
    const P = () => ((m().place || {})[OV.canvas]) || {};
    const pk = (k) => ({ get: () => P()[k], set: (v) => upd(id, { place: { [k]: v } }) });

    // デザイン
    const grid = h('div', { class: 'cd-grid' });
    // 先頭は「テンプレートに合わせる」
    const tplD = OV.tplValue ? OV.tplValue('callout') : null;
    const btns = [...(tplD ? [{ id: 'tpl', name: 'テンプレートに合わせる', design: { ...D(), ...tplD } }] : []), ...(OV.catalogs.calloutDesigns || [])].map((x) => {
      const b = h('button', { type: 'button', class: 'cd-btn', title: x.name, onclick: () => { ADM.send('callout:applyDesign', { id, designId: x.id }); } }, swatch(x.design), h('span', { class: 'nm' }, x.name));
      b.dataset.id = x.id;
      grid.append(b);
      return b;
    });
    UI.bind(grid, () => btns.forEach((b) => b.classList.toggle('on', b.dataset.id === m().designId)));

    // 場所(3×3)
    const anchors = h('div', { class: 'co-anchor' });
    const abtns = ['tl', 't', 'tr', 'l', 'c', 'r', 'bl', 'b', 'br'].map((a) => {
      const b = h('button', { type: 'button', title: { tl: '左上', t: '上', tr: '右上', l: '左', c: '中央', r: '右', bl: '左下', b: '下', br: '右下' }[a], onclick: () => upd(id, { place: { anchor: a, x: 0, y: 0 } }) }, { tl: '↖', t: '↑', tr: '↗', l: '←', c: '●', r: '→', bl: '↙', b: '↓', br: '↘' }[a]);
      b.dataset.a = a;
      anchors.append(b);
      return b;
    });
    UI.bind(anchors, () => abtns.forEach((b) => b.classList.toggle('on', b.dataset.a === (P().anchor || 'b'))));

    root.append(
      UI.text({ label: 'メッセージ', ...mk('text') }),
      UI.text({ label: '小さい文字(2行目)', placeholder: '空欄なら出しません', ...mk('sub') }),
      h('div', { class: 'row' },
        UI.button('▶ 配信画面に表示', () => ADM.send('callout:show', { id }), 'primary small'),
        UI.button('プレビューだけで試す', () => local.show(id), 'small'),
        UI.button('消す', () => (OV.calloutLocal ? local.hide() : ADM.send('callout:hide')), 'small')),
      UI.num({ label: '表示する時間', min: 1, max: 120, step: 1, unit: '秒', ...mk('sec') }),
      UI.toggle({ label: '上部バーにボタンを出す', ...mk('quick') }),
      UI.toggle({ label: '自動で出す(下の「自動で出す間隔」ごとに順番に)', ...mk('auto') }),

      UI.section(`co-anim-${id}`, '出し方(登場・退場)',
        UI.select({ label: '登場', options: OV.CALLOUT_ENTERS, ...mk('enter') }),
        UI.num({ label: '登場の時間', min: 0, max: 3000, step: 50, unit: 'ms', ...mk('enterMs') }),
        UI.select({ label: '退場', options: OV.CALLOUT_EXITS, ...mk('exit') }),
        UI.num({ label: '退場の時間', min: 0, max: 3000, step: 50, unit: 'ms', ...mk('exitMs') })),

      UI.section(`co-icon-${id}`, 'アイコン(矢印・指さし)',
        UI.select({ label: 'アイコン', options: Object.entries(OV.CALLOUT_ICONS).map(([k, v]) => [k, v.label]), ...mk('icon') }),
        UI.seg({ label: '文字との位置', options: [['left', '左'], ['right', '右'], ['top', '上'], ['bottom', '下']], get: () => m().iconPos || 'right', set: (v) => upd(id, { iconPos: v }) }),
        UI.select({ label: '動き', options: OV.CALLOUT_ICON_ANIMS, ...mk('iconAnim') }),
        UI.num({ label: '大きさ', min: 0.3, max: 3, step: 0.05, unit: '倍', ...mk('iconSize') }),
        UI.color({ label: 'アイコンの色(矢印)', ...dk('iconColor') }),
        h('p', { class: 'hint' }, 'YouTube の「チャンネル登録」ボタンは、横型配信では動画の左下の下、縦型(ショート)では画面の左下にあります。そちらを指す矢印・指さしを選び、場所を左下にすると伝わりやすくなります。')),

      UI.section(`co-place-${id}`, `表示する場所(${OV.canvas === 'v' ? '縦画面' : '横画面'})`,
        UI.field('基準の位置', anchors),
        UI.num({ label: '横にずらす', min: -1500, max: 1500, step: 2, unit: 'px', ...pk('x') }),
        UI.num({ label: '縦にずらす', min: -1500, max: 1500, step: 2, unit: 'px', ...pk('y') }),
        UI.num({ label: '大きさ', min: 0.2, max: 3, step: 0.05, unit: '倍', ...pk('scale') }),
        h('p', { class: 'hint' }, '横画面と縦画面で、別々に決められます(縦画面は、上の「縦 9:16」に切り替えて設定します)。表示中に変えると、すぐ反映されます。')),

      UI.section(`co-design-${id}`, 'デザイン', grid,
        h('p', { class: 'hint' }, '選ぶと、文字・色・枠・エフェクトがまとめて切り替わります。そのあと下の項目で自由に変えられます。')),
      UI.section(`co-font-${id}`, '文字とエフェクト',
        UI.select({ label: 'フォント', options: fontOptions, ...dk('font') }),
        UI.num({ label: '文字の大きさ', min: 16, max: 200, step: 1, unit: 'px', ...dk('size') }),
        UI.toggle({ label: '太字', ...dk('bold') }),
        UI.seg({ label: '文字の色', options: [['solid', '単色'], ['gradient', 'グラデーション']], get: () => D().fill || 'solid', set: (v) => upd(id, { design: { fill: v } }) }),
        UI.when(() => D().fill !== 'gradient', UI.color({ label: '色', ...dk('color') })),
        UI.when(() => D().fill === 'gradient', h('div', null,
          UI.color({ label: '色1', ...dk('grad1') }),
          UI.color({ label: '色2', ...dk('grad2') }),
          UI.color({ label: '色3(空欄で2色)', ...dk('grad3') }),
          UI.num({ label: '向き', min: 0, max: 360, step: 5, unit: '度', ...dk('gradAngle') }))),
        UI.color({ label: '小さい文字の色', ...dk('subColor') }),
        UI.num({ label: '縁取りの太さ', min: 0, max: 12, step: 0.5, unit: 'px', ...dk('strokeWidth') }),
        UI.color({ label: '縁取りの色', ...dk('strokeColor') }),
        UI.toggle({ label: '影を付ける', ...dk('shadow') }),
        UI.select({ label: 'エフェクト', options: OV.CALLOUT_EFFECTS, ...dk('effect') }),
        UI.color({ label: 'エフェクトの色(光・ネオン・きらきら)', ...dk('effectColor') })),
      UI.section(`co-box-${id}`, '枠と背景',
        UI.select({ label: '枠の形', options: [['none', 'なし(文字だけ)'], ['pill', 'ボタン(丸)'], ['card', 'カード'], ['bubble', '吹き出し'], ['ribbon', 'リボン(帯)'], ['window', 'ウィンドウ(二重線)']], ...dk('box') }),
        UI.color({ label: '背景の色', ...dk('boxColor'), alpha: dk('boxAlpha') }),
        UI.text({ label: 'グラデーション', placeholder: 'linear-gradient(180deg, #ff4a3d, #cc1a12)', ...dk('boxImage') }),
        h('div', { class: 'row end' }, UI.button('グラデーションを使わない', () => upd(id, { design: { boxImage: '' } }), 'small')),
        UI.num({ label: '枠線の太さ', min: 0, max: 20, step: 1, unit: 'px', ...dk('borderWidth') }),
        UI.color({ label: '枠線の色', ...dk('borderColor') }),
        UI.num({ label: '角丸', min: 0, max: 80, step: 1, unit: 'px', ...dk('radius') }),
        UI.num({ label: '余白(横)', min: 0, max: 160, step: 2, unit: 'px', ...dk('padX') }),
        UI.num({ label: '余白(縦)', min: 0, max: 100, step: 2, unit: 'px', ...dk('padY') })),
      h('div', { class: 'row', style: { marginTop: '8px' } },
        UI.button('このメッセージを複製', () => ADM.send('callout:add', { copyOf: id }), 'small'),
        UI.button('削除', () => { if (confirm(`「${m().text}」を削除しますか?`)) ADM.send('callout:remove', { id }); }, 'small danger')));
    ['font', 'box', 'place'].forEach((k) => UI.setDefaultOpen(`co-${k}-${id}`, false));
    return root;
  }

  ADM.registerTab({
    id: 'callout',
    label: 'お願い',
    order: 37,
    sig: () => JSON.stringify([JSON.stringify(OV.raw.theme), (OV.catalogs.templates || []).length, msgs().map((m) => m.id), selId, (OV.catalogs.calloutDesigns || []).map((x) => x.id), (OV.catalogs.fonts || []).length, C().token]),
    build(root) {
      if (!msgs().some((m) => m.id === selId)) selId = (msgs()[0] || {}).id || '';
      root.append(h('p', { class: 'hint' }, '「チャンネル登録お願いします」などを、好きなタイミングで画面に出します。上部バーの 📣 のボタンを押すとすぐ表示され、決めた秒数で消えます(表示中にもう一度押すと消えます)。'));
      const list = h('div', { class: 'co-list' });
      msgs().forEach((m, i) => {
        const item = h('div', { class: `co-item${m.id === selId ? ' on' : ''}` },
          h('div', { class: 'row' },
            UI.button(m.id === selId ? '▼' : '▶', () => { selId = m.id; ADM.changed(); }, 'small'),
            h('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }, onclick: () => { selId = m.id; ADM.changed(); } }, `${i + 1}. ${m.text}`),
            UI.button('表示', () => ADM.send('callout:show', { id: m.id }), 'small primary'),
            UI.button('↑', () => ADM.send('callout:move', { id: m.id, dir: -1 }), 'small'),
            UI.button('↓', () => ADM.send('callout:move', { id: m.id, dir: 1 }), 'small')));
        if (m.id === selId) item.append(editor(m.id));
        list.append(item);
      });
      root.append(list, h('div', { class: 'row', style: { marginTop: '8px' } }, UI.button('+ メッセージを追加', () => ADM.send('callout:add', {}), 'primary small')));

      const url = (n) => `${location.origin}/api/callout/show?n=${n}&token=${C().token}`;
      root.append(
        h('h3', { class: 'h' }, '自動で出す'),
        UI.num({ label: '自動で出す間隔', min: 0, max: 120, step: 1, unit: '分', get: () => C().autoMin, set: (v) => ADM.send('callout:update', { patch: { autoMin: v } }) }),
        h('p', { class: 'hint' }, '0 のときは自動で出しません。1 以上にすると、その間隔で「自動で出す」にしたメッセージを順番に表示します(ずっと出しっぱなしより目に留まりやすくなります)。'),
        h('h3', { class: 'h' }, '呼び出しURL(Stream Deck など)'),
        h('p', { class: 'hint' }, `1番目を表示:${url(1)}`),
        h('p', { class: 'hint' }, `消す:${location.origin}/api/callout/hide?token=${C().token}`),
        h('p', { class: 'hint' }, 'n= の数字を変えると、その番号のメッセージを表示します。このPCの中からだけ呼び出せます。'),
        h('div', { class: 'row' }, UI.button('呼び出しURLを作り直す', () => { if (confirm('今のURLは使えなくなります。作り直しますか?')) ADM.send('callout:newToken'); }, 'small')));
    },
  });
  // 追加したメッセージを開く(ADM.hub は起動後にできる)
  const hook = () => (ADM.hub ? ADM.hub.on('callout:added', (p) => { selId = p.id; ADM.changed(); }) : setTimeout(hook, 200));
  hook();
})();
