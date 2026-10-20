'use strict';
// 構成プリセット:全パネル+レイアウトに名前を付けて保存・読込
const { uid, clone } = require('../../core/util');

module.exports = {
  order: 90,
  sections: {
    presets: { default: () => [], normalize: (v) => (Array.isArray(v) ? v : []) },
  },
  handlers: {
    save({ name }, ctx) {
      const n = String(name || '').trim().slice(0, 40);
      if (!n) return ctx.toast('プリセット名を入力してください', 'warn');
      const list = ctx.state.presets;
      const entry = { id: uid('ps'), name: n, savedAt: Date.now(), panels: clone(ctx.state.panels), layout: clone(ctx.state.layout) };
      const i = list.findIndex((p) => p.name === n);
      if (i >= 0) { entry.id = list[i].id; list[i] = entry; } else list.push(entry);
      ctx.commit('presets');
      ctx.toast(`「${n}」を保存しました`);
    },
    load({ id }, ctx) {
      const p = ctx.state.presets.find((x) => x.id === id);
      if (!p) return;
      ctx.state.panels = ctx.normalize('panels', clone(p.panels));
      if (p.layout) ctx.state.layout = ctx.normalize('layout', clone(p.layout));
      ctx.commit('panels', 'layout');
      ctx.toast(`「${p.name}」を読み込みました`);
    },
    remove({ id }, ctx) {
      ctx.state.presets = ctx.state.presets.filter((x) => x.id !== id);
      ctx.commit('presets');
    },
  },
};
