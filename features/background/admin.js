/* 背景タブ */
(function () {
  'use strict';
  const { h } = UI;
  const B = () => OV.state.background || {};
  const bk = (k) => ({ get: () => B()[k], set: (v) => ADM.send('background:update', { patch: { [k]: v } }) });
  const gk = (k) => ({ get: () => (B().game || {})[k], set: (v) => ADM.send('background:update', { patch: { game: { [k]: v } } }) });

  /** 画像・動画を1つ以上アップロードして、保存したファイル名の一覧を返す(場面・クイック設定からも使う) */
  ADM.bgUpload = async function (files) {
    const list = [...files].filter((f) => ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'mp4', 'webm'].includes((f.name.split('.').pop() || '').toLowerCase()));
    if (!list.length) { ADM.toast('PNG / JPG / WebP / GIF / SVG の画像か、MP4 / WebM の動画を選んでください', 'warn'); return []; }
    const done = [];
    for (const file of list) {
      try {
        const r = await fetch('/api/backgrounds', { method: 'POST', headers: { 'X-Filename': encodeURIComponent(file.name), 'Content-Type': 'application/octet-stream' }, body: file });
        const j = await r.json();
        if (!r.ok) { ADM.toast(`${file.name}: ${j.error || 'アップロードできませんでした'}`, 'error'); continue; }
        done.push(j.file);
      } catch (e) { ADM.toast(`${file.name}: アップロードできませんでした(${e.message})`, 'error'); }
    }
    return done;
  };
  /** 背景の見本(画像は縮小表示、動画は先頭のコマ) */
  ADM.bgSwatch = function (cfg, cls = 'bg-sw') {
    const el = h('div', { class: cls });
    Object.assign(el.style, OV.bgStyle(cfg));
    if (cfg.type === 'upload' && OV.isVideoFile(cfg.upload)) {
      const v = h('video', { class: 'bg-sw-video', src: `/bg-uploads/${encodeURIComponent(cfg.upload)}#t=0.5`, muted: true, preload: 'metadata' });
      v.muted = true;
      el.append(v, h('span', { class: 'bg-sw-badge' }, '▶'));
    }
    return el;
  };
  // 画像を1枚以上アップロードする(最後の1枚を背景にする)
  async function upload(files) {
    const list = await ADM.bgUpload(files);
    const last = list[list.length - 1] || '';
    if (!last) return;
    ADM.send('background:update', { patch: { type: 'upload', upload: last, enabled: true } });
    ADM.toast(list.length > 1 ? `背景を ${list.length} 枚追加しました。一覧から選んで切り替えられます` : '背景を追加しました');
  }

  function swatch(cfg) {
    return ADM.bgSwatch(cfg);
  }

  ADM.registerTab({
    id: 'background',
    label: '背景',
    order: 45,
    sig: () => JSON.stringify([JSON.stringify(OV.raw.theme), OV.catalogs.bgUploads, (OV.catalogs.bgPresets || []).length, B().type]),
    build(root) {
      const profNote = h('p', { class: 'hint' });
      UI.bind(profNote, () => {
        const g = OV.state.game || {};
        const prof = (OV.state.gameProfiles || []).find((x) => x.id === g.profileId);
        profNote.textContent = B().linkGame === false ? 'オフのときは、ゲームを切り替えても背景は変わりません。'
          : prof ? `いま選んだ背景は、ゲーム「${prof.name}」の背景として保存されます(${OV.canvas === 'v' ? '縦画面' : '横画面'})。ゲームタブや上部バーでゲームを切り替えると、そのゲームの背景に切り替わります。`
            : 'ゲームタブでゲームプロファイルを選ぶ(または保存する)と、背景もゲームごとに保存・切り替えできます。';
      });
      const gameInfo = h('div', { class: 'note-box' });
      UI.bind(gameInfo, () => {
        const r = OV.gameWindowRect ? OV.gameWindowRect(OV.state) : null;
        gameInfo.style.display = B().target === 'full' && r ? '' : 'none';
        if (r) gameInfo.textContent = `OBS のゲーム映像を、左 ${r.x}px・上 ${r.y}px、幅 ${r.w}px × 高さ ${r.h}px の位置に置くと、枠の中にぴったり収まります。`;
      });
      root.append(
        UI.toggle({ label: '背景を表示する', ...bk('enabled') }),
        UI.toggle({ label: 'ゲームごとに背景を切り替える(ゲームプロファイルと連動)', get: () => B().linkGame !== false, set: (v) => ADM.send('background:update', { patch: { linkGame: v } }) }),
        profNote,
        UI.seg({ label: '背景の場所', options: [['sidebar', 'サイドバーの後ろ'], ['full', '画面全体(ゲーム映像の枠を抜く)']], get: () => B().target || 'sidebar', set: (v) => ADM.send('background:update', { patch: { target: v } }) }),
        h('p', { class: 'hint' }, '「画面全体」では、ゲーム映像を表示する場所だけを透明にして、まわりに背景を表示します。OBS では、背景(このオーバーレイ)をゲーム映像より上に置きます。'),
        gameInfo,
        UI.seg({ label: '種類', options: [['preset', 'プリセット'], ['color', '単色'], ['gradient', 'グラデーション'], ['upload', '自分の画像・動画']], get: () => B().type || 'preset', set: (v) => ADM.send('background:update', { patch: { type: v } }) }));

      // プリセット
      const presets = [{ id: 'tpl', group: 'テンプレート', name: 'テンプレートの背景' }, ...(OV.catalogs.bgPresets || [])];
      const wrap = h('div');
      const groups = [...new Set(presets.map((p) => p.group || 'その他'))];
      const btns = [];
      for (const g of groups) {
        wrap.append(h('h3', { class: 'h' }, g));
        const grid = h('div', { class: 'bg-grid' });
        presets.filter((p) => (p.group || 'その他') === g).forEach((p) => {
          const b = h('button', { type: 'button', class: 'bg-btn', title: p.name, onclick: () => ADM.send('background:update', { patch: { type: 'preset', presetId: p.id, enabled: true } }) }, swatch({ type: 'preset', presetId: p.id, fit: 'cover' }), h('span', { class: 'nm' }, p.name));
          b.dataset.id = p.id;
          btns.push(b);
          grid.append(b);
        });
        wrap.append(grid);
      }
      UI.bind(wrap, () => btns.forEach((b) => b.classList.toggle('on', B().type === 'preset' && b.dataset.id === B().presetId)));
      root.append(UI.when(() => (B().type || 'preset') === 'preset', h('div', null, wrap, h('p', { class: 'hint' }, 'プリセットは config/backgrounds.json で追加・編集できます。'))));

      // 単色・グラデーション
      root.append(UI.when(() => B().type === 'color', UI.color({ label: '色', ...bk('color') })));
      root.append(UI.when(() => B().type === 'gradient', h('div', null,
        UI.color({ label: '色1(上)', ...bk('color') }),
        UI.color({ label: '色2(下)', ...bk('color2') }),
        UI.num({ label: '角度', min: 0, max: 360, step: 5, unit: '度', ...bk('angle') }))));

      // アップロード
      const file = h('input', { type: 'file', multiple: true, accept: '.png,.jpg,.jpeg,.webp,.gif,.svg,.mp4,.webm,image/*,video/*', style: { display: 'none' } });
      file.addEventListener('change', () => { if (file.files.length) upload(file.files); file.value = ''; });
      const drop = h('div', { class: 'dropzone', onclick: () => file.click() }, 'ここに画像・動画をドロップ、またはクリックして選択(複数まとめてOK。画像は PNG / JPG / WebP / GIF / SVG で25MBまで、動画は MP4 / WebM で300MBまで)');
      drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('over'));
      drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files.length) upload(e.dataTransfer.files); });
      const ups = OV.catalogs.bgUploads || [];
      const ug = h('div', { class: 'bg-grid' });
      const ubtns = ups.map((f) => {
        const x = h('button', { type: 'button', class: 'x', title: '削除' }, '×');
        x.addEventListener('click', (e) => { e.stopPropagation(); if (confirm('この画像を削除しますか?')) ADM.send('background:deleteUpload', { file: f }); });
        const b = h('div', { class: 'bg-btn', title: f, onclick: () => ADM.send('background:update', { patch: { type: 'upload', upload: f, enabled: true } }) }, swatch({ type: 'upload', upload: f, fit: 'cover' }), x);
        b.dataset.f = f;
        ug.append(b);
        return b;
      });
      UI.bind(ug, () => ubtns.forEach((b) => b.classList.toggle('on', B().type === 'upload' && b.dataset.f === B().upload)));
      root.append(UI.when(() => B().type === 'upload', h('div', { class: 'stack', style: { marginTop: '8px' } }, drop, file,
        ups.length ? ug : h('p', { class: 'hint' }, 'アップロードした画像がここに並びます。'),
        ups.length ? h('p', { class: 'hint' }, `登録済み ${ups.length} 枚。クリックで切り替え、× で削除できます。`) : '')));

      // 画像の表示
      root.append(UI.when(() => (B().type === 'upload') || (B().type === 'preset' && ((presets.find((p) => p.id === B().presetId) || {}).kind === 'image')), h('div', null,
        h('h3', { class: 'h' }, '画像の表示'),
        UI.seg({ label: '合わせ方', options: [['cover', '全面に広げる'], ['contain', '全体を収める'], ['tile', '並べる']], get: () => B().fit || 'cover', set: (v) => ADM.send('background:update', { patch: { fit: v } }) }),
        UI.when(() => B().fit === 'tile', UI.num({ label: '1枚の幅', min: 32, max: 1920, step: 16, unit: 'px', ...bk('tileSize') })))));

      // 共通の調整
      root.append(
        h('h3', { class: 'h' }, '調整'),
        UI.num({ label: '暗くする', min: 0, max: 0.9, step: 0.05, ...bk('dim') }),
        UI.num({ label: '不透明度', min: 0, max: 1, step: 0.05, ...bk('opacity') }),
        h('p', { class: 'hint' }, '背景が明るすぎて文字が読みにくいときは、「暗くする」を上げてください。'));

      // ゲーム映像の場所(画面全体)
      root.append(UI.when(() => B().target === 'full', h('div', null,
        h('h3', { class: 'h' }, 'ゲーム映像の場所(抜く部分)'),
        UI.seg({ label: '決め方', options: [['auto', '自動'], ['manual', '数値で指定']], get: () => (B().game || {}).mode || 'auto', set: (v) => ADM.send('background:update', { patch: { game: { mode: v } } }) }),
        UI.when(() => (B().game || {}).mode !== 'manual', h('div', null,
          UI.seg({ label: '縦横比', options: [['16:9', '16:9'], ['21:9', '21:9'], ['4:3', '4:3'], ['3:2', '3:2'], ['1:1', '1:1']], get: () => (B().game || {}).ratio || '16:9', set: (v) => ADM.send('background:update', { patch: { game: { ratio: v } } }) }),
          UI.num({ label: 'まわりの余白', min: 0, max: 200, step: 2, unit: 'px', ...gk('margin') }))),
        UI.when(() => (B().game || {}).mode === 'manual', h('div', null,
          UI.num({ label: 'X', min: 0, max: OV.W, step: 2, unit: 'px', ...gk('x') }),
          UI.num({ label: 'Y', min: 0, max: OV.H, step: 2, unit: 'px', ...gk('y') }),
          UI.num({ label: '幅', min: 100, max: OV.W, step: 2, unit: 'px', ...gk('w') }),
          UI.num({ label: '高さ', min: 100, max: OV.H, step: 2, unit: 'px', ...gk('h') }))),
        UI.seg({ label: '枠線', options: [['solid', '実線'], ['double', '二重線'], ['none', 'なし']], get: () => (B().game || {}).borderStyle || 'solid', set: (v) => ADM.send('background:update', { patch: { game: { borderStyle: v } } }) }),
        UI.num({ label: '枠線の太さ', min: 0, max: 24, step: 1, unit: 'px', ...gk('borderWidth') }),
        UI.color({ label: '枠線の色', ...gk('borderColor') }),
        UI.num({ label: '角丸', min: 0, max: 60, step: 1, unit: 'px', ...gk('radius') }))));
    },
  });
})();
