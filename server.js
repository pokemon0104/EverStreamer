'use strict';
// EverStreamer(OBS 配信オーバーレイ):サーバー本体
const path = require('path');
const fs = require('fs');
const http = require('http');
const express = require('express');
const { createStore } = require('./core/store');
const { createHub } = require('./core/hub');
const { createCatalogs } = require('./core/catalogs');
const { loadFeatures } = require('./core/features');
const { mountFonts } = require('./core/fonts');
const { isLoopback } = require('./core/util');
const { bus } = require('./core/bus');
const { V_ALIAS } = require('./core/canvas');

const PORT = Number(process.env.PORT) || 3000;
const HOST = '127.0.0.1'; // localhost のみで待ち受け(外部公開しない)

const paths = {
  root: __dirname,
  data: path.join(__dirname, 'data'),
  config: path.join(__dirname, 'config'),
  public: path.join(__dirname, 'public'),
  features: path.join(__dirname, 'features'),
};
fs.mkdirSync(paths.data, { recursive: true });

// ---- 機能(プラグイン)の読み込み ----
const features = loadFeatures(paths.features);
const sections = {};
const handlers = {};
const panelTypes = {};
for (const f of features) {
  const m = f.mod;
  Object.assign(panelTypes, m.panelTypes || {});
}
for (const f of features) {
  const m = f.mod;
  if (typeof m.prepare === 'function') m.prepare({ panelTypes, paths });
  Object.assign(sections, m.sections || {});
  const ns = m.namespace || f.name;
  for (const [action, fn] of Object.entries(m.handlers || {})) handlers[`${ns}:${action}`] = fn;
}

// 縦画面(9:16)用の設定欄を、横画面の設定欄から作る(初期値は vDefault があればそれを使う)
for (const [key, vkey] of Object.entries(V_ALIAS)) {
  const def = sections[key];
  if (def && !sections[vkey]) sections[vkey] = { ...def, default: def.vDefault || def.default, normalize: def.vNormalize || def.normalize };
}

const store = createStore({ file: path.join(paths.data, 'settings.json'), sections });
const catalogs = createCatalogs();

const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  if (!isLoopback(req.socket.remoteAddress)) return res.status(403).end();
  res.set('Cache-Control', 'no-store');
  next();
});

const server = http.createServer(app);
const hub = createHub({ server, store, catalogs, handlers, panelTypes, bus });

const featureCtx = { app, store, catalogs, hub, paths, panelTypes, bus };
mountFonts(featureCtx);
for (const f of features) {
  if (typeof f.mod.init === 'function') f.mod.init({ ...featureCtx, dir: f.dir });
}

// ---- 画面 ----
function assetTags(kind) {
  const css = features.filter((f) => f.client.css)
    .map((f) => `<link rel="stylesheet" href="/features/${f.name}/style.css">`);
  const ov = features.filter((f) => f.client.overlay)
    .map((f) => `<script src="/features/${f.name}/overlay.js"></script>`);
  const adm = kind === 'admin'
    ? features.filter((f) => f.client.admin).map((f) => `<script src="/features/${f.name}/admin.js"></script>`)
    : [];
  return [...css, ...ov, ...adm].join('\n');
}
function sendPage(file, kind) {
  return (req, res) => {
    const html = fs.readFileSync(path.join(paths.public, file), 'utf8')
      .replace('<!--FEATURE_ASSETS-->', assetTags(kind));
    res.type('html').send(html);
  };
}
app.get('/', (req, res) => res.redirect('/admin'));
app.get('/admin', sendPage('admin.html', 'admin'));
app.get('/overlay', sendPage('overlay.html', 'overlay'));
app.get('/overlay-vertical', sendPage('overlay.html', 'overlay')); // 縦型配信用(1080x1920)
app.get('/core/tokens.js', (req, res) => res.type('application/javascript').sendFile(path.join(paths.root, 'core', 'tokens.js')));
app.use('/core', express.static(path.join(paths.public, 'core')));
app.use('/i18n', express.static(path.join(paths.public, 'i18n')));
app.get('/features/:name/:file', (req, res) => {
  const { name, file } = req.params;
  const f = features.find((x) => x.name === name);
  if (!f || !['overlay.js', 'admin.js', 'style.css'].includes(file)) return res.status(404).end();
  res.sendFile(path.join(f.dir, file));
});
app.get('/api/manifest', (req, res) => {
  res.json({ version: store.version, features: features.map((f) => ({ name: f.name, ...f.client })) });
});


server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  EverStreamer 起動しました / started');
  console.log(`  管理画面 Admin : http://localhost:${PORT}/admin`);
  console.log(`  オーバーレイ   : http://localhost:${PORT}/overlay  (OBS Browser Source 1920x1080)`);
  console.log(`  縦型 Vertical  : http://localhost:${PORT}/overlay-vertical  (OBS Browser Source 1080x1920)`);
  console.log(`  機能       : ${features.map((f) => f.name).join(', ')}`);
  console.log('  終了するには Ctrl + C / Press Ctrl + C to quit');
  console.log('');
  // 起動スクリプト(start.bat など)から起動したときは、管理画面をブラウザで開く
  if (process.env.SOK_OPEN === '1') {
    const url = `http://localhost:${PORT}/admin`;
    const { exec } = require('child_process');
    const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
    exec(cmd, () => { /* 開けなくても、URL は上に表示している */ });
  }
});
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error('');
    console.error(`  ポート ${PORT} は、ほかのアプリが使っています。すでに起動していないか確認してください。`);
    console.error(`  Port ${PORT} is already in use. Is EverStreamer already running?`);
    console.error('  別のポートで起動するには / To use another port:  set PORT=3001 (Windows)  /  PORT=3001 ./start.sh');
    console.error('');
    process.exit(1);
  }
  console.error(e);
  process.exit(1);
});

function shutdown() {
  store.flush();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
