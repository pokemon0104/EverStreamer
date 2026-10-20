/* 空きスペースの設定 */
(function () {
  'use strict';
  const { h } = UI;
  ADM.registerInspector('space', {
    title: '空きスペース',
    build(root, id) {
      const D = () => (ADM.panel(id) || {}).data || {};
      root.append(
        UI.text({ label: '名前(プレビューに表示)', get: () => D().label, set: (v) => ADM.patchPanel(id, { data: { label: v } }) }),
        h('p', { class: 'hint' }, 'OBS のオーバーレイには何も表示されません。縦型配信で YouTube がコメントを表示する場所など、パネルを置きたくない場所の目安に使います。'));
    },
  });
})();
