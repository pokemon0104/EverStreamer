'use strict';
// テンプレート:配信画面の見た目一式(パネル・ゲーム枠・お願いポップアップ・あらすじ・背景)をまとめて切り替える
const fs = require('fs');
const path = require('path');
const express = require('express');
const { isPlainObject, pick } = require('../../core/util');
const TOKENS = require('../../core/tokens');
const theme = require('../../core/theme');

const defaults = () => ({
  templateId: 'neon',
  accent: '', // 空 = テンプレートの色
  accent2: '',
});
function normalize(v) {
  const o = isPlainObject(v) ? v : {};
  return {
    templateId: String(o.templateId || 'neon').replace(/[^\w-]/g, '') || 'neon',
    accent: TOKENS.isColor(o.accent) ? o.accent : '',
    accent2: TOKENS.isColor(o.accent2) ? o.accent2 : '',
  };
}
// アプリ全体の状態(初回の案内を見たか など)
const appDefaults = () => ({ onboarded: false, lang: 'ja', contentLang: 'ja' });

// スタイルを変えても残す「サイズ系」の個別調整(パネル機能と同じ)
const SIZE_KEYS = ['headingSize', 'bodySize', 'numberSize', 'lineHeight', 'letterSpacing', 'padding'];

// ---- 初期の文字(見本のパネル名・目標・お願いの文など)を、選んだ言語に置き換える ----
// 辞書 public/i18n/en.json の「日本語 → 英語」を使う。初期のままの文字(完全に一致するもの)だけを置き換えるので、自分で書いた文字は変わらない
const CONTENT_SECTIONS = ['panels', 'vPanels', 'game', 'gameProfiles', 'callout', 'thanks', 'scene', 'character', 'alerts'];
const SKIP_KEYS = new Set(['id', 'type', 'styleId', 'designId', 'font', 'titleFont', 'file', 'icon', 'anchor', 'metric', 'source', 'mode', 'profileId', 'lookId', 'logo', 'members']);
const UNIT_EN = { 人: '', 件: '', 個: '' }; // 英語では単位を付けない
let dictPath = '';
function contentMap(lang) {
  let d = {};
  try { d = JSON.parse(fs.readFileSync(dictPath, 'utf8')).strings || {}; } catch { return null; }
  if (lang === 'en') return { map: { ...d }, unit: UNIT_EN };
  const rev = {};
  for (const [ja, en] of Object.entries(d)) if (en && rev[en] === undefined) rev[en] = ja;
  return { map: rev, unit: {} };
}
function localize(raw, lang) {
  const m = contentMap(lang);
  if (!m) return [];
  const changed = [];
  const walk = (v, key) => {
    if (typeof v === 'string') {
      if (key === 'unit' && m.unit[v] !== undefined) return m.unit[v];
      const t = m.map[v.trim()];
      return t != null ? t : v;
    }
    if (Array.isArray(v)) return v.map((x) => walk(x, key));
    if (isPlainObject(v)) {
      const o = {};
      for (const [k, x] of Object.entries(v)) o[k] = SKIP_KEYS.has(k) ? x : walk(x, k);
      return o;
    }
    return v;
  };
  for (const key of CONTENT_SECTIONS) {
    if (raw[key] === undefined) continue;
    const before = JSON.stringify(raw[key]);
    const after = walk(raw[key], key);
    if (JSON.stringify(after) !== before) { raw[key] = after; changed.push(key); }
  }
  return changed;
}

/** 「テンプレートに合わせる」になっている、お願いポップアップ・あらすじのデザインを、いまのテンプレートで作り直す */
function refreshFollowers(ctx) {
  const raw = ctx.raw;
  const changed = [];
  const co = theme.value(ctx.catalogs, raw, 'callout');
  if (co && raw.callout && Array.isArray(raw.callout.messages)) {
    let any = false;
    for (const m of raw.callout.messages) {
      if (m.designId !== 'tpl') continue;
      m.design = { ...(isPlainObject(m.design) ? m.design : {}), ...co };
      any = true;
    }
    if (any) changed.push('callout');
  }
  const st = theme.value(ctx.catalogs, raw, 'story');
  if (st && raw.story && raw.story.designId === 'tpl') {
    raw.story.design = { ...(isPlainObject(raw.story.design) ? raw.story.design : {}), ...st };
    changed.push('story');
  }
  if (changed.length) ctx.commitRaw(...changed);
}

