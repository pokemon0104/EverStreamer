'use strict';
// キャラクター(PNGtuber 方式):画像 2〜4 枚(口閉じ・口開き・目閉じ・喜び)を、声・コメント・アラートで動かす
// ・画像と動き・反応の設定は横・縦で共通(character)。位置と大きさは画面ごと(characterView / 縦は vCharacterView)
// ・口パクの判定は、管理画面のマイク(おすすめ)・OBS のマイク・コメントのどれか
// ・反応はサーバーが決めて配る(character:react)。口の開け閉めも配る(character:talk。保存しない)
const fs = require('fs');
const path = require('path');
const express = require('express');
const { uid, isPlainObject, deepMerge } = require('../../core/util');

const SLOTS = ['idle', 'talk', 'blink', 'happy'];
const SAMPLE = Object.fromEntries(SLOTS.map((s) => [s, `sample:mochimaru-${s}.svg`]));
const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

const defaultRules = () => [
  { id: 'r1', words: '草,ww,www,lol,笑', reply: 'わはは!', action: 'happy' },
  { id: 'r2', words: 'gg,GG,ナイス,nice,うまい', reply: 'ありがとう!', action: 'happy' },
  { id: 'r3', words: 'こんにちは,こんばんは,はじめまして,初見,hello,hi', reply: 'いらっしゃい!', action: 'bounce' },
  { id: 'r4', words: '888,パチパチ,おめでとう', reply: 'えへへ', action: 'happy' },
];
const defaults = () => ({
  enabled: false,
  images: { ...SAMPLE },
  mouth: 'admin', // admin = 管理画面のマイク / overlay = OBS(ブラウザソース)のマイク / chat = コメントで口を動かす / off
  threshold: 0.06, // 口を開ける音量(0〜1)
  hold: 160, // 声が止まってから口を閉じるまで(ミリ秒)
  blink: true,
  breathe: true,
  sway: false,
  talkBounce: true, // 話している間、小さくはずむ
  onComment: 'bounce', // コメントが来たら:bounce / none
  onAlert: true, // アラート(スパチャ・メンバーなど)で喜ぶ
  bubble: true, // 吹き出しを出す
  bubbleSec: 3.5,
  bubbleComment: false, // キーワード以外のコメントも吹き出しに出す
  rules: defaultRules(),
});
function normalize(v) {
  const d = defaults();
  const o = isPlainObject(v) ? v : {};
  const imgs = isPlainObject(o.images) ? o.images : {};
  return {
    ...d,
    ...o,
    enabled: !!o.enabled,
    images: Object.fromEntries(SLOTS.map((s) => [s, typeof imgs[s] === 'string' ? imgs[s].slice(0, 160) : (s in imgs ? '' : d.images[s])])),
    mouth: ['admin', 'overlay', 'chat', 'off'].includes(o.mouth) ? o.mouth : d.mouth,
    threshold: num(o.threshold, d.threshold, 0.005, 0.6),
    hold: num(o.hold, d.hold, 40, 1000),
    onComment: ['bounce', 'none'].includes(o.onComment) ? o.onComment : d.onComment,
    bubbleSec: num(o.bubbleSec, d.bubbleSec, 1, 15),
    rules: (Array.isArray(o.rules) ? o.rules : d.rules).filter(isPlainObject).slice(0, 30).map((r) => ({
      id: String(r.id || uid('cr')), words: String(r.words || '').slice(0, 300), reply: String(r.reply || '').slice(0, 60), action: r.action === 'bounce' ? 'bounce' : 'happy',
    })),
  };
}
// 画面ごとの位置と大きさ(x, y は足もとの中央。h はキャラクターの高さ)
const viewDefault = () => ({ show: true, x: 1290, y: 1076, h: 280, flip: false }); // ゲーム映像の右下に少し重なる位置
const viewNormalize = (v, d = viewDefault()) => {
  const o = isPlainObject(v) ? v : {};
  return { show: o.show !== false, x: num(o.x, d.x, -500, 3000), y: num(o.y, d.y, -500, 3000), h: num(o.h, d.h, 40, 1800), flip: !!o.flip };
};

let uploadsDir = '';
let hubRef = null;
let storeRef = null;
const lastReact = { at: 0 };
function react(p) {
  const now = Date.now();
  // コメントが続けて来ても、反応は 0.8 秒に 1 回まで(アラートは必ず)
  if (p.kind === 'comment' && now - lastReact.at < 800) return;
  lastReact.at = now;
  hubRef.broadcast('character:react', { ...p, at: now });
}
function onMessages(messages) {
  const c = storeRef.state.character;
  if (!c || !c.enabled) return;
  const fresh = (messages || []).filter((m) => !m.old).slice(-5);
  for (const m of fresh) {
    const text = String(m.text || '');
    const low = text.toLowerCase();
    const rule = c.rules.find((r) => r.words.split(/[,、\n]+/).map((w) => w.trim().toLowerCase()).filter(Boolean).some((w) => low.includes(w)));
    if (rule) react({ kind: 'keyword', action: rule.action, bubble: c.bubble ? rule.reply : '', name: m.name, talk: c.mouth === 'chat' });
    else react({ kind: 'comment', action: c.onComment === 'bounce' ? 'bounce' : 'none', bubble: c.bubble && c.bubbleComment ? text.slice(0, 40) : '', name: m.name, talk: c.mouth === 'chat' });
  }
}
const ALERT_TEXT = { superchat: '{name}さん、ありがとう!', bits: '{name}さん、ビッツありがとう!', member: '{name}さん、ようこそ!', gift: '{name}さん、ギフトありがとう!', raid: '{name}さん、レイドありがとう!', follow: '{name}さん、フォローありがとう!', subscribe: '登録ありがとう!' };

