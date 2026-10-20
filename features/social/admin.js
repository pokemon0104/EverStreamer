/* 名前と SNS のパネル:表示する項目(ID の入力はクイック設定タブ) */
(function () {
  'use strict';
  const { h } = UI;
  ADM.registerInspector('social', {
    title: '名前とSNS',
    build(root, id) {
      const D = () => (ADM.panel(id) || {}).data || {};
      const dk = (k) => ({ get: () => D()[k], set: (v) => ADM.patchPanel(id, { data: { [k]: v } }) });
      const items = () => D().items || [];
      const chips = h('div', { class: 'row wrap' }, ...OV.SNS.map((s) => UI.toggle({
        label: s.label,
        get: () => items().includes(s.id),
        set: (v) => ADM.patchPanel(id, { data: { items: v ? [...items(), s.id] : items().filter((x) => x !== s.id) } }),
      })));
      root.append(
        h('p', { class: 'hint' }, '名前と ID は「クイック設定」タブで入力します。入力したものだけが表示されます。'),
        UI.button('クイック設定を開く', () => ADM.showTab('quick'), 'small'),
        UI.toggle({ label: '名前を表示', get: () => D().showName !== false, set: (v) => ADM.patchPanel(id, { data: { showName: v } }) }),
        UI.seg({ label: '並べ方', options: [['row', '横に並べる'], ['col', '縦に並べる']], ...dk('layout') }),
        UI.toggle({ label: 'X・TikTok・Instagram の ID に @ を付ける', get: () => D().prefix !== false, set: (v) => ADM.patchPanel(id, { data: { prefix: v } }) }),
        h('h3', { class: 'h' }, '表示するサービス'), chips);
    },
  });
})();
