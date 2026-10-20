'use strict';
// チャットの取り込み口:YouTube・Twitch などのコメントを、共通の形にそろえて各機能へ配る
//
// 共通の形(1件のコメント)
//   { id, platform: 'youtube' | 'twitch' | 'dummy', side: 'h' | 'v', name, userId, text,
//     parts: null | [{ t: 'text', v } | { t: 'emote', url, alt }],   // 絵文字・エモート画像入りの本文
//     badges: ['owner' | 'moderator' | 'member' | 'vip' | 'verified'],
//     kind: 'text' | 'superchat' | 'sticker' | 'bits', amount, color, at (ISO 文字列), old,
//     type }  // type は以前の形(textMessageEvent / superChatEvent …)。古い機能のために残す
//
// 配る先(bus):
//   'chat:messages' { messages, spreadMs }   … コメント欄・投票・演出・キャラクターなど
//   'alert:event'   { kind, name, … }        … アラート(スパチャ・メンバー・ギフト・レイドなど)
//
// プラットフォームを足すときは platforms/<名前>.js を作り、PLATFORMS に加える
//   module.exports = { id, label, create(api) → { start(cfg), stop() } }
//   api.emit([コメント…]) / api.event(アラート) / api.status(state, detail)
const { isPlainObject } = require('../../core/util');

const PLATFORMS = [require('./platforms/twitch')];
const BOTS = ['nightbot', 'streamelements', 'streamlabs', 'moobot', 'fossabot', 'wizebot', 'botisimo', 'deepbot', 'coebot', 'phantombot', 'sery_bot', 'kofistreambot', 'soundalerts'];

const defaults = () => ({
  twitch: { channel: '', side: 'h' }, // side = Twitch のコメントを、横・縦どちらの配信のコメントとして扱うか
  exclude: '', // 除外する名前(改行かカンマで区切る)
  excludeBots: true, // よくある Bot(Nightbot など)を除外
  hideCommands: false, // 「!」で始まるコマンドを除外
});
function normalize(v) {
  const d = defaults();
  const o = isPlainObject(v) ? v : {};
  const tw = isPlainObject(o.twitch) ? o.twitch : {};
  return {
    twitch: { channel: String(tw.channel || '').slice(0, 60), side: tw.side === 'v' ? 'v' : 'h' },
    exclude: String(o.exclude == null ? d.exclude : o.exclude).slice(0, 4000),
    excludeBots: o.excludeBots !== false,
    hideCommands: !!o.hideCommands,
  };
}
const emptyStatus = () => ({ twitch: { state: 'off', detail: '', at: 0, count: 0 }, dummy: { count: 0 } });

let storeRef = null;
let hubRef = null;
let busRef = null;
const S = () => storeRef.state;
function publishStatus() { hubRef.broadcast('core:section', { key: 'chatStatus', value: S().chatStatus }); }

// ---- 除外 ----
function excluded(m) {
  const cfg = S().chat || defaults();
  const n = String(m.name || '').trim().toLowerCase();
  const list = String(cfg.exclude || '').split(/[\n,、]+/).map((x) => x.trim().toLowerCase()).filter(Boolean);
  if (n && list.includes(n)) return true;
  if (m.userId && list.includes(String(m.userId).toLowerCase())) return true;
  if (cfg.excludeBots && (BOTS.includes(n.replace(/\s/g, '')) || /bot$/i.test(n) && m.badges && m.badges.includes('moderator'))) return true;
  if (cfg.hideCommands && /^\s*!/.test(m.text || '')) return true;
  return false;
}

