/* 最新のサポーター:表示の設定と、手入力・記録の整理 */
(function () {
  'use strict';
  const { h } = UI;
  ADM.registerInspector('supporters', {
    title: '最新のサポーター',
    sig: () => JSON.stringify(((OV.raw.supporters || {}).list || []).map((x) => x.id)),
    build(root, id) {
      const D = () => (ADM.panel(id) || {}).data || {};
      const dk = (k) => ({ get: () => D()[k], set: (v) => ADM.patchPanel(id, { data: { [k]: v } }) });
      const kinds = () => D().kinds || [];
      const kt = (k, label) => UI.toggle({ label, get: () => kinds().includes(k), set: (v) => ADM.patchPanel(id, { data: { kinds: v ? [...kinds(), k] : kinds().filter((x) => x !== k) } }) });
      const nameIn = h('input', { type: 'text', placeholder: '名前', style: { flex: 1 } });
      const amtIn = h('input', { type: 'text', placeholder: '金額など(空欄でも可)', style: { width: '120px' } });
      const list = (OV.raw.supporters || {}).list || [];
      root.append(
        UI.text({ label: '見出し', ...dk('title') }),
        UI.seg({ label: '表示', options: [['latest', '最新の1人'], ['list', '新しい順に何人か']], ...dk('mode') }),
        UI.when(() => D().mode === 'list', UI.num({ label: '人数', min: 1, max: 10, step: 1, unit: '人', ...dk('count') })),
        UI.toggle({ label: '金額を表示', get: () => D().showAmount !== false, set: (v) => ADM.patchPanel(id, { data: { showAmount: v } }) }),
        UI.text({ label: 'いないときの文字', ...dk('emptyText') }),
        h('h3', { class: 'h' }, '表示する種類'),
        kt('superchat', 'スーパーチャット・スーパーステッカー(YouTube)'),
        kt('member', 'メンバー登録(YouTube)'),
        kt('manual', '手入力'),
        h('p', { class: 'hint' }, 'YouTube タブで取得中のチャットから、自動で記録します。チャンネル登録者の名前は YouTube の仕様で取得できないため、手入力で追加してください。'),
        h('h3', { class: 'h' }, '手入力で追加'),
        h('div', { class: 'row' }, nameIn, amtIn, UI.button('追加', () => { ADM.send('supporters:add', { name: nameIn.value, amount: amtIn.value }); nameIn.value = ''; amtIn.value = ''; }, 'small primary')),
        h('h3', { class: 'h' }, `記録(${list.length}件)`),
        ...list.slice().reverse().slice(0, 12).map((x) => h('div', { class: 'row' }, h('span', { style: { flex: 1 } }, `${x.name}${x.amount ? ` ${x.amount}` : ''}`), UI.button('×', () => ADM.send('supporters:remove', { id: x.id }), 'small danger'))),
        list.length ? h('div', { class: 'row end' }, UI.button('記録をすべて消す', () => { if (confirm('サポーターの記録をすべて消しますか?')) ADM.send('supporters:clear'); }, 'small danger')) : null);
    },
  });
})();
