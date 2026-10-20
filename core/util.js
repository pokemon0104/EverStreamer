'use strict';
// 共通ユーティリティ(サーバー側)
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function uid(prefix = 'id') {
  return `${prefix}_${crypto.randomBytes(4).toString('hex')}`;
}
function clone(v) {
  return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
}
function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
/** patch を target に深くマージする。値が null のキーは削除扱い。配列は丸ごと置換。 */
function deepMerge(target, patch) {
  if (!isPlainObject(patch)) return target;
  for (const [k, v] of Object.entries(patch)) {
    if (BAD_KEYS.has(k)) continue;
    if (v === null) { delete target[k]; continue; }
    if (isPlainObject(v)) {
      if (!isPlainObject(target[k])) target[k] = {};
      deepMerge(target[k], v);
    } else {
      target[k] = clone(v);
    }
  }
  return target;
}
function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj && obj[k] !== undefined) out[k] = clone(obj[k]);
  return out;
}
function sha1(s) {
  return crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 16);
}
/** 一時ファイルに書いてから置き換える(書き込み途中で落ちても壊れにくい) */
function writeJsonAtomic(file, obj) {
  const text = JSON.stringify(obj, null, 2);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, text, 'utf8');
  try {
    fs.renameSync(tmp, file);
  } catch (e) {
    // Windows でウイルス対策ソフト等がファイルを掴んでいる場合のフォールバック
    fs.writeFileSync(file, text, 'utf8');
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  }
}
/** 設定用 JSON を読み込み、変更を監視して再読込する(手で編集してもすぐ反映) */
function watchJson(file, onLoad, { fallback } = {}) {
  let loaded = false;
  const load = () => {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      loaded = true;
      onLoad(data);
    } catch (e) {
      console.warn(`[config] ${path.basename(file)} を読み込めませんでした: ${e.message}`);
      if (!loaded && fallback !== undefined) onLoad(clone(fallback));
    }
  };
  load();
  let t = null;
  fs.watchFile(file, { interval: 1000 }, () => {
    clearTimeout(t);
    t = setTimeout(load, 150);
  });
}
function isLoopback(ip) {
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

module.exports = { uid, clone, isPlainObject, deepMerge, pick, sha1, writeJsonAtomic, watchJson, isLoopback };
