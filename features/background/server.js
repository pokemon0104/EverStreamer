'use strict';
// 背景:テンプレートの背景・色・グラデーション・パターン・アップロードした画像
const fs = require('fs');
const path = require('path');
const express = require('express');
const { deepMerge, isPlainObject, watchJson } = require('../../core/util');

const ALLOWED = ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif', '.mp4', '.webm'];
const VIDEO = ['.mp4', '.webm'];

const defaults = () => ({
  enabled: true,
  target: 'full', // sidebar = サイドバーの後ろ / full = 画面全体(ゲーム映像の場所を抜く)
  type: 'preset', // preset / color / gradient / upload
  presetId: 'tpl', // tpl = テンプレートの背景
  color: '#101a4a',
  color2: '#3a63e0',
  angle: 180,
  upload: '',
  fit: 'cover', // 画像:cover = 全面に広げる / contain = 全体を収める / tile = 並べる
  tileSize: 256,
  dim: 0, // 暗くして、パネルを見やすくする
  opacity: 1,
  linkGame: true, // ゲームプロファイルと連動(ゲームを切り替えると、そのゲームの背景に切り替わる)
  // 画面全体のとき、ゲーム映像を表示する場所(OBS のゲーム映像をここに合わせる)
  game: {
    mode: 'auto', // auto = サイドバー以外の場所に自動で収める / manual = 数値で指定
    ratio: '16:9', // 16:9 / 4:3 / 1:1
    margin: 24,
    x: 24, y: 24, w: 1388, h: 781,
    borderStyle: 'solid', // solid / double / none
    borderWidth: 6,
    borderColor: '#ffffff',
    radius: 0,
  },
});

let uploadsDir = '';

// ゲームプロファイルに保存する背景の項目(見た目だけ。ゲーム映像の場所などは保存しない)
const LOOK_KEYS = ['enabled', 'type', 'presetId', 'color', 'color2', 'angle', 'upload', 'fit', 'tileSize', 'dim', 'opacity'];
const pickLook = (b) => { const o = {}; for (const k of LOOK_KEYS) if (b && b[k] !== undefined) o[k] = b[k]; return JSON.parse(JSON.stringify(o)); };
/** いまの背景を、選んでいるゲームプロファイルに保存する(canvas: 'h' / 'v') */
function saveToProfile(raw, canvas) {
  const key = canvas === 'v' ? 'vBackground' : 'background';
  const b = raw[key];
  const g = raw.game || {};
  if (!b || b.linkGame === false || !g.profileId) return false;
  const prof = (raw.gameProfiles || []).find((x) => x.id === g.profileId);
  if (!prof) return false;
  prof.bg = { ...(prof.bg || {}), [canvas]: pickLook(b) };
  return true;
}
/** ゲームプロファイルを切り替えたとき、そのゲームの背景にする(保存されている画面だけ)。変えた設定欄の名前を返す */
function applyFromProfile(raw, prof) {
  const changed = [];
  for (const [canvas, key] of [['h', 'background'], ['v', 'vBackground']]) {
    const saved = prof && prof.bg && prof.bg[canvas];
    const b = raw[key];
    if (!saved || !b || b.linkGame === false) continue;
    Object.assign(b, pickLook(saved));
    changed.push(key);
  }
  return changed;
}

function normalize(v) {
  const d = defaults();
  const o = isPlainObject(v) ? v : {};
  return { ...d, ...o, game: { ...d.game, ...(isPlainObject(o.game) ? o.game : {}) } };
}
function listUploads() {
  try {
    return fs.readdirSync(uploadsDir).filter((f) => ALLOWED.includes(path.extname(f).toLowerCase()))
      .map((f) => ({ f, t: fs.statSync(path.join(uploadsDir, f)).mtimeMs })).sort((a, b) => b.t - a.t).map((x) => x.f);
  } catch { return []; }
}
function sniffOk(buf, ext) {
  if (ext === '.png') return buf.length > 8 && buf.readUInt32BE(0) === 0x89504e47;
  if (ext === '.jpg' || ext === '.jpeg') return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8;
  if (ext === '.gif') return buf.length > 6 && buf.toString('ascii', 0, 3) === 'GIF';
  if (ext === '.webp') return buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
  if (ext === '.svg') return /<svg[\s>]/i.test(buf.toString('utf8', 0, Math.min(buf.length, 4096)));
  if (ext === '.mp4') return buf.length > 12 && buf.toString('ascii', 4, 8) === 'ftyp';
  if (ext === '.webm') return buf.length > 4 && buf.readUInt32BE(0) === 0x1a45dfa3;
  return false;
}