// ---- 共通の形にそろえる ----
const TYPE = { superchat: 'superChatEvent', sticker: 'superStickerEvent', bits: 'superChatEvent', text: 'textMessageEvent' };
function norm(m, platform, side) {
  const kind = ['superchat', 'sticker', 'bits'].includes(m.kind) ? m.kind
    : m.type === 'superChatEvent' ? 'superchat' : m.type === 'superStickerEvent' ? 'sticker' : 'text';
  return {
    id: String(m.id || `${platform}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`),
    platform,
    side: (m.side || side) === 'v' ? 'v' : 'h',
    name: String(m.name || '').slice(0, 60),
    userId: String(m.userId || ''),
    text: String(m.text || '').slice(0, 500),
    parts: Array.isArray(m.parts) ? m.parts.slice(0, 200) : null,
    badges: Array.isArray(m.badges) ? m.badges.slice(0, 6) : [],
    kind,
    amount: String(m.amount || ''),
    color: m.color || '',
    at: m.at || new Date().toISOString(),
    old: !!m.old,
    type: TYPE[kind],
  };
}
function deliver(platform, raw, opts = {}) {
  const messages = (raw || []).map((m) => norm(m, platform, opts.side)).filter((m) => !excluded(m));
  if (!messages.length) return;
  const st = S().chatStatus;
  if (st[platform]) { st[platform].count = (st[platform].count || 0) + messages.length; st[platform].lastAt = Date.now(); }
  busRef.emit('chat:messages', { messages, spreadMs: opts.spreadMs || 2000 });
  // スーパーチャット・スーパーステッカー・ビッツは、アラートにも送る(取得し始めたときの古いものは除く)
  for (const m of messages) {
    if (m.old || !['superchat', 'sticker', 'bits'].includes(m.kind)) continue;
    alert({ kind: m.kind === 'bits' ? 'bits' : 'superchat', name: m.name, amount: m.amount, text: m.text, platform: m.platform, test: !!opts.test });
  }
  publishStatusSoon();
}
let pubTimer = null;
function publishStatusSoon() { if (!pubTimer) pubTimer = setTimeout(() => { pubTimer = null; publishStatus(); }, 500); }
function alert(ev) {
  if (!ev || !ev.kind) return;
  if (ev.name && excluded({ name: ev.name, text: '' })) return;
  busRef.emit('alert:event', { ...ev, at: Date.now() });
}

// ---- ダミー(テスト用) ----
const DUMMY = {
  text: [['たろう', 'こんばんは!初見です'], ['ゲーム好き', 'このBGM最高 🎵'], ['ゆうき', '次のボス強そう…'], ['みかん', 'がんばれー!'], ['そら', '草'], ['ねこまる', 'gg']],
  superchat: [['ねこまる', 'いつも楽しく見てます!', '¥500'], ['あおい', '応援してます', '¥1,000'], ['とも', 'ナイスプレイ!', '¥2,000']],
};
const DUMMY_EN = {
  text: [['Taro', 'Hi! First time here'], ['GameFan', 'This BGM is great 🎵'], ['Yuki', 'The next boss looks tough…'], ['Mika', 'You got this!'], ['Sora', 'lol'], ['Neko', 'gg']],
  superchat: [['Neko', 'Love your streams!', '$5.00'], ['Aoi', 'Keep it up!', '$10.00'], ['Tomo', 'Nice play!', '$20.00']],
};
let di = 0;
function dummy({ kind = 'text', platform = 'youtube', side = 'h', count = 1 }) {
  const D = (S().app || {}).lang === 'en' ? DUMMY_EN : DUMMY; // 管理画面の言語に合わせる
  const n = Math.max(1, Math.min(20, Number(count) || 1));
  const msgs = [];
  for (let i = 0; i < n; i++) {
    const k = kind === 'mix' ? (['text', 'text', 'superchat', 'text', 'mod'][di % 5]) : kind;
    if (k === 'superchat') {
      const [name, text, amount] = D.superchat[di++ % D.superchat.length];
      msgs.push(platform === 'twitch' ? { name, text, kind: 'bits', amount: '500 bits', badges: [], color: '#9147ff' } : { name, text, kind: 'superchat', amount, badges: ['member'] });
    } else {
      const [name, text] = D.text[di++ % D.text.length];
      const badges = k === 'mod' ? ['moderator'] : (di % 3 === 0 ? ['member'] : []);
      const colors = ['#ff6b8b', '#4fd1ff', '#7dff6b', '#ffd84a', '#c47dff'];
      msgs.push({ name: k === 'mod' ? ((S().app || {}).lang === 'en' ? `${name} (mod)` : `${name}(モデレーター)`) : name, text, kind: 'text', badges, color: platform === 'twitch' ? colors[di % colors.length] : '' });
    }
  }
  S().chatStatus.dummy.count += msgs.length;
  deliver(platform === 'twitch' ? 'twitch' : 'youtube', msgs.map((m) => ({ ...m, side })), { spreadMs: 1500, test: true });
}

