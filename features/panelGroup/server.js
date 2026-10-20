'use strict';
// パネルのグループ:いいね・コメント・登録者などを横一列にまとめ、高さと幅をそろえて表示する。
// グループ自体は枠も背景もない入れ物。中のパネルはそれぞれの枠・見た目のまま並ぶ。
// 中に入れるパネルは、グループの data.members(並び順)で決まる。グループを消すと、元のパネルに戻る。
const { isPlainObject } = require('../../core/util');

const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const groups = (list) => list.filter((p) => p.type === 'group');
const membersOf = (g) => (Array.isArray((g.data || {}).members) ? g.data.members : []);

// ほかのグループから外す(1つのパネルは1つのグループにだけ入る)
function detach(list, ids, except) {
  for (const g of groups(list)) {
    if (g === except) continue;
    const before = membersOf(g).length;
    g.data.members = membersOf(g).filter((x) => !ids.includes(x));
    if (g.data.ratios) for (const id of ids) delete g.data.ratios[id];
    if (before !== g.data.members.length) g.data.members = [...g.data.members];
  }
}
// 入れられるパネル(存在する・グループではない)だけにする
const cleanIds = (list, ids) => [...new Set((Array.isArray(ids) ? ids : []).map(String))]
  .filter((id) => { const p = list.find((x) => x.id === id); return p && p.type !== 'group'; });

