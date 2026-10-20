/* アラート:画面上部に、テンプレートの色のカードで1件ずつ表示する(紙吹雪・花火・効果音つき) */
(function () {
  'use strict';
  const { esc, clamp } = OV.util;
  const entries = [];

  function fit(e) {
    const t = e.layer.querySelector('.al-title');
    if (!t) return;
    t.style.fontSize = '';
    const max = 1100;
    const w = t.scrollWidth;
    if (w > max) t.style.fontSize = `${Math.max(30, 64 * (max / w))}px`;
  }
  function effects(e, item) {
    if (!OV.fx) return;
    const card = e.layer.querySelector('.al-card');
    if (!card) return;
    const fx = e.layer.querySelector('.al-fx');
    const k = e.stage.getBoundingClientRect().width / OV.W || 1;
    const r = card.getBoundingClientRect();
    const s = e.stage.getBoundingClientRect();
    const rect = { x: (r.left - s.left) / k - 120, y: (r.top - s.top) / k - 40, w: r.width / k + 240, h: r.height / k + 260 };
    if (item.effect === 'confetti' || item.effect === 'both') OV.fx.confetti(fx, rect, 60, 1.1);
    if (item.effect === 'fireworks' || item.effect === 'both') for (let i = 0; i < 4; i++) setTimeout(() => OV.fx.firework(fx, rect, 1.2), i * 300);
  }
  function sound(item) {
    if (!item.sound || OV.role !== 'overlay' || !OV.chime) return;
    const vol = clamp(Number((OV.state.reactions || {}).volume) || 0.4, 0, 1) * 0.2;
    const big = ['superchat', 'gift', 'raid'].includes(item.kind);
    OV.chime(big ? [659.3, 830.6, 987.8, 1318.5] : [880, 1108.7, 1318.5], vol, 0.09, big ? 1 : 0.7);
  }
  function render(e, S) {
    const sh = S.alertShow || {};
    const v = S.alertView || {};
    e.layer.style.setProperty('--al-y', `${Number(v.y) || 0}px`);
    e.layer.style.setProperty('--al-scale', String(clamp(Number(v.scale) || 1, 0.4, 2.5)));
    if (!sh.active || !sh.item) {
      if (e.key) { e.key = ''; const c = e.layer.querySelector('.al-card'); if (c) c.classList.add('out'); }
      return;
    }
    const key = `${sh.seq}`;
    if (key === e.key) return;
    e.key = key;
    const tr = (s) => OV.t(String(s || '')); // 決まった文だけ訳す(名前やコメントはそのまま)
    const it = { ...sh.item, title: tr(sh.item.title), sub: tr(sh.item.sub), text: tr(sh.item.text) };
    const plat = OV.chatPlatformIcon && it.platform && ['youtube', 'twitch'].includes(it.platform) ? `<span class="al-plat">${OV.chatPlatformIcon(it.platform)}</span>` : '';
    e.layer.innerHTML = `<div class="al-fx"></div><div class="al-wrap"><div class="al-card k-${esc(it.kind)}">
      <div class="al-icon"><span>${esc(it.icon || '★')}</span></div>
      <div class="al-body">${it.title ? `<div class="al-title">${plat}${esc(it.title)}</div>` : ''}${it.sub ? `<div class="al-sub">${esc(it.sub)}</div>` : ''}${it.text ? `<div class="al-text">${esc(it.text)}</div>` : ''}</div>
      <div class="al-shine"></div></div></div>`;
    fit(e);
    requestAnimationFrame(() => { effects(e, it); });
    sound(it);
  }
  OV.registerLayer({
    mount(stage) {
      const layer = document.createElement('div');
      layer.className = 'al-layer';
      stage.appendChild(layer);
      entries.push({ stage, layer, key: '' });
    },
    update(S, stage) {
      const e = entries.find((x) => x.stage === stage);
      if (e) render(e, S);
    },
  });
})();
