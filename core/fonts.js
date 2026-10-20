'use strict';
// Google Fonts をローカルにキャッシュして配信する。
// OBS のブラウザソースが外部フォントの読み込みに失敗しても、2回目以降はローカルから確実に読める。
const fs = require('fs');
const path = require('path');
const { watchJson, sha1 } = require('./util');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const GSTATIC = 'https://fonts.gstatic.com/';

function mountFonts({ app, paths, catalogs }) {
  const cacheDir = path.join(paths.data, 'fonts');
  fs.mkdirSync(cacheDir, { recursive: true });
  let fonts = [];
  let warned = false;

  watchJson(path.join(paths.config, 'fonts.json'), (d) => {
    fonts = Array.isArray(d) ? d : [];
    catalogs.set('fonts', fonts);
  }, { fallback: [] });

  app.get('/fonts/css', async (req, res) => {
    res.type('text/css');
    res.set('Cache-Control', 'no-cache');
    const family = String(req.query.family || '');
    const f = fonts.find((x) => x.family === family);
    if (!f) return res.status(404).send('/* unknown font */');

    const weights = String(f.weights || '400').split(/[;,]/).map((s) => s.trim()).filter(Boolean)
      .sort((a, b) => Number(a) - Number(b)).join(';');
    const cssFile = path.join(cacheDir, `css-${sha1(`${family}|${weights}`)}.css`);
    if (fs.existsSync(cssFile)) return res.send(fs.readFileSync(cssFile, 'utf8'));

    const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, '+')}:wght@${weights}&display=block`;
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      let css = await r.text();
      css = css.replace(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g,
        (m, u) => `url(/fonts/g/${u.slice(GSTATIC.length)})`);
      fs.writeFileSync(cssFile, css, 'utf8');
      res.send(css);
    } catch (e) {
      if (!warned) {
        console.warn(`[fonts] Google Fonts に接続できません(${e.message})。キャッシュ済みでないフォントは代替フォントで表示されます。`);
        warned = true;
      }
      res.send(`/* ${family}: オフラインのため読み込めませんでした */`);
    }
  });

  app.get(/^\/fonts\/g\/(.+)$/, async (req, res) => {
    const rel = req.params[0];
    if (!/^[\w\-./]+$/.test(rel) || rel.includes('..')) return res.status(400).end();
    const local = path.join(cacheDir, 'g', ...rel.split('/'));
    if (fs.existsSync(local)) return res.sendFile(local, { maxAge: '365d' });
    try {
      const r = await fetch(GSTATIC + rel, { headers: { 'User-Agent': UA } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      fs.mkdirSync(path.dirname(local), { recursive: true });
      fs.writeFileSync(local, buf);
      res.type(path.extname(local) || 'font/woff2').set('Cache-Control', 'max-age=31536000').send(buf);
    } catch (e) {
      res.status(504).end();
    }
  });
}

module.exports = { mountFonts };
