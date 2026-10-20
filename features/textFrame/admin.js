/* テキストパネルの内容編集 */
(function () {
  'use strict';
  const { h } = UI;
  ADM.registerInspector('text', {
    title: 'テキストの内容',
    build(root, id) {
      const D = () => (ADM.panel(id) || {}).data || {};
      const dk = (k) => ({ get: () => D()[k], set: (v) => ADM.patchPanel(id, { data: { [k]: v } }) });
      // 目的・目標を書いたパネルは、横・縦で共通の内容に切り替えられる
      if (ADM.isGoalLike && ADM.isGoalLike(ADM.panel(id) || {})) {
        root.append(h('div', { class: 'note-box' },
          h('div', null, '目的や目標を書いたパネルなら、横画面・縦画面で共通の内容に切り替えられます(リッチテキストのパネルに変わります。位置・見た目はそのまま)。'),
          h('div', { class: 'row', style: { marginTop: '6px' } },
            UI.button('今日の目標に連動', () => ADM.linkRichPanel(ADM.panel(id), 'goal', OV.canvas), 'small primary'),
            UI.button('ゲーム全体の目的に連動', () => ADM.linkRichPanel(ADM.panel(id), 'purpose', OV.canvas), 'small'))));
      }
      root.append(
        UI.toggle({ label: '見出しを表示', get: () => D().showTitle !== false, set: (v) => ADM.patchPanel(id, { data: { showTitle: v } }) }),
        UI.text({ label: '見出し', ...dk('title') }),
        UI.textarea({ label: '本文', rows: 6, placeholder: '- 行頭に「-」か「・」で箇条書き', ...dk('body') }),
        h('p', { class: 'hint' }, '改行で行が分かれます。行頭に「-」「・」「*」を付けた行が箇条書きになります。'),
        UI.seg({ label: '箇条書き', options: [['auto', '記号で判定'], ['all', '全行'], ['none', 'なし']], ...dk('bulletMode') }),
        UI.select({ label: '行頭の記号', options: ['▶', '・', '●', '◆', '★', '▸', '-'].map((x) => [x, x]), ...dk('bullet') }),
        UI.seg({ label: '見出しの位置', options: [['left', '左'], ['center', '中央'], ['right', '右']], ...dk('titleAlign') }),
        UI.seg({ label: '本文の位置', options: [['left', '左'], ['center', '中央'], ['right', '右']], ...dk('align') }),
      );
    },
  });
})();
