'use strict';
// 配信終了時の感謝メッセージ:ボタン1つで画面いっぱいに表示する
const crypto = require('crypto');
const { uid, deepMerge, isPlainObject, clone } = require('../../core/util');

const ANIMS = ['pop', 'zoom', 'type', 'slide', 'shine'];
const EFFECTS = ['none', 'confetti', 'fireworks', 'both'];

const defaultMessages = () => [
  { id: 'th_1', text: 'ありがとうございました', lookId: 'tpl', inSet: true },
  { id: 'th_2', text: '明日も素晴らしい一日を', lookId: 'tpl', inSet: true },
  { id: 'th_3', text: 'また遊びに来てね', lookId: 'tpl', inSet: true },
  { id: 'th_4', text: '見てくれてありがとう!', lookId: 'tpl', inSet: false },
];
const defaults = () => ({
  messages: defaultMessages(),
  durationSec: 8, // 1つだけ表示したときの時間
  setSec: 5, // エンディングセットの1枚あたりの時間
  holdLast: false, // 最後の画面を消さずに残す
  showStats: true, // セットの最後に「今日の記録」を入れる
  statsSec: 8,
  anim: 'pop',
  effect: 'confetti',
  dim: 0.6, // 暗幕の濃さ
  hideSidebar: true, // 表示中はサイドバーを隠す
  avoidAvatar: false, // アバターの枠を避けて表示する
  confirmTwice: false, // 2回押さないと表示しない(誤操作防止)
  token: crypto.randomBytes(6).toString('hex'), // 呼び出しURL用の合言葉
});
const emptyShow = () => ({ active: false, seq: 0, index: 0, items: [] });

let storeRef = null;
let hubRef = null;
let timer = null;

function normalize(v) {
  const d = defaults();
  const o = isPlainObject(v) ? v : {};
  const out = { ...d, ...o };
  if (!Array.isArray(out.messages)) out.messages = defaultMessages();
  if (!ANIMS.includes(out.anim)) out.anim = 'pop';
  if (!EFFECTS.includes(out.effect)) out.effect = 'confetti';
  if (!out.token) out.token = d.token;
  return out;
}

function publish() {
  storeRef.scheduleSave();
  hubRef.broadcast('core:section', { key: 'thanksShow', value: storeRef.state.thanksShow });
}

// 「今日の記録」:配信時間・最大同時視聴者数・高評価・チャット数(取れているものだけ)
function statsRows(state) {
  const rows = [];
  const t = state.timer || {};
  if (t.startedAt) {
    const m = Math.floor(Math.max(0, (t.stoppedAt || Date.now()) - t.startedAt) / 60000);
    rows.push(['配信時間', m >= 60 ? `${Math.floor(m / 60)}時間${m % 60}分` : `${m}分`]);
  }
  const y = state.ytStats || {};
  const tot = y.total || {};
  const fmt = (n) => Number(n).toLocaleString('ja-JP');
  if (y.updatedAt) {
    if (y.peakViewers) rows.push(['最大同時視聴者', `${fmt(y.peakViewers)}人`]);
    if (tot.likeCount != null) rows.push(['高評価', fmt(tot.likeCount)]);
    if (tot.chatCount != null) rows.push(['チャット', `${fmt(tot.chatCount)}件`]);
  }
  return rows;
}

