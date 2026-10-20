/* 背景:サイドバーの後ろ、または画面全体(ゲーム映像の場所を抜く) */
(function () {
  'use strict';
  const { clamp } = OV.util;

  /** 動画のファイルか(MP4 / WebM) */
  OV.isVideoFile = (f) => /\.(mp4|webm)$/i.test(String(f || ''));
  /** el の中に、背景の動画を置く(動画でなければ取り除く)。音は出さない */
  OV.setBgVideo = function (el, file) {
    let v = el.querySelector(':scope > video.bg-video');
    if (!OV.isVideoFile(file)) { if (v) v.remove(); return; }
    const src = `/bg-uploads/${encodeURIComponent(file)}`;
    if (!v) {
      v = document.createElement('video');
      v.className = 'bg-video';
      v.muted = true; v.loop = true; v.autoplay = true; v.playsInline = true;
      v.setAttribute('muted', '');
      el.appendChild(v);
    }
    if (v.getAttribute('src') !== src) { v.setAttribute('src', src); v.play().catch(() => {}); }
  };
  // 設定から、背景の CSS を作る(オーバーレイと、管理画面の見本で共通)
  OV.bgStyle = function (cfg) {
    const out = {};
    const imageProps = (url) => {
      out.backgroundImage = `url("${url}")`;
      out.backgroundColor = '#000';
      out.backgroundPosition = 'center';
      out.backgroundRepeat = cfg.fit === 'tile' ? 'repeat' : 'no-repeat';
      out.backgroundSize = cfg.fit === 'tile' ? `${clamp(Number(cfg.tileSize) || 256, 16, 1920)}px auto` : cfg.fit === 'contain' ? 'contain' : 'cover';
    };
    if (cfg.type === 'color') out.background = cfg.color || '#000';
    else if (cfg.type === 'gradient') out.background = `linear-gradient(${Number(cfg.angle) || 0}deg, ${cfg.color || '#000'}, ${cfg.color2 || '#fff'})`;
    else if (cfg.type === 'upload') {
      if (cfg.upload) imageProps(`/bg-uploads/${encodeURIComponent(cfg.upload)}`);
      else out.background = '#000';
    } else if (cfg.presetId === 'tpl') {
      // テンプレートの背景
      out.background = (OV.tplValue && OV.tplValue('background')) || '#000';
    } else {
      const p = (OV.catalogs.bgPresets || []).find((x) => x.id === cfg.presetId);
      if (!p) out.background = '#000';
      else if (p.kind === 'image') imageProps(`/bg-assets/${encodeURIComponent(p.file)}`);
      else out.background = p.css;
    }
    return out;
  };

  // ゲーム映像を表示する場所(1920x1080 の中)
  OV.gameWindowRect = function (S) {
    const g = ((S.background || {}).game) || {};
    const fixed = OV.frameManualRect && OV.frameManualRect(S); // ゲーム枠タブで大きさを指定しているとき
    if (fixed) return fixed;
    if (g.mode === 'manual') {
      const area = { x: Number(g.x) || 0, y: Number(g.y) || 0, w: Math.max(40, Number(g.w) || 1280), h: Math.max(40, Number(g.h) || 720) };
      return (OV.frameFit && OV.frameFit(S, area, '')) || area; // ゲーム枠があるときは、枠ごとこの範囲に収める
    }
    const c = (S.layout || {}).container || {};
    const free = { x: 0, y: 0, w: OV.W, h: OV.H };
    if (c.enabled !== false && OV.containerRect) {
      const r = OV.containerRect(c);
      if (c.dock === 'right') free.w = r.x;
      else if (c.dock === 'left') { free.x = r.w; free.w = OV.W - r.w; } else if (c.dock === 'bottom') free.h = r.y;
      else if (c.dock === 'top') { free.y = r.h; free.h = OV.H - r.h; }
    }
    const m = Number(g.margin) || 0;
    if (OV.frameFit) {
      const fit = OV.frameFit(S, { x: free.x + m, y: free.y + m, w: Math.max(100, free.w - m * 2), h: Math.max(100, free.h - m * 2) }, g.ratio || '16:9');
      if (fit) return fit;
    }
    const [rw, rh] = String(g.ratio || '16:9').split(':').map(Number);
    const availW = Math.max(100, free.w - m * 2);
    const availH = Math.max(100, free.h - m * 2);
    const w = Math.min(availW, (availH * rw) / rh);
    const h = (w * rh) / rw;
    return { x: Math.round(free.x + (free.w - w) / 2), y: Math.round(free.y + (free.h - h) / 2), w: Math.round(w), h: Math.round(h) };
  };

  const entries = [];
  function render(e, S) {
    const b = S.background || {};
    const sig = JSON.stringify([b, (S.layout || {}).container, (OV.catalogs.bgPresets || []).length, S.gameFrame, S.theme, S.frameCustom, OV.catalogs.gameFrames, (OV.catalogs.templates || []).length]);
    if (sig === e.sig) return;
    e.sig = sig;
    const L = e.layer;
    if (!b.enabled) { L.style.display = 'none'; return; }
    L.style.display = '';
    L.style.opacity = String(clamp(b.opacity == null ? 1 : Number(b.opacity), 0, 1));
    const fill = L.querySelector('.bg-fill');
    const dim = L.querySelector('.bg-dim');
    const frame = L.querySelector('.bg-frame');
    fill.style.cssText = '';
    Object.assign(fill.style, OV.bgStyle(b));
    OV.setBgVideo(fill, b.type === 'upload' ? b.upload : '');
    const geo = { left: '0px', top: '0px', width: `${OV.W}px`, height: `${OV.H}px`, clipPath: 'none' };
    frame.style.display = 'none';
    if (b.target === 'full') {
      const r = OV.gameWindowRect(S);
      const path = `path(evenodd, "M0 0H${OV.W}V${OV.H}H0Z M${r.x} ${r.y}h${r.w}v${r.h}h${-r.w}Z")`;
      geo.clipPath = path;
      const g = b.game || {};
      const bw = g.borderStyle === 'none' ? 0 : Number(g.borderWidth) || 0;
      if (bw > 0 && !(OV.frameActive && OV.frameActive(S))) {
        Object.assign(frame.style, { display: '', left: `${r.x - bw}px`, top: `${r.y - bw}px`, width: `${r.w + bw * 2}px`, height: `${r.h + bw * 2}px`, border: `${bw}px ${g.borderStyle === 'double' ? 'double' : 'solid'} ${g.borderColor || '#fff'}`, borderRadius: `${Number(g.radius) || 0}px`, boxSizing: 'border-box' });
      }
    } else {
      const c = (S.layout || {}).container || {};
      if (c.enabled === false) { L.style.display = 'none'; return; }
      const r = OV.containerRect(c);
      Object.assign(geo, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
    }
    Object.assign(fill.style, geo);
    Object.assign(dim.style, geo, { background: `rgba(0,0,0,${clamp(Number(b.dim) || 0, 0, 0.9)})` });
  }

  OV.registerLayer({
    mount(stage) {
      const layer = document.createElement('div');
      layer.className = 'bg-layer';
      layer.innerHTML = '<div class="bg-fill"></div><div class="bg-dim"></div><div class="bg-frame"></div>';
      stage.insertBefore(layer, stage.firstChild); // パネルより後ろ
      entries.push({ stage, layer, sig: '' });
    },
    update(S, stage) {
      const e = entries.find((x) => x.stage === stage);
      if (e) render(e, S);
    },
  });
  // 背景の一覧が届いたあと、描き直す
  OV.onMessage('core:catalog', () => entries.forEach((e) => { e.sig = ''; }));
})();
