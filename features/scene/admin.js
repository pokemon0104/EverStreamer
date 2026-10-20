/* 場面タブと、上部バーの場面ボタン(Alt + 1〜4 でも切り替え) */
(function () {
  'use strict';
  const { h } = UI;
  const SC = () => OV.raw.scene || {};
  const LABELS = [['live', '配信中'], ['starting', '開始待機'], ['brb', '休憩'], ['ending', '終了']];
  const setScene = (id, extra) => ADM.send('scene:set', { id, ...(extra || {}) });
  const upd = (patch) => {
    OV.util.deepMerge(OV.raw.scene, OV.util.clone(patch));
    ADM.hub.send('scene:update', { patch });
    ADM.changed();
  };

  // ---- 上部バー ----
  ADM.registerTopbar({
    order: 27,
    build(root) {
      const wrap = h('span', { class: 'sc-quick' }, h('span', { class: 'tb-label' }, '🎬'));
      const btns = LABELS.map(([id, label], i) => {
        const b = h('button', { type: 'button', class: 'btn small', title: `「${label}」に切り替え(Alt + ${i + 1})`, onclick: () => setScene(id) }, label);
        b.dataset.id = id;
        wrap.append(b);
        return b;
      });
      UI.bind(wrap, () => btns.forEach((b) => b.classList.toggle('on', b.dataset.id === (SC().current || 'live'))));
      root.append(wrap);
    },
  });
  // Alt + 1〜4(管理画面を開いているとき)
  document.addEventListener('keydown', (e) => {
    if (!e.altKey || e.ctrlKey || e.metaKey) return;
    const n = Number(e.key);
    if (n >= 1 && n <= 4) { e.preventDefault(); setScene(LABELS[n - 1][0]); }
  });

  // ---- 場面タブ ----
  ADM.registerTab({
    id: 'scene',
    label: '場面',
    order: 21,
    basic: true,
    sig: () => JSON.stringify([SC().token, OV.canvas, OV.catalogs.bgUploads, JSON.stringify(OV.raw.theme)]),
    build(root) {
      const k = (scene, key) => ({ get: () => (SC()[scene] || {})[key], set: (v) => upd({ [scene]: { [key]: v } }) });
      // 切り替えボタン(大きく)
      const big = h('div', { class: 'sc-big' }, ...LABELS.map(([id, label], i) => {
        const b = h('button', { type: 'button', class: 'sc-bigbtn', onclick: () => setScene(id) }, h('b', null, label), h('small', null, `Alt + ${i + 1}`));
        b.dataset.id = id;
        return b;
      }));
      UI.bind(big, () => [...big.children].forEach((b) => b.classList.toggle('on', b.dataset.id === (SC().current || 'live'))));
      const cd = h('div', { class: 'row' },
        h('span', { class: 'f-l' }, 'カウントダウン'),
        UI.button('−1分', () => ADM.send('scene:addTime', { sec: -60 }), 'small'),
        UI.button('+1分', () => ADM.send('scene:addTime', { sec: 60 }), 'small'),
        UI.button('+5分', () => ADM.send('scene:addTime', { sec: 300 }), 'small'));
      // プレビューだけで見る
      const local = UI.seg({
        label: 'プレビューだけで見る',
        options: [['', 'しない'], ['starting', '開始待機'], ['brb', '休憩'], ['ending', '終了']],
        get: () => OV.sceneLocal || '',
        set: (v) => { OV.sceneLocal = v || null; if (OV.sceneRefresh) OV.sceneRefresh(); ADM.changed(); },
      });
      root.append(
        h('p', { class: 'hint' }, '配信の前・休憩中・終わりに、画面全体をテンプレートのデザインでおおいます。上部バーの 🎬 のボタンや、Alt + 1〜4 でも切り替えられます。'),
        big, cd, local,
        h('p', { class: 'hint' }, '「プレビューだけで見る」は、OBS の画面は変えずに、この管理画面のプレビューだけで場面を確認できます。'));

      // 場面ごとの背景(テンプレート / 自分の画像・動画)
      const bgPicker = (scene) => {
        const C = () => SC()[scene] || {};
        const grid = h('div', { class: 'sc-bggrid' });
        const items = [{ type: 'tpl' }, ...(OV.catalogs.bgUploads || []).map((f) => ({ type: 'upload', f }))];
        const btns = items.map((it) => {
          const sw = it.type === 'tpl' ? ADM.bgSwatch({ type: 'preset', presetId: 'tpl' }) : ADM.bgSwatch({ type: 'upload', upload: it.f, fit: 'cover' });
          const b = h('button', { type: 'button', class: 'sc-bgbtn', title: it.type === 'tpl' ? 'テンプレートの背景' : it.f, onclick: () => upd({ [scene]: it.type === 'tpl' ? { bgType: 'tpl' } : { bgType: 'upload', bgFile: it.f } }) }, sw);
          b.dataset.k = it.type === 'tpl' ? 'tpl' : it.f;
          grid.append(b);
          return b;
        });
        UI.bind(grid, () => btns.forEach((b) => b.classList.toggle('on', (C().bgType === 'upload' ? C().bgFile : 'tpl') === b.dataset.k)));
        const file = h('input', { type: 'file', multiple: true, accept: '.png,.jpg,.jpeg,.webp,.gif,.svg,.mp4,.webm,image/*,video/*', style: { display: 'none' } });
        const add = async (files) => {
          const done = ADM.bgUpload ? await ADM.bgUpload(files) : [];
          if (done.length) { upd({ [scene]: { bgType: 'upload', bgFile: done[done.length - 1] } }); ADM.toast('背景を追加しました'); }
        };
        file.addEventListener('change', () => { if (file.files.length) add(file.files); file.value = ''; });
        const drop = h('div', { class: 'dropzone', onclick: () => file.click() }, '画像・動画をドロップ、またはクリックして選択');
        drop.addEventListener('dragover', (ev) => { ev.preventDefault(); drop.classList.add('over'); });
        drop.addEventListener('dragleave', () => drop.classList.remove('over'));
        drop.addEventListener('drop', (ev) => { ev.preventDefault(); drop.classList.remove('over'); if (ev.dataTransfer.files.length) add(ev.dataTransfer.files); });
        return h('div', null,
          h('h3', { class: 'h' }, '背景'),
          grid, drop, file,
          UI.when(() => C().bgType === 'upload', UI.num({ label: '暗くする', min: 0, max: 0.9, step: 0.05, get: () => C().bgDim, set: (v) => upd({ [scene]: { bgDim: v } }) })),
          h('div', { class: 'row end' }, UI.button('この背景を、ほかの場面にも使う', () => {
            const c = C();
            const patch = {};
            for (const [id] of LABELS) if (id !== 'live') patch[id] = { bgType: c.bgType, bgFile: c.bgFile || '', bgDim: c.bgDim };
            upd(patch);
            ADM.toast('開始待機・休憩・終了の背景をそろえました');
          }, 'small')),
          h('p', { class: 'hint' }, '動画は音を出さずにくり返し再生します。自分の画像の上では、文字が白くなり、暗幕で読みやすくなります。画像・動画は「背景」タブと共通です。'));
      };

      root.append(UI.section('sc-start', '開始待機',
        UI.text({ label: '上の小さな文字', ...k('starting', 'kicker') }),
        UI.text({ label: 'タイトル', ...k('starting', 'title') }),
        UI.text({ label: '説明', ...k('starting', 'sub') }),
        UI.toggle({ label: 'カウントダウンを表示する', ...k('starting', 'countdown') }),
        UI.num({ label: 'カウントダウン', min: 0, max: 60, step: 1, unit: '分', ...k('starting', 'minutes') }),
        UI.text({ label: '0 になったときの文字', ...k('starting', 'doneText') }),
        UI.toggle({ label: '0 になったら自動で「配信中」に切り替える', ...k('starting', 'autoLive') }),
        bgPicker('starting')));
      root.append(UI.section('sc-brb', '休憩',
        UI.text({ label: '上の小さな文字', ...k('brb', 'kicker') }),
        UI.text({ label: 'タイトル', ...k('brb', 'title') }),
        UI.text({ label: '説明', ...k('brb', 'sub') }),
        UI.toggle({ label: 'カウントダウンを表示する', ...k('brb', 'countdown') }),
        UI.num({ label: 'カウントダウン', min: 0, max: 60, step: 1, unit: '分', ...k('brb', 'minutes') }),
        bgPicker('brb')));
      root.append(UI.section('sc-end', '終了',
        UI.text({ label: '上の小さな文字', ...k('ending', 'kicker') }),
        UI.text({ label: 'タイトル', ...k('ending', 'title') }),
        UI.text({ label: '説明', ...k('ending', 'sub') }),
        UI.text({ label: '次回の予告', placeholder: '例:次回は土曜 21:00〜', ...k('ending', 'next') }),
        bgPicker('ending')));
      const gk = (key) => ({ get: () => SC()[key], set: (v) => upd({ [key]: v }) });
      root.append(UI.section('sc-common', '共通',
        UI.toggle({ label: 'ゲーム名(ロゴ)を表示', get: () => SC().showGame !== false, set: (v) => upd({ showGame: v }) }),
        UI.toggle({ label: '名前とSNSを表示', get: () => SC().showSocial !== false, set: (v) => upd({ showSocial: v }) }),
        UI.select({ label: '背景の動き', options: [['auto', 'テンプレートに合わせる'], ['orbs', '光の玉'], ['grid', '奥へ流れるグリッド'], ['particles', '光の粒が昇る'], ['waves', '波'], ['lines', '斜めの光の線'], ['none', 'なし']], ...gk('fx') }),
        UI.num({ label: '切り替えのフェード', min: 0, max: 3000, step: 100, unit: 'ms', ...gk('fadeMs') })));

      // 呼び出しURL
      const base = `${location.origin}/api/scene?token=${SC().token}`;
      root.append(UI.section('sc-url', '呼び出しURL(Stream Deck など)',
        h('p', { class: 'hint' }, 'このURLを開くと、場面が切り替わります。このPCの中からだけ使えます。min= でカウントダウンの分数も決められます。'),
        ...LABELS.map(([id, label]) => h('div', { class: 'f' }, h('span', { class: 'f-l' }, label), h('input', { type: 'text', readonly: true, value: `${base}&to=${id}${id === 'starting' ? '&min=5' : ''}`, class: 'url-in' }))),
        h('div', { class: 'row end' }, UI.button('呼び出しURLを作り直す', () => { if (confirm('今のURLは使えなくなります。作り直しますか?')) ADM.send('scene:newToken'); }, 'small danger'))));
    },
  });
})();
