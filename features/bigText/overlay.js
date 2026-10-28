/* 大きな文字:枠なしで、文字だけを大きく表示する(縁取り2重・グロー・影・グラデーション・縦書き・動き) */
(function () {
  'use strict';
  const { esc, hexToRgba } = OV.util;
  const BASE = 48; // OV.titleTextHtml は 48px 基準の値を使うので、実際の px を換算する

  const isOn = (o) => !!(o && o.on);
  /** グラデーションの色の並び(stops があればそれを使い、なければ 色1→色2) */
  const stopsOf = (o) => {
    if (Array.isArray(o.stops) && o.stops.length > 1) {
      return o.stops.map((s) => `${s.color || '#fff'} ${Math.max(0, Math.min(100, Number(s.pos) || 0))}%`);
    }
    return [o.color || '#fff', o.color2 || '#ffd84a'];
  };
  const fillOf = (o, extra) => Object.assign(o.fillType === 'gradient'
    ? { type: 'gradient', angle: Number(o.angle) || 180, stops: stopsOf(o) }
    : { type: 'solid', color: o.color || '#fff' }, extra || {});

  /** パネルの設定 → 文字の装飾(OV.titleTextHtml の形) */
  OV.bigTextLook = function (d) {
    const size = Math.max(8, Number(d.size) || 100);
    const k = BASE / size; // px → 48px 基準
    const on = (o) => o && o.on !== false && Number(o.width == null ? o.size : o.width) > 0;
    const strokes = [d.stroke1, d.stroke2, d.stroke3].filter(on).map((s) => ({ color: s.color || '#000', width: Number(s.width) * k }));
    const sh = d.shadow || {};
    const tex = d.texture && d.texture.id && d.texture.id !== 'none' ? { id: d.texture.id, blend: d.texture.blend || 'multiply', bright: Number(d.texture.bright) || 0, scale: Number(d.texture.scale) || 1, contrast: Number(d.texture.contrast) || 0, x: d.texture.x, y: d.texture.y } : null;
    const ex = d.extrude || {};
    return {
      font: d.font || 'Noto Sans JP',
      weight: d.bold === false ? 400 : 900,
      italic: !!d.italic,
      letterSpacing: Number(d.letterSpacing) || 0,
      skew: Number(d.skew) || 0,
      fill: fillOf(d, { texture: tex, gloss: isOn(d.gloss) ? (d.gloss.strength == null ? 1 : Number(d.gloss.strength)) : 0 }),
      accent: isOn(d.accent) ? fillOf(d.accent) : null,
      accent2: isOn(d.accent2) ? fillOf(d.accent2) : null,
      strokes,
      round: d.roundStroke !== false, // 縁取りの角を丸くする
      perLine: true,
      stripMarks: true, // [[ ]] {{ }} の記号は、色分けを使わないときも表示しない
      glow: d.glow && d.glow.on && Number(d.glow.size) > 0 ? { color: d.glow.color || '#fff', size: Number(d.glow.size) * k } : null,
      shadow: sh.on ? { color: hexToRgba(sh.color || '#000000', sh.alpha == null ? 0.6 : Number(sh.alpha)), x: Number(sh.x || 0) * k, y: Number(sh.y || 0) * k, blur: Number(sh.blur || 0) * k } : null,
      extrude: ex.on ? { color: ex.color || '#000', x: Number(ex.x || 0) * k, y: Number(ex.y || 0) * k } : null,
      band: isOn(d.band) ? { color: d.band.color || '#ff2a3a', height: Number(d.band.height) || 45 } : null,
      pixel: isOn(d.pixel) && Number(d.pixel.size) > 0 ? { em: Number(d.pixel.size) / size } : null, // ドット風(1マスの大きさ)
      charSize: d.charSize ? { auto: d.charSize.auto || 'none', digits: !!d.charSize.digits, big: Number(d.charSize.big) || 1.35, small: Number(d.charSize.small) || 0.7 } : null,
    };
  };

  /** 文字の後ろに敷く図形(ギザギザ・丸・雲) */
  OV.bigTextDeco = function (deco) {
    if (!deco || !deco.type || deco.type === 'none') return '';
    const fill = esc(deco.color || '#e8102a');
    const edge = deco.edge ? esc(deco.edge) : 'none';
    let shape = '';
    if (deco.type === 'burst') {
      const n = 18;
      const pts = [];
      for (let i = 0; i < n * 2; i++) {
        const a = (Math.PI * i) / n - Math.PI / 2;
        const r = i % 2 ? 0.78 : 1;
        pts.push(`${(50 + Math.cos(a) * 50 * r).toFixed(2)},${(50 + Math.sin(a) * 50 * r).toFixed(2)}`);
      }
      shape = `<polygon points="${pts.join(' ')}"/>`;
    } else if (deco.type === 'circle') {
      shape = '<ellipse cx="50" cy="50" rx="49" ry="49"/>';
    } else if (deco.type === 'cloud') {
      const bumps = [];
      for (let i = 0; i < 12; i++) { const a = (Math.PI * 2 * i) / 12; bumps.push(`<circle cx="${(50 + Math.cos(a) * 36).toFixed(1)}" cy="${(50 + Math.sin(a) * 36).toFixed(1)}" r="16"/>`); }
      shape = `${bumps.join('')}<ellipse cx="50" cy="50" rx="38" ry="38"/>`;
    } else if (deco.type === 'box') {
      shape = '<rect x="1" y="1" width="98" height="98" rx="10" ry="10"/>';
    }
    const pad = Math.max(0, Math.min(1.5, Number(deco.pad == null ? 0.45 : deco.pad)));
    return `<span class="bt-deco" aria-hidden="true" style="inset:-${pad}em -${(pad * 1.4).toFixed(2)}em"><svg viewBox="0 0 100 100" preserveAspectRatio="none" fill="${fill}" stroke="${edge}" stroke-width="${deco.edge ? 1.5 : 0}">${shape}</svg></span>`;
  };

  OV.registerPanelType('bigText', {
    label: '大きな文字(自由配置)',
    noLook: true, // 枠・背景は使わない(文字の装飾は、このパネルの設定で決める)
    // 傾き・影・光は、はみ出しとして数えない。高さを固定したときだけ、文字の行が入りきらなければ縮める
    noFit: true,
    layoutFit(el) {
      const bt = el.querySelector('.bt');
      if (!bt) return;
      bt.style.setProperty('--bt-fit', '1');
      const room = () => el.clientHeight - (parseFloat(getComputedStyle(el).paddingTop) || 0) - (parseFloat(getComputedStyle(el).paddingBottom) || 0);
      const over = () => bt.offsetHeight > room() + 1 || bt.offsetWidth > el.clientWidth + 1;
      if (!over()) { OV.fixPixelFilters(el); return; }
      let lo = 0.1;
      let hi = 1;
      for (let i = 0; i < 8; i++) {
        const mid = (lo + hi) / 2;
        bt.style.setProperty('--bt-fit', mid.toFixed(4));
        if (over()) hi = mid; else lo = mid;
      }
      bt.style.setProperty('--bt-fit', lo.toFixed(4));
      OV.fixPixelFilters(el);
    },
    sizeLabels: { headingSize: '(未使用)', bodySize: '(未使用)', numberSize: '(未使用)' },
    render(el, p) {
      const d = p.data || {};
      const L = OV.bigTextLook(d);
      const align = ['left', 'right'].includes(d.align) ? d.align : 'center';
      const style = [
        `font-size:calc(${Math.max(8, Number(d.size) || 100)}px * var(--k) * var(--bt-fit, 1))`,
        `line-height:${Number(d.lineHeight) || 1.2}`,
        `text-align:${align}`,
        `--bt-sec:${Math.max(0.3, Number(d.motionSec) || 2)}s`,
      ].join(';');
      const cls = `bt${d.vertical ? ' vert' : ''} al-${align}${d.motion && d.motion !== 'none' ? ` mo-${d.motion}` : ''}`;
      const deco = OV.bigTextDeco(d.deco);
      const inner = OV.titleTextHtml(d.text || '', L);
      el.innerHTML = `<div class="${esc(cls)}" style="${esc(style)}">${deco ? `<span class="bt-dw">${deco}${inner}</span>` : inner}</div>`;
    },
  });
})();