// ---- プラットフォーム ----
const instances = {};
function applyConfig() {
  const cfg = S().chat;
  const tw = instances.twitch;
  if (tw) tw.start({ channel: cfg.twitch.channel });
}

module.exports = {
  order: 48,
  namespace: 'chat',
  sections: {
    chat: { default: defaults, normalize },
    chatStatus: { transient: true, default: emptyStatus, normalize: (v) => (isPlainObject(v) && v.twitch ? v : emptyStatus()) },
  },
  init({ store, hub, bus, app }) {
    storeRef = store;
    hubRef = hub;
    busRef = bus;
    if (!S().chatStatus) S().chatStatus = emptyStatus();
    for (const P of PLATFORMS) {
      instances[P.id] = P.create({
        emit: (msgs) => deliver(P.id, msgs, { side: S().chat[P.id] ? S().chat[P.id].side : 'h' }),
        event: (ev) => alert(ev),
        status: (state, detail) => {
          const st = S().chatStatus[P.id] || (S().chatStatus[P.id] = { count: 0 });
          if (st.state === state && st.detail === detail) return;
          Object.assign(st, { state, detail: String(detail || ''), at: Date.now() });
          publishStatus();
        },
      });
    }
    // YouTube(youtube 機能が取得したもの)を、共通の形にして配る
    bus.on('yt:chat', ({ messages, spreadMs }) => deliver('youtube', messages, { spreadMs }));
    bus.on('yt:member', ({ members }) => {
      for (const m of members || []) alert(m.count > 1 || m.kind === 'gift' ? { kind: 'gift', name: m.name, count: m.count || 1, platform: 'youtube' } : { kind: 'member', name: m.name, months: m.months || 0, platform: 'youtube' });
    });
    // ほかの機能のテストコメント(コメント連動タブなど)
    bus.on('chat:raw', ({ platform, messages, spreadMs }) => deliver(platform === 'twitch' ? 'twitch' : 'youtube', messages, { spreadMs }));
    // 起動が終わってから接続する(ほかの機能の準備ができてから)
    setTimeout(applyConfig, 300);
    process.on('exit', () => { for (const i of Object.values(instances)) try { i.stop(); } catch { /* ignore */ } });
    void app;
  },
  handlers: {
    update({ patch }, ctx) {
      if (!isPlainObject(patch)) return;
      const cur = ctx.raw.chat;
      if (isPlainObject(patch.twitch)) Object.assign(cur.twitch, patch.twitch);
      for (const k of ['exclude', 'excludeBots', 'hideCommands']) if (patch[k] !== undefined) cur[k] = patch[k];
      ctx.raw.chat = normalize(cur);
      ctx.commitRaw('chat');
      if (isPlainObject(patch.twitch) && patch.twitch.channel !== undefined) applyConfig();
    },
    reconnect({ platform }) {
      const i = instances[platform || 'twitch'];
      if (!i) return;
      i.stop();
      applyConfig();
    },
    dummy(p) { dummy(p || {}); },
  },
  _test: { norm, excluded: (m) => excluded(m) },
  BOTS,
};