function play(items) {
  clearTimeout(timer);
  if (!items.length) return;
  const prev = storeRef.state.thanksShow || emptyShow();
  storeRef.state.thanksShow = { active: true, seq: (prev.seq || 0) + 1, index: 0, items };
  publish();
  step();
}
function step() {
  const sh = storeRef.state.thanksShow;
  const it = sh.items[sh.index];
  timer = setTimeout(() => {
    const now = storeRef.state.thanksShow;
    if (now !== sh || !now.active) return;
    if (now.index < now.items.length - 1) { now.index += 1; publish(); step(); return; }
    if (!storeRef.state.thanks.holdLast) hide();
  }, Math.max(1, Number(it.sec) || 5) * 1000);
}
function hide() {
  clearTimeout(timer);
  const sh = storeRef.state.thanksShow;
  if (!sh.active) return;
  sh.active = false;
  publish();
}
const msgItem = (m, sec) => ({ kind: 'text', text: m.text, lookId: m.lookId, sec });
function playSet() {
  const cfg = storeRef.state.thanks;
  const items = cfg.messages.filter((m) => m.inSet && String(m.text || '').trim()).map((m) => msgItem(m, cfg.setSec));
  if (cfg.showStats) {
    const rows = statsRows(storeRef.state);
    if (rows.length) items.push({ kind: 'stats', rows, sec: cfg.statsSec });
  }
  play(items);
}
function showOne(m) {
  if (m && String(m.text || '').trim()) play([msgItem(m, storeRef.state.thanks.durationSec)]);
}

module.exports = {
  order: 70,
  sections: {
    thanks: { default: defaults, normalize },
    // いま表示中の内容(起動時は必ず消えた状態から)
    thanksShow: { default: emptyShow, normalize: () => emptyShow() },
  },
  init({ app, store, hub }) {
    storeRef = store;
    hubRef = hub;
    // Stream Deck やスマホからも押せる呼び出しURL(このPCの中だけ・合言葉つき)
    app.get('/api/thanks/:action', (req, res) => {
      if (String(req.query.token || '') !== store.state.thanks.token) return res.status(403).json({ error: '合言葉(token)が違います' });
      const { action } = req.params;
      if (action === 'play') playSet();
      else if (action === 'hide') hide();
      else if (action === 'show') {
        const n = Number(req.query.n) || 1;
        showOne(store.state.thanks.messages[n - 1]);
      } else return res.status(404).json({ error: 'play / show / hide のどれかを指定してください' });
      res.json({ ok: true });
    });
  },
  handlers: {
    playSet() { playSet(); },
    show({ id }, ctx) { showOne(ctx.state.thanks.messages.find((m) => m.id === id)); },
    hide() { hide(); },
    update({ patch }, ctx) {
      if (!isPlainObject(patch)) return;
      const p = { ...patch };
      delete p.messages;
      delete p.token;
      deepMerge(ctx.state.thanks, p);
      ctx.state.thanks = normalize(ctx.state.thanks);
      ctx.commit('thanks');
    },
    addMessage({ text }, ctx) {
      ctx.state.thanks.messages.push({ id: uid('th'), text: String(text || '新しいメッセージ').slice(0, 80), lookId: 'tpl', inSet: true });
      ctx.commit('thanks');
    },
    updateMessage({ id, patch }, ctx) {
      const m = ctx.state.thanks.messages.find((x) => x.id === id);
      if (!m || !isPlainObject(patch)) return;
      if (typeof patch.text === 'string') m.text = patch.text.slice(0, 80);
      if (typeof patch.lookId === 'string') m.lookId = patch.lookId;
      if (typeof patch.inSet === 'boolean') m.inSet = patch.inSet;
      ctx.commit('thanks');
    },
    removeMessage({ id }, ctx) {
      ctx.state.thanks.messages = ctx.state.thanks.messages.filter((x) => x.id !== id);
      ctx.commit('thanks');
    },
    moveMessage({ id, dir }, ctx) {
      const list = ctx.state.thanks.messages;
      const i = list.findIndex((x) => x.id === id);
      const j = i + (dir < 0 ? -1 : 1);
      if (i < 0 || j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      ctx.commit('thanks');
    },
    newToken(_, ctx) {
      ctx.state.thanks.token = crypto.randomBytes(6).toString('hex');
      ctx.commit('thanks');
      ctx.toast('呼び出しURLを作り直しました。以前のURLは使えなくなります');
    },
  },
  _test: { statsRows, clone },
};
