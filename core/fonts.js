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

  // ---- 自分のフォント(PC に入っているフォントの名前を登録/フォントファイルを取り込む) ----
  const userDir = path.join(paths.data, 'userfonts');
  const userList = path.join(paths.data, 'user-fonts.json');
  fs.mkdirSync(userDir, { recursive: true });
  let configFonts = [];
  const FONT_EXT = ['.ttf', '.otf', '.woff', '.woff2', '.ttc'];
  const readSystem = () => {
    try { const d = JSON.parse(fs.readFileSync(userList, 'utf8')); return Array.isArray(d.system) ? d.system.filter((x) => x && typeof x.family === 'string') : []; } catch { return []; }
  };
  const writeSystem = (list) => fs.writeFileSync(userList, JSON.stringify({ system: list }, null, 2), 'utf8');
  const fileFamily = (file) => path.basename(file, path.extname(file));
  const userFonts = () => {
    let files = [];
    try { files = fs.readdirSync(userDir).filter((f) => FONT_EXT.includes(path.extname(f).toLowerCase())).sort(); } catch { /* ignore */ }
    return [
      ...files.map((f) => ({ family: fileFamily(f), label: `${fileFamily(f)}(取り込んだフォント)`, local: 'file', file: f })),
      ...readSystem().map((x) => ({ family: x.family, label: `${x.family}(PCのフォント)`, local: 'system' })),
    ];
  };
  const publish = () => {
    const own = userFonts();
    const names = new Set(own.map((f) => f.family));
    fonts = [...configFonts.filter((f) => !names.has(f.family)), ...own];
    catalogs.set('fonts', fonts);
  };
  const cleanName = (s) => String(s || '').replace(/["'\\;{}<>\/]/g, '').trim().slice(0, 60);

  watchJson(path.join(paths.config, 'fonts.json'), (d) => {
    configFonts = Array.isArray(d) ? d : [];
    publish();
  }, { fallback: [] });

  app.use('/user-fonts', require('express').static(userDir, { maxAge: '1d' }));
  // フォントファイルの取り込み(TTF / OTF / WOFF / WOFF2 / TTC)
  app.post('/api/user-fonts', require('express').raw({ type: () => true, limit: '60mb' }), (req, res) => {
    const orig = decodeURIComponent(String(req.get('x-filename') || 'font.ttf'));
    const ext = path.extname(orig).toLowerCase();
    if (!FONT_EXT.includes(ext)) return res.status(400).json({ error: 'TTF / OTF / WOFF / WOFF2 / TTC のフォントファイルを選んでください' });
    const buf = req.body;
    if (!Buffer.isBuffer(buf) || buf.length < 12) return res.status(400).json({ error: 'ファイルが空です' });
    const sig = buf.toString('latin1', 0, 4);
    const ok = buf.readUInt32BE(0) === 0x00010000 || ['true', 'OTTO', 'wOFF', 'wOF2', 'ttcf'].includes(sig);
    if (!ok) return res.status(400).json({ error: 'フォントファイルとして読み込めませんでした' });
    let base = cleanName(path.basename(orig, path.extname(orig))).replace(/[^\w\u3040-\u30ff\u3400-\u9fff\uff00-\uffef\- ]+/g, '_') || 'MyFont';
    let file = `${base}${ext}`;
    // 同じ名前があれば上書き(別の拡張子の同名は、後から入れたものだけ残す)
    for (const e of FONT_EXT) { if (e !== ext) { try { fs.unlinkSync(path.join(userDir, `${base}${e}`)); } catch { /* ignore */ } } }
    fs.writeFileSync(path.join(userDir, file), buf);
    publish();
    res.json({ family: base });
  });
  // PC に入っているフォントを名前で登録(OBS も同じ PC で動くので、名前だけで使える)
  app.post('/api/user-fonts/system', require('express').json(), (req, res) => {
    const names = (Array.isArray((req.body || {}).families) ? req.body.families : [(req.body || {}).family]).map(cleanName).filter(Boolean);
    if (!names.length) return res.status(400).json({ error: 'フォント名を入力してください' });
    const list = readSystem();
    for (const n of names) if (!list.some((x) => x.family === n)) list.push({ family: n });
    writeSystem(list);
    publish();
    res.json({ ok: true, added: names });
  });
  app.post('/api/user-fonts/remove', require('express').json(), (req, res) => {
    const { family } = req.body || {};
    const n = cleanName(family);
    writeSystem(readSystem().filter((x) => x.family !== n));
    for (const e of FONT_EXT) { try { fs.unlinkSync(path.join(userDir, `${n}${e}`)); } catch { /* ignore */ } }
    publish();
    res.json({ ok: true });
  });

  app.get('/fonts/css', async (req, res) => {
    res.type('text/css');
    res.set('Cache-Control', 'no-cache');
    const family = String(req.query.family || '');
    const f = fonts.find((x) => x.family === family);
    if (!f) return res.status(404).send('/* unknown font */');
    // 自分のフォント:取り込んだファイルは @font-face を返す。PC のフォントは、名前だけで使えるので何もしない
    if (f.local === 'file') {
      const fmt = { '.ttf': 'truetype', '.otf': 'opentype', '.woff': 'woff', '.woff2': 'woff2', '.ttc': 'truetype' }[path.extname(f.file).toLowerCase()] || 'truetype';
      return res.send(`@font-face{font-family:'${f.family}';src:url('/user-fonts/${encodeURIComponent(f.file)}') format('${fmt}');font-display:block;}`);
    }
    if (f.local) return res.send(`/* ${family}: PC にインストールされたフォント */`);

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
