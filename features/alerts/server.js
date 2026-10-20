'use strict';
// アラート:新規登録・フォロー・スーパーチャット/ビッツ・メンバー(サブスク)・ギフト・レイドを、画面上部にカードで知らせる
// 感謝表示(thanks)の見た目(タイトル文字・紙吹雪・花火・効果音)を使い、1件ずつ順番に表示する
//
// 自動で検知できるもの(チャットに流れる通知から):
//   YouTube … スーパーチャット・スーパーステッカー・メンバー登録・メンバーの記念・メンバーシップのギフト
//   Twitch  … ビッツ(Cheer)・サブスク/再サブスク・ギフト・レイド
// 自動で検知できないもの(公式の仕組み上、名前が取れない・ログインが必要):
//   YouTube の新規チャンネル登録(登録者数の増加は「お祝い」で検知できるが、名前は取れない)
//   YouTube のレイド、Twitch のフォロー
//   → 管理画面の手動ボタン、または呼び出しURL(/api/alert)で、外部のツール(Stream Deck・Streamer.bot など)から送る
const crypto = require('crypto');
const { isPlainObject, deepMerge } = require('../../core/util');

const KINDS = ['superchat', 'bits', 'member', 'gift', 'raid', 'follow', 'subscribe'];
const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const kind = (icon, title, sub, extra = {}) => ({ on: true, icon, title, sub, showText: true, effect: 'confetti', sound: true, sec: 7, ...extra });
const defaults = () => ({
  enabled: true,
  kinds: {
    superchat: kind('💎', '{name}', 'スーパーチャット {amount} ありがとう!', { effect: 'both' }),
    bits: kind('💎', '{name}', '{amount} ありがとう!'),
    member: kind('⭐', '{name}', 'メンバーになってくれてありがとう!'),
    gift: kind('🎁', '{name}', '{count}人にギフト!ありがとう!', { effect: 'both' }),
    raid: kind('🚀', '{name}', '{viewers}人でレイド!いらっしゃい!', { effect: 'fireworks', sec: 8 }),
    follow: kind('❤️', '{name}', 'フォローありがとう!', { effect: 'none', sec: 5, showText: false }),
    subscribe: kind('🔔', '{name}', 'チャンネル登録ありがとう!', { sec: 6, showText: false, auto: false }),
  },
  subsAuto: false, // YouTube の登録者数が増えたら、名前なしで「チャンネル登録」のアラートを出す(お祝いと重なるので初期はオフ)
  gapSec: 1, // 次のアラートまでの間
  token: crypto.randomBytes(6).toString('hex'),
});
function normKind(o, d) {
  const k = { ...d, ...(isPlainObject(o) ? o : {}) };
  k.on = k.on !== false;
  k.icon = String(k.icon || '').slice(0, 8);
  k.title = String(k.title == null ? d.title : k.title).slice(0, 80);
  k.sub = String(k.sub == null ? d.sub : k.sub).slice(0, 120);
  k.effect = ['none', 'confetti', 'fireworks', 'both'].includes(k.effect) ? k.effect : d.effect;
  k.sec = num(k.sec, d.sec, 2, 30);
  k.showText = !!k.showText;
  k.sound = k.sound !== false;
  return k;
}
function normalize(v) {
  const d = defaults();
  const o = isPlainObject(v) ? v : {};
  const ks = isPlainObject(o.kinds) ? o.kinds : {};
  return {
    enabled: o.enabled !== false,
    kinds: Object.fromEntries(KINDS.map((k) => [k, normKind(ks[k], d.kinds[k])])),
    subsAuto: !!o.subsAuto,
    gapSec: num(o.gapSec, 1, 0, 10),
    token: typeof o.token === 'string' && o.token ? o.token : d.token,
  };
}
// 画面ごとの表示位置(上の中央からのずれ)
const viewDefault = () => ({ y: 70, scale: 1 });
const viewNormalize = (v, d = viewDefault()) => { const o = isPlainObject(v) ? v : {}; return { y: num(o.y, d.y, 0, 1800), scale: num(o.scale, d.scale, 0.4, 2.5) }; };
const emptyShow = () => ({ active: false, seq: 0, item: null });

let storeRef = null;
let hubRef = null;
let busRef = null;
const queue = [];
let timer = null;
const S = () => storeRef.state;
function publish() { hubRef.broadcast('core:section', { key: 'alertShow', value: S().alertShow }); }