module.exports = {
  order: 11,
  namespace: 'panelGroup',
  panelTypes: {
    group: {
      label: 'グループ(横一列にまとめる)',
      defaults: () => ({
        name: 'グループ',
        anim: { type: 'fade', ms: 350 },
        data: {
          members: [], // 中のパネルの ID(左から順)
          gap: 12, // パネル同士のすき間(px)
          ratios: {}, // パネルごとの幅の比率(なし = 1)
          syncSize: true, // 文字の縮小率をそろえる(数字の大きさがバラバラにならない)
        },
      }),
    },
  },
  handlers: {
    // グループを作る。ids のパネルを中に入れる(なければ空のグループ)
    create({ ids, name }, ctx) {
      const { makePanel } = require('../panels/server');
      const list = ctx.state.panels;
      const members = cleanIds(list, ids);
      detach(list, members);
      const ps = members.map((id) => list.find((x) => x.id === id));
      const lay = ctx.state.layout || {};
      const noSidebar = lay.container && lay.container.enabled === false;
      const extra = { name: typeof name === 'string' && name.trim() ? name.slice(0, 40) : 'グループ', data: { members } };
      const allFree = ps.length ? ps.every((p) => p.placement === 'free') : noSidebar;
      if (allFree) {
        // 自由配置のパネルをまとめるときは、それらを囲む位置・幅にする
        if (ps.length) {
          const x = Math.min(...ps.map((p) => Number(p.x) || 0));
          const y = Math.min(...ps.map((p) => Number(p.y) || 0));
          const right = Math.max(...ps.map((p) => (Number(p.x) || 0) + (Number(p.w) || 200)));
          // 横に並んでいなかったときは、幅を合計にする
          const sumW = ps.reduce((a, p) => a + (Number(p.w) || 200), 0) + 12 * (ps.length - 1);
          // 縦に積んであったパネルも、横一列に並ぶ幅にする(画面からはみ出すときは左へずらす)
          const W = ctx.canvas === 'v' ? 1080 : 1920;
          const w = Math.min(W - 32, Math.max(right - x, sumW));
          Object.assign(extra, { placement: 'free', x: Math.max(16, Math.min(x, W - 16 - w)), y, w });
          const hs = ps.filter((p) => p.heightMode === 'fixed').map((p) => Number(p.h) || 0);
          if (hs.length === ps.length) Object.assign(extra, { heightMode: 'fixed', h: Math.max(...hs) });
        } else Object.assign(extra, { placement: 'free', x: 40, y: 200, w: 600 });
      }
      // 中のパネルがすべて非表示なら、表示・非表示はグループでまとめて切り替える(中のパネルは表示にしておく)
      if (ps.length && ps.every((p) => p.visible === false)) { extra.visible = false; ps.forEach((p) => { p.visible = true; }); }
      const g = makePanel('group', extra);
      ps.forEach((p) => { p.pairWithNext = false; });
      // サイドバーでは、最初のパネルの場所に入れる
      let idx = list.length;
      const firstIdx = Math.min(...ps.map((p) => list.indexOf(p)).filter((i) => i >= 0), list.length);
      if (ps.length) idx = firstIdx;
      else if (g.placement !== 'free') {
        const fillIdx = list.findIndex((x) => x.fill && x.placement !== 'free');
        if (fillIdx >= 0) idx = fillIdx;
      }
      list.splice(idx, 0, g);
      ctx.commit('panels');
      ctx.reply('panels:added', { id: g.id });
    },
    // 中のパネル(並び順)を決める
    setMembers({ id, members }, ctx) {
      const list = ctx.state.panels;
      const g = list.find((x) => x.id === id && x.type === 'group');
      if (!g) return;
      const ids = cleanIds(list, members);
      detach(list, ids, g);
      g.data.members = ids;
      ids.forEach((m) => { const p = list.find((x) => x.id === m); if (p) p.pairWithNext = false; });
      ctx.commit('panels');
    },
    setRatio({ id, member, ratio }, ctx) {
      const g = ctx.state.panels.find((x) => x.id === id && x.type === 'group');
      if (!g) return;
      g.data.ratios = isPlainObject(g.data.ratios) ? g.data.ratios : {};
      g.data.ratios[String(member)] = num(ratio, 1, 0.2, 6);
      ctx.commit('panels');
    },
    // 1つ目のパネルの見た目(スタイル・文字サイズ・枠など)を、ほかのパネルにもそろえる
    matchLook({ id }, ctx) {
      const list = ctx.state.panels;
      const g = list.find((x) => x.id === id && x.type === 'group');
      if (!g) return;
      const ps = membersOf(g).map((m) => list.find((x) => x.id === m)).filter(Boolean);
      if (ps.length < 2) return;
      for (const p of ps.slice(1)) { p.styleId = ps[0].styleId; p.look = JSON.parse(JSON.stringify(ps[0].look || {})); }
      ctx.commit('panels');
      ctx.toast(`「${ps[0].name}」と同じ見た目にそろえました`);
    },
    // グループを解除する(中のパネルは、グループのあった場所に並べて戻す)
    ungroup({ id }, ctx) {
      const list = ctx.state.panels;
      const gi = list.findIndex((x) => x.id === id && x.type === 'group');
      if (gi < 0) return;
      const g = list[gi];
      const ps = membersOf(g).map((m) => list.find((x) => x.id === m)).filter(Boolean);
      list.splice(gi, 1);
      if (g.placement === 'free') {
        const gap = num(g.data.gap, 12, 0, 200);
        const ratios = ps.map((p) => num((g.data.ratios || {})[p.id], 1, 0.2, 6));
        const sum = ratios.reduce((a, b) => a + b, 0) || 1;
        const inner = Math.max(80, (Number(g.w) || 600) - gap * (ps.length - 1));
        let x = Number(g.x) || 0;
        ps.forEach((p, i) => {
          const w = Math.round((inner * ratios[i]) / sum);
          Object.assign(p, { placement: 'free', x, y: Number(g.y) || 0, w });
          if (g.heightMode === 'fixed') Object.assign(p, { heightMode: 'fixed', h: g.h });
          x += w + gap;
        });
      } else {
        // サイドバー:グループのあった場所に、横並びで戻す(2つまでは横並び、3つ目からは縦)
        for (const p of ps) { const i = list.indexOf(p); if (i >= 0) list.splice(i, 1); }
        const at = Math.min(gi, list.length);
        ps.forEach((p, i) => { p.placement = 'container'; p.pairWithNext = ps.length === 2 && i === 0; });
        list.splice(at, 0, ...ps);
      }
      ctx.commit('panels');
      ctx.toast('グループを解除しました');
    },
  },
};
