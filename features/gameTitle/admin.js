/* ゲームタブ(タイトル・おまかせ・ロゴ・使用ハード・ゲームプロファイル)と、ゲームタイトルパネルの表示設定 */
(function () {
  'use strict';
  const { h } = UI;
  const G = () => OV.state.game || {};
  const gk = (k) => ({ get: () => G()[k], set: (v) => ADM.patchGame({ [k]: v }) });

  async function upload(file, onDone) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (!['png', 'webp', 'svg'].includes(ext)) { ADM.toast(`${file.name}: PNG / WebP / SVG の画像を選んでください`, 'warn'); return ''; }
    try {
      const r = await fetch('/api/logos', {
        method: 'POST',
        headers: { 'X-Filename': encodeURIComponent(file.name), 'Content-Type': 'application/octet-stream' },
        body: file,
      });
      const j = await r.json();
      if (!r.ok) { ADM.toast(`${file.name}: ${j.error || 'アップロードできませんでした'}`, 'error'); return ''; }
      if (onDone) onDone(j.file);
      return j.file;
    } catch (e) {
      ADM.toast(`アップロードできませんでした: ${e.message}`, 'error');
      return '';
    }
  }
  // 複数のロゴをまとめて登録する(最後の1枚を、いまのゲームのロゴにする)
  async function uploadMany(files) {
    let last = '';
    let n = 0;
    for (const f of [...files]) { const r = await upload(f); if (r) { last = r; n++; } }
    if (!last) return;
    ADM.patchGame({ logo: last, method: 'logo' });
    ADM.toast(n > 1 ? `ロゴを ${n} 枚追加しました。一覧から選んで切り替えられます` : 'ロゴを追加しました');
  }

  // 上部バー:ゲームの切り替え(タイトル・ロゴ・背景・目的・あらすじが、まとめて切り替わる)
  ADM.registerTopbar({
    order: 8,
    build(root) {
      const sel = h('select', { class: 'tb-game', title: 'ゲームプロファイルを切り替えます(タイトル・ロゴ・目的・あらすじと、パネル・レイアウト・背景・ゲーム枠などの画面の設定が、まとめて切り替わります)' });
      sel.addEventListener('change', () => { if (sel.value) ADM.send('game:loadProfile', { id: sel.value }); });
      UI.bind(sel, () => {
        const profs = OV.state.gameProfiles || [];
        const key = JSON.stringify(profs.map((p) => [p.id, p.name]));
        if (sel.dataset.key !== key) {
          sel.dataset.key = key;
          sel.innerHTML = '';
          sel.append(h('option', { value: '' }, '(プロファイルなし)'), ...profs.map((p) => h('option', { value: p.id }, p.name)));
        }
        if (document.activeElement !== sel) sel.value = (OV.state.game || {}).profileId || '';
      });
      root.append(h('span', { class: 'tb-label' }, 'ゲーム'), sel);
    },
  });

  ADM.registerTab({
    id: 'game',
    label: 'ゲーム',
    order: 20,
    sig: () => JSON.stringify([
      (OV.state.gameProfiles || []).map((p) => [p.id, p.name]), G().profileId,
      OV.catalogs.logos,
      (OV.catalogs.looks || []).map((l) => l.id), JSON.stringify(OV.raw.theme), (OV.catalogs.templates || []).length,
      ['panels', 'vPanels'].map((k) => (OV.raw[k] || []).filter((p) => ADM.isGoalLike && ADM.isGoalLike(p)).map((p) => [p.id, p.name, p.type, OV.richKind ? OV.richKind(p.data) : ''])),
    ]),
    build(root) {
      // --- プロファイル
      const profs = OV.state.gameProfiles || [];
      const list = h('div', { class: 'prof-list' });
      for (const p of profs) {
        list.append(h('div', { class: `prof${G().profileId === p.id ? ' on' : ''}` },
          h('span', { class: 'pn', title: 'クリックでこのゲームに切り替え', onclick: () => ADM.send('game:loadProfile', { id: p.id }) }, p.name),
          h('span', { class: 'ph' },
            UI.button('上書き', () => ADM.send('game:saveProfile', { overwriteId: p.id }), 'small'),
            UI.button('×', () => { if (confirm(`プロファイル「${p.name}」を削除しますか?`)) ADM.send('game:deleteProfile', { id: p.id }); }, 'small danger'))));
      }
      const nameIn = h('input', { type: 'text', placeholder: '例:ゲーム名', style: { flex: 1 } });
      root.append(
        h('h3', { class: 'h' }, 'ゲームプロファイル(クリックで切り替え)'),
        profs.length ? list : h('p', { class: 'hint' }, 'まだありません。下で今の設定に名前を付けて保存できます。'),
        h('div', { class: 'row', style: { marginTop: '6px' } }, nameIn,
          UI.button('今の設定を保存', () => { ADM.send('game:saveProfile', { name: nameIn.value }); nameIn.value = ''; }, 'primary')),
        h('p', { class: 'hint' }, 'タイトル・表示方式・見た目・ロゴと、「ゲーム全体の目的」「今日の目標」がまとめて保存されます。目的・目標は書き換えると、選んでいるプロファイルにも自動で保存されます。'),
        UI.toggle({ label: 'ゲームごとに画面の設定を分ける(OBS のシーンのように)', get: () => G().sceneLink !== false, set: (v) => ADM.patchGame({ sceneLink: v }) }),
        (() => {
          const note = h('p', { class: 'hint' });
          return UI.bind(note, () => {
            note.textContent = G().sceneLink === false
              ? 'オフのときは、パネル・サイドバー・演出などの設定は、すべてのゲームで共通です(背景・ゲーム枠は、それぞれのタブの設定に従います)。'
              : 'パネル(文字の大きさ・スタイル・表示/非表示・位置)、サイドバーの大きさ、背景、ゲーム枠、演出、あらすじの出し方を、ゲームごとに別々に持ちます(横画面・縦画面とも)。ゲームを切り替えると、まるごと切り替わります。初めて切り替えたゲームは、それまでの画面を引き継ぎます。YouTube 連携・経過時間・お祝い・感謝メッセージは、すべてのゲームで共通です。';
          });
        })());

      // --- 目的と目標(横画面・縦画面で共通)
      if (ADM.richEditor) {
        root.append(h('h3', { class: 'h' }, '目的と目標(横画面・縦画面で共通)'),
          h('p', { class: 'hint' }, 'ここで書いた内容は、横画面・縦画面の「ゲーム全体の目的」「今日の目標」パネルすべてに表示されます。'));
        const ed = (kind, label) => {
          const [tk, lk] = OV.RICH_KEYS[kind];
          return UI.section(`game-${kind}`, label, ADM.richEditor({
            key: `game-${kind}`,
            getTitle: () => G()[tk] || '',
            setTitle: (v) => ADM.patchGame({ [tk]: v }),
            getLines: () => G()[lk] || [],
            setLines: (arr) => ADM.patchGame({ [lk]: arr }),
          }));
        };
        root.append(
          ed('purpose', 'ゲーム全体の目的(このゲームを配信する目的)'),
          ed('goal', '今日の目標(今日どこまで進めるか・やること)'));

        // パネルの状況(横・縦)と、連動ボタン
        const rows = h('div', { class: 'rt-status' });
        const all = [['h', '横', OV.raw.panels || []], ['v', '縦', OV.raw.vPanels || []]];
        let n = 0;
        for (const [cv, cvName, list] of all) {
          for (const p of list.filter((x) => ADM.isGoalLike(x))) {
            n++;
            const kind = p.type === 'text' ? 'custom' : OV.richKind(p.data);
            const row = h('div', { class: 'rt-st' },
              h('span', { class: 'chip' }, cvName),
              h('span', { class: 'rt-st-n' }, p.name),
              h('span', { class: `chip${kind === 'custom' ? ' warn' : ''}` }, kind === 'custom' ? (p.type === 'text' ? '連動していない(テキスト)' : '連動していない') : ADM.RICH_KIND_NAME[kind]));
            if (kind === 'custom') {
              row.append(
                UI.button('今日の目標に連動', () => ADM.linkRichPanel(p, 'goal', cv), 'small primary'),
                UI.button('目的に連動', () => ADM.linkRichPanel(p, 'purpose', cv), 'small'));
            }
            rows.append(row);
          }
        }
        const add = (kind, name) => ADM.send('panels:add', { type: 'richText', preset: { name, data: { source: kind, linkGame: true } } });
        root.append(UI.section('game-rich-panels', '目的・目標のパネル', n ? rows : h('p', { class: 'hint' }, 'まだありません。'),
          h('p', { class: 'hint' }, '「連動していない」パネルは、その画面だけの内容です。連動すると、横・縦で同じ内容になります。'),
          h('div', { class: 'row' },
            UI.button(`この画面(${OV.canvas === 'v' ? '縦' : '横'})に「ゲーム全体の目的」を追加`, () => add('purpose', 'ゲーム全体の目的'), 'small'),
            UI.button(`この画面(${OV.canvas === 'v' ? '縦' : '横'})に「今日の目標」を追加`, () => add('goal', '今日の目標'), 'small'))));
      }

      // --- タイトル
      root.append(
        h('h3', { class: 'h' }, 'タイトル'),
        UI.text({ label: 'ゲーム名', ...gk('title') }),
        UI.seg({ label: '表示方式', options: [['text', 'A テキスト'], ['logo', 'B ロゴ画像']], ...gk('method') }));

      // 方式A
      const sample = () => (G().title || 'ゲームタイトル').slice(0, 8);
      const tl = OV.templateLook ? OV.templateLook() : null;
      const looks = [...(tl ? [tl] : []), ...(OV.catalogs.looks || [])];
      const grid = h('div', { class: 'look-grid' });
      const lbtns = looks.map((l) => {
        const b = h('button', { type: 'button', class: 'look-btn', title: l.name, onclick: () => ADM.patchGame({ lookId: l.id, method: 'text' }) },
          h('span', { class: 'lk', html: OV.titleTextHtml(sample(), l) }), h('span', { class: 'nm' }, l.name));
        b.dataset.id = l.id;
        grid.append(b);
        return b;
      });
      let lastSample = sample();
      UI.bind(grid, () => {
        lbtns.forEach((b) => b.classList.toggle('on', b.dataset.id === G().lookId));
        if (sample() !== lastSample) {
          lastSample = sample();
          lbtns.forEach((b, i) => { b.firstChild.innerHTML = OV.titleTextHtml(lastSample, looks[i]); });
        }
      });
      const omakase = UI.button('🎲 おまかせ', () => ADM.send('game:omakase'), 'primary');
      UI.bind(omakase, () => { omakase.disabled = !!G().lookLocked; });
      root.append(UI.when(() => G().method !== 'logo', h('div', null,
        h('div', { class: 'row', style: { margin: '8px 0' } }, omakase, UI.toggle({ label: 'この見た目で固定', ...gk('lookLocked') })),
        grid,
        h('p', { class: 'hint' }, '見た目の組み合わせは config/title-looks.json で追加・編集できます。'))));

      // 方式B
      const file = h('input', { type: 'file', multiple: true, accept: '.png,.webp,.svg,image/png,image/webp,image/svg+xml', style: { display: 'none' } });
      file.addEventListener('change', () => { if (file.files.length) uploadMany(file.files); file.value = ''; });
      const drop = h('div', { class: 'dropzone', onclick: () => file.click() }, 'ここに画像をドロップ、またはクリックして選択(複数まとめてOK。PNG / WebP / SVG)');
      drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
      drop.addEventListener('dragleave', () => drop.classList.remove('over'));
      drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); if (e.dataTransfer.files.length) uploadMany(e.dataTransfer.files); });
      const logos = OV.catalogs.logos || [];
      const lgrid = h('div', { class: 'logo-grid' });
      const items = logos.map((f) => {
        const x = h('button', { type: 'button', class: 'x', title: '削除' }, '×');
        x.addEventListener('click', (e) => { e.stopPropagation(); if (confirm('このロゴを削除しますか?')) ADM.send('game:deleteLogo', { file: f }); });
        const it = h('div', { class: 'logo-item', title: f, onclick: () => ADM.patchGame({ logo: f, method: 'logo' }) }, h('img', { src: `/logos/${encodeURIComponent(f)}`, alt: f }), x);
        it.dataset.f = f;
        lgrid.append(it);
        return it;
      });
      UI.bind(lgrid, () => items.forEach((it) => it.classList.toggle('on', it.dataset.f === G().logo)));
      root.append(UI.when(() => G().method === 'logo', h('div', { class: 'stack', style: { marginTop: '8px' } },
        drop, file,
        logos.length ? lgrid : h('p', { class: 'hint' }, 'アップロードしたロゴがここに並びます。'),
        logos.length ? h('p', { class: 'hint' }, `登録済み ${logos.length} 枚。クリックで、いまのゲームのロゴに切り替わります(× で削除)。ゲームプロファイルに自動で保存されるので、ゲームを切り替えるとロゴも切り替わります。`) : '',
        UI.toggle({ label: 'ドロップシャドウ', ...gk('logoShadow') }),
        UI.toggle({ label: 'グロー', ...gk('logoGlow') }),
        UI.when(() => G().logoGlow, UI.color({ label: 'グローの色', ...gk('logoGlowColor') })))));

      root.append(
        h('div', { class: 'row', style: { marginTop: '10px' } }, UI.button('ゲームタイトルパネルの表示設定へ', () => {
          const p = (OV.state.panels || []).find((x) => x.type === 'gameTitle');
          if (p) ADM.select(p.id);
        })));
    },
  });

  ADM.registerInspector('gameTitle', {
    title: '表示内容',
    build(root, id) {
      const D = () => (ADM.panel(id) || {}).data || {};
      const dk = (k) => ({ get: () => D()[k], set: (v) => ADM.patchPanel(id, { data: { [k]: v } }) });
      root.append(
        UI.text({ label: 'ゲーム名', ...gk('title') }),
        h('div', { class: 'row', style: { margin: '4px 0 8px' } },
          UI.button('🎲 おまかせ', () => ADM.send('game:omakase'), 'small'),
          UI.button('方式・ロゴ・プロファイル', () => ADM.showTab('game'), 'small')),
        UI.toggle({ label: '配信中バッジ(LIVE)を表示', ...dk('showLive') }),
        UI.when(() => D().showLive, h('div', null,
          UI.text({ label: '配信中の文字', ...dk('liveText') }),
          UI.text({ label: '停止中の文字', ...dk('offText') }))),
        UI.toggle({ label: '経過時間を表示', ...dk('showTimer') }),
        UI.seg({ label: 'タイトルの揃え', options: [['left', '左'], ['center', '中央']], ...dk('align') }),
        UI.num({ label: 'ロゴの最大高さ', min: 30, max: 300, step: 1, unit: 'px', ...dk('logoMaxHeight') }),
        UI.toggle({ label: 'タイトルが変わったらきらっと光る', get: () => D().shineOnChange !== false, set: (v) => ADM.patchPanel(id, { data: { shineOnChange: v } }) }),
        h('p', { class: 'hint' }, 'タイトルが長いときは、1行に収まるよう自動で縮小されます。'),
      );
    },
  });

  ADM.uploadLogo = upload;

  // ---- ゲームロゴのパネル ----
  ADM.registerInspector('gameLogo', {
    title: 'ゲームロゴの内容',
    sig: () => JSON.stringify(OV.catalogs.logos || []),
    build(root, id) {
      const D = () => (ADM.panel(id) || {}).data || {};
      const setD = (k) => (v) => ADM.patchPanel(id, { data: { [k]: v } });
      const dk = (k) => ({ get: () => D()[k], set: setD(k) });
      const fileIn = h('input', { type: 'file', accept: '.png,.webp,.svg', style: { display: 'none' } });
      fileIn.addEventListener('change', () => {
        const f = fileIn.files[0];
        fileIn.value = '';
        if (!f) return;
        // 「選んでいるゲームのロゴ」なら、ゲームのロゴとして登録(プロファイルに保存できる)
        upload(f, (file) => (D().source === 'file' ? ADM.patchPanel(id, { data: { file } }) : ADM.patchGame({ logo: file })));
      });
      const grid = h('div', { class: 'logo-grid' });
      const cur = () => (D().source === 'file' ? D().file : (OV.state.game || {}).logo);
      const items = (OV.catalogs.logos || []).map((f) => {
        const it = h('div', { class: 'logo-item', title: f, onclick: () => (D().source === 'file' ? ADM.patchPanel(id, { data: { file: f } }) : ADM.patchGame({ logo: f })) }, h('img', { src: `/logos/${encodeURIComponent(f)}`, alt: f }));
        it.dataset.f = f;
        grid.append(it);
        return it;
      });
      UI.bind(grid, () => items.forEach((it) => it.classList.toggle('on', it.dataset.f === cur())));
      root.append(
        UI.seg({ label: '表示するロゴ', options: [['game', '選んでいるゲームのロゴ'], ['file', '決まったロゴ']], get: () => D().source || 'game', set: setD('source') }),
        h('p', { class: 'hint' }, '「選んでいるゲームのロゴ」は、ゲームタブのロゴと同じです。ゲームプロファイルを切り替えると、ロゴも一緒に切り替わります。'),
        h('div', { class: 'row' }, UI.button('ロゴをアップロード', () => fileIn.click(), 'primary small'), fileIn,
          UI.button('ロゴを外す', () => (D().source === 'file' ? ADM.patchPanel(id, { data: { file: '' } }) : ADM.patchGame({ logo: '' })), 'small')),
        grid.children.length ? grid : h('p', { class: 'hint' }, 'まだロゴがありません。PNG / WebP / SVG(透過OK)をアップロードしてください。'),
        UI.seg({ label: 'ロゴがないとき', options: [['title', 'タイトル文字を表示'], ['none', '何も出さない']], get: () => D().fallback || 'title', set: setD('fallback') }),
        UI.seg({ label: '横の位置', options: [['left', '左'], ['center', '中央'], ['right', '右']], get: () => D().align || 'center', set: setD('align') }),
        UI.seg({ label: '縦の位置', options: [['top', '上'], ['center', '中央'], ['bottom', '下']], get: () => D().valign || 'center', set: setD('valign') }),
        UI.toggle({ label: '影を付ける', get: () => D().shadow !== false, set: setD('shadow') }),
        UI.toggle({ label: '光らせる(グロー)', ...dk('glow') }),
        UI.when(() => D().glow, UI.color({ label: 'グローの色', ...dk('glowColor') })),
        UI.toggle({ label: 'ロゴが変わったら、きらっと光らせる', get: () => D().shineOnChange !== false, set: setD('shineOnChange') }),
        h('p', { class: 'hint' }, 'ロゴは、パネルの枠いっぱいに縦横比を保って表示されます。大きさは「配置とサイズ」の幅・高さで決めます。'));
    },
  });
})();
