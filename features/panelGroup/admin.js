/* パネルのグループ:中のパネル・並び順・幅の比率・すき間 */
(function () {
  'use strict';
  const { h } = UI;

  // まとめる候補:YouTube などの数を出す数値パネル(いいね・コメント・登録者など)
  ADM.groupCandidates = () => {
    const ps = OV.state.panels || [];
    const gm = OV.groupMap(ps);
    return ps.filter((p) => p.type === 'number' && !gm.has(p.id) && (p.data || {}).mode !== 'goal' && (p.data || {}).view !== 'none');
  };
  ADM.createGroup = (ids, name) => ADM.send('panelGroup:create', { ids: ids || [], name });

  ADM.registerInspector('group', {
    title: 'グループの中身',
    sig: (p) => JSON.stringify([(p.data || {}).members, (OV.state.panels || []).map((x) => [x.id, x.name, x.type])]),
    build(root, id) {
      const G = () => ADM.panel(id) || {};
      const D = () => G().data || {};
      const ps = OV.state.panels || [];
      const gm = OV.groupMap(ps);
      const members = (D().members || []).filter((m) => gm.get(m) === id).map((m) => ps.find((x) => x.id === m)).filter(Boolean);
      const setMembers = (arr) => ADM.send('panelGroup:setMembers', { id, members: arr });
      const ids = members.map((m) => m.id);

      root.append(h('p', { class: 'hint' }, '中のパネルを横一列に並べ、高さをそろえます。位置と大きさは、このグループで決めます(下の「配置とサイズ」)。中のパネルは、それぞれの枠・見た目のままです。'));
      const list = h('div', { class: 'pg-list' });
      members.forEach((m, i) => {
        const ratio = UI.num({ label: '幅', min: 0.2, max: 4, step: 0.1, unit: '倍', get: () => Number(((D().ratios || {})[m.id])) || 1, set: (v) => ADM.send('panelGroup:setRatio', { id, member: m.id, ratio: v }) });
        list.append(h('div', { class: 'pg-item' },
          h('div', { class: 'pg-top' },
            h('span', { class: 'pg-no' }, `${i + 1}`),
            h('button', { type: 'button', class: 'pg-name', title: 'このパネルの設定を開く', onclick: () => ADM.select(m.id) }, m.name, m.visible === false ? '(非表示)' : ''),
            UI.button('←', () => { const a = [...ids]; if (i > 0) { [a[i - 1], a[i]] = [a[i], a[i - 1]]; setMembers(a); } }, 'small'),
            UI.button('→', () => { const a = [...ids]; if (i < a.length - 1) { [a[i + 1], a[i]] = [a[i], a[i + 1]]; setMembers(a); } }, 'small'),
            UI.button('外す', () => setMembers(ids.filter((x) => x !== m.id)), 'small danger')),
          ratio));
      });
      root.append(h('h3', { class: 'h' }, `中のパネル(左から順・${members.length}個)`), members.length ? list : h('p', { class: 'hint' }, 'まだ入っていません。下で追加してください。'));

      // 追加
      const cands = ps.filter((p) => p.type !== 'group' && !ids.includes(p.id));
      if (cands.length) {
        const label = (p) => {
          const g = gm.get(p.id) ? ps.find((x) => x.id === gm.get(p.id)) : null;
          return `${p.name}(${ADM.typeLabel(p.type)})${g ? ` ※「${g.name}」から移動` : ''}`;
        };
        const sel = h('select', null, ...cands.map((p) => h('option', { value: p.id }, label(p))));
        const best = cands.find((p) => p.type === 'number' && !gm.has(p.id));
        if (best) sel.value = best.id;
        root.append(h('div', { class: 'row' }, sel, UI.button('+ 追加', () => setMembers([...ids, sel.value]), 'primary small')));
      }

      root.append(
        h('h3', { class: 'h' }, '並べ方'),
        UI.num({ label: 'すき間', min: 0, max: 80, step: 1, unit: 'px', get: () => (D().gap == null ? 12 : D().gap), set: (v) => ADM.patchPanel(id, { data: { gap: v } }) }),
        UI.toggle({ label: '数字・文字の大きさをそろえる', get: () => D().syncSize !== false, set: (v) => ADM.patchPanel(id, { data: { syncSize: v } }) }),
        h('p', { class: 'hint' }, 'オンにすると、収まりきらずに縮小されたパネルに合わせて、ほかのパネルの文字も同じ割合で縮小します。'),
        h('div', { class: 'row' },
          UI.button('1つ目のパネルと同じ見た目にそろえる', () => { if (confirm('1つ目のパネルのスタイル・文字サイズ・枠などを、ほかの中のパネルにもコピーしますか?')) ADM.send('panelGroup:matchLook', { id }); }, 'small'),
          UI.button('グループを解除', () => { if (confirm('グループを解除しますか?(中のパネルは残ります)')) ADM.send('panelGroup:ungroup', { id }); }, 'small danger')));
    },
  });
})();