module.exports = {
  saveToProfile,
  applyFromProfile,
  order: 5,
  namespace: 'background',
  sections: {
    background: {
      default: defaults,
      normalize,
      // 縦画面:ゲーム映像は上のロゴ・目的の下に、横幅いっぱい(4:3)で置く
      vDefault: () => normalize({ target: 'full', game: { mode: 'manual', ratio: '16:9', x: 0, y: 282, w: 1080, h: 608, borderWidth: 4 } }),
    },
  },
  init({ app, paths, catalogs }) {
    uploadsDir = path.join(paths.data, 'backgrounds');
    fs.mkdirSync(uploadsDir, { recursive: true });
    const refresh = () => catalogs.set('bgUploads', listUploads());
    refresh();
    module.exports._refresh = refresh;
    watchJson(path.join(paths.config, 'backgrounds.json'), (d) => catalogs.set('bgPresets', Array.isArray(d.presets) ? d.presets : []), { fallback: { presets: [] } });
    app.use('/bg-assets', express.static(path.join(__dirname, 'assets')));
    app.use('/bg-uploads', express.static(uploadsDir));
    app.post('/api/backgrounds', express.raw({ type: () => true, limit: '300mb' }), (req, res) => {
      const orig = decodeURIComponent(String(req.get('x-filename') || 'bg.png'));
      const ext = path.extname(orig).toLowerCase();
      if (!ALLOWED.includes(ext)) return res.status(400).json({ error: 'PNG / JPG / WebP / GIF / SVG の画像、MP4 / WebM の動画のみアップロードできます' });
      const buf = req.body;
      if (!Buffer.isBuffer(buf) || !buf.length) return res.status(400).json({ error: 'ファイルが空です' });
      if (!sniffOk(buf, ext)) return res.status(400).json({ error: '画像の中身が拡張子と一致しません' });
      if (!VIDEO.includes(ext) && buf.length > 25 * 1024 * 1024) return res.status(400).json({ error: '画像は 25MB までです' });
      const base = path.basename(orig, path.extname(orig)).replace(/[^\w\u3040-\u30ff\u3400-\u9fff\-]+/g, '_').slice(0, 40) || 'bg';
      const file = `${base}-${Date.now().toString(36)}${ext}`;
      fs.writeFileSync(path.join(uploadsDir, file), buf);
      refresh();
      res.json({ file });
    });
  },
  handlers: {
    update({ patch }, ctx) {
      if (!isPlainObject(patch)) return;
      deepMerge(ctx.state.background, patch);
      ctx.state.background = normalize(ctx.state.background);
      ctx.commit('background');
      if (saveToProfile(ctx.raw, ctx.canvas)) ctx.commitRaw('gameProfiles');
    },
    deleteUpload({ file }, ctx) {
      const f = path.basename(String(file || ''));
      if (!ALLOWED.includes(path.extname(f).toLowerCase())) return;
      try { fs.unlinkSync(path.join(uploadsDir, f)); } catch { /* ignore */ }
      for (const key of ['background', 'vBackground']) {
        const b = ctx.raw[key];
        if (b && b.upload === f) { b.upload = ''; ctx.commitRaw(key); }
      }
      // ゲームプロファイルに保存された背景からも外す
      for (const prof of ctx.raw.gameProfiles || []) for (const c of ['h', 'v']) if (prof.bg && prof.bg[c] && prof.bg[c].upload === f) { prof.bg[c].upload = ''; ctx.commitRaw('gameProfiles'); }
      module.exports._refresh();
    },
  },
};
