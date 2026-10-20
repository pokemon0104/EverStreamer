/* 数値パネル:ラベル+大きな数字。目標モードは「あと何人」を自動計算し、進み具合をバーでも表示する */
(function () {
  'use strict';
  const { esc, clamp } = OV.util;
  const fmt = (n) => (n == null || n === '' ? '—' : Number.isFinite(Number(n)) ? Number(n).toLocaleString('ja-JP') : esc(n));
  // 外部の数値(YouTube など)。各機能が OV.numberSources[名前] = { get(data, state), deps(state) } を登録する
  OV.numberSources = OV.numberSources || {};
  const sourceOf = (d) => (d && d.source && d.source !== 'manual' ? OV.numberSources[d.source] : null);
  const safeColor = (c) => (/^#[0-9a-f]{3,8}$/i.test(String(c || '')) ? c : '');

  // ---- 絵文字(「いいね」なら 👍 など。指標から自動で選ぶ。パネルごとに好きな絵文字へ変更もできる) ----
  const AUTO_ICON = { likeCount: '👍', chatCount: '💬', commentCount: '💬', subscriberCount: '👤', viewCount: '👀', concurrentViewers: '👥' };
  OV.numberIcon = (d) => d.icon || (d.source === 'youtube' ? AUTO_ICON[d.metric] : '') || '⭐';

  // ---- 文字の行(「500人まで あと71人」など) ----
  function textLine(d, vars, isGoal, done) {
    const tpl = d.template || (isGoal ? OV.t('{goal}{unit}まで あと{remain}{unit}') : '{value}{unit}');
    const align = d.align || 'center';
    const jc = align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center';
    let body;
    if (done && d.doneText) {
      body = `<span class="np-num">${esc(d.doneText)}</span>`;
    } else {
      body = tpl.split(/(\{\w+\})/).filter(Boolean).map((part) => {
        const m = /^\{(\w+)\}$/.exec(part);
        if (!m || !(m[1] in vars)) return `<span class="np-t">${esc(part)}</span>`;
        const k = m[1];
        if (k === 'unit') return vars.unit ? `<span class="np-unit">${esc(vars.unit)}</span>` : '';
        if (k === 'remain' || k === 'value') {
          const n = vars[k];
          return `<span class="np-num"${n != null && Number.isFinite(Number(n)) ? ` data-n="${Number(n)}"` : ''}>${fmt(n)}</span>`;
        }
        return `<span class="np-sub">${fmt(vars[k])}</span>`;
      }).join('');
    }
    return `<div class="np-line" style="justify-content:${jc}">${body}</div>`;
  }

  // ---- バー ----
  function barHtml(d, g) {
    const style = d.barStyle === 'blocks' ? 'blocks' : 'smooth';
    const blocks = clamp(Math.round(Number(d.barBlocks) || 20), 5, 50);
    const css = [
      `--bar-h:${clamp(Number(d.barHeight) || 22, 6, 80)}px`,
      `--blocks:${blocks}`,
      safeColor(d.barColor) ? `--bar-c:${d.barColor};--bar-fill:${d.barColor}` : '',
      safeColor(d.barBg) ? `--bar-bg:${d.barBg}` : '',
    ].filter(Boolean).join(';');
    // ブロック表示は、ブロック単位に切り上げず切り捨てて表示する(満たしたブロックだけ点灯)
    const shown = style === 'blocks' ? (g.pct >= 100 ? 100 : Math.floor(g.pct / (100 / blocks)) * (100 / blocks)) : g.pct;
    // 補足の文字(自動:バーだけの表示なら「あと◯人」、それ以外は「現在 / 目標」)
    let mode = d.barText || 'auto';
    if (mode === 'auto') mode = d.display === 'bar' || d.display === 'cycle' ? 'remain' : 'fraction';
    const unit = esc(d.unit || '');
    const left = mode === 'remain' ? OV.t(`あと${fmt(g.remain)}${unit}`) : mode === 'fraction' ? `${fmt(g.cur)} / ${fmt(g.goal)}${unit}` : '';
    const right = mode === 'none' ? '' : `${Math.round(g.pct)}%`;
    const cap = mode === 'none' ? '' : `<div class="np-cap"><span>${left}</span><span>${right}</span></div>`;
    return `<div class="np-barwrap"><div class="np-bar ${style}" style="${esc(css)}"><i class="np-fill" data-shown="${shown}"></i></div>${cap}</div>`;
  }

  // ---- 交互表示のタイマー(再描画しても止まらないよう、要素ごとに1つだけ持つ) ----
  function stopCycle(el) { clearInterval(el.__npTimer); el.__npTimer = null; el.__npSec = 0; }
  function ensureCycle(el, sec) {
    if (el.__npTimer && el.__npSec === sec) return;
    clearInterval(el.__npTimer);
    el.__npSec = sec;
    el.__npTimer = setInterval(() => {
      if (!el.isConnected) { stopCycle(el); return; }
      el.__npPhase = el.__npPhase === 'b' ? 'a' : 'b';
      const st = el.querySelector('.np-stack');
      if (st) st.dataset.phase = el.__npPhase;
    }, sec * 1000);
  }

  OV.registerPanelType('number', {
    label: '数値',
    sizeLabels: { headingSize: 'ラベル', bodySize: '補足文字', numberSize: '数字' },
    // YouTube の更新時刻などは含めず、数値が変わったときだけ描き直す
    deps: (S, p) => { const src = sourceOf(p && p.data); return src && src.deps ? src.deps(S) : null; },
    render(el, p, ctx) {
      const d = p.data || {};
      const src = sourceOf(d);
      const ext = src ? src.get(d, OV.state) : undefined; // null = まだ取得できていない
      const isGoal = d.mode === 'goal';
      const goal = Number(d.goal) || 0;
      const start = Math.min(Number(d.barStart) || 0, goal);
      const curRaw = src ? ext : d.current;
      const cur = curRaw == null ? null : Number(curRaw) || 0;
      const remain = cur == null ? null : Math.max(0, goal - cur);
      const done = isGoal && goal > 0 && cur != null && cur >= goal;
      const pct = cur == null || goal <= start ? 0 : clamp(((cur - start) / (goal - start)) * 100, 0, 100);
      const vars = { value: src ? ext : d.value, remain, goal, current: cur, unit: d.unit || '' };
      const display = isGoal ? d.display || 'both' : 'text';
      const wantBar = isGoal && goal > 0 && display !== 'text';
      const prev = el.__np || null;
      const g = { pct, cur: cur || 0, goal, remain: remain == null ? 0 : remain };
      const align = d.align || 'center';

      const view = d.view === 'emoji' || d.view === 'none' ? d.view : 'label';
      let html = '';
      if (view === 'none') {
        // 何も表示しない(場所だけ確保して、いいね・コメント・お祝いの演出の出る場所にする)
        el.innerHTML = `<div class="ov-ghost np-ghost ${OV.role === 'admin' ? 'peek' : ''}">${OV.role === 'admin' ? OV.t('演出だけ(本番では何も表示されません)') : ''}</div>`;
        stopCycle(el);
        cancelAnimationFrame(el.__npRaf);
        el.__np = { cur, shown: null, nums: [] };
        return;
      }
      if (view === 'label' && d.label) html += `<div class="ov-h np-label" style="text-align:${esc(align)}">${esc(d.label)}</div>`;
      let text = textLine(d, vars, isGoal, done);
      if (view === 'emoji') text = text.replace('<div class="np-line"', `<div class="np-line emo"`).replace(/^(<div[^>]*>)/, `$1<span class="np-emo">${esc(OV.numberIcon(d))}</span>`);
      if (!wantBar) html += text;
      else if (display === 'bar') html += barHtml({ ...d, display }, g);
      else if (display === 'cycle') html += `<div class="np-stack" data-phase="${el.__npPhase || 'a'}"><div class="np-layer a">${text}</div><div class="np-layer b">${barHtml({ ...d, display }, g)}</div></div>`;
      else html += text + barHtml({ ...d, display }, g);
      el.innerHTML = html;

      if (display === 'cycle' && wantBar) ensureCycle(el, clamp(Number(d.cycleSec) || 6, 2, 60)); else stopCycle(el);

      // ---- アニメーション ----
      const ms = clamp(Number(d.barAnimMs) || 900, 100, 5000);
      const animate = !!prev && d.barAnim !== 'none';
      const changed = prev && prev.cur != null && cur != null && cur !== prev.cur;
      const fill = el.querySelector('.np-fill');
      if (fill) {
        const target = Number(fill.dataset.shown);
        if (animate && prev.shown != null && prev.shown !== target) {
          fill.style.width = `${prev.shown}%`; // いまの長さから
          void fill.offsetWidth; // 描画を確定させてから、新しい長さへ伸ばす
          fill.style.transition = `width ${ms}ms cubic-bezier(.2,.8,.2,1)`;
        }
        fill.style.width = `${target}%`;
        if (changed && d.flash !== false) fill.classList.add('flash');
      }
      // 数字のカウントアップ(「あと71人」が 72→71 と変わるときなど)
      const nums = [...el.querySelectorAll('.np-num[data-n]')];
      const to = nums.map((n) => Number(n.dataset.n));
      cancelAnimationFrame(el.__npRaf);
      if (prev && d.countUp !== false && prev.nums && prev.nums.length === to.length && to.some((v, i) => v !== prev.nums[i])) {
        nums.forEach((n, i) => { n.textContent = fmt(prev.nums[i]); });
        const t0 = performance.now();
        const step = (t) => {
          const k = Math.min(1, (t - t0) / ms);
          const e = 1 - Math.pow(1 - k, 3);
          nums.forEach((n, i) => { n.textContent = fmt(Math.round(prev.nums[i] + (to[i] - prev.nums[i]) * e)); });
          if (k < 1) el.__npRaf = requestAnimationFrame(step); else ctx.queueFit();
        };
        el.__npRaf = requestAnimationFrame(step);
        if (changed && d.flash !== false) nums.forEach((n) => n.classList.add('flash'));
      }
      el.__np = { cur, shown: fill ? Number(fill.dataset.shown) : null, nums: to };
    },
  });
})();
