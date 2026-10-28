/* コメント連動:投票・アイデア募集・カウンターの設定と、テストコメント */
(function () {
  'use strict';
  const { h } = UI;
  const { clone } = OV.util;
  const PRESETS = [['route', 'ルート選択'], ['weapon', '武器・装備'], ['abcd', 'A〜D 選択'], ['yesno', 'はい / いいえ']];
  const STATE = (id) => (OV.state.ctState || {})[id] || { votes: {}, ideas: [] };

  function help(text) { return h('p', { class: 'hint' }, text); }

  // ---------- 投票 ----------
  ADM.registerInspector('poll', {
    title: '投票の設定',
    sig: (p) => JSON.stringify((p.data.candidates || []).map((c) => c.id)),
    build(root, id) {
      const P = () => ADM.panel(id) || {};
      const D = () => P().data || {};
      const dk = (k) => ({ get: () => D()[k], set: (v) => ADM.patchPanel(id, { data: { [k]: v } }) });
      const setCands = (arr) => ADM.patchPanel(id, { data: { candidates: arr } });
      root.append(
        UI.text({ label: 'タイトル', ...dk('title') }),
        UI.toggle({ label: '投票を受け付ける', ...dk('active') }),
        UI.seg({ label: '判定', options: [['contains', 'コメントに含まれていれば'], ['exact', '完全一致のみ']], get: () => D().match || 'contains', set: (v) => ADM.patchPanel(id, { data: { match: v } }) }),
        UI.toggle({ label: '1人1票(投票先を変えると前の票は取り消し)', get: () => D().oneVote !== false, set: (v) => ADM.patchPanel(id, { data: { oneVote: v } }) }),
        UI.num({ label: '表示する候補数', min: 1, max: 12, step: 1, ...dk('showTop') }),
        UI.toggle({ label: '票の多い順に並べる', get: () => D().sortByVotes !== false, set: (v) => ADM.patchPanel(id, { data: { sortByVotes: v } }) }),
        UI.toggle({ label: '割合(%)を表示', get: () => D().showPercent !== false, set: (v) => ADM.patchPanel(id, { data: { showPercent: v } }) }),
        UI.text({ label: '補足の文', placeholder: '例:コメントで名前を書いて投票!', ...dk('hint') }),
        h('h3', { class: 'h' }, 'プリセットから読み込む(票はリセットされます)'),
        h('div', { class: 'row' }, ...PRESETS.map(([k, l]) => UI.button(l, () => { if (confirm(`「${l}」の候補に置き換えますか?`)) ADM.send('ct:loadPreset', { id, preset: k }); }, 'small'))),
        h('h3', { class: 'h' }, '候補(カンマ区切りの言葉が投票の合図になります)'));
      (D().candidates || []).forEach((c, i) => {
        const cur = () => (D().candidates || [])[i] || {};
        const votes = h('span', { class: 'muted' });
        UI.bind(votes, () => { votes.textContent = `${STATE(id).votes[cur().id] || 0}票`; });
        root.append(h('div', { class: 'hw-card' },
          h('div', { class: 'top' }, h('span', { class: 'muted' }, `${i + 1}`), votes, h('span', { class: 'sp' }),
            UI.button('削除', () => setCands((D().candidates || []).filter((_, j) => j !== i)), 'small danger')),
          UI.text({ label: '表示名', get: () => cur().name, set: (v) => { const a = clone(D().candidates); a[i].name = v; setCands(a); } }),
          UI.text({ label: '合図の言葉', placeholder: '左,ひだり,left', get: () => (cur().aliases || []).join(','), set: (v) => { const a = clone(D().candidates); a[i].aliases = v.split(/[,、]/).map((x) => x.trim()).filter(Boolean); setCands(a); } })));
      });
      root.append(
        h('div', { class: 'row' },
          UI.button('+ 候補を追加', () => setCands([...(D().candidates || []), { id: `c${Date.now().toString(36)}`, name: '新しい候補', aliases: [] }]), 'primary small'),
          UI.button('票をリセット', () => { if (confirm('すべての票を 0 に戻しますか?')) ADM.send('ct:resetVotes', { id }); }, 'small danger')),
        help('取得を始める前の古いコメントは集計しません。テストは「コメント連動」タブのテストコメントで行えます。'));
    },
  });

  // ---------- アイデア募集 ----------
  ADM.registerInspector('ideas', {
    title: 'アイデア募集の設定',
    sig: (p) => `${(STATE(p.id).ideas || []).map((x) => x.id).join(',')}`,
    build(root, id) {
      const D = () => (ADM.panel(id) || {}).data || {};
      const dk = (k) => ({ get: () => D()[k], set: (v) => ADM.patchPanel(id, { data: { [k]: v } }) });
      root.append(
        UI.text({ label: 'タイトル', ...dk('title') }),
        UI.toggle({ label: '募集を受け付ける', ...dk('active') }),
        UI.text({ label: '募集の合言葉', placeholder: '例:#案(空欄なら全部のコメント)', ...dk('prefix') }),
        UI.num({ label: '最大の長さ', min: 5, max: 100, step: 1, unit: '文字', ...dk('maxLen') }),
        UI.num({ label: '表示する件数', min: 1, max: 12, step: 1, ...dk('showCount') }),
        UI.toggle({ label: '投稿者名を表示', get: () => D().showUser !== false, set: (v) => ADM.patchPanel(id, { data: { showUser: v } }) }),
        UI.text({ label: '補足の文', placeholder: '空欄なら自動', ...dk('hint') }),
        help('合言葉を決めておくと、普通のコメントが混ざりません(例:「#案 ボスの前に装備を変える」)。'),
        h('h3', { class: 'h' }, '集まったアイデア'));
      const list = (STATE(id).ideas || []).slice().reverse();
      if (!list.length) root.append(help('まだありません。'));
      list.slice(0, 20).forEach((it) => root.append(h('div', { class: 'plist-item' }, h('span', { class: 'nm' }, `${it.text}  (${it.user})`), UI.button('×', () => ADM.send('ct:removeIdea', { id, ideaId: it.id }), 'small danger'))));
      root.append(h('div', { class: 'row end' }, UI.button('すべて消す', () => { if (confirm('集まったアイデアをすべて消しますか?')) ADM.send('ct:clearIdeas', { id }); }, 'small danger')));
    },
  });

  // ---------- カウンター ----------
  ADM.registerInspector('counter', {
    title: 'カウンターの設定',
    sig: (p) => (p.data.counters || []).length,
    build(root, id) {
      const D = () => (ADM.panel(id) || {}).data || {};
      const dk = (k) => ({ get: () => D()[k], set: (v) => ADM.patchPanel(id, { data: { [k]: v } }) });
      root.append(
        UI.toggle({ label: 'タイトルを表示', get: () => D().showTitle !== false, set: (v) => ADM.patchPanel(id, { data: { showTitle: v } }) }),
        UI.text({ label: 'タイトル', ...dk('title') }),
        UI.seg({ label: '並べ方', options: [['row', '横'], ['column', '縦']], get: () => D().layout || 'row', set: (v) => ADM.patchPanel(id, { data: { layout: v } }) }));
      (D().counters || []).forEach((c, i) => {
        const cur = () => (D().counters || [])[i] || {};
        const val = h('input', { type: 'number', class: 'num', style: { width: '80px' }, min: 0 });
        val.addEventListener('input', () => { const v = parseInt(val.value, 10); if (!Number.isNaN(v)) ADM.send('ct:counter', { id, index: i, set: v }); });
        UI.bind(val, () => { if (document.activeElement !== val) val.value = cur().value || 0; });
        const step = (d) => () => ADM.send('ct:counter', { id, index: i, delta: d });
        root.append(h('div', { class: 'hw-card' },
          UI.text({ label: '名前', get: () => cur().name, set: (v) => { const a = clone(D().counters); a[i].name = v; ADM.patchPanel(id, { data: { counters: a } }); } }),
          h('div', { class: 'row' }, val, UI.button('−1', step(-1), 'small'), UI.button('+1', step(1), 'primary small'), UI.button('+10', step(10), 'small'),
            h('span', { style: { flex: 1 } }), UI.button('削除', () => ADM.patchPanel(id, { data: { counters: (D().counters || []).filter((_, j) => j !== i) } }), 'small danger'))));
      });
      root.append(h('div', { class: 'row' },
        UI.button('+ カウンターを追加', () => ADM.patchPanel(id, { data: { counters: [...(D().counters || []), { name: '新しいカウンター', value: 0 }] } }), 'primary small'),
        UI.button('すべて 0 に戻す', () => { if (confirm('すべてのカウンターを 0 に戻しますか?')) ADM.patchPanel(id, { data: { counters: (D().counters || []).map((c) => ({ ...c, value: 0 })) } }); }, 'small danger')),
        help('配信中に押しやすいよう、「コメント連動」タブにカウンターのボタンとStream Deck用のURLがあります。'));
    },
  });

  // ---------- タブ ----------
  ADM.registerTab({
    id: 'ct',
    label: 'コメント連動',
    order: 36,
    sig: () => `${(OV.state.panels || []).filter((p) => p.type === 'counter').map((p) => `${p.id}:${(p.data.counters || []).length}`).join(',')}|${(OV.state.ct || {}).token}`,
    build(root) {
      if (ADM.screenRow) root.append(ADM.screenRow('ct', '投票・アイデア募集・カウンターのパネル'), help('出さない画面では、これらのパネルを置いていても表示しません。コメントの集計は続けます。言葉に反応する演出は「演出」タブで切り替えます。'));
      const name = h('input', { type: 'text', value: 'テスト', style: { width: '90px' } });
      const text = h('input', { type: 'text', placeholder: '例:左 / 草 / セーブ / #案 〇〇', style: { flex: 1 } });
      const send = (count) => { ADM.send('ct:test', { name: name.value, text: text.value, count }); };
      text.addEventListener('keydown', (e) => { if (e.key === 'Enter') send(1); });
      root.append(
        h('h3', { class: 'h' }, 'テストコメント(YouTube なしで確認できます)'),
        h('div', { class: 'row' }, name, text),
        h('div', { class: 'row', style: { marginTop: '6px' } }, UI.button('送信', () => send(1), 'primary small'), UI.button('5人が送信', () => send(5), 'small'), UI.button('20人が送信', () => send(20), 'small')),
        help('送ったコメントは、投票・アイデア募集・言葉の演出・コメントの演出に、本物のコメントと同じように反映されます。'),
        h('div', { class: 'note-box' }, 'YouTube のコメントは、「取得を開始」したあとに届いたものだけが集計されます。'));

      // カウンターのボタン
      const counters = (OV.state.panels || []).filter((p) => p.type === 'counter');
      root.append(h('h3', { class: 'h' }, 'カウンター(配信中のボタン)'));
      if (!counters.length) root.append(help('カウンターのパネルがありません。「パネル」タブで種類「カウンター」を追加してください。'));
      counters.forEach((p) => (p.data.counters || []).forEach((c, i) => {
        const val = h('span', { class: 'timer-disp', style: { fontSize: '16px', minWidth: '46px' } });
        UI.bind(val, () => { const cc = ((ADM.panel(p.id) || {}).data || {}).counters || []; val.textContent = (cc[i] || {}).value || 0; });
        root.append(h('div', { class: 'plist-item' }, h('span', { class: 'nm' }, `${c.name}`), val,
          UI.button('−', () => ADM.send('ct:counter', { id: p.id, index: i, delta: -1 }), 'small'), UI.button('+1', () => ADM.send('ct:counter', { id: p.id, index: i, delta: 1 }), 'primary small')));
      }));

      // Stream Deck 用 URL
      const base = `${location.origin}/api/counter`;
      const tok = (OV.state.ct || {}).token;
      root.append(h('h3', { class: 'h' }, 'Stream Deck・スマホから増減する'), help('このURLを開く(アクセスする)と、カウンターが増減します。このPCの中からだけ使えます。panel にはパネル名(例:カウンター)、n には何番目のカウンターか、delta には増減の数を入れます。'));
      [['1番目を +1', `${base}?panel=カウンター&n=1&delta=1&token=${tok}`], ['2番目を +1', `${base}?panel=カウンター&n=2&delta=1&token=${tok}`], ['1番目を −1', `${base}?panel=カウンター&n=1&delta=-1&token=${tok}`]].forEach(([l, url]) => {
        const input = h('input', { type: 'text', value: url, readonly: true, style: { flex: 1, fontSize: '11px' } });
        root.append(h('div', { class: 'f-l', style: { marginTop: '6px' } }, l), h('div', { class: 'row' }, input, UI.button('コピー', () => { input.select(); navigator.clipboard && navigator.clipboard.writeText(url); ADM.toast('コピーしました'); }, 'small')));
      });
      root.append(h('div', { class: 'row end', style: { marginTop: '6px' } }, UI.button('URLを作り直す', () => { if (confirm('今のURLは使えなくなります。作り直しますか?')) ADM.send('ct:newToken'); }, 'small')));
    },
  });
})();
