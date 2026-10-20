/* 経過時間:状態は「開始時刻」だけを共有し、各画面が自分で時刻を計算する */
(function () {
  'use strict';
  OV.timerRunning = () => {
    const t = OV.state.timer;
    return !!(t && t.startedAt && !t.stoppedAt);
  };
  OV.elapsedMs = () => {
    const t = OV.state.timer;
    if (!t || !t.startedAt) return 0;
    return Math.max(0, (t.stoppedAt || Date.now()) - t.startedAt);
  };
  OV.formatElapsed = (ms) => {
    const s = Math.floor(ms / 1000);
    return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0')).join(':');
  };
  OV.elapsedText = () => OV.formatElapsed(OV.elapsedMs());
  OV.onTick((root) => {
    const txt = OV.elapsedText();
    root.querySelectorAll('[data-elapsed]').forEach((el) => { if (el.textContent !== txt) el.textContent = txt; });
  });
})();