module.exports = {
  order: 1,
  namespace: 'theme',
  sections: {
    theme: { default: defaults, normalize },
    app: { default: appDefaults, normalize: (v) => ({ ...appDefaults(), ...(isPlainObject(v) ? v : {}) }) },
  },
  init({ app, paths, catalogs, store, hub }) {
    const dir = path.join(paths.config, 'templates');
    dictPath = path.join(paths.public, 'i18n', 'en.json');
    // 起動時と、テンプレートのファイルを書き換えたときに、「テンプレートに合わせる」デザインを作り直す
    const fake = {
      raw: store.state,
      catalogs,
      commitRaw: (...keys) => { store.scheduleSave(); keys.forEach((k) => hub.broadcast('core:section', { key: k, value: store.state[k] })); },
    };
    theme.watchTemplates(dir, (list) => { catalogs.set('templates', list); refreshFollowers(fake); });
    // テンプレートごとの CSS(飾り)。/templates/neon.css など
    app.get('/templates/:file', (req, res) => {
      const f = String(req.params.file || '');
      if (!/^[\w-]+\.css$/.test(f)) return res.status(404).end();
      res.type('text/css').sendFile(path.join(dir, f), (e) => { if (e && !res.headersSent) res.status(404).end(); });
    });
    app.use('/template-assets', express.static(path.join(dir, 'assets')));
  },
  handlers: {
    // テンプレート・メインカラー・サブカラーを変える
    set(payload, ctx) {
      const t = ctx.raw.theme;
      const prevTpl = t.templateId;
      if (payload.templateId != null) {
        const id = String(payload.templateId);
        if ((ctx.catalogs.get('templates') || []).some((x) => x.id === id)) t.templateId = id;
      }
      // テンプレートを変えたときは、色の指定はテンプレートの色に戻す(keepColor で残せる)
      if (t.templateId !== prevTpl && !payload.keepColor) { t.accent = ''; t.accent2 = ''; }
      for (const k of ['accent', 'accent2']) {
        if (payload[k] === undefined) continue;
        t[k] = TOKENS.isColor(payload[k]) ? payload[k] : '';
      }
      ctx.raw.theme = normalize(t);
      // テンプレートの枠の調整は、テンプレートごとのものなので、切り替えたら消す
      if (t.templateId !== prevTpl && ctx.raw.frameCustom && ctx.raw.frameCustom.tpl) {
        delete ctx.raw.frameCustom.tpl;
        ctx.commitRaw('frameCustom');
      }
      ctx.commitRaw('theme');
      refreshFollowers(ctx);
    },
    // パネル・ゲーム枠・背景・お願いポップアップ・あらすじを、すべてテンプレートに合わせる(横・縦の両方)
    applyAll({ background = true, frame = true } = {}, ctx) {
      const raw = ctx.raw;
      const touched = new Set();
      for (const key of ['panels', 'vPanels']) {
        if (!Array.isArray(raw[key])) continue;
        for (const p of raw[key]) {
          if (p.type === 'group' || p.type === 'space') continue;
          const look = isPlainObject(p.look) ? p.look : {};
          // 背景を消してあるパネル(ロゴだけ表示など)は、そのまま
          if (Number(look.bgAlpha) === 0) { p.styleId = 'tpl'; continue; }
          p.styleId = 'tpl';
          p.look = pick(look, SIZE_KEYS);
        }
        touched.add(key);
      }
      if (frame) {
        for (const key of ['gameFrame', 'vGameFrame']) {
          const g = raw[key];
          if (!isPlainObject(g)) continue;
          g.frameId = 'tpl';
          g.enabled = true;
          touched.add(key);
        }
      }
      if (background) {
        for (const key of ['background', 'vBackground']) {
          const b = raw[key];
          if (!isPlainObject(b)) continue;
          b.type = 'preset';
          b.presetId = 'tpl';
          b.enabled = true;
          touched.add(key);
        }
      }
      if (raw.callout && Array.isArray(raw.callout.messages)) {
        raw.callout.messages.forEach((m) => { m.designId = 'tpl'; });
        touched.add('callout');
      }
      if (raw.story) { raw.story.designId = 'tpl'; touched.add('story'); }
      ctx.commitRaw(...touched);
      refreshFollowers(ctx);
      ctx.toast('すべてをテンプレートに合わせました');
    },
    // 言語(管理画面で選んだ言語。オーバーレイの決まった文字もこの言語になる)
    lang({ lang, localize: force }, ctx) {
      const l = lang === 'en' ? 'en' : 'ja';
      const app = ctx.raw.app;
      app.lang = l;
      // 初回の案内を終えるまでは、見本の文字も一緒に置き換える(終えたあとは force のときだけ)
      if ((!app.onboarded || force) && app.contentLang !== l) {
        const changed = localize(ctx.raw, l);
        app.contentLang = l;
        if (changed.length) ctx.commitRaw(...changed);
      }
      ctx.commitRaw('app');
    },
    onboarded({ done = true }, ctx) {
      ctx.raw.app.onboarded = !!done;
      ctx.commitRaw('app');
    },
  },
  _test: { refreshFollowers, localize },
};
