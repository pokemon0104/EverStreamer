/* お祝い:登録者が増えたとき・目標を達成したときの盛大な演出(画面いっぱい) */
(function () {
  'use strict';
  const { esc, clamp } = OV.util;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const FULL = { x: 0, y: 0, w: OV.W, h: OV.H };
  const entries = [];

  // ---- ファンファーレ(やわらかいチャイムの和音。OBS 用の画面だけで鳴る) ----
  function fanfare(big) {
    const vol = clamp(Number((OV.state.reactions || {}).volume) || 0.4, 0, 1) * 0.2;
    if (!OV.chime) return;
    if (big) { OV.chime([523.3, 659.3, 784, 1046.5], vol, 0.11, 0.9); setTimeout(() => OV.chime([784, 1046.5, 1318.5, 1568], vol, 0.08, 1.4), 520); } else OV.chime([784, 987.8, 1318.5], vol, 0.09, 0.8);
  }

  // ---- 効果の組み合わせ ----
  function effects(e, p, ms) {
    const fxl = e.layer.querySelector('.cl-fx');
    const fx = OV.fx;
    if (!fx) return;
    const big = p.kind === 'goal';
    const timers = [];
    const at = (t, fn) => timers.push(setTimeout(() => { if (e.token === p.at) fn(); }, t));
    const fireworks = (n, span) => { for (let i = 0; i < n; i++) at((i * span) / n, () => fx.firework(fxl, FULL, big ? 2.2 : 1.8)); };
    const confetti = (waves, n) => { for (let i = 0; i < waves; i++) at(i * 900, () => fx.confetti(fxl, FULL, n, big ? 1.8 : 1.4)); };
    const rain = (name, color, n) => { for (let i = 0; i < n; i++) at(i * 90, () => (name === 'coin' ? fx.coin(fxl, { x: 0, y: 200, w: OV.W, h: 700 }, (OV.tokens ? OV.tokens().accent : '#ffc93c'), 2.4, false) : fx.rise(fxl, { x: 0, y: 500, w: OV.W, h: 600 }, name, color, 3, i))); };
    switch (p.effect) {
      case 'fireworks': fireworks(big ? 26 : 12, ms * 0.8); break;
      case 'confetti': confetti(big ? 5 : 3, big ? 140 : 90); break;
      case 'coins': rain('coin', '#ffc93c', big ? 50 : 30); break;
      case 'hearts': rain('heart', '#ff4f78', big ? 50 : 30); break;
      default: // grand:全部
        fireworks(big ? 30 : 14, ms * 0.8);
        confetti(big ? 6 : 3, big ? 150 : 100);
        rain('star', '#ffd84a', big ? 24 : 12);
        if (big) rain('heart', '#ff4f78', 20);
    }
  }

  // 文字を、枠に収まる一番大きなサイズにする
  function fit(e) {
    const t = e.layer.querySelector('.cl-title');
    if (!t) return;
    t.style.fontSize = '100px';
    const w = (t.querySelector('.gt-layers') || t).offsetWidth || 1;
    t.style.fontSize = `${clamp((OV.W * 0.82 / w) * 100, 60, 260)}px`;
  }

  function show(e, p) {
    const ms = clamp(Number(p.sec) || 6, 2, 60) * 1000;
    e.token = p.at;
    clearTimeout(e.timer);
    const big = p.kind === 'goal';
    const look = OV.lookById ? OV.lookById(p.lookId, true) : null;
    const title = look && OV.titleTextHtml ? OV.titleTextHtml(p.text, look) : esc(p.text);
    const num = p.kind === 'sub' && p.delta ? `<div class="cl-num">+${Number(p.delta).toLocaleString('ja-JP')}</div>` : '';
    e.layer.innerHTML = `<div class="cl-flash"></div><div class="cl-dim ${big ? 'big' : ''}"></div><div class="cl-fx"></div>
      <div class="cl-box"><div class="cl-main ${big ? 'big' : ''}">${big ? '<div class="cl-rays"></div>' : ''}${num}<div class="cl-title">${title}</div>${p.subtext ? `<div class="cl-sub">${esc(p.subtext)}</div>` : ''}<div class="cl-glint"></div></div></div>`;
    e.layer.classList.add('on');
    fit(e);
    setTimeout(() => fit(e), 150);
    setTimeout(() => fit(e), 900);
    effects(e, p, ms);
    if (p.sound) fanfare(big);
    e.timer = setTimeout(() => {
      e.layer.classList.remove('on');
      setTimeout(() => { if (e.token === p.at) { e.layer.innerHTML = ''; e.busy = false; next(e); } }, 700);
    }, ms);
  }

  // 続けて届いたお祝いは、順番に再生する(登録者増加 → 目標達成 など)
  function next(e) {
    if (e.busy) return;
    const p = e.queue.shift();
    if (!p) return;
    e.busy = true;
    show(e, p);
  }

  OV.registerLayer({
    mount(stage) {
      const layer = document.createElement('div');
      layer.className = 'cl-layer';
      stage.appendChild(layer);
      entries.push({ stage, layer, local: null, queue: [], busy: false, token: 0, timer: 0 });
    },
  });
  // ---- パネルのまわりだけの演出(いいね・コメントの演出と同じ作り) ----
  function goalPanelEl(stage) {
    const ps = (OV.state.panels || []).filter((x) => x.type === 'number' && x.visible !== false);
    const isSub = (x) => (x.data || {}).source === 'youtube' && (x.data || {}).metric === 'subscriberCount';
    const p = ps.find((x) => isSub(x) && x.data.mode === 'goal') || ps.find(isSub)
      || ps.find((x) => (x.data || {}).mode === 'goal') || ps.find((x) => /登録/.test(`${x.name} ${(x.data || {}).label || ''}`));
    const el = p ? stage.querySelector(`.ov-panel[data-id="${p.id}"]`) : null;
    return el && !el.closest('.is-gone, .is-empty') ? el : null;
  }
  function localRect(stage, el) {
    const s = stage.getBoundingClientRect();
    const k = s.width / OV.W || 1;
    const r = el.getBoundingClientRect();
    return { x: (r.left - s.left) / k, y: (r.top - s.top) / k, w: r.width / k, h: r.height / k };
  }
  // 見つからなければ false(画面いっぱいに切り替える)
  function playLocal(e, p) {
    const fx = OV.fx;
    const el = goalPanelEl(e.stage);
    if (!fx || !el) return false;
    let layer = e.local;
    if (!layer || !layer.isConnected) { layer = document.createElement('div'); layer.className = 'cl-local'; e.stage.appendChild(layer); e.local = layer; }
    const rect = localRect(e.stage, el);
    const big = p.kind === 'goal';
    const ms = clamp(Number(p.sec) || 6, 2, 30) * 1000;
    const s = clamp(rect.w / 340, 0.7, 1.4) * (big ? 1.2 : 1);
    const wide = { x: rect.x - 20, y: rect.y - 40, w: rect.w + 40, h: rect.h + 60 };
    const run = (n, span, fn) => { for (let i = 0; i < n; i++) setTimeout(() => fn(i), (i * span) / n); };
    el.classList.remove('cl-pulse'); void el.offsetWidth; el.classList.add('cl-pulse');
    setTimeout(() => el.classList.remove('cl-pulse'), ms);
    const label = document.createElement('div');
    label.className = `cl-badge ${big ? 'big' : ''}`;
    label.textContent = p.kind === 'sub' && p.delta ? `+${Number(p.delta).toLocaleString('ja-JP')}` : (p.text || '').slice(0, 14);
    label.style.cssText = `left:${rect.x + rect.w / 2}px;top:${rect.y}px;font-size:${Math.round((big ? 34 : 44) * s)}px`;
    layer.appendChild(label);
    setTimeout(() => label.remove(), Math.min(ms, 4000));
    const n = big ? 14 : 6;
    switch (p.effect) {
      case 'fireworks': run(n, ms * 0.8, () => fx.firework(layer, wide, s)); break;
      case 'confetti': run(big ? 4 : 2, ms * 0.6, () => fx.confetti(layer, wide, big ? 60 : 40, s)); break;
      case 'coins': run(big ? 24 : 12, ms * 0.7, () => fx.coin(layer, wide, '#ffc93c', s * 1.2, false)); break;
      case 'hearts': run(big ? 24 : 12, ms * 0.7, (i) => fx.rise(layer, wide, 'heart', '#ff4f78', s, i)); break;
      default:
        run(n, ms * 0.8, () => fx.firework(layer, wide, s));
        run(big ? 3 : 2, ms * 0.5, () => fx.confetti(layer, wide, big ? 60 : 40, s));
        run(big ? 10 : 5, ms * 0.6, (i) => fx.rise(layer, wide, 'star', '#ffd84a', s, i));
    }
    if (p.sound) fanfare(big);
    return true;
  }

  OV.onMessage('celebrate:play', (p) => {
    if (OV.screenOn && !OV.screenOn('celebrate')) return; // この画面(横型/縦型)には出さない
    for (const e of entries) {
      if (!e.stage.isConnected) continue;
      const mode = p.mode || 'full';
      let full = mode !== 'panel';
      if (mode !== 'full') {
        const ok = playLocal(e, p);
        if (!ok) full = true; // パネルが見つからないときは、画面いっぱいで代わりに表示する
      }
      if (!full) continue;
      if (e.queue.length < 4) e.queue.push(p);
      next(e);
    }
  });
})();
