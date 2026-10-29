'use strict';
// 追加パック(packs/<フォルダ名>/):テンプレート・文字のデザイン・質感の画像・キャラクターのまとまり
// フォルダを packs に入れるだけで読み込む(再起動しなくても数秒で反映)。本体を更新しても packs は消えない
//
// packs/<id>/
//   pack.json            { "name": "…", "version": "1.0.0", "author": "…" }(なくても動く)
//   templates/           <id>.json + <id>.css(config/templates と同じ形)
//   text-designs.json    大きな文字のデザイン(config/text-designs.json と同じ形。types・categories・themes を追加)
//   textures/            質感の画像(PNG / JPG / WebP)と textures.json(表示名)
//   characters/<set>/    idle / talk / blink / happy の画像(PNG / WebP / SVG)と character.json({ "name": "…" })
const fs = require('fs');
const path = require('path');

const safeId = (s) => String(s || '').replace(/[^\w-]/g, '').slice(0, 60);
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return null; } };
const isDir = (d) => { try { return fs.statSync(d).isDirectory(); } catch { return false; } };

/** packs フォルダの中のパック一覧 */
function list(root) {
  let names = [];
  try { names = fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort(); } catch { return []; }
  return names.filter((n) => safeId(n) === n && !n.startsWith('_')).map((id) => {
    const dir = path.join(root, id);
    const meta = readJson(path.join(dir, 'pack.json')) || {};
    return {
      id,
      dir,
      name: String(meta.name || id).slice(0, 80),
      version: String(meta.version || '').slice(0, 20),
      author: String(meta.author || '').slice(0, 60),
    };
  });
}

/** 変わったかどうかの目印(フォルダ内のファイル名と更新時刻) */
function signature(root) {
  const out = [];
  const walk = (d, depth) => {
    let es = [];
    try { es = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of es) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (depth < 4) walk(p, depth + 1); continue; }
      try { out.push(`${p}:${fs.statSync(p).mtimeMs}`); } catch { /* 消えた */ }
    }
  };
  walk(root, 0);
  return out.sort().join('|');
}

/** 一定間隔でパックの中身を見て、変わったら onChange を呼ぶ */
function watch(root, onChange, ms = 2500) {
  let last = signature(root);
  const t = setInterval(() => {
    const s = signature(root);
    if (s !== last) { last = s; onChange(); }
  }, ms);
  if (t.unref) t.unref();
}

/** パックに入っているキャラクターのセット */
function characterSets(root) {
  const out = [];
  for (const p of list(root)) {
    const cdir = path.join(p.dir, 'characters');
    let sets = [];
    try { sets = fs.readdirSync(cdir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort(); } catch { continue; }
    for (const s of sets) {
      if (safeId(s) !== s) continue;
      const dir = path.join(cdir, s);
      const meta = readJson(path.join(dir, 'character.json')) || {};
      let files = [];
      try { files = fs.readdirSync(dir); } catch { continue; }
      const images = {};
      for (const slot of ['idle', 'talk', 'blink', 'happy']) {
        const f = files.find((x) => new RegExp(`^${slot}\\.(png|webp|svg)$`, 'i').test(x));
        images[slot] = f ? `pack:${p.id}/${s}/${f}` : '';
      }
      if (!images.idle) continue;
      out.push({ id: `${p.id}/${s}`, name: String(meta.name || s).slice(0, 60), pack: p.name, images });
    }
  }
  return out;
}

/** パックの静的ファイル(画像・CSS・フォント)だけを /packs/... で配る */
const SERVE = /\.(png|jpe?g|webp|svg|gif|css|woff2?|ttf|otf|mp4|webm|mp3|ogg|wav)$/i;
function serve(app, root) {
  const express = require('express');
  const st = express.static(root, { maxAge: '10m', dotfiles: 'ignore', index: false });
  app.use('/packs', (req, res, next) => (SERVE.test(req.path) ? st(req, res, next) : res.status(404).end()));
}

module.exports = { list, watch, signature, characterSets, serve, isDir, safeId, readJson };
