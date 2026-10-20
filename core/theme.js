'use strict';
// テンプレート(config/templates/*.json)の読み込みと、いま選んでいるテンプレートの値の取り出し(サーバー側)
const fs = require('fs');
const path = require('path');
const TOKENS = require('./tokens');
const { isPlainObject } = require('./util');

/** config/templates の JSON をすべて読む(並び順は order → id) */
function readTemplates(dir) {
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
      list.push(t);
    } catch (e) {
      console.warn(`[templates] ${f} を読み込めませんでした: ${e.message}`);
    }
  }
  list.sort((a, b) => (Number(a.order) || 99) - (Number(b.order) || 99) || a.id.localeCompare(b.id));
  return list;
}

/** フォルダを監視して、変わったら読み直す(手で JSON や CSS を足してもすぐ反映) */
function watchTemplates(dir, onLoad) {
  const load = () => onLoad(readTemplates(dir));
  load();
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

module.exports = { readTemplates, watchTemplates, current, value };
