'use strict';
// 最新のサポーター:スーパーチャット・スーパーステッカー・メンバー登録(YouTube)と、手入力の記録
const { uid, isPlainObject } = require('../../core/util');

const MAX = 30;
const KINDS = ['superchat', 'member', 'manual'];
const defaults = () => ({ list: [] });
function normItem(x) {
  if (!isPlainObject(x)) return null;
  return {
    id: String(x.id || uid('sp')),
    name: String(x.name || '').slice(0, 60),
    amount: String(x.amount || '').slice(0, 30),
    kind: KINDS.includes(x.kind) ? x.kind : 'manual',
    at: Number(x.at) || Date.now(),
  };
}
const normalize = (v) => ({ list: (Array.isArray((v || {}).list) ? v.list : []).map(normItem).filter((x) => x && x.name).slice(-MAX) });

let storeRef = null;
let hubRef = null;
function push(items) {
  const st = storeRef.state.supporters;
  let n = 0;
  for (const it of items) {
    const x = normItem(it);
    if (!x || !x.name || st.list.some((y) => y.id === x.id)) continue;
    st.list.push(x);
    n += 1;
  }
  if (!n) return;
  st.list = st.list.slice(-MAX);
  storeRef.scheduleSave();
  hubRef.broadcast('core:section', { key: 'supporters', value: st });
}

module.exports = {
  order: 53,
  namespace: 'supporters',
  sections: { supporters: { default: defaults, normalize } },
  panelTypes: {
    supporters: {
      label: '最新のサポーター',
      defaults: () => ({
        name: '最新のサポーター',
        anim: { type: 'fade', ms: 350 },
        look: { headingSize: 22, bodySize: 22, padding: 14 },
        data: { title: '最新のサポーター', mode: 'latest', count: 3, kinds: ['superchat', 'member', 'manual'], showAmount: true, emptyText: 'まだいません' },
      }),
    },
  },
  init({ store, hub, bus }) {
    storeRef = store;
    hubRef = hub;
    bus.on('chat:messages', ({ messages }) => {
      push((messages || []).filter((m) => !m.old && (m.type === 'superChatEvent' || m.type === 'superStickerEvent'))
        .map((m) => ({ id: m.id, name: m.name, amount: m.amount, kind: 'superchat', at: Date.parse(m.at) || Date.now() })));
    });
    // メンバー登録・ギフト(YouTube のメンバー、Twitch のサブスク)
    bus.on('alert:event', (ev) => { if (!ev.test && (ev.kind === 'member' || ev.kind === 'gift')) push([{ id: `al-${ev.at}-${ev.name}`, name: ev.name, amount: ev.kind === 'gift' ? `🎁×${ev.count || 1}` : '', kind: 'member', at: ev.at || Date.now() }]); });
  },
  handlers: {
    add({ name, amount, kind }, ctx) {
      if (!String(name || '').trim()) return ctx.toast('名前を入力してください', 'warn');
      push([{ name: String(name).trim(), amount, kind: kind || 'manual', at: Date.now() }]);
    },
    remove({ id }, ctx) {
      ctx.raw.supporters.list = ctx.raw.supporters.list.filter((x) => x.id !== id);
      ctx.commitRaw('supporters');
    },
    clear(_, ctx) {
      ctx.raw.supporters.list = [];
      ctx.commitRaw('supporters');
    },
  },
};