const fill = (tpl, ev) => String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (ev[k] == null || ev[k] === '' ? '' : String(ev[k]))).replace(/\s{2,}/g, ' ').trim();
/** アラートを並べる(表示中なら、終わってから順番に) */
function enqueue(ev) {
  const cfg = S().alerts;
  if (!cfg || !cfg.enabled || !KINDS.includes(ev.kind)) return false;
  const k = cfg.kinds[ev.kind];
  if (!k || !k.on) return false;
  const e = { ...ev, name: ev.name || (ev.kind === 'subscribe' ? '' : '???') };
  let sub = fill(k.sub, e);
  if (ev.kind === 'member' && Number(ev.months) > 1) sub += `(${ev.months}か月)`;
  const item = {
    name: e.name,
    kind: ev.kind, icon: k.icon, title: fill(k.title, e) || fill('{name}', e), sub,
    text: k.showText ? String(ev.text || '').slice(0, 140) : '', effect: k.effect, sound: k.sound, sec: k.sec, platform: ev.platform || '',
  };
  if (!item.title && ev.kind === 'subscribe') { item.title = sub; item.sub = ''; }
  if (queue.length >= 20) queue.shift(); // たまりすぎたら古いものから捨てる
  queue.push(item);
  if (!S().alertShow.active) next();
  return true;
}
function next() {
  clearTimeout(timer);
  const sh = S().alertShow;
  const item = queue.shift();
  if (!item) { if (sh.active) { sh.active = false; publish(); } return; }
  sh.active = true;
  sh.seq += 1;
  sh.item = item;
  publish();
  busRef.emit('alert:shown', { kind: item.kind, name: item.name }); // キャラクターは、表示したときに喜ぶ
  timer = setTimeout(() => {
    sh.active = false;
    publish();
    timer = setTimeout(next, (Number(S().alerts.gapSec) || 1) * 1000 + 600); // 消える動きのあとに次へ
  }, item.sec * 1000);
}
function clearAll() { queue.length = 0; clearTimeout(timer); const sh = S().alertShow; if (sh.active) { sh.active = false; publish(); } }

module.exports = {
  order: 71,
  namespace: 'alerts',
  sections: {
    alerts: { default: defaults, normalize },
    alertView: { default: viewDefault, normalize: (v) => viewNormalize(v), vDefault: () => ({ y: 300, scale: 0.9 }), vNormalize: (v) => viewNormalize(v, { y: 300, scale: 0.9 }) },
    alertShow: { transient: true, default: emptyShow, normalize: () => emptyShow() },
  },
  init({ app, store, hub, bus }) {
    storeRef = store;
    hubRef = hub;
    busRef = bus;
    if (!S().alertShow) S().alertShow = emptyShow();
    // 表示しないアラート(オフの種類・アラート自体がオフ)でも、キャラクターは反応する
    bus.on('alert:event', (ev) => { if (!enqueue(ev)) bus.emit('alert:shown', { kind: ev.kind, name: ev.name || '' }); });
    bus.on('yt:subs', ({ delta }) => { if (S().alerts.subsAuto) enqueue({ kind: 'subscribe', name: '', count: delta, platform: 'youtube' }); });
    // 外部のツール(Stream Deck・Streamer.bot など)から:/api/alert?token=…&kind=follow&name=…
    app.get('/api/alert', (req, res) => {
      const q = req.query;
      if (String(q.token || '') !== S().alerts.token) return res.status(403).json({ error: '合言葉(token)が違います' });
      const k = String(q.kind || '');
      if (!KINDS.includes(k)) return res.status(400).json({ error: `kind には ${KINDS.join(' / ')} のどれかを指定してください` });
      const ev = { kind: k, name: String(q.name || '').slice(0, 60), amount: String(q.amount || '').slice(0, 30), text: String(q.text || '').slice(0, 200), count: Number(q.count) || 1, viewers: Number(q.viewers) || 0, months: Number(q.months) || 0, platform: 'external' };
      // キャラクター・最新のサポーターにも伝える(表示はアラート側が受け取る)
      bus.emit('alert:event', { ...ev, at: Date.now() });
      res.json({ ok: true });
    });
  },
  handlers: {
    update({ patch }, ctx) {
      if (!isPlainObject(patch)) return;
      const p = { ...patch };
      delete p.token;
      deepMerge(ctx.raw.alerts, p);
      ctx.raw.alerts = normalize(ctx.raw.alerts);
      ctx.commitRaw('alerts');
    },
    updateView({ patch }, ctx) {
      if (!isPlainObject(patch)) return;
      deepMerge(ctx.state.alertView, patch);
      ctx.state.alertView = viewNormalize(ctx.state.alertView, ctx.canvas === 'v' ? { y: 300, scale: 0.9 } : viewDefault());
      ctx.commit('alertView');
    },
    // 手動・テスト(キャラクターの反応も一緒に動く)
    fire({ kind, name, amount, text, count, viewers, test }) {
      const k = KINDS.includes(kind) ? kind : 'follow';
      const en = (S().app || {}).lang === 'en';
      const sample = { superchat: { amount: en ? '$10.00' : '¥1,000', text: en ? 'Always cheering for you!' : 'いつも応援してます!' }, bits: { amount: '500 bits', text: 'GG!' }, gift: { count: 5 }, raid: { viewers: 42 }, member: { months: 1 } }[k] || {};
      busRef.emit('alert:event', { kind: k, name: String(name || '').trim() || (test ? 'テストさん' : ''), ...sample, ...(amount ? { amount } : {}), ...(text ? { text } : {}), ...(count ? { count } : {}), ...(viewers ? { viewers } : {}), platform: 'manual', test: !!test, at: Date.now() });
    },
    skip() { clearTimeout(timer); const sh = S().alertShow; if (sh.active) { sh.active = false; publish(); } timer = setTimeout(next, 600); },
    clear() { clearAll(); },
    newToken(_, ctx) {
      ctx.raw.alerts.token = crypto.randomBytes(6).toString('hex');
      ctx.commitRaw('alerts');
      ctx.toast('呼び出しURLを作り直しました。以前のURLは使えなくなります');
    },
  },
  KINDS,
};
