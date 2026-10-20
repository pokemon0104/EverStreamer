'use strict';
// 配信の経過時間
module.exports = {
  order: 5,
  sections: {
    timer: { default: () => ({ startedAt: null, stoppedAt: null }) },
  },
  handlers: {
    start(_, ctx) {
      ctx.state.timer = { startedAt: Date.now(), stoppedAt: null };
      ctx.commit('timer');
    },
    stop(_, ctx) {
      const t = ctx.state.timer;
      if (t.startedAt && !t.stoppedAt) { t.stoppedAt = Date.now(); ctx.commit('timer'); }
    },
    resume(_, ctx) {
      const t = ctx.state.timer;
      if (t.startedAt && t.stoppedAt) {
        t.startedAt += Date.now() - t.stoppedAt;
        t.stoppedAt = null;
        ctx.commit('timer');
      }
    },
    reset(_, ctx) {
      ctx.state.timer = { startedAt: null, stoppedAt: null };
      ctx.commit('timer');
    },
    // 経過時間を増減(正の値で経過時間が増える)
    adjust({ deltaMs }, ctx) {
      const t = ctx.state.timer;
      const d = Number(deltaMs) || 0;
      if (!t.startedAt) { t.startedAt = Date.now(); t.stoppedAt = Date.now(); }
      t.startedAt -= d;
      if (t.startedAt > (t.stoppedAt || Date.now())) t.startedAt = t.stoppedAt || Date.now();
      ctx.commit('timer');
    },
    // 開始時刻を直接指定(ミリ秒の時刻)
    setStart({ startedAt }, ctx) {
      const v = Number(startedAt);
      if (!v) return;
      ctx.state.timer.startedAt = Math.min(v, Date.now());
      ctx.commit('timer');
    },
  },
};
