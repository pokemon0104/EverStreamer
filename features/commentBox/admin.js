/* コメント欄の設定:ダミー表示、または YouTube のライブチャット(横型・縦型・両方) */
(function () {
  'use strict';
  const { h } = UI;
  const SOURCES = [['dummy', 'ダミー'], ['h', '横型配信のチャット'], ['v', '縦型配信のチャット'], ['all', '横+縦']];
  ADM.registerInspector('comments', {
    title: 'コメント欄',
    build(root, id) {
      const D = () => (ADM.panel(id) || {}).data || {};
      const setD = (k) => (v) => ADM.patchPanel(id, { data: { [k]: v } });
      const dk = (k) => ({ get: () => D()[k], set: setD(k) });
      const src = () => D().source || (D().dummy === false ? 'none' : 'dummy');
      root.append(
        UI.select({ label: '表示するコメント', options: SOURCES, get: src, set: (v) => ADM.patchPanel(id, { data: { source: v, dummy: v === 'dummy' } }) }),
        UI.when(() => src() !== 'dummy', h('div', null,
          h('p', { class: 'hint' }, '「チャット」タブでつないだ YouTube・Twitch のコメントを表示します(API の消費は増えません)。縦型配信の画面に「横型配信のコメント」を出したいときは「横型配信のチャット」を選びます。除外の設定は「チャット」タブにあります。'),
          UI.num({ label: '表示する件数', min: 1, max: 60, step: 1, unit: '件', ...dk('max') }),
          UI.num({ label: '消えるまでの秒数', min: 0, max: 600, step: 5, unit: '秒', get: () => D().life || 0, set: setD('life') }),
          h('p', { class: 'hint' }, '0 のときは消えません(新しいコメントに押し出されて消えます)。'),
          UI.seg({ label: '見た目', options: [['bubble', '吹き出し(1件ずつ)'], ['line', '1行ずつ']], get: () => D().look || 'bubble', set: setD('look') }),
          UI.toggle({ label: '名前を表示', get: () => D().showName !== false, set: setD('showName') }),
          UI.toggle({ label: 'バッジを表示(配信者・モデレーター・メンバーなど)', get: () => D().showBadges !== false, set: setD('showBadges') }),
          UI.toggle({ label: 'Twitch の名前の色を使う', get: () => D().nameColor !== false, set: setD('nameColor') }),
          UI.seg({ label: 'YouTube / Twitch の印', options: [['auto', '混ざっているときだけ'], ['on', 'いつも'], ['off', '出さない']], get: () => D().showPlatform || 'auto', set: setD('showPlatform') }),
          UI.when(() => src() === 'all', UI.toggle({ label: '「横」「縦」の印を付ける', get: () => D().showMark !== false, set: setD('showMark') })),
          h('div', { class: 'row' }, h('span', { class: 'f-l' }, 'テスト'),
            UI.button('横に1件', () => ADM.send('chat:dummy', { kind: 'mix', side: 'h', count: 1 }), 'small'),
            UI.button('縦に1件', () => ADM.send('chat:dummy', { kind: 'mix', side: 'v', count: 1 }), 'small'),
            UI.button('Twitch 風', () => ADM.send('chat:dummy', { kind: 'mix', platform: 'twitch', side: OV.canvas === 'v' ? 'v' : 'h', count: 1 }), 'small'),
            UI.button('消す', () => ADM.send('commentBox:clear', {}), 'small')))),
        UI.toggle({ label: '見出しを表示', get: () => D().showTitle !== false, set: setD('showTitle') }),
        UI.text({ label: '見出し', placeholder: '例:横型コメント', ...dk('title') }),
        UI.when(() => src() === 'dummy', UI.textarea({ label: 'ダミーのコメント(名前: 本文)', rows: 5, ...dk('sample') })),
      );
    },
  });
})();
