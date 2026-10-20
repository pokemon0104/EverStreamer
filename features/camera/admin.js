/* カメラ枠の設定 */
(function () {
  'use strict';
  const { h } = UI;
  ADM.registerInspector('camera', {
    title: 'カメラ枠',
    build(root, id) {
      const P = () => ADM.panel(id) || {};
      const D = () => P().data || {};
      const dk = (k) => ({ get: () => D()[k], set: (v) => ADM.patchPanel(id, { data: { [k]: v } }) });
      const ratio = (r) => {
        const [a, b] = r.split(':').map(Number);
        ADM.patchPanel(id, { data: { ratio: r }, h: Math.round((P().w * b) / a), heightMode: 'fixed' });
      };
      root.append(
        h('p', { class: 'hint' }, '中は透明です。OBS で Web カメラのソースをこのパネルの位置・大きさに合わせ、このオーバーレイより下に置いてください。枠の見た目は、パネルのスタイル(初期はテンプレートに合わせる)で変わります。'),
        UI.toggle({ label: '名前の帯を表示', get: () => D().showLabel !== false, set: (v) => ADM.patchPanel(id, { data: { showLabel: v } }) }),
        UI.text({ label: '帯の文字', placeholder: '空欄なら、クイック設定の名前', ...dk('label') }),
        UI.seg({ label: '帯の位置', options: [['bl', '左下'], ['br', '右下'], ['tl', '左上'], ['b', '下の中央']], ...dk('labelPos') }),
        UI.field('縦横比', ...[['16:9', '16:9'], ['4:3', '4:3'], ['1:1', '1:1'], ['3:4', '縦長 3:4']].map(([r, l]) => UI.button(l, () => ratio(r), 'small'))),
        h('p', { class: 'hint' }, 'いまの位置と大きさ(OBS のカメラをこの値に合わせます):'));
      const info = h('div', { class: 'note-box' });
      UI.bind(info, () => { const p = P(); info.textContent = `X ${p.x} ・ Y ${p.y} ・ 幅 ${p.w} × 高さ ${p.h}`; });
      root.append(info);
    },
  });
})();
