'use strict';
// サイドバー(コンテナ)・全体スケール・レイアウトプリセット
const path = require('path');
const { uid, clone, deepMerge, pick, isPlainObject, watchJson } = require('../../core/util');

const FALLBACK_CONTAINER = { enabled: true, dock: 'right', x: 1460, y: 0, w: 460, h: 1080, gap: 12, margin: 16, direction: 'column' };
// 縦画面(1080x1920):初期はサイドバーを使わず、パネルを自由配置で並べる
const V_CONTAINER = { enabled: false, dock: 'bottom', x: 0, y: 1100, w: 1080, h: 820, gap: 12, margin: 16, direction: 'column' };
// レイアウトプリセットが保存・復元するパネルの配置項目
const ARRANGE_KEYS = ['placement', 'x', 'y', 'w', 'h', 'widthMode', 'heightMode', 'pairWithNext', 'fill', 'fillMin', 'visible'];

let builtin = [];

function normalizeLayout(v, vertical) {
  const l = isPlainObject(v) ? v : {};
  const scale = Number(l.globalScale);
  return {
    globalScale: scale >= 0.5 && scale <= 2 ? scale : 1,
    activeId: l.activeId || (vertical ? 'vFree' : 'sidebarRight'),
    container: { ...(vertical ? V_CONTAINER : FALLBACK_CONTAINER), ...(isPlainObject(l.container) ? l.container : {}) },
    // アバターなどを置く場所の目安(管理画面のプレビューにだけ表示。オーバーレイには出ません)
    avatar: { show: false, side: 'right', w: vertical ? 400 : 420, h: vertical ? 440 : 420, ...(isPlainObject(l.avatar) ? l.avatar : {}) },
    // YouTube の画面に出る部品(チャット欄・登録ボタンなど)の目安。管理画面のプレビューにだけ表示。items は部品ごとの {show, x, y, w, h}
    ytGuide: (() => {
      const g = isPlainObject(l.ytGuide) ? l.ytGuide : {};
      return { show: g.show === true, items: isPlainObject(g.items) ? g.items : {} };
    })(),
  };
}

module.exports = {
  order: 8,
  sections: {
    layout: {
      default: () => normalizeLayout({}),
      normalize: (v) => normalizeLayout(v),
      vDefault: () => normalizeLayout({}, true),
      vNormalize: (v) => normalizeLayout(v, true),
    },
    layoutPresets: { default: () => [], normalize: (v) => (Array.isArray(v) ? v : []) },
  },
  init({ paths, catalogs }) {
    watchJson(path.join(paths.config, 'layouts.json'), (d) => {
      builtin = Array.isArray(d.builtin) ? d.builtin : [];
      catalogs.set('layouts', builtin);
    }, { fallback: { builtin: [] } });
  },
  handlers: {
    update({ patch }, ctx) {
      if (!isPlainObject(patch)) return;
      deepMerge(ctx.state.layout, patch);
      ctx.state.layout = normalizeLayout(ctx.state.layout, ctx.canvas === 'v');
      ctx.commit('layout');
    },
    apply({ id }, ctx) {
      const preset = builtin.find((b) => b.id === id) || ctx.state.layoutPresets.find((b) => b.id === id);
      if (!preset) return;
      ctx.state.layout.container = { ...(ctx.canvas === 'v' ? V_CONTAINER : FALLBACK_CONTAINER), ...clone(preset.container) };
      ctx.state.layout.activeId = preset.id;
      if (preset.arrangement) {
        const panels = ctx.state.panels;
        for (const p of panels) {
          const a = preset.arrangement[p.id];
          if (a) Object.assign(p, clone(a));
        }
        if (Array.isArray(preset.order)) {
          const byId = new Map(panels.map((p) => [p.id, p]));
          const next = preset.order.map((x) => byId.get(x)).filter(Boolean);
          for (const p of panels) if (!next.includes(p)) next.push(p);
          ctx.state.panels = next;
        }
        ctx.commit('panels');
      }
      ctx.commit('layout');
    },
    save({ name }, ctx) {
      const n = String(name || '').trim().slice(0, 40);
      if (!n) return ctx.toast('レイアウト名を入力してください', 'warn');
      const arrangement = {};
      for (const p of ctx.state.panels) arrangement[p.id] = pick(p, ARRANGE_KEYS);
      const list = ctx.state.layoutPresets;
      const entry = {
        id: uid('lay'), name: n, savedAt: Date.now(),
        container: clone(ctx.state.layout.container),
        order: ctx.state.panels.map((p) => p.id),
        arrangement,
      };
      const i = list.findIndex((x) => x.name === n);
      if (i >= 0) { entry.id = list[i].id; list[i] = entry; } else list.push(entry);
      ctx.state.layout.activeId = entry.id;
      ctx.commit('layoutPresets', 'layout');
      ctx.toast(`レイアウト「${n}」を保存しました`);
    },
    remove({ id }, ctx) {
      ctx.state.layoutPresets = ctx.state.layoutPresets.filter((x) => x.id !== id);
      ctx.commit('layoutPresets');
    },
  },
};
