/* 上部バー:配信の経過時間 */
(function () {
  'use strict';
  const { h } = UI;
  ADM.registerTopbar({
    order: 10,
    build(root) {
      const disp = h('span', { class: 'timer-disp', title: '配信の経過時間' }, '00:00:00');
      const start = UI.button('● 配信開始', () => {
        if (OV.elapsedMs() > 0 && !confirm('経過時間を 0 から測り直しますか?')) return;
        ADM.send('timer:start');
      }, 'live small');
      const stop = UI.button('停止', () => ADM.send('timer:stop'), 'small');
      const resume = UI.button('再開', () => ADM.send('timer:resume'), 'small');
      const reset = UI.button('リセット', () => { if (confirm('経過時間をリセットしますか?')) ADM.send('timer:reset'); }, 'small');
      const minus = UI.button('−1分', () => ADM.send('timer:adjust', { deltaMs: -60000 }), 'small');
      const plus = UI.button('+1分', () => ADM.send('timer:adjust', { deltaMs: 60000 }), 'small');
      const time = h('input', { type: 'time', title: '実際の配信開始時刻', style: { width: '92px' } });
      const fix = UI.button('開始時刻に合わせる', () => {
        if (!time.value) return;
        const [hh, mm] = time.value.split(':').map(Number);
        const d = new Date();
        d.setHours(hh, mm, 0, 0);
        if (d.getTime() > Date.now()) d.setDate(d.getDate() - 1); // 未来なら前日とみなす
        ADM.send('timer:setStart', { startedAt: d.getTime() });
      }, 'small');
      const tick = () => {
        disp.textContent = OV.elapsedText ? OV.elapsedText() : '00:00:00';
        const run = OV.timerRunning && OV.timerRunning();
        const t = OV.state.timer || {};
        disp.classList.toggle('run', !!run);
        start.style.display = run ? 'none' : '';
        stop.style.display = run ? '' : 'none';
        resume.style.display = !run && t.startedAt && t.stoppedAt ? '' : 'none';
      };
      setInterval(tick, 500);
      UI.bind(disp, tick);
      root.append(disp, start, stop, resume, reset, minus, plus, time, fix);
    },
  });
})();
