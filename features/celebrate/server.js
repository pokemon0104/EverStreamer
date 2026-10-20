'use strict';
// お祝い:チャンネル登録者が増えたとき・目標を達成したときに、盛大なアニメーションとテキストを表示する
const { deepMerge, isPlainObject } = require('../../core/util');
const { allPanels } = require('../../core/canvas');

const EFFECTS = ['grand', 'fireworks', 'confetti', 'coins', 'hearts'];
const MODES = ['full', 'panel', 'both'];

const defaults = () => ({
  sub: {
    enabled: true,
    effect: 'grand', // grand = 花火+紙吹雪+星+フラッシュ(全部) / fireworks / confetti / coins / hearts
    text: 'チャンネル登録ありがとう!',
    subtext: '一緒に楽しんでくれてありがとう!',
    sec: 6,
    lookId: 'tpl',
    sound: false,
    mode: 'full', // full = 画面いっぱい / panel = 登録者目標のパネルのまわりだけ / both = 両方
  },
  goal: {
    enabled: true,
    effect: 'grand',
    text: '目標達成!',
    subtext: '登録者{goal}人 突破!みなさんのおかげです!',
    sec: 12,
    lookId: 'tpl',
    sound: false,
    mode: 'full',
  },
});

let storeRef = null;
let hubRef = null;
const lastValue = {}; // パネルごとの、前回の値
const goalReached = {}; // パネルごとの「目標に届いているか」(起動直後の1回目は、お祝いせず状態だけ記録する)

function normalize(v) {
  const d = defaults();
  const o = isPlainObject(v) ? v : {};
  const out = { sub: { ...d.sub, ...(o.sub || {}) }, goal: { ...d.goal, ...(o.goal || {}) } };
  for (const k of ['sub', 'goal']) {
    if (!EFFECTS.includes(out[k].effect)) out[k].effect = 'grand';
    if (!MODES.includes(out[k].mode)) out[k].mode = 'full';
  }
  return out;
}

const fill = (s, vars) => String(s || '').replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? Number(vars[k]).toLocaleString('ja-JP') : ''));

function play(kind, vars) {
  const cfg = storeRef.state.celebrate[kind];
  hubRef.broadcast('celebrate:play', {
    kind,
    text: fill(cfg.text, vars),
    subtext: fill(cfg.subtext, vars),
    effect: cfg.effect,
    sec: cfg.sec,
    lookId: cfg.lookId,
    sound: cfg.sound,
    mode: cfg.mode,
    delta: vars.delta,
    at: Date.now(),
  });
}

// 目標を設定している数値パネルの「いまの値」
function currentValue(state, p) {
  const d = p.data || {};
  if (d.source === 'youtube') {
    const y = state.ytStats || {};
    const obj = (d.scope || 'total') === 'total' ? y.total : y[d.scope];
    const v = obj ? obj[d.metric || 'likeCount'] : null;
    return v == null ? null : Number(v);
  }
  return d.current == null ? null : Number(d.current);
}

function evalGoals() {
  const st = storeRef.state;
  for (const p of allPanels(st)) {
    if (p.type !== 'number' || (p.data || {}).mode !== 'goal') continue;
    const goal = Number(p.data.goal) || 0;
    const v = currentValue(st, p);
    if (goal <= 0 || v == null) continue;
    const reached = v >= goal;
    const key = p.id;
    const last = lastValue[key];
    lastValue[key] = v;
    if (goalReached[key] === undefined) { goalReached[key] = reached; continue; }
    // 「値が増えて」目標に届いたときだけお祝いする(目標を下げて届いた形になったときは、お祝いしない)
    if (reached && !goalReached[key] && last != null && v > last && st.celebrate.goal.enabled) {
      goalReached[key] = true;
      play('goal', { goal, count: v });
    } else goalReached[key] = reached; // 目標を上げ直したり、値が下がったときは、また達成したときにお祝いする
  }
}

module.exports = {
  order: 66,
  sections: { celebrate: { default: defaults, normalize } },
  init({ store, hub, bus }) {
    storeRef = store;
    hubRef = hub;
    bus.on('yt:subs', ({ delta, count }) => {
      if (store.state.celebrate.sub.enabled) play('sub', { delta, count });
    });
    bus.on('yt:stats', evalGoals);
    bus.on('panels:updated', evalGoals);
    evalGoals(); // 起動時の状態を記録する(この時点では、お祝いしない)
  },
  handlers: {
    update({ patch }, ctx) {
      if (!isPlainObject(patch)) return;
      deepMerge(ctx.state.celebrate, patch);
      ctx.state.celebrate = normalize(ctx.state.celebrate);
      ctx.commit('celebrate');
    },
    // テスト再生(YouTube がなくても動きを確認できる)
    test({ kind, delta }, ctx) {
      const goal = (ctx.state.panels.find((p) => p.type === 'number' && p.data.mode === 'goal') || { data: { goal: 500 } }).data.goal;
      play(kind === 'goal' ? 'goal' : 'sub', { delta: Math.max(1, Number(delta) || 1), count: Number(goal) || 500, goal: Number(goal) || 500 });
    },
  },
  _test: { evalGoals, goalReached },
};
