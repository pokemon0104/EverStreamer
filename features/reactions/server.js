'use strict';
// いいね・コメントを受け取ったときの演出
// YouTube 連携から「いいねが増えた」「コメントが来た」を受け取り、オーバーレイに演出の指示を送る(API は使わない)
const { deepMerge, isPlainObject } = require('../../core/util');

const LIKE_TYPES = ['heart', 'star', 'coin', 'firework', 'confetti', 'plusone', 'glow'];
const COMMENT_TYPES = ['bubble', 'scroll', 'dotwin', 'glow'];

const defaults = () => ({
  volume: 0.4,
  like: {
    enabled: true,
    type: 'heart',
    area: 'panel', // panel = いいねの数値パネルのそば / area = 指定した範囲 / screen = 画面全体
    x: 40, y: 560, w: 900, h: 480,
    size: 1,
    max: 10, // 一度に出す最大数(それ以上は「+N」でまとめて表示)
    color: '#ff4f78',
    sound: false,
  },
  comment: {
    enabled: true,
    type: 'bubble',
    area: 'area',
    x: 40, y: 560, w: 900, h: 480,
    size: 1,
    max: 6, // 同時に画面に出す最大数
    showText: true, // 名前と本文を表示する
    sound: false,
  },
  // コメントの言葉に反応して、絵文字を舞わせる
  word: {
    enabled: true,
    area: 'area', // area = 指定した範囲 / screen = 画面全体
    x: 40, y: 300, w: 900, h: 560,
    size: 1,
    max: 12, // 同時に画面に出す最大数
    cooldownSec: 1.5, // 同じ言葉の連続反応の間隔(連打で画面が埋まらないように)
    rules: [
      { id: 'w1', triggers: ['草', 'ww', 'ｗｗ'], icons: ['🌱', '草', '🌿'], color: '#4ade80' },
      { id: 'w2', triggers: ['8888', 'パチパチ', 'clap'], icons: ['👏', '✨', '8888'], color: '#fde047' },
      { id: 'w3', triggers: ['gg', 'ナイス', 'nice'], icons: ['🎉', 'GG!', '🏆'], color: '#38bdf8' },
      { id: 'w4', triggers: ['神', 'きた'], icons: ['🔥', '神!', '⚡'], color: '#f43f5e' },
      { id: 'w5', triggers: ['セーブ', 'save'], icons: ['💾', '⛺', 'SAVE', '📖'], color: '#38bdf8' },
    ],
  },
});

const SAMPLE = [
  { name: 'たろう', text: 'こんばんは!' },
  { name: 'ゲーム好き', text: 'このBGM最高です' },
  { name: 'ゆうき', text: '次のボス強そう…' },
  { name: 'みかん', text: 'がんばれー' },
  { name: 'ねこまる', text: 'ナイスプレイ!', amount: '¥500', type: 'superChatEvent' },
];
const SAMPLE_EN = [
  { name: 'Taro', text: 'Good evening!' },
  { name: 'GameFan', text: 'This BGM is great' },
  { name: 'Yuki', text: 'The next boss looks tough…' },
  { name: 'Mika', text: 'You got this!' },
  { name: 'Neko', text: 'Nice play!', amount: '$5.00', type: 'superChatEvent' },
];

let hubRef = null;
let storeRef = null;
const lastWord = {}; // ルールごとの、最後に反応した時刻
const nz = (s) => String(s || '').normalize('NFKC').toLowerCase();

