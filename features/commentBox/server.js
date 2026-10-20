'use strict';
// コメント欄:ダミー表示、または YouTube のライブチャット(横型・縦型・両方)をそのまま表示する。
// 縦型配信の画面に「横型配信のコメント」を出す、といった使い方ができる。API の消費は増えない(取得済みのチャットを使う)。
const MAX = 60; // 覚えておく件数(横・縦それぞれ)

let storeRef = null;
let hubRef = null;
let pubTimer = null;

const emptyLog = () => ({ h: [], v: [] });

function publish() {
  // 続けて届いたときは、まとめて1回だけ送る
  if (pubTimer) return;
  pubTimer = setTimeout(() => {
    pubTimer = null;
    hubRef.broadcast('core:section', { key: 'chatLog', value: storeRef.state.chatLog });
  }, 150);
}

function push(messages) {
  const log = storeRef.state.chatLog;
  let n = 0;
  for (const m of messages || []) {
    const side = m.side === 'v' ? 'v' : 'h';
    const list = log[side];
    if (m.id && list.some((x) => x.id === m.id)) continue;
    list.push({
      id: m.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: String(m.name || '').slice(0, 60),
      text: String(m.text || '').slice(0, 300),
      amount: m.amount || '',
      sc: m.type === 'superChatEvent' || m.type === 'superStickerEvent',
      platform: m.platform || 'youtube',
      badges: Array.isArray(m.badges) ? m.badges : [],
      color: m.color || '',
      parts: Array.isArray(m.parts) ? m.parts : null,
      kind: m.kind || 'text',
      at: Date.parse(m.at) || Date.now(),
    });
    if (list.length > MAX) list.splice(0, list.length - MAX);
    n += 1;
  }
  if (n) publish();
}

const SAMPLE = [
  ['たろう', 'こんばんは!横から来ました'],
  ['ゲーム好き', 'このBGM最高'],
  ['ゆうき', '次のボス強そう…'],
  ['みかん', 'がんばれー'],
  ['ねこまる', 'ナイスプレイ!', '¥500'],
  ['そら', 'セーブ忘れずに!'],
];
let sampleIdx = 0;
let busRef = null;

module.exports = {
  order: 50,
  sections: {
    // 最近のチャット(保存しない。サーバーを再起動すると空になる)
    chatLog: { transient: true, default: emptyLog, normalize: (v) => (v && Array.isArray(v.h) && Array.isArray(v.v) ? v : emptyLog()) },
  },
  panelTypes: {
    comments: {
      label: 'コメント欄',
      defaults: () => ({
        name: 'コメント欄',
        fill: true,
        look: { bodySize: 18 },
        data: {
          title: 'コメント',
          showTitle: true,
          // source: 'dummy' / h = 横型配信のチャット / v = 縦型配信のチャット / all = 両方(未設定なら dummy の値で決める)
          max: 12, // 表示する件数(入りきらない古いものは上に消える)
          showName: true,
          showMark: true, // 両方を表示するとき、横・縦の印を付ける
          source: 'h', // 横型配信のチャット(YouTube・Twitch)
          dummy: false,
          look: 'bubble',
          life: 0,
          sample: 'たろう: こんばんは!初見です\nゲーム好き: このBGM最高\nゆうき: 次のボス強そう…\nみかん: がんばれー',
        },
      }),
    },
  },
  init({ store, hub, bus }) {
    storeRef = store;
    hubRef = hub;
    busRef = bus;
    bus.on('chat:messages', ({ messages }) => push(messages));
  },
  handlers: {
    // テスト用のコメントを流す(YouTube がなくても見た目を確認できる)
    test({ side, count }, ctx) {
      const n = Math.max(1, Math.min(10, Number(count) || 1));
      const msgs = [];
      for (let i = 0; i < n; i++) {
        const [name, text, amount] = SAMPLE[sampleIdx++ % SAMPLE.length];
        msgs.push({ name, text, amount: amount || '', type: amount ? 'superChatEvent' : 'textMessageEvent', side: side === 'v' ? 'v' : 'h', at: new Date().toISOString() });
      }
      // チャットの取り込み口を通す(除外の設定なども、本物と同じように効く)
      busRef.emit('chat:raw', { platform: 'youtube', messages: msgs });
      void ctx;
    },
    clear(_, ctx) {
      ctx.state.chatLog = emptyLog();
      ctx.commit('chatLog');
    },
  },
};
