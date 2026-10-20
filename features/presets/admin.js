/* プリセットタブ:全パネル+レイアウトの構成を保存・読込・削除 */
(function () {
  'use strict';
  const { h } = UI;
  const fmt = (t) => new Date(t).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  ADM.registerTab({
    id: 'presets',
    label: 'プリセット',
    order: 50,
    sig: () => JSON.stringify((OV.state.presets || []).map((p) => [p.id, p.name, p.savedAt])),
    build(root) {
      const nameIn = h('input', { type: 'text', placeholder: '例:FPS実況セット', style: { flex: 1 } });
      root.append(
        h('div', { class: 'row' }, nameIn, UI.button('今の構成を保存', () => { ADM.send('presets:save', { name: nameIn.value }); nameIn.value = ''; }, 'primary')),
        h('p', { class: 'hint' }, '全パネルの内容・見た目・配置と、サイドバーの設定をまとめて保存します。同じ名前で保存すると上書きします。ゲームプロファイルは含みません。'));
      const list = OV.state.presets || [];
      if (!list.length) root.append(h('p', { class: 'hint' }, '保存したプリセットはまだありません。'));
      for (const p of list) {
        root.append(h('div', { class: 'plist-item' },
          h('span', { class: 'nm' }, p.name), h('span', { class: 'dt' }, fmt(p.savedAt)),
          UI.button('読み込む', () => { if (confirm(`「${p.name}」を読み込みますか?今の構成は置き換わります。`)) ADM.send('presets:load', { id: p.id }); }, 'small'),
          UI.button('×', () => { if (confirm(`「${p.name}」を削除しますか?`)) ADM.send('presets:remove', { id: p.id }); }, 'small danger')));
      }
    },
  });
})();