// コメントに、登録した言葉が含まれていれば絵文字を舞わせる(横画面・縦画面それぞれの設定で)
function matchWords(messages) {
  for (const [canvas, key] of [['h', 'reactions'], ['v', 'vReactions']]) {
    const w = (storeRef.state[key] || {}).word;
    if (!w || !w.enabled) continue;
    const now = Date.now();
    const hit = new Set();
    for (const m of messages) {
      const t = nz(m.text);
      for (const r of w.rules || []) {
        if ((r.triggers || []).some((x) => nz(x) && t.includes(nz(x)))) hit.add(r);
      }
    }
    for (const r of hit) {
      const lk = `${canvas}:${r.id}`;
      if (now - (lastWord[lk] || 0) < (Number(w.cooldownSec) || 0) * 1000) continue;
      lastWord[lk] = now;
      hubRef.broadcast('reactions:fire', { kind: 'word', canvas, icons: r.icons || [], color: r.color || '#ffffff', at: now });
    }
  }
}

function normalize(v) {
  const d = defaults();
  const o = isPlainObject(v) ? v : {};
  const out = { ...d, ...o, like: { ...d.like, ...(o.like || {}) }, comment: { ...d.comment, ...(o.comment || {}) }, word: { ...d.word, ...(o.word || {}) } };
  if (!Array.isArray(out.word.rules)) out.word.rules = d.word.rules;
  if (!LIKE_TYPES.includes(out.like.type)) out.like.type = 'heart';
  if (!COMMENT_TYPES.includes(out.comment.type)) out.comment.type = 'bubble';
  return out;
}

function fire(kind, payload) {
  // 横か縦のどちらかで有効なら送る(それぞれの画面が、自分の設定で表示するか決める)
  const on = (c) => c && c[kind] && c[kind].enabled;
  if (!on(storeRef.state.reactions) && !on(storeRef.state.vReactions)) return;
  hubRef.broadcast('reactions:fire', { kind, ...payload, at: Date.now() });
}

module.exports = {
  order: 65,
  sections: {
    reactions: {
      default: defaults,
      normalize,
      // 縦画面:YouTube がコメントを表示するので、コメントの演出は初期はオフ。いいねはゲーム映像の右下あたり
      vDefault: () => normalize({
        like: { area: 'area', x: 620, y: 720, w: 440, h: 380 },
        comment: { enabled: false, area: 'area', x: 40, y: 700, w: 1000, h: 380 },
        word: { area: 'area', x: 40, y: 320, w: 1000, h: 700 },
      }),
    },
  },
  init({ hub, store, bus }) {
    hubRef = hub;
    storeRef = store;
    bus.on('yt:likes', ({ delta }) => fire('like', { count: delta }));
    bus.on('chat:messages', ({ messages, spreadMs }) => {
      const fresh = (messages || []).filter((m) => !m.old); // 取得し始めたときの古いチャットは演出しない
      if (fresh.length) { fire('comment', { messages: fresh, spreadMs }); matchWords(fresh); }
    });
  },
  handlers: {
    update({ patch }, ctx) {
      if (!isPlainObject(patch)) return;
      deepMerge(ctx.state.reactions, patch);
      ctx.state.reactions = normalize(ctx.state.reactions);
      ctx.commit('reactions');
    },
    // テスト再生(YouTube がなくても動きを確認できる)
    test({ kind, count }, ctx) {
      const n = Math.max(1, Math.min(50, Number(count) || 1));
      if (kind === 'word') {
        const r = (ctx.state.reactions.word.rules || []).find((x) => x.id === arguments[0].rule) || (ctx.state.reactions.word.rules || [])[0];
        if (r) ctx.broadcast('reactions:fire', { kind: 'word', canvas: ctx.canvas, icons: r.icons || [], color: r.color || '#fff', test: true, at: Date.now() });
      } else if (kind === 'like') ctx.broadcast('reactions:fire', { kind: 'like', canvas: ctx.canvas, count: n, test: true, at: Date.now() });
      else {
        const list = (ctx.raw.app || {}).lang === 'en' ? SAMPLE_EN : SAMPLE;
        const messages = Array.from({ length: n }, (_, i) => list[i % list.length]);
        ctx.broadcast('reactions:fire', { kind: 'comment', canvas: ctx.canvas, messages, spreadMs: 3000, test: true, at: Date.now() });
      }
    },
  },
};
