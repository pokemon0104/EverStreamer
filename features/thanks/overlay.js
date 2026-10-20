/* 感謝メッセージ:画面いっぱいに大きく表示する */
(function () {
  'use strict';
  const { esc, clamp } = OV.util;
  const entries = [];

  function boxRect(S) {
    const cfg = S.thanks || {};
    const a = OV.avatarRect ? OV.avatarRect(S.layout) : null;
    if (cfg.avoidAvatar && a && a.show) {
      return { x: a.side === 'left' ? a.w : 0, y: 0, w: OV.W - a.w, h: OV.H };
    }
    return { x: 0, y: 0, w: OV.W, h: OV.H };
  }

  function itemHtml(it) {
    if (it.kind === 'stats') {
      const rows = (it.rows || []).map(([k, v]) => `<tr><th>${esc(OV.t(k))}</th><td>${esc(OV.t(v))}</td></tr>`).join('');
      return `<div class="th-stats"><div class="th-st-title">${OV.t('今日の記録')}</div><table>${rows}</table></div>`;
    }
    const look = OV.lookById ? OV.lookById(it.lookId, true) : null;
    const lines = String(it.text || '').split(/\r?\n/).filter((l) => l.trim());
    return `<div class="th-text">${lines.map((l) => `<div class="th-line">${look && OV.titleTextHtml ? OV.titleTextHtml(l, look) : esc(l)}</div>`).join('')}</div>`;
  }

  // 文字を、枠に収まる一番大きなサイズにする
  function fit(e) {
    const t = e.layer.querySelector('.th-text');
    const box = e.layer.querySelector('.th-box');
    if (!t || !box) return;
    t.style.fontSize = '100px';
    const lines = [...t.querySelectorAll('.th-line')];
    const widest = Math.max(1, ...lines.map((l) => (l.querySelector('.gt-layers') || l).offsetWidth));
    const bw = box.clientWidth * 0.9;
    const bh = box.clientHeight * 0.8;
    const size = Math.min((bw / widest) * 100, bh / (lines.length * 1.3));
    t.style.fontSize = `${clamp(size, 40, 280)}px`;
  }

  function effect(e, cfg, rect) {
    if (!OV.fx) return;
    const fxl = e.layer.querySelector('.th-fx');
    if (cfg.effect === 'confetti' || cfg.effect === 'both') OV.fx.confetti(fxl, rect, 110, 1.3);
    if (cfg.effect === 'fireworks' || cfg.effect === 'both') {
      for (let i = 0; i < 6; i++) setTimeout(() => OV.fx.firework(fxl, rect, 1.6), i * 380);
    }
  }

  function render(e, S) {
    const sh = S.thanksShow || {};
    const cfg = S.thanks || {};
    e.stage.classList.toggle('th-hide-ui', !!(sh.active && cfg.hideSidebar));
    if (!sh.active) {
      if (e.key) {
        e.key = '';
        e.layer.classList.remove('on');
        setTimeout(() => { if (!e.key) e.layer.innerHTML = ''; }, 800);
      }
      return;
    }
    const key = `${sh.seq}:${sh.index}`;
    if (key === e.key) return;
    e.key = key;
    const it = (sh.items || [])[sh.index];
    if (!it) return;
    const r = boxRect(S);
    if (!e.layer.querySelector('.th-box')) {
      e.layer.innerHTML = '<div class="th-dim"></div><div class="th-box"></div><div class="th-fx"></div>';
    }
    e.layer.querySelector('.th-dim').style.opacity = String(clamp(Number(cfg.dim) || 0, 0, 0.95));
    const box = e.layer.querySelector('.th-box');
    Object.assign(box.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
    const anim = it.kind === 'stats' ? 'slide' : cfg.anim || 'pop';
    const chars = String(it.text || '').length || 10;
    box.innerHTML = `<div class="th-item a-${esc(anim)}" style="--chars:${chars}">${itemHtml(it)}${anim === 'shine' ? '<div class="th-glint"></div>' : ''}</div>`;
    fit(e);
    setTimeout(() => fit(e), 120);
    setTimeout(() => fit(e), 900); // フォントの読み込みが遅れたとき用
    requestAnimationFrame(() => e.layer.classList.add('on'));
    if (sh.index === 0 || it.kind !== 'stats') effect(e, cfg, r);
  }

  OV.registerLayer({
    mount(stage) {
      const layer = document.createElement('div');
      layer.className = 'th-layer';
      stage.appendChild(layer);
      entries.push({ stage, layer, key: '' });
    },
    update(S, stage) {
      const e = entries.find((x) => x.stage === stage);
      if (e) render(e, S);
    },
  });
})();
