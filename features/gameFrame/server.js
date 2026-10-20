'use strict';
// ゲーム枠:ゲーム映像のまわりを囲む枠(テンプレートの枠・用意した枠・自分の枠画像)
const fs = require('fs');
const path = require('path');
const express = require('express');
const { deepMerge, isPlainObject, watchJson, uid } = require('../../core/util');

const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

const defaults = () => ({
  enabled: true,
  frameId: 'tpl', // tpl = テンプレートの枠 / 枠ID / img:画像ID
  autoRatio: true, // 枠に合わせてゲーム映像の縦横比を切り替える
  opacity: 1,
  scanlines: 0, // 走査線
  vignette: 0, // 周辺を暗く
  // ゲーム映像の大きさ・位置: auto = 背景/レイアウトの設定から自動 / manual = 数値で指定(OBS のゲーム映像に合わせる)
  size: { mode: 'auto', x: 60, y: 40, w: 1342, h: 1000, keepRatio: true },
  images: [], // 取り込んだ枠画像 { id, name, file, iw, ih, hole:{x,y,w,h}(0〜1) }
});

function normImage(i) {
  if (!isPlainObject(i) || !i.file) return null;
  const h = isPlainObject(i.hole) ? i.hole : {};
  const x = num(h.x, 0.1, 0, 0.9), y = num(h.y, 0.1, 0, 0.9);
  return {
    id: String(i.id || uid('img')), name: String(i.name || '画像').slice(0, 40), file: path.basename(String(i.file)),
    iw: num(i.iw, 1600, 16, 8192), ih: num(i.ih, 900, 16, 8192),
    hole: { x, y, w: num(h.w, 0.8, 0.05, 1 - x), h: num(h.h, 0.8, 0.05, 1 - y) },
  };
}
function normalize(v) {
  const d = defaults();
  const o = isPlainObject(v) ? v : {};
  const out = { ...d, ...o };
  out.images = (Array.isArray(o.images) ? o.images : []).map(normImage).filter(Boolean);
  const sz = isPlainObject(o.size) ? o.size : {};
  out.size = {
    mode: sz.mode === 'manual' ? 'manual' : 'auto',
    x: Math.round(num(sz.x, d.size.x, -2000, 4000)), y: Math.round(num(sz.y, d.size.y, -2000, 4000)),
    w: Math.round(num(sz.w, d.size.w, 40, 4000)), h: Math.round(num(sz.h, d.size.h, 40, 4000)),
    keepRatio: sz.keepRatio !== false,
  };
  delete out.mode; // 以前の「ハードに合わせて自動」は使わない
  delete out.map;
  out.frameId = String(out.frameId || 'tpl');
  out.opacity = num(o.opacity, 1, 0, 1);
  out.scanlines = num(o.scanlines, 0, 0, 1);
  out.vignette = num(o.vignette, 0, 0, 1);
  return out;
}

let dir = '';

