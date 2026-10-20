/* テンプレート:いま選んでいるテンプレートの値を、パネル・ゲーム枠・背景に渡す(オーバーレイと管理画面で共通) */
(function () {
  'use strict';
  const T = window.TOKENS;

  /** いま選んでいるテンプレート(なければ一覧の先頭) */
  OV.template = function () {
    const list = OV.catalogs.templates || [];
    const th = (OV.raw && OV.raw.theme) || {};
    return list.find((x) => x.id === th.templateId) || list[0] || null;
  };
  let cacheKey = '';
  let cacheTokens = null;
  /** トークン(メインカラーなどを反映済み)。
   *  tpl を渡すと、そのテンプレートのトークン(いま選んでいるもの以外は、テンプレートの初期の色で) */
  OV.tokens = function (tpl) {
    const cur = OV.template();
    const th = (OV.raw && OV.raw.theme) || {};
    if (tpl && (!cur || tpl.id !== cur.id)) return T.tokensFor(tpl, {});
    const key = JSON.stringify([cur && cur.id, cur && cur.tokens, th.accent, th.accent2]);
    if (key !== cacheKey || !cacheTokens) { cacheKey = key; cacheTokens = T.tokensFor(cur, th); }
    return cacheTokens;
  };
  /** テンプレートの値を、トークンを置き換えて取り出す(key: panel / title / frame / callout / story / background) */
  OV.tplValue = function (key, tpl) {
    const t = tpl || OV.template();
    if (!t || t[key] == null) return null;
    return T.resolve(t[key], OV.tokens(t));
  };
  /** テンプレートの名前(言語に合わせる) */
  OV.tplName = (t, field = 'name') => T.label(t && t[field], (window.I18N && I18N.lang) || 'ja');

  /** パネルのスタイル「テンプレートに合わせる」(スタイルID: tpl) */
  OV.templateStyle = function () {
    const look = OV.tplValue('panel') || {};
    return { id: 'tpl', name: 'テンプレートに合わせる', fromTemplate: true, look: Object.assign({}, look, { tpl: true }) };
  };
  /** ゲーム枠「テンプレートの枠」(枠ID: tpl) */
  OV.templateFrame = function () {
    const f = OV.tplValue('frame');
    if (!f) return null;
    const t = OV.template();
    return Object.assign({ match: [], ratio: '' }, f, { id: 'tpl', name: 'テンプレートの枠', desc: OV.tplName(t) });
  };

  // ---- 画面全体に、テンプレートの色・フォントを CSS 変数で渡す(テンプレートの CSS や、各機能の CSS が使う) ----
  const { fontStack } = OV.util;
  function loadCss(list) {
    for (const t of list || []) {
      if (!t.css) continue;
      const id = `tplcss-${t.id}`;
      if (document.getElementById(id)) continue;
      const l = document.createElement('link');
      l.id = id;
      l.rel = 'stylesheet';
      l.href = `/templates/${encodeURIComponent(t.id)}.css`;
      document.head.appendChild(l);
    }
  }
  OV.applyTemplateVars = function (el, tpl) {
    const t = tpl || OV.template();
    const tk = OV.tokens(t);
    const s = el.style;
    el.dataset.template = t ? t.id : '';
    for (const k of ['accent', 'accent2', 'accentLight', 'accentDark', 'bg', 'surface', 'text', 'muted', 'onAccent']) {
      s.setProperty(`--t-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`, tk[k]);
    }
    // カードの上に置く「メインカラーの文字」:カードの色に対していちばん読みやすいもの
    const cands = [tk.accentLight, tk.accent, tk.accentDark];
    s.setProperty('--t-accent-text', cands.reduce((best, c) => (T.contrast(c, tk.surface) > T.contrast(best, tk.surface) ? c : best), cands[0]));
    s.setProperty('--t-accent-a50', T.alpha(tk.accent, 0.5));
    s.setProperty('--t-accent-a20', T.alpha(tk.accent, 0.2));
    s.setProperty('--t-accent2-a50', T.alpha(tk.accent2, 0.5));
    s.setProperty('--t-font', fontStack(tk.font));
    s.setProperty('--t-hfont', fontStack(tk.headingFont || tk.font));
    s.setProperty('--t-nfont', fontStack(tk.numberFont || tk.headingFont || tk.font));
    s.setProperty('--t-radius', `${Number(tk.radius) || 0}px`);
  };

  const stages = [];
  OV.registerLayer({
    mount(stage) { stages.push(stage); },
    update(S, stage) {
      loadCss(OV.catalogs.templates);
      const sig = JSON.stringify([S.theme, (OV.catalogs.templates || []).map((t) => t.id)]);
      if (sig === stage.dataset.tplSig) return;
      stage.dataset.tplSig = sig;
      OV.applyTemplateVars(stage);
    },
  });
  // オーバーレイの言語(管理画面で選んだ言語に合わせる)。管理画面は、その画面の言語のまま
  function ensureLang(app) {
    if (OV.role === 'admin' || !window.I18N || !app) return;
    I18N.switchTo(app.lang).then((changed) => {
      if (!changed) return;
      document.documentElement.lang = I18N.lang;
      if (window.__overlay) window.__overlay.renderer.render();
    });
  }
  OV.onMessage('core:init', (p) => ensureLang(p && p.state && p.state.app));
  OV.onMessage('core:section', (p) => { if (p && p.key === 'app') ensureLang(p.value); });
  OV.onMessage('core:catalog', (p) => { if (p && p.name === 'templates') stages.forEach((s) => { s.dataset.tplSig = ''; }); });
})();
