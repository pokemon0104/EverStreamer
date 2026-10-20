/* ゲーム枠:ゲーム映像のまわりの枠(オーバーレイと、管理画面の見本で共通) */
(function () {
  'use strict';
  const { clamp } = OV.util;

  // 枠の種類(config/game-frames.json)に、管理画面での調整(frameCustom)を重ねたもの
  OV.mergeFrame = (f, c) => {
    if (!c || typeof c !== 'object') return f;
    const o = { ...f, customized: true };
    if (Array.isArray(c.layers)) o.layers = c.layers;
    if (c.radius != null) o.radius = c.radius;
    if (c.ratio != null) o.ratio = c.ratio;
    for (const k of ['glow', 'shadow', 'corners']) {
      if (c[k] === false) delete o[k];
      else if (c[k] && typeof c[k] === 'object') o[k] = { ...(f[k] || {}), ...c[k] };
    }
    if (c.panel && typeof c.panel === 'object') o.panel = { ...(f.panel || {}), ...c.panel };
    return o;
  };
  const frames = () => {
    const cu = (OV.state && OV.state.frameCustom) || {};
    const tpl = OV.templateFrame ? OV.templateFrame() : null; // テンプレートの枠(先頭に置く)
    return [...(tpl ? [tpl] : []), ...(OV.catalogs.gameFrames || [])].map((f) => OV.mergeFrame(f, cu[f.id]));
  };
  OV.frameDefs = frames;

  // いま使う枠を決める: { kind:'css', def } / { kind:'img', img } / null
  // ---- ゲーム枠と同じデザインの「パネルのスタイル」(サイドバーのパネル用) ----
  const PANEL_MAX = 14; // パネルでは、枠の太さの合計をこのpxまでに縮める
  const outsetSum = (def) => (def.layers || []).reduce((a, l) => a + (Number(l.w) || 0), 0);
  /** スタイルID frame:枠ID(frame:auto = いまのゲーム枠に合わせる)から、パネルのスタイルを作る */
  OV.frameStyle = function (id) {
    let fid = String(id || '').slice(6);
    if (fid === 'auto') {
      const S = OV.state || {};
      const fr = OV.resolveFrame({ ...S, gameFrame: { ...(S.gameFrame || {}), enabled: true } });
      fid = fr && fr.kind === 'css' && fr.def.id !== 'none' ? fr.def.id : 'simple';
    }
    const def = frames().find((x) => x.id === fid) || frames().find((x) => x.id === 'simple');
    if (!def) return null;
    fid = def.id;
    const T = outsetSum(def);
    const k = T > PANEL_MAX ? PANEL_MAX / T : 1;
    const Tk = (def.layers || []).reduce((a, l) => a + Math.max(1, Math.round((Number(l.w) || 0) * k)), 0);
    const P = def.panel || {};
    const sh = [];
    if (def.shadow) sh.push(`0 ${Math.round((Number(def.shadow.y) || 0) * 0.6)}px ${Math.round((Number(def.shadow.blur) || 0) * 0.6)}px ${def.shadow.color || 'rgba(0,0,0,.5)'}`);
    if (def.glow) sh.push(`0 0 ${Math.round((Number(def.glow.blur) || 0) * 0.7)}px ${def.glow.color || '#fff'}`);
    const R = def.radius ? Math.min(20, Number(def.radius)) + Tk : 0;
    return {
      id,
      name: String(id) === 'frame:auto' ? 'ゲーム枠に合わせる(自動)' : def.name,
      fromFrame: true,
      look: {
        font: P.font || 'M PLUS Rounded 1c', headingFont: P.headingFont || '', bold: true,
        bgColor: P.bgColor || '#0b0c14', bgAlpha: P.bgAlpha == null ? 0.9 : P.bgAlpha, bgImage: P.bgImage || '',
        textColor: P.textColor || '#ffffff', headingColor: P.headingColor || '#ffffff', numberColor: P.numberColor || '#ffe14d',
        borderStyle: 'none', borderWidth: 0, frame: 'plain', insetColor: '', bevel: false, scanlines: false,
        shadowBlur: 0, shadowY: 0, innerShadow: sh.join(', '), radius: R, padding: 14 + Tk,
        gameFrame: def.id, gfScale: k, gfSig: JSON.stringify([def.layers, def.radius, def.corners]),
      },
    };
  };
  /** 「ゲーム枠と同じスタイル」の一覧(先頭は「ゲーム枠に合わせる(自動)」) */
  OV.frameStyles = () => [OV.frameStyle('frame:auto'), ...frames().filter((f) => f.id !== 'none' && f.id !== 'tpl').map((f) => OV.frameStyle(`frame:${f.id}`))].filter(Boolean)
    ;

  /** パネルの縁の内側に、ゲーム枠と同じ帯を描く(位置は inset で指定するので、パネルの大きさが変わっても崩れない) */
  OV.frameDecorate = function (el, fid, k, R) {
    el.textContent = '';
    const def = frames().find((x) => x.id === fid);
    if (!def) return;
    const mk = (cls) => { const d = document.createElement('div'); d.className = cls; el.appendChild(d); return d; };
    const layers = def.layers || [];
    let out = 0;
    for (let i = layers.length - 1; i >= 0; i--) {
      const l = layers[i];
      const w = Math.max(1, Math.round((Number(l.w) || 0) * (k || 1)));
      if (!(Number(l.w) > 0)) continue;
      const fill = l.fill || '#fff';
      if (l.pixel) {
        const bar = (st) => Object.assign(mk('gf-px').style, { position: 'absolute', background: fill }, st);
        bar({ top: `${out}px`, left: `${out + w}px`, right: `${out + w}px`, height: `${w}px` });
        bar({ bottom: `${out}px`, left: `${out + w}px`, right: `${out + w}px`, height: `${w}px` });
        bar({ left: `${out}px`, top: `${out + w}px`, bottom: `${out + w}px`, width: `${w}px` });
        bar({ right: `${out}px`, top: `${out + w}px`, bottom: `${out + w}px`, width: `${w}px` });
      } else {
        Object.assign(mk('gf-ring').style, {
          position: 'absolute', inset: `${out}px`, boxSizing: 'border-box', border: `${w}px solid transparent`,
          background: fill, backgroundOrigin: 'border-box', backgroundClip: 'border-box', borderRadius: `${Math.max(0, (R || 0) - out)}px`,
          WebkitMask: 'linear-gradient(#000 0 0) padding-box, linear-gradient(#000 0 0)', WebkitMaskComposite: 'xor', maskComposite: 'exclude',
        });
      }
      out += w;
    }
    if (def.corners) {
      const c = def.corners, len = Math.min(26, Number(c.len) || 24), cw = Math.max(2, Math.round((Number(c.w) || 3) * 0.75));
      [['top', 'left'], ['top', 'right'], ['bottom', 'left'], ['bottom', 'right']].forEach(([a, b]) => {
        const cap = (x) => x[0].toUpperCase() + x.slice(1);
        Object.assign(mk('gf-corner').style, { position: 'absolute', [a]: '0', [b]: '0', width: `${len}px`, height: `${len}px`, boxSizing: 'border-box',
          [`border${cap(a)}`]: `${cw}px solid ${c.color || '#fff'}`, [`border${cap(b)}`]: `${cw}px solid ${c.color || '#fff'}` });
      });
    }
  };

  OV.resolveFrame = function (S) {
    const g = S.gameFrame;
    if (!g || !g.enabled) return null;
    const pick = (id) => {
      if (!id || id === 'none') return null;
      if (String(id).startsWith('img:')) {
        const img = (g.images || []).find((x) => `img:${x.id}` === id);
        return img ? { kind: 'img', img, id } : undefined;
      }
      const def = frames().find((x) => x.id === id);
      return def ? { kind: 'css', def, id } : undefined;
    };
    let r = pick(g.frameId);
    if (r === undefined) r = pick('tpl');
    if (r === undefined) r = pick('simple');
    return r || null;
  };
  OV.frameActive = (S) => !!OV.resolveFrame(S);
  // 大きさを数値で指定しているとき、そのゲーム映像の場所(枠が使われていないときは null)
  OV.frameManualRect = function (S) {
    const z = (S.gameFrame || {}).size;
    if (!z || z.mode !== 'manual' || !OV.resolveFrame(S)) return null;
    return { x: Math.round(Number(z.x) || 0), y: Math.round(Number(z.y) || 0), w: Math.max(40, Math.round(Number(z.w) || 0)), h: Math.max(40, Math.round(Number(z.h) || 0)) };
  };

  const parseRatio = (s) => { const [a, b] = String(s || '').split(':').map(Number); return a > 0 && b > 0 ? a / b : 0; };
  const outsetOf = (def) => (def.layers || []).reduce((a, l) => a + (Number(l.w) || 0), 0) + (def.corners ? Number(def.corners.gap) || 0 : 0) * 0;
  // 影や光がはみ出る分も含めた、見た目の外側の広がり
  const spread = (def) => {
    const sh = def.shadow, gl = def.glow;
    return Math.max(0, sh ? (Number(sh.blur) || 0) * 0.6 + Math.abs(Number(sh.y) || 0) : 0, gl ? (Number(gl.blur) || 0) * 0.6 : 0);
  };

  /** 枠が使えるとき、area の中に枠ごと収まるゲーム映像の場所を返す(なければ null)。
   *  bgRatio: 枠が縦横比を決めないときに使う比率('16:9' など / 空なら area いっぱい) */
  OV.frameFit = function (S, area, bgRatio) {
    const fr = OV.resolveFrame(S);
    if (!fr) return null;
    const g = S.gameFrame;
    if (fr.kind === 'img') {
      const { iw, ih, hole } = fr.img;
      const A = iw / ih;
      const tw = Math.min(area.w, area.h * A);
      const th = tw / A;
      const k = tw / iw;
      const gw = hole.w * iw * k, gh = hole.h * ih * k;
      const ox = area.x + (area.w - tw) / 2, oy = area.y + (area.h - th) / 2;
      return { x: Math.round(ox + hole.x * iw * k), y: Math.round(oy + hole.y * ih * k), w: Math.round(gw), h: Math.round(gh) };
    }
    const def = fr.def;
    const O = outsetOf(def) + Math.min(spread(def), 12);
    const iw = Math.max(40, area.w - O * 2), ih = Math.max(40, area.h - O * 2);
    const ratio = (g.autoRatio !== false && parseRatio(def.ratio)) || parseRatio(bgRatio);
    let w = iw, h = ih;
    if (ratio) { w = Math.min(iw, ih * ratio); h = w / ratio; }
    return { x: Math.round(area.x + (area.w - w) / 2), y: Math.round(area.y + (area.h - h) / 2), w: Math.round(w), h: Math.round(h) };
  };

  // ---- 描画 ----
  const ringStyle = (el, rect, off, w, fill, radius) => {
    const o = off + w;
    Object.assign(el.style, {
      position: 'absolute', left: `${rect.x - o}px`, top: `${rect.y - o}px`, width: `${rect.w + o * 2}px`, height: `${rect.h + o * 2}px`,
      boxSizing: 'border-box', border: `${w}px solid transparent`, background: fill, backgroundOrigin: 'border-box', backgroundClip: 'border-box',
      borderRadius: `${radius}px`,
      WebkitMask: 'linear-gradient(#000 0 0) padding-box, linear-gradient(#000 0 0)', WebkitMaskComposite: 'xor', maskComposite: 'exclude',
    });
  };

  // ピクセル枠(角が欠けた枠):上下左右の4本の棒で描き、角を欠く。2段なら内側の角に段を付ける
  function pixelRing(add, mk, rect, off, w, fill, steps) {
    const R = { x: rect.x - off - w, y: rect.y - off - w, w: rect.w + (off + w) * 2, h: rect.h + (off + w) * 2 };
    const bar = (x, y, bw, bh) => { const d = add(mk('gf-px')); Object.assign(d.style, { position: 'absolute', left: `${x}px`, top: `${y}px`, width: `${bw}px`, height: `${bh}px`, background: fill }); };
    bar(R.x + w, R.y, R.w - w * 2, w);
    bar(R.x + w, R.y + R.h - w, R.w - w * 2, w);
    bar(R.x, R.y + w, w, R.h - w * 2);
    bar(R.x + R.w - w, R.y + w, w, R.h - w * 2);
    if (Number(steps) >= 2) {
      bar(R.x + w, R.y + w, w, w); bar(R.x + R.w - w * 2, R.y + w, w, w);
      bar(R.x + w, R.y + R.h - w * 2, w, w); bar(R.x + R.w - w * 2, R.y + R.h - w * 2, w, w);
    }
  }

  /** box の中に、rect(ゲーム映像の場所)を囲む枠を描く。S は画面の状態(scanlines などを使う) */
  OV.renderGameFrameInto = function (box, fr, rect, cfg) {
    box.textContent = '';
    if (!fr) return;
    const add = (el) => { box.appendChild(el); return el; };
    const mk = (cls) => { const d = document.createElement('div'); d.className = cls; return d; };
    box.style.opacity = String(clamp(cfg.opacity == null ? 1 : Number(cfg.opacity), 0, 1));
    if (fr.kind === 'img') {
      const { iw, ih, hole, file } = fr.img;
      const k = rect.w / (hole.w * iw);
      const im = document.createElement('img');
      im.src = `/frames/${encodeURIComponent(file)}`;
      im.draggable = false;
      Object.assign(im.style, { position: 'absolute', left: `${rect.x - hole.x * iw * k}px`, top: `${rect.y - hole.y * ih * k}px`, width: `${iw * k}px`, height: `${ih * k}px`, maxWidth: 'none' });
      add(im);
    } else {
      const def = fr.def;
      let off = 0;
      const r0 = Number(def.radius) || 0;
      const fx = add(mk('gf-fx'));
      const total = outsetOf(def);
      const shadows = [];
      if (def.shadow) shadows.push(`0 ${Number(def.shadow.y) || 0}px ${Number(def.shadow.blur) || 0}px ${def.shadow.color || 'rgba(0,0,0,.5)'}`);
      if (def.glow) shadows.push(`0 0 ${Number(def.glow.blur) || 0}px ${def.glow.color || '#fff'}`);
      Object.assign(fx.style, { position: 'absolute', left: `${rect.x - total}px`, top: `${rect.y - total}px`, width: `${rect.w + total * 2}px`, height: `${rect.h + total * 2}px`, borderRadius: `${r0 + total}px`, boxShadow: shadows.join(',') });
      fx.style.display = shadows.length ? '' : 'none';
      for (const l of def.layers || []) {
        const w = Number(l.w) || 0;
        if (w <= 0) continue;
        const rad = l.radius != null ? Number(l.radius) : (r0 ? r0 + off + w : 0);
        if (l.pixel) pixelRing(add, mk, rect, off, w, l.fill || '#fff', l.steps);
        else ringStyle(add(mk('gf-ring')), rect, off, w, l.fill || '#fff', rad);
        off += w;
      }
      if (def.corners) {
        const c = def.corners, len = Number(c.len) || 30, cw = Number(c.w) || 3, gap = Number(c.gap) || 0;
        const x0 = rect.x - gap - cw, y0 = rect.y - gap - cw, x1 = rect.x + rect.w + gap, y1 = rect.y + rect.h + gap;
        [[x0, y0, 'Top', 'Left'], [x1 - len + cw, y0, 'Top', 'Right'], [x0, y1 - len + cw, 'Bottom', 'Left'], [x1 - len + cw, y1 - len + cw, 'Bottom', 'Right']].forEach(([x, y, a, b]) => {
          const d = add(mk('gf-corner'));
          Object.assign(d.style, { position: 'absolute', left: `${x}px`, top: `${y}px`, width: `${len}px`, height: `${len}px`, boxSizing: 'border-box', [`border${a}`]: `${cw}px solid ${c.color || '#fff'}`, [`border${b}`]: `${cw}px solid ${c.color || '#fff'}` });
        });
      }
    }
    // 走査線・周辺減光(ゲーム映像の上に重なる)。ブラウン管風のスタイルの枠は、走査線が最初から付く
    const over = (fr.def && fr.def.over) || {};
    const scan = Math.max(Number(cfg.scanlines) || 0, Number(over.scanlines) || 0);
    const vig = Math.max(Number(cfg.vignette) || 0, Number(over.vignette) || 0);
    if (scan > 0 || vig > 0) {
      const o = add(mk('gf-over'));
      const bg = [];
      if (scan > 0) bg.push(`repeating-linear-gradient(0deg, rgba(0,0,0,${(0.35 * scan).toFixed(3)}) 0 1px, transparent 1px 3px)`);
      if (vig > 0) bg.push(`radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,${(0.75 * vig).toFixed(3)}) 100%)`);
      Object.assign(o.style, { position: 'absolute', left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.w}px`, height: `${rect.h}px`, background: bg.join(',') });
    }
  };

  const entries = [];
  function render(e, S) {
    const g = S.gameFrame || {};
    const fr = OV.resolveFrame(S);
    const rect = fr ? OV.gameWindowRect(S) : null;
    const sig = JSON.stringify([g, fr && fr.id, fr && fr.def, rect, OV.catalogs.gameFrames]);
    if (sig === e.sig) return;
    e.sig = sig;
    if (!fr || !rect) { e.box.style.display = 'none'; e.box.textContent = ''; return; }
    e.box.style.display = '';
    OV.renderGameFrameInto(e.box, fr, rect, g);
  }
  OV.registerLayer({
    mount(stage) {
      const box = document.createElement('div');
      box.className = 'gf-layer';
      const first = stage.firstChild;
      stage.insertBefore(box, first && first.nextSibling); // 背景のすぐ上、パネルの下
      entries.push({ stage, box, sig: '' });
    },
    update(S, stage) {
      const e = entries.find((x) => x.stage === stage);
      if (e) render(e, S);
    },
  });
  OV.onMessage('core:catalog', () => entries.forEach((e) => { e.sig = ''; }));
})();