module.exports = {
  order: 6,
  namespace: 'gameFrame',
  sections: {
    gameFrame: {
      default: defaults,
      normalize,
      vDefault: () => normalize({}),
    },
    // 枠の種類ごとの調整(横・縦で共通):{ 枠ID: { layers, radius, ratio, glow, shadow, corners, panel } }
    frameCustom: { default: () => ({}), normalize: (v) => (isPlainObject(v) ? v : {}) },
  },
  init({ app, paths, catalogs }) {
    dir = path.join(paths.data, 'frames');
    fs.mkdirSync(dir, { recursive: true });
    watchJson(path.join(paths.config, 'game-frames.json'), (d) => catalogs.set('gameFrames', Array.isArray(d.frames) ? d.frames : []), { fallback: { frames: [] } });
    app.use('/frames', express.static(dir));
    app.post('/api/frames', express.raw({ type: () => true, limit: '40mb' }), (req, res) => {
      const buf = req.body;
      if (!Buffer.isBuffer(buf) || !buf.length) return res.status(400).json({ error: 'ファイルが空です' });
      if (!(buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47)) return res.status(400).json({ error: 'PNG 画像のみ取り込めます' });
      const orig = decodeURIComponent(String(req.get('x-filename') || 'frame.png'));
      const base = path.basename(orig, path.extname(orig)).replace(/[^\w぀-ヿ㐀-鿿\-]+/g, '_').slice(0, 40) || 'frame';
      const file = `${base}-${Date.now().toString(36)}.png`;
      fs.writeFileSync(path.join(dir, file), buf);
      res.json({ file });
    });
  },
  handlers: {
    // 枠の種類の調整(layers は配列ごと置き換え、ほかは上書き。null で項目を消す=初期に戻す)
    custom({ id, patch }, ctx) {
      const fid = String(id || '');
      if (!fid || !isPlainObject(patch)) return;
      const all = ctx.state.frameCustom;
      const cur = isPlainObject(all[fid]) ? all[fid] : {};
      for (const [k, v] of Object.entries(patch)) {
        if (!['layers', 'radius', 'ratio', 'glow', 'shadow', 'corners', 'panel'].includes(k)) continue;
        if (v === null) { delete cur[k]; continue; }
        if (k === 'layers') {
          if (!Array.isArray(v)) continue;
          cur.layers = v.slice(0, 8).map((l) => ({ w: num(l && l.w, 4, 0, 80), fill: String((l && l.fill) || '#ffffff').slice(0, 300) }));
        } else if (k === 'radius') cur.radius = num(v, 0, 0, 80);
        else if (k === 'ratio') cur.ratio = String(v).slice(0, 10);
        else if (isPlainObject(v)) cur[k] = { ...(isPlainObject(cur[k]) ? cur[k] : {}), ...v };
        else if (v === false) cur[k] = false; // 光・影・四隅を「なし」にする
      }
      all[fid] = cur;
      ctx.commit('frameCustom');
    },
    resetCustom({ id }, ctx) {
      delete ctx.state.frameCustom[String(id || '')];
      ctx.commit('frameCustom');
    },
    update({ patch }, ctx) {
      if (!isPlainObject(patch)) return;
      const p = { ...patch };
      delete p.images; // 画像の追加・削除は専用の操作で行う
      delete p.map;
      deepMerge(ctx.state.gameFrame, p);
      ctx.state.gameFrame = normalize(ctx.state.gameFrame);
      ctx.commit('gameFrame');
    },
    addImage(payload, ctx) {
      const img = normImage({ ...payload, id: uid('img') });
      if (!img) return;
      ctx.state.gameFrame.images.push(img);
      ctx.state.gameFrame.frameId = `img:${img.id}`;
      ctx.state.gameFrame.enabled = true;
      ctx.commit('gameFrame');
    },
    updateImage({ id, patch }, ctx) {
      const i = ctx.state.gameFrame.images.find((x) => x.id === id);
      if (!i || !isPlainObject(patch)) return;
      const p = { ...patch };
      delete p.id; delete p.file;
      deepMerge(i, p);
      ctx.state.gameFrame = normalize(ctx.state.gameFrame);
      ctx.commit('gameFrame');
    },
    removeImage({ id }, ctx) {
      const g = ctx.state.gameFrame;
      const i = g.images.find((x) => x.id === id);
      if (!i) return;
      g.images = g.images.filter((x) => x.id !== id);
      if (g.frameId === `img:${id}`) g.frameId = 'tpl';
      // 縦・横のどちらからも使われていなければ、ファイルも消す
      const used = [ctx.raw.gameFrame, ctx.raw.vGameFrame].some((s) => s && s !== g && (s.images || []).some((x) => x.file === i.file));
      if (!used) { try { fs.unlinkSync(path.join(dir, path.basename(i.file))); } catch { /* ignore */ } }
      ctx.commit('gameFrame');
    },
  },
};
