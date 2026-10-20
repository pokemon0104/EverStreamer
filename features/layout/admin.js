/* レイアウトタブ(サイドバー・レイアウトプリセット)と、上部の全体スケール */
(function () {
  'use strict';
  const { h } = UI;
  const { clamp } = OV.util;
  const LAY = () => OV.state.layout || {};
  const C = () => LAY().container || {};
  const ck = (k) => ({ get: () => C()[k], set: (v) => ADM.patchLayout({ container: { [k]: v } }) });
  const setScale = (v) => ADM.patchLayout({ globalScale: Math.round(clamp(v, 0.5, 2) * 100) / 100 });

  // 上部バー:横画面 / 縦画面の切り替え(縦画面は、パネル・配置・背景・演出の場所を別に持つ)
  ADM.registerTopbar({
    order: 5,
    build(root) {
      const go = (c) => { if (c !== OV.canvas) location.href = c === 'v' ? '/admin?canvas=v' : '/admin'; };
      const seg = h('div', { class: 'seg canvas-seg' },
        h('button', { type: 'button', class: OV.canvas === 'h' ? 'on' : '', title: '横型配信(16:9 / 1920x1080)の画面を編集', onclick: () => go('h') }, '横 16:9'),
        h('button', { type: 'button', class: OV.canvas === 'v' ? 'on' : '', title: '縦型配信・ショート(9:16 / 1080x1920)の画面を編集', onclick: () => go('v') }, '縦 9:16'));
      root.append(h('span', { class: 'tb-label' }, '編集する画面'), seg);
    },
  });

  // 上部バー:全体スケール
  ADM.registerTopbar({
    order: 20,
    build(root) {
      const val = h('span', { class: 'scale-val' });
      UI.bind(val, () => { val.textContent = `${Math.round((LAY().globalScale || 1) * 100)}%`; });
      const chips = h('div', { class: 'seg scale-chips' });
      const cbs = [0.8, 1, 1.2, 1.5].map((v) => {
        const b = h('button', { type: 'button', onclick: () => setScale(v) }, `${Math.round(v * 100)}%`);
        b.dataset.v = v;
        chips.append(b);
        return b;
      });
      UI.bind(chips, () => cbs.forEach((b) => b.classList.toggle('on', Math.abs(Number(b.dataset.v) - (LAY().globalScale || 1)) < 0.001)));
      root.append(h('span', { class: 'tb-label' }, '全体の文字'),
        UI.button('−', () => setScale((LAY().globalScale || 1) - 0.05), 'small'), val,
        UI.button('+', () => setScale((LAY().globalScale || 1) + 0.05), 'small'), chips);
    },
  });


  // 調整後に文字がどれだけ縮んだかを確認して、小さすぎる場合はその場で知らせる
  let checkAfterAvoid = false;
  ADM.on('fit', () => {
    if (!checkAfterAvoid) return;
    checkAfterAvoid = false;
    const s = ADM.preview ? ADM.preview.renderer.containerScale : 1;
    if (s < 0.7) {
      ADM.toast(`入りきらないため、文字が ${Math.round(s * 100)}% に縮んでいます。コメント欄を隠す・数字や余白を小さくする・パネルを減らすなどで調整してください`, 'warn');
    }
  });

  // アバターの目安枠に被らないよう、サイドバーの大きさを縮める
  function avoidAvatar() {
    checkAfterAvoid = true;
    const c = C();
    const av = OV.avatarRect(LAY());
    const rect = OV.containerRect(c);
    if (c.enabled === false || !OV.rectsOverlap(av, rect)) return ADM.toast('すでにアバターの枠に被っていません');
    if (c.dock === 'right' || c.dock === 'left') {
      // 縦に積むサイドバー:下端をアバターの上までにする
      const h2 = Math.max(200, av.y - (Number(c.y) || 0));
      ADM.patchLayout({ container: { h: h2 } });
      ADM.toast(`サイドバーの高さを ${h2}px にしました`);
      setTimeout(() => ADM.changed(), 50);
    } else if (c.dock === 'bottom') {
      // 下部バー:横幅をアバターの内側までにする
      const w2 = Math.max(300, OV.W - av.w);
      ADM.patchLayout({ container: { w: w2, x: av.side === 'left' ? av.w : 0 } });
      ADM.toast(`下部バーの幅を ${w2}px にしました`);
    } else {
      ADM.toast('この置き場所では、サイドバーの位置や大きさを手動で調整してください', 'warn');
    }
  }

  function thumb(c) {
    const r = OV.containerRect(c || {});
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `0 0 ${OV.W / 10} ${OV.H / 10}`);
    if (OV.canvas === 'v') svg.style.maxHeight = '120px';
    svg.innerHTML = `<rect width="${OV.W / 10}" height="${OV.H / 10}" fill="#5c94fc"/><rect x="${r.x / 10}" y="${r.y / 10}" width="${r.w / 10}" height="${r.h / 10}" fill="#000" stroke="#fff" stroke-width="1.2"/>`;
    return svg;
  }

  // 縦画面:ゲーム映像を置く場所(OBS でゲーム映像をここに合わせる)。背景を「画面全体」にしたときは、ここが抜かれる
  function gameAreaSection() {
    const G = () => ((OV.state.background || {}).game) || {};
    const setG = (patch) => ADM.send('background:update', { patch: { game: { mode: 'manual', ...patch } } });
    const gk = (k) => ({ get: () => G()[k], set: (v) => setG({ [k]: v }) });
    const RATIOS = [['16:9', '16:9'], ['4:3', '4:3'], ['3:2', '3:2'], ['1:1', '1:1']];
    const fitWidth = (ratio) => {
      const [rw, rh] = ratio.split(':').map(Number);
      const hh = Math.round((OV.W * rh) / rw);
      setG({ ratio, x: 0, w: OV.W, h: hh });
      ADM.toast(`ゲーム映像を 横幅いっぱい ${OV.W}×${hh} にしました`);
    };
    return h('div', null,
      h('h3', { class: 'h' }, 'ゲーム映像の場所(縦画面)'),
      h('p', { class: 'hint' }, 'プレビューのダミー映像の場所です。OBS では、ゲーム映像のソースをこの位置・大きさに合わせてください。背景タブで背景を「画面全体」にすると、この部分が抜かれ、枠線も付けられます。'),
      h('div', { class: 'row', style: { flexWrap: 'wrap' } }, h('span', { class: 'f-l' }, '横幅いっぱい'), ...RATIOS.map(([r, l]) => UI.button(l, () => fitWidth(r), 'small'))),
      UI.num({ label: 'X', min: 0, max: OV.W, step: 2, unit: 'px', ...gk('x') }),
      UI.num({ label: 'Y', min: 0, max: OV.H, step: 2, unit: 'px', ...gk('y') }),
      UI.num({ label: '幅', min: 100, max: OV.W, step: 2, unit: 'px', ...gk('w') }),
      UI.num({ label: '高さ', min: 100, max: OV.H, step: 2, unit: 'px', ...gk('h') }),
      h('h3', { class: 'h' }, '縦型の初期配置'),
      h('p', { class: 'hint' }, '左上にロゴ、右に目的と今日の目標、その下にゲーム映像、横型配信のコメント、縦型配信のコメント用の空き(右下はアバター用)の並びに戻します。今の縦画面のパネルは置き換わります(横画面は変わりません)。'),
      h('div', { class: 'row' }, UI.button('縦型の初期配置に戻す', () => {
        if (!confirm('縦画面のパネルを、初期の配置に戻しますか?(今の縦画面のパネルは置き換わります)')) return;
        ADM.send('panels:resetAll', {});
        ADM.send('layout:apply', { id: 'vFree' });
        setG({ ratio: '16:9', x: 0, y: 282, w: OV.W, h: 608 });
      }, 'small danger')));
  }

  ADM.registerTab({
    id: 'layout',
    label: 'レイアウト',
    order: 40,
    sig: () => JSON.stringify([(OV.state.layoutPresets || []).map((p) => [p.id, p.name]), OV.catalogs.layouts && OV.catalogs.layouts.map((l) => l.id)]),
    build(root) {
      const grid = h('div', { class: 'lay-grid' });
      const all = [...(OV.catalogs.layouts || []).filter((l) => (l.canvas || 'h') === OV.canvas), ...(OV.state.layoutPresets || [])];
      const btns = all.map((l) => {
        const b = h('button', { type: 'button', class: 'lay-btn', onclick: () => ADM.send('layout:apply', { id: l.id }) }, thumb(l.container), h('span', null, l.name));
        if (l.arrangement) {
          const x = h('span', { class: 'muted', title: '削除' }, '削除');
          x.addEventListener('click', (e) => { e.stopPropagation(); if (confirm(`レイアウト「${l.name}」を削除しますか?`)) ADM.send('layout:remove', { id: l.id }); });
          b.append(x);
        }
        b.dataset.id = l.id;
        grid.append(b);
        return b;
      });
      UI.bind(grid, () => btns.forEach((b) => b.classList.toggle('on', b.dataset.id === LAY().activeId)));
      const nameIn = h('input', { type: 'text', placeholder: '例:FPS用', style: { flex: 1 } });
      root.append(
        h('h3', { class: 'h' }, OV.canvas === 'v' ? 'レイアウト(縦画面・クリックで切り替え)' : 'レイアウト(クリックで切り替え)'), grid,
        h('div', { class: 'row', style: { marginTop: '8px' } }, nameIn,
          UI.button('今の配置を保存', () => { ADM.send('layout:save', { name: nameIn.value }); nameIn.value = ''; }, 'primary')),
        h('p', { class: 'hint' }, '保存すると、サイドバーの設定と各パネルの並び・サイズ・表示状態がまとめて記録されます。'));

      const note = h('div', { class: 'note-box' });
      const updNote = () => {
        const s = ADM.preview ? ADM.preview.renderer.containerScale : 1;
        note.style.display = s < 0.999 ? '' : 'none';
        note.textContent = `パネルがサイドバーに収まらないため、サイドバー内の文字を ${Math.round(s * 100)}% に縮小しています。パネルを減らす・隠す、または高さを広げると元の大きさに戻ります。`;
      };
      ADM.on('fit', updNote);
      UI.bind(note, updNote);

      const dockSet = (v) => {
        const patch = { dock: v };
        if (v === 'bottom' || v === 'top') patch.direction = 'row';
        if (v === 'left' || v === 'right') patch.direction = 'column';
        ADM.patchLayout({ container: patch });
      };
      const dock = () => C().dock;
      root.append(
        h('h3', { class: 'h' }, 'サイドバー'), note,
        UI.toggle({ label: 'サイドバーを表示', get: () => C().enabled !== false, set: (v) => ADM.patchLayout({ container: { enabled: v } }) }),
        UI.select({ label: '置き場所', options: [['right', '右端'], ['left', '左端'], ['bottom', '下端'], ['top', '上端'], ['free', '自由(X・Y指定)']], get: dock, set: dockSet }),
        UI.seg({ label: '並べ方', options: [['column', '縦に積む'], ['row', '横に並べる']], ...ck('direction') }),
        UI.when(() => ['bottom', 'top', 'free'].includes(dock()), UI.num({ label: 'X', min: 0, max: OV.W, step: 1, unit: 'px', ...ck('x') })),
        UI.when(() => ['left', 'right', 'free'].includes(dock()), UI.num({ label: 'Y', min: 0, max: OV.H, step: 1, unit: 'px', ...ck('y') })),
        UI.num({ label: '幅', min: 160, max: OV.W, step: 1, unit: 'px', ...ck('w') }),
        UI.num({ label: '高さ', min: 80, max: OV.H, step: 1, unit: 'px', ...ck('h') }),
        UI.num({ label: 'パネルの隙間', min: 0, max: 60, step: 1, unit: 'px', ...ck('gap') }),
        UI.num({ label: '外側の余白', min: 0, max: 80, step: 1, unit: 'px', ...ck('margin') }),
        h('p', { class: 'hint' }, 'プレビューの「サイドバー」タブをドラッグで移動、点線の辺をドラッグでサイズ変更できます(Shift で 10px 単位)。'),
        OV.canvas === 'v' ? gameAreaSection() : '',
        h('h3', { class: 'h' }, 'アバター用の空き(プレビューの目安)'),
        UI.toggle({ label: '目安の枠を表示', get: () => (LAY().avatar || {}).show !== false, set: (v) => ADM.patchLayout({ avatar: { show: v } }) }),
        UI.seg({ label: '置く場所', options: [['right', '右下'], ['left', '左下']], get: () => (LAY().avatar || {}).side || 'right', set: (v) => ADM.patchLayout({ avatar: { side: v } }) }),
        UI.num({ label: '幅', min: 100, max: 1200, step: 10, unit: 'px', get: () => (LAY().avatar || {}).w, set: (v) => ADM.patchLayout({ avatar: { w: v } }) }),
        UI.num({ label: '高さ', min: 100, max: 1000, step: 10, unit: 'px', get: () => (LAY().avatar || {}).h, set: (v) => ADM.patchLayout({ avatar: { h: v } }) }),
        h('div', { class: 'row' }, UI.button('アバターに被らないようサイドバーを調整', avoidAvatar, 'primary small')),
        h('p', { class: 'hint' }, '枠はプレビューにだけ表示され、OBS のオーバーレイには出ません。実際のアバターの大きさに合わせてください。サイドバーと重なると赤くなります。調整後も入りきらない分は、文字が自動で縮小されます。'),
        h('h3', { class: 'h' }, '全体スケール(すべての文字サイズ)'),
        UI.num({ label: '倍率', min: 0.8, max: 1.5, step: 0.05, unit: '倍', get: () => LAY().globalScale || 1, set: setScale }));
    },
  });
})();
