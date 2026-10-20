'use strict';
// お願いポップアップ:「チャンネル登録お願いします」などを、ボタン1つで画面に出す(トランジション・エフェクト・矢印アイコン付き)
// ・メッセージ(callout.messages)は横・縦で共通。表示する場所は、メッセージごとに横(place.h)・縦(place.v)で別
// ・いま表示中のもの(calloutShow)は保存しない。消すタイミング・自動で出す間隔はサーバーが決める
const crypto = require('crypto');
const path = require('path');
const { uid, deepMerge, isPlainObject, clone, watchJson } = require('../../core/util');
const theme = require('../../core/theme');

const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const ANCHORS = ['tl', 't', 'tr', 'l', 'c', 'r', 'bl', 'b', 'br'];

const defaultDesign = () => ({
  font: 'Noto Sans JP', size: 56, bold: true, color: '#ffffff', fill: 'solid', grad1: '#ffffff', grad2: '#ffd84a', grad3: '', gradAngle: 90,
  strokeWidth: 0, strokeColor: '#000000', shadow: true, effect: 'pulse', effectColor: '#ff4d4d',
  box: 'pill', boxColor: '#e1251b', boxAlpha: 1, boxImage: 'linear-gradient(180deg,#ff4a3d,#cc1a12)', borderColor: '#ffffff', borderWidth: 0, radius: 999, padX: 46, padY: 22,
  subColor: '#ffe0de', iconColor: '#ffffff',
});
const place = (anchor, x = 0, y = 0) => ({ anchor, x, y, scale: 1 });
const msg = (o) => ({
  id: uid('co'), text: 'メッセージ', sub: '', designId: 'tpl', design: defaultDesign(),
  icon: 'pointDown', iconPos: 'right', iconAnim: 'bounce', iconSize: 1,
  enter: 'pop', exit: 'fade', enterMs: 700, exitMs: 600, sec: 8,
  place: { h: place('b', -230, -70), v: place('b', 0, -260) }, quick: true, auto: false,
  ...o,
});
const defaultMessages = () => [
  msg({ id: 'co_sub', text: 'チャンネル登録お願いします!', sub: 'ボタンひとつで、次の配信のお知らせが届きます', icon: 'pointDown', auto: true, place: { h: place('bl', 40, -40), v: place('bl', 20, -330) } }),
  msg({ id: 'co_like', text: '高評価で応援してね', sub: '', icon: 'thumb', iconPos: 'left', iconAnim: 'pulse', enter: 'bounceIn', auto: true }),
  msg({ id: 'co_chat', text: 'コメントもお待ちしています', sub: '初見さんも大歓迎!', icon: 'chat', iconPos: 'left', iconAnim: 'wiggle', enter: 'slideUp', place: { h: place('bl', 40, -40), v: place('b', 0, -260) } }),
];
const defaults = () => ({
  messages: defaultMessages(),
  autoMin: 0, // 0 = 自動で出さない / 1〜 = この分ごとに「自動」のメッセージを順番に出す
  token: crypto.randomBytes(6).toString('hex'), // 呼び出しURL用の合言葉
});
const emptyShow = () => ({ active: false, phase: 'idle', token: '', id: '' });

function normMsg(m) {
  if (!isPlainObject(m)) return null;
  const d = msg({ id: m.id || uid('co') });
  const o = { ...d, ...m, design: { ...defaultDesign(), ...(isPlainObject(m.design) ? m.design : {}) } };
  const pl = isPlainObject(m.place) ? m.place : {};
  o.place = {};
  for (const c of ['h', 'v']) {
    const p = { ...d.place[c], ...(isPlainObject(pl[c]) ? pl[c] : {}) };
    p.anchor = ANCHORS.includes(p.anchor) ? p.anchor : 'b';
    p.x = num(p.x, 0, -3000, 3000); p.y = num(p.y, 0, -3000, 3000); p.scale = num(p.scale, 1, 0.2, 4);
    o.place[c] = p;
  }
  o.text = String(o.text || '').slice(0, 120);
  o.sub = String(o.sub || '').slice(0, 160);
  o.sec = num(o.sec, 8, 1, 600);
  o.enterMs = num(o.enterMs, 700, 0, 5000);
  o.exitMs = num(o.exitMs, 600, 0, 5000);
  o.iconSize = num(o.iconSize, 1, 0.3, 3);
  return o;
}
function normalize(v) {
  const d = defaults();
  const o = isPlainObject(v) ? v : {};
  const out = { ...d, ...o };
  out.messages = Array.isArray(o.messages) ? o.messages.map(normMsg).filter(Boolean) : d.messages;
  out.autoMin = num(out.autoMin, 0, 0, 240);
  if (!out.token) out.token = d.token;
  return out;
}

let storeRef = null;
let hubRef = null;
let timer = null;
let autoTimer = null;
let autoIdx = 0;

const publish = () => hubRef.broadcast('core:section', { key: 'calloutShow', value: storeRef.state.calloutShow });
const findMsg = (id) => (storeRef.state.callout.messages || []).find((m) => m.id === id);

