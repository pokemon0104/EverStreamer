'use strict';
// 設定ファイル(data/settings.json)の読み書き。バージョン番号とマイグレーションを持つ。
const fs = require('fs');
const { writeJsonAtomic } = require('./util');

const SCHEMA_VERSION = 1;

// 将来スキーマを変えるときはここに追加する。キーは「移行後のバージョン」。
// 例) 2: (s) => { s.layout.container.radius = 0; return s; }
const MIGRATIONS = {};

function migrate(raw) {
  let v = Number(raw.version) || SCHEMA_VERSION;
  if (v > SCHEMA_VERSION) {
    console.warn(`[store] 設定ファイルのバージョン(${v})がツール(${SCHEMA_VERSION})より新しいです。`);
  }
  while (v < SCHEMA_VERSION) {
    const fn = MIGRATIONS[v + 1];
    if (fn) raw = fn(raw);
    v += 1;
  }
  raw.version = Math.max(v, SCHEMA_VERSION);
  return raw;
}

/**
 * @param {{file:string, sections:Record<string,{default:()=>any, normalize?:(v:any)=>any, transient?:boolean}>}} opts
 */
function createStore({ file, sections }) {
  let raw = {};
  if (fs.existsSync(file)) {
    try {
      raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      const bak = file.replace(/\.json$/, `.broken-${Date.now()}.json`);
      try { fs.copyFileSync(file, bak); } catch { /* ignore */ }
      console.warn(`[store] 設定ファイルが壊れていたため初期値で起動します(退避: ${bak})`);
      raw = {};
    }
  }
  raw = migrate(raw);

  const state = { version: raw.version };
  // 無効化された機能のデータも消さずに保持する
  for (const [k, v] of Object.entries(raw)) if (k !== 'version') state[k] = v;
  for (const [key, def] of Object.entries(sections)) {
    if (def.transient) state[key] = undefined;
    if (state[key] === undefined) state[key] = def.default();
    if (def.normalize) state[key] = def.normalize(state[key]);
  }

  let timer = null;
  function saveNow() {
    clearTimeout(timer);
    timer = null;
    try {
      // 一時的な情報(最近のチャットなど)は保存しない
      const out = {};
      for (const [k, v] of Object.entries(state)) if (!(sections[k] && sections[k].transient)) out[k] = v;
      writeJsonAtomic(file, out);
    } catch (e) {
      console.error('[store] 保存に失敗しました:', e.message);
    }
  }
  function scheduleSave() {
    clearTimeout(timer);
    timer = setTimeout(saveNow, 250);
  }
  saveNow();

  return {
    state,
    file,
    version: SCHEMA_VERSION,
    scheduleSave,
    flush() { if (timer) saveNow(); },
    normalize(key, value) {
      const def = sections[key];
      return def && def.normalize ? def.normalize(value) : value;
    },
  };
}

module.exports = { createStore, SCHEMA_VERSION };