module.exports = {
  order: 66,
  namespace: 'character',
  sections: {
    character: { default: defaults, normalize },
    characterView: {
      default: viewDefault,
      normalize: (v) => viewNormalize(v),
      vDefault: () => ({ show: true, x: 900, y: 1880, h: 360, flip: false }),
      vNormalize: (v) => viewNormalize(v, { show: true, x: 900, y: 1880, h: 360, flip: false }),
    },
  },
  init({ app, paths, hub, store, bus, catalogs }) {
    hubRef = hub;
    storeRef = store;
    uploadsDir = path.join(paths.data, 'character');
    fs.mkdirSync(uploadsDir, { recursive: true });
    const list = () => { try { return fs.readdirSync(uploadsDir).filter((f) => /\.(png|webp)$/i.test(f)).sort(); } catch { return []; } };
    const refresh = () => catalogs.set('charUploads', list());
    refresh();
    // キャラクターのセット:同梱のサンプルと、追加パック(packs/*/characters/<セット>/)のもの
    const packs = require('../../core/packs');
    const publishSets = () => catalogs.set('charSets', [{ id: 'mochimaru', name: 'もちまる(サンプル)', pack: '', images: { ...SAMPLE } }, ...packs.characterSets(paths.packs)]);
    publishSets();
    packs.watch(paths.packs, publishSets);
    app.use('/char-assets', express.static(path.join(__dirname, 'assets')));
    app.use('/char-uploads', express.static(uploadsDir));
    // 透過画像(PNG / WebP)を受け取る
    app.post('/api/character', express.raw({ type: () => true, limit: '20mb' }), (req, res) => {
      const orig = decodeURIComponent(String(req.get('x-filename') || 'char.png'));
      const ext = path.extname(orig).toLowerCase();
      const buf = req.body;
      if (!['.png', '.webp'].includes(ext)) return res.status(400).json({ error: '透過できる PNG か WebP の画像を選んでください' });
      if (!Buffer.isBuffer(buf) || !buf.length) return res.status(400).json({ error: 'ファイルが空です' });
      const ok = ext === '.png' ? buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47 : buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
      if (!ok) return res.status(400).json({ error: '画像の中身が拡張子と一致しません' });
      const base = path.basename(orig, ext).replace(/[^\w぀-ヿ㐀-鿿-]+/g, '_').slice(0, 40) || 'char';
      const file = `${base}-${Date.now().toString(36)}${ext}`;
      fs.writeFileSync(path.join(uploadsDir, file), buf);
      refresh();
      res.json({ file });
    });
    module.exports._refresh = refresh;
    bus.on('chat:messages', ({ messages }) => onMessages(messages));
    bus.on('alert:shown', (ev) => {
      const c = store.state.character;
      if (!c || !c.enabled || !c.onAlert) return;
      // {name} は画面側で置き換える(言語を英語にしたとき、決まった文を訳せるように)
      const t = ev.name ? (ALERT_TEXT[ev.kind] || '{name}さん、ありがとう!') : 'ありがとう!';
      react({ kind: 'alert', action: 'happy', big: true, bubble: c.bubble ? t : '', name: ev.name || '' });
    });
  },
  handlers: {
    update({ patch }, ctx) {
      if (!isPlainObject(patch)) return;
      const p = { ...patch };
      if (Array.isArray(p.rules)) { ctx.raw.character.rules = p.rules; delete p.rules; }
      deepMerge(ctx.raw.character, p);
      ctx.raw.character = normalize(ctx.raw.character);
      ctx.commitRaw('character');
    },
    updateView({ patch }, ctx) {
      if (!isPlainObject(patch)) return;
      deepMerge(ctx.state.characterView, patch);
      ctx.state.characterView = viewNormalize(ctx.state.characterView, ctx.canvas === 'v' ? { show: true, x: 900, y: 1880, h: 360, flip: false } : viewDefault());
      ctx.commit('characterView');
    },
    useSample(_, ctx) {
      ctx.raw.character.images = { ...SAMPLE };
      ctx.commitRaw('character');
    },
    deleteUpload({ file }, ctx) {
      const f = path.basename(String(file || ''));
      if (!/\.(png|webp)$/i.test(f)) return;
      try { fs.unlinkSync(path.join(uploadsDir, f)); } catch { /* ignore */ }
      const imgs = ctx.raw.character.images;
      for (const s of SLOTS) if (imgs[s] === f) imgs[s] = s === 'idle' ? SAMPLE.idle : '';
      ctx.commitRaw('character');
      module.exports._refresh();
    },
    // 口の開け閉め(管理画面のマイク・ボタン)。保存しないで、そのまま配る
    talk({ on }, ctx) { ctx.broadcast('character:talk', { on: !!on, at: Date.now() }); },
    // 反応のテスト
    test({ kind }) {
      const c = storeRef.state.character;
      if (kind === 'alert') react({ kind: 'alert', action: 'happy', big: true, bubble: c.bubble ? 'ありがとう!' : '', name: 'テスト' });
      else if (kind === 'keyword') { const r = c.rules[0]; react({ kind: 'keyword', action: r ? r.action : 'happy', bubble: c.bubble && r ? r.reply : '', talk: c.mouth === 'chat' }); }
      else { lastReact.at = 0; react({ kind: 'comment', action: 'bounce', bubble: c.bubble && c.bubbleComment ? 'こんばんは!' : '', talk: c.mouth === 'chat' }); }
    },
  },
  SLOTS,
};