function show(id) {
  const m = findMsg(id);
  if (!m || !String(m.text || '').trim()) return false;
  clearTimeout(timer);
  const token = uid('cs');
  storeRef.state.calloutShow = { active: true, phase: 'show', token, id: m.id };
  publish();
  timer = setTimeout(() => hide(token), m.enterMs + m.sec * 1000);
  return true;
}
function hide(token) {
  const sh = storeRef.state.calloutShow;
  if (!sh.active || (token && sh.token !== token) || sh.phase === 'out') return;
  clearTimeout(timer);
  const m = findMsg(sh.id) || { exitMs: 600 };
  sh.phase = 'out';
  publish();
  timer = setTimeout(() => {
    if (storeRef.state.calloutShow.token !== sh.token) return;
    storeRef.state.calloutShow = { ...emptyShow(), token: sh.token };
    publish();
  }, m.exitMs + 150);
}
// 自動で出す:autoMin 分ごとに、「自動」にしたメッセージを順番に表示
function scheduleAuto() {
  clearInterval(autoTimer);
  const min = Number(storeRef.state.callout.autoMin) || 0;
  if (!min) return;
  autoTimer = setInterval(() => {
    const list = storeRef.state.callout.messages.filter((m) => m.auto && String(m.text || '').trim());
    if (!list.length || storeRef.state.calloutShow.active) return;
    show(list[autoIdx++ % list.length].id);
  }, min * 60 * 1000);
}

module.exports = {
  order: 72,
  namespace: 'callout',
  sections: {
    callout: { default: defaults, normalize },
    calloutShow: { default: emptyShow, normalize: () => emptyShow(), transient: true },
  },
  init({ app, store, hub, paths, catalogs }) {
    storeRef = store;
    hubRef = hub;
    if (!store.state.calloutShow) store.state.calloutShow = emptyShow();
    watchJson(path.join(paths.config, 'callout-designs.json'), (d) => catalogs.set('calloutDesigns', Array.isArray(d.designs) ? d.designs : []), { fallback: { designs: [] } });
    scheduleAuto();
    // Stream Deck やスマホからも押せる呼び出しURL(このPCの中だけ・合言葉つき)
    app.get('/api/callout/:action', (req, res) => {
      if (String(req.query.token || '') !== store.state.callout.token) return res.status(403).json({ error: '合言葉(token)が違います' });
      if (req.params.action === 'show') {
        const n = Number(req.query.n) || 1;
        const m = store.state.callout.messages[n - 1];
        if (!m || !show(m.id)) return res.status(404).json({ error: `${n} 番目のメッセージがありません` });
      } else if (req.params.action === 'hide') hide();
      else return res.status(404).json({ error: 'show / hide のどちらかを指定してください' });
      res.json({ ok: true });
    });
  },
  handlers: {
    show({ id }, ctx) { if (!show(id)) ctx.toast('メッセージが空です', 'warn'); },
    hide() { hide(); },
    update({ patch }, ctx) {
      if (!isPlainObject(patch)) return;
      const p = { ...patch };
      delete p.messages; delete p.token;
      deepMerge(ctx.state.callout, p);
      ctx.state.callout = normalize(ctx.state.callout);
      ctx.commit('callout');
      scheduleAuto();
    },
    add({ copyOf }, ctx) {
      const list = ctx.state.callout.messages;
      const src = copyOf ? list.find((m) => m.id === copyOf) : null;
      const m = src ? normMsg({ ...clone(src), id: uid('co'), text: `${src.text}` }) : normMsg(msg({ text: '新しいメッセージ' }));
      list.splice(src ? list.indexOf(src) + 1 : list.length, 0, m);
      ctx.commit('callout');
      ctx.reply('callout:added', { id: m.id });
    },
    updateMsg({ id, patch }, ctx) {
      const list = ctx.state.callout.messages;
      const i = list.findIndex((m) => m.id === id);
      if (i < 0 || !isPlainObject(patch)) return;
      const p = { ...patch };
      delete p.id;
      // 横・縦の場所は、編集している画面の分だけ
      if (isPlainObject(p.place)) { p.place = { [ctx.canvas]: p.place }; }
      // テンプレートに合わせていたデザインを自分で変えたら、それ以降はテンプレートを切り替えても変わらない
      if (isPlainObject(p.design) && list[i].designId === 'tpl') p.designId = 'custom';
      deepMerge(list[i], p);
      list[i] = normMsg(list[i]);
      ctx.commit('callout');
    },
    applyDesign({ id, designId }, ctx) {
      const m = ctx.state.callout.messages.find((x) => x.id === id);
      if (m && designId === 'tpl') {
        m.design = { ...defaultDesign(), ...(theme.value(ctx.catalogs, ctx.raw, 'callout') || {}) };
        m.designId = 'tpl';
        return ctx.commit('callout');
      }
      const d = (ctx.catalogs.get('calloutDesigns') || []).find((x) => x.id === designId);
      if (!m || !d) return;
      m.design = { ...defaultDesign(), ...clone(d.design) };
      m.designId = d.id;
      ctx.commit('callout');
    },
    remove({ id }, ctx) {
      ctx.state.callout.messages = ctx.state.callout.messages.filter((m) => m.id !== id);
      ctx.commit('callout');
    },
    move({ id, dir }, ctx) {
      const list = ctx.state.callout.messages;
      const i = list.findIndex((m) => m.id === id);
      const j = i + (dir < 0 ? -1 : 1);
      if (i < 0 || j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      ctx.commit('callout');
    },
    newToken(_, ctx) {
      ctx.state.callout.token = crypto.randomBytes(6).toString('hex');
      ctx.commit('callout');
      ctx.toast('呼び出しURLを作り直しました。以前のURLは使えなくなります');
    },
  },
};
