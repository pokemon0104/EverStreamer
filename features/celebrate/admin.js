/* お祝いタブ:登録者が増えたとき・目標を達成したときの演出 */
(function () {
  'use strict';
  const { h } = UI;
  const C = () => OV.state.celebrate || {};
  const EFFECTS = [['grand', '全部入り(花火+紙吹雪+星+フラッシュ)'], ['fireworks', '花火'], ['confetti', '紙吹雪'], ['coins', '光るチップ'], ['hearts', 'ハート']];
  const MODES = [['full', '画面いっぱい'], ['panel', '登録者目標のパネルのまわりだけ'], ['both', '画面いっぱい+パネルのまわり']];
  const looks = () => [['tpl', 'テンプレートに合わせる'], ...(OV.catalogs.looks || []).map((l) => [l.id, l.name])];

  function block(kind, title, hint, vars) {
    const K = () => C()[kind] || {};
    const k = (key) => ({ get: () => K()[key], set: (v) => ADM.send('celebrate:update', { patch: { [kind]: { [key]: v } } }) });
    return h('div', null,
      h('h3', { class: 'h' }, title),
      UI.toggle({ label: 'お祝いを表示する', ...k('enabled') }),
      UI.text({ label: 'メッセージ', ...k('text') }),
      UI.text({ label: '補足の文', placeholder: '空欄なら表示しない', ...k('subtext') }),
      h('p', { class: 'hint' }, `文の中で ${vars} が使えます。${hint}`),
      UI.select({ label: '文字の見た目', options: looks, ...k('lookId') }),
      UI.select({ label: '表示する場所', options: MODES, ...k('mode') }),
      UI.select({ label: '演出', options: EFFECTS, ...k('effect') }),
      UI.num({ label: '表示時間', min: 3, max: 30, step: 1, unit: '秒', ...k('sec') }),
      UI.toggle({ label: 'ファンファーレを鳴らす(OBS で音を拾う設定が必要)', ...k('sound') }));
  }

  ADM.registerTab({
    id: 'celebrate',
    label: 'お祝い',
    order: 39,
    sig: () => '',
    build(root) {
      root.append(
        h('p', { class: 'hint' }, 'YouTube の取得中に、チャンネル登録者が増えたとき、数値パネルの目標を達成したときに、画面いっぱい、または登録者目標のパネルのまわりだけに、お祝いを表示します。API の消費は増えません。'),
        h('div', { class: 'row' },
          UI.button('登録者 +1 を試す', () => ADM.send('celebrate:test', { kind: 'sub', delta: 1 }), 'small'),
          UI.button('登録者 +5 を試す', () => ADM.send('celebrate:test', { kind: 'sub', delta: 5 }), 'small'),
          UI.button('目標達成を試す', () => ADM.send('celebrate:test', { kind: 'goal' }), 'primary small')),
        block('sub', 'チャンネル登録者が増えたとき', '増えた人数は {delta}、いまの登録者数は {count} です。', '{delta} {count}'),
        block('goal', '目標を達成したとき', '「目標まで あと何」の数値パネル(登録者目標など)が、目標に届いたときに表示します。', '{goal} {count}'),
        h('div', { class: 'note-box' }, '登録者数は YouTube の確認間隔(YouTube タブの「登録者数の確認間隔」、初期 30 秒)ごとに調べます。数が増えてから表示されるまで、その間隔ぶん遅れることがあります。YouTube の仕様で、登録者数は上3桁に丸められた値になります(1,000 人を超えたあと)。'));
    },
  });
})();
