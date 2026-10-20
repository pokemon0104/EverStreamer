'use strict';
// 場面の切り替え:開始待機(カウントダウン)・配信中・休憩・終了。デザインはテンプレートに合わせる(横・縦で共通)
const crypto = require('crypto');
const { deepMerge, isPlainObject } = require('../../core/util');

const SCENES = ['live', 'starting', 'brb', 'ending'];
const FX = ['auto', 'orbs', 'grid', 'particles', 'waves', 'lines', 'none'];
const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

const defaults = () => ({
  current: 'live',
  endsAt: 0, // 開始待機のカウントダウンが 0 になる時刻(ミリ秒)。0 = カウントダウンなし
  startAt: 0, // カウントダウンを始めた時刻(進み具合のバー用)
  starting: { kicker: 'STARTING SOON', title: 'まもなく配信開始', sub: '少々お待ちください', minutes: 5, countdown: true, autoLive: false, doneText: 'まもなく始まります' },
  brb: { kicker: 'BE RIGHT BACK', title: '休憩中', sub: 'すぐに戻ります', minutes: 0, countdown: false },
  ending: { kicker: 'THANKS FOR WATCHING', title: 'ご視聴ありがとうございました', sub: 'チャンネル登録・高評価もよろしくお願いします', next: '次回の配信もお楽しみに' },
  showGame: true, // ゲーム名(またはロゴ)を出す
  showSocial: true, // 名前とSNSを出す
  fx: 'auto', // 背景の動き(auto = テンプレートに合わせる)
  fadeMs: 800,
  token: crypto.randomBytes(6).toString('hex'),
});
// 場面ごとの背景:tpl = テンプレートの背景 / upload = 自分の画像・動画(背景タブと同じ data/backgrounds)
const BG = () => ({ bgType: 'tpl', bgFile: '', bgDim: 0.35 });
function normScene(o, d) {
  const s = { ...BG(), ...d, ...(isPlainObject(o) ? o : {}) };
  s.bgType = s.bgType === 'upload' && s.bgFile ? 'upload' : 'tpl';
  s.bgFile = String(s.bgFile || '').replace(/[\\/]/g, '').slice(0, 120);
  s.bgDim = num(s.bgDim, 0.35, 0, 0.9);
  for (const k of ['kicker', 'title', 'sub', 'next', 'doneText']) if (k in d) s[k] = String(s[k] == null ? '' : s[k]).slice(0, 160);
  if ('minutes' in d) s.minutes = num(s.minutes, d.minutes, 0, 600);
  for (const k of ['countdown', 'autoLive']) if (k in d) s[k] = !!s[k];
  return s;
}
function normalize(v) {
  const d = defaults();
  const o = isPlainObject(v) ? v : {};
  return {
    ...d,
    ...o,
    current: SCENES.includes(o.current) ? o.current : 'live',
    endsAt: num(o.endsAt, 0, 0, 1e15),
    startAt: num(o.startAt, 0, 0, 1e15),
    starting: normScene(o.starting, d.starting),
    brb: normScene(o.brb, d.brb),
    ending: normScene(o.ending, d.ending),
    showGame: o.showGame !== false,
    showSocial: o.showSocial !== false,
    fx: FX.includes(o.fx) ? o.fx : 'auto',
    fadeMs: num(o.fadeMs, 800, 0, 4000),
    token: typeof o.token === 'string' && o.token ? o.token : d.token,
  };
}

let storeRef = null;
let hubRef = null;
let timer = null;
const S = () => storeRef.state.scene;
function publish() {
  storeRef.scheduleSave();
  hubRef.broadcast('core:section', { key: 'scene', value: S() });
}
/** カウントダウンが 0 になったら「配信中」に切り替える(設定がオンのとき) */
function schedule() {
  clearTimeout(timer);
  const s = S();
  if (s.current !== 'starting' || !s.endsAt || !s.starting.autoLive) return;
  const wait = s.endsAt - Date.now();
  if (wait <= 0) { s.current = 'live'; s.endsAt = 0; publish(); return; }
  timer = setTimeout(schedule, Math.min(wait + 50, 60000));
}
/** 場面を切り替える。minutes を渡すと、その分のカウントダウン(開始待機・休憩) */
function setScene(id, minutes) {
  const s = S();
  if (!SCENES.includes(id)) return false;
  s.current = id;
  const cfg = s[id] || {};
  const m = minutes != null ? num(minutes, 0, 0, 600) : (cfg.countdown ? cfg.minutes : 0);
  s.endsAt = (id === 'starting' || id === 'brb') && m > 0 ? Date.now() + m * 60000 : 0;
  s.startAt = s.endsAt ? Date.now() : 0;
  publish();
  schedule();
  return true;
}

module.exports = {
  order: 36,
  namespace: 'scene',
  sections: { scene: { default: defaults, normalize } },
  init({ app, store, hub }) {
    storeRef = store;
    hubRef = hub;
    schedule();
    // Stream Deck・スマホから:/api/scene?to=starting&min=5&token=…
    app.get('/api/scene', (req, res) => {
      if (String(req.query.token || '') !== S().token) return res.status(403).json({ error: '合言葉(token)が違います' });
      const to = String(req.query.to || '');
      if (!setScene(to, req.query.min != null ? Number(req.query.min) : undefined)) return res.status(400).json({ error: 'to には live / starting / brb / ending のどれかを指定してください' });
      res.json({ ok: true, scene: to });
    });
  },
  handlers: {
    set({ id, minutes }, ctx) { if (!setScene(String(id || ''), minutes)) ctx.toast('場面の名前が正しくありません', 'warn'); },
    // カウントダウンを延ばす・縮める(秒)
    addTime({ sec }) {
      const s = S();
      const d = num(sec, 0, -36000, 36000) * 1000;
      if (!s.endsAt) s.startAt = Date.now();
      s.endsAt = Math.max(Date.now(), (s.endsAt || Date.now()) + d);
      publish();
      schedule();
    },
    update({ patch }, ctx) {
      if (!isPlainObject(patch)) return;
      const p = { ...patch };
      delete p.token; delete p.current; delete p.endsAt; delete p.startAt;
      deepMerge(ctx.raw.scene, p);
      ctx.raw.scene = normalize(ctx.raw.scene);
      ctx.commitRaw('scene');
      schedule();
    },
    newToken(_, ctx) {
      ctx.raw.scene.token = crypto.randomBytes(6).toString('hex');
      ctx.commitRaw('scene');
      ctx.toast('呼び出しURLを作り直しました。以前のURLは使えなくなります');
    },
  },
  SCENES,
};
