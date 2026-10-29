'use strict';
// テンプレート(config/templates/*.json)の読み込みと、いま選んでいるテンプレートの値の取り出し(サーバー側)
const fs = require('fs');
const path = require('path');
const TOKENS = require('./tokens');
const { isPlainObject } = require('./util');

/** config/templates の JSON をすべて読む(並び順は order → id)。pack を渡すと、そのパックのテンプレートとして印を付ける */
function readTemplates(dir, pack) {
  const list = [];
  let files = [];
  try { files = fs.readdirSync(dir); } catch { return list; }
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    try {
      const t = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      if (!isPlainObject(t) || !t.id) throw new Error('id がありません');
      t.id = String(t.id).replace(/[^\w-]/g, '');
      t.css = fs.existsSync(path.join(dir, `${t.id}.css`));
      if (pack) { t.pack = pack.name; t.packId = pack.id; if (t.order == null) t.order = 100; }
      Object.defineProperty(t, 'dir', { value: dir, enumerable: false }); // CSS を探す場所(画面には送らない)
      list.push(t);
    } catch (e) {
      console.warn(`[templates] ${f} を読み込めませんでした: ${e.message}`);
    }
  }
  list.sort((a, b) => (Number(a.order) || 99) - (Number(b.order) || 99) || a.id.localeCompare(b.id));
  return list;
}

/** 本体のテンプレート+追加パックのテンプレート(同じ id は本体を優先) */
function readAll(dir, packsRoot) {
  const list = readTemplates(dir);
  const seen = new Set(list.map((t) => t.id));
  if (packsRoot) {
    for (const p of require('./packs').list(packsRoot)) {
      const sub = readTemplates(path.join(p.dir, 'templates'), p).filter((t) => !seen.has(t.id));
      sub.forEach((t) => seen.add(t.id));
      list.push(...sub);
    }
  }
  list.sort((a, b) => (Number(a.order) || 99) - (Number(b.order) || 99) || a.id.localeCompare(b.id));
  return list;
}

/** フォルダを監視して、変わったら読み直す(手で JSON や CSS を足してもすぐ反映。パックも数秒で反映) */
function watchTemplates(dir, onLoad, packsRoot) {
  const load = () => onLoad(readAll(dir, packsRoot));
  load();
  if (packsRoot) require('./packs').watch(packsRoot, load);
  let t = null;
  try {
    fs.watch(dir, () => { clearTimeout(t); t = setTimeout(load, 200); });
  } catch {
    // fs.watch が使えない環境では、定期的に読み直す
    setInterval(load, 5000);
  }
}

/** いま選んでいるテンプレートと、トークン(メインカラーなどを反映済み) */
function current(catalogs, raw) {
  const list = catalogs.get('templates') || [];
  const th = (raw && raw.theme) || {};
  const tpl = list.find((x) => x.id === th.templateId) || list[0] || null;
  return { tpl, tokens: TOKENS.tokensFor(tpl, th) };
}

/** テンプレートの値(callout / story / panel / frame / background)を、トークンを置き換えて返す */
function value(catalogs, raw, key) {
  const { tpl, tokens } = current(catalogs, raw);
  if (!tpl || tpl[key] == null) return null;
  return TOKENS.resolve(tpl[key], tokens);
}

module.exports = { readTemplates, readAll, watchTemplates, current, value };
