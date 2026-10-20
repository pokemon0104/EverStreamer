/* 管理画面の言語(日本語 / English)
 * 画面の文字は日本語で書いてあり、英語のときは /i18n/en.json の辞書で置き換える。
 *  - strings : { "日本語の文字": "English" }(文字全体が一致したとき)
 *  - patterns: { "現在の枠: {0}": "Current frame: {0}" }({0} などの部分は、そのまま差し込む)
 * 画面に文字が足されるたびに自動で訳す(プレビューの中=配信画面の文字は訳さない)。
 */
(function () {
  'use strict';
  const I18N = (window.I18N = { lang: 'ja', strings: {}, patterns: [], version: 0 });
  // 管理画面は、この PC のブラウザで選んだ言語。OBS 用の画面(オーバーレイ)は、サーバーの設定(app.lang)に合わせる
  const isAdmin = /^\/admin/.test(location.pathname);
  const get = () => { try { return localStorage.getItem('sok.lang'); } catch { return null; } };
  const qs = new URLSearchParams(location.search).get('lang');
  const nav = String(navigator.language || 'ja').toLowerCase();
  I18N.lang = isAdmin ? (qs || get() || (nav.startsWith('ja') ? 'ja' : 'en')) : (qs || 'ja');
  if (!['ja', 'en'].includes(I18N.lang)) I18N.lang = 'en';
  document.documentElement.lang = I18N.lang;

  /** 管理画面の言語を変える(オーバーレイの言語も同じにする) */
  I18N.setLang = (l) => {
    try { localStorage.setItem('sok.lang', l); } catch { /* 保存できなくても、この画面では切り替わる */ }
    if (window.ADM && ADM.hub) ADM.hub.send('theme:lang', { lang: l });
    const u = new URL(location.href);
    u.searchParams.delete('lang');
    if (l !== I18N.lang) setTimeout(() => { location.href = u.toString(); }, 200);
  };

  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  function use(d) {
    I18N.strings = (d && d.strings) || {};
    I18N.patterns = Object.entries((d && d.patterns) || {}).map(([k, v]) => {
      const parts = k.split(/\{(\d)\}/);
      let src = '^';
      for (let i = 0; i < parts.length; i++) src += i % 2 ? '([\\s\\S]*?)' : escRe(parts[i]);
      return { re: new RegExp(`${src}$`), idx: parts.filter((_, i) => i % 2).map(Number), to: v };
    });
    I18N.version++;
  }
  function loadSync() {
    if (I18N.lang === 'ja') return;
    try {
      // 起動時に1回だけ読む(ローカルのサーバーなので一瞬で終わる)
      const x = new XMLHttpRequest();
      x.open('GET', `/i18n/${I18N.lang}.json`, false);
      x.send();
      if (x.status === 200) use(JSON.parse(x.responseText));
    } catch (e) { console.warn('[i18n]', e); }
  }
  /** オーバーレイ用:言語を切り替える(辞書を読み込んでから resolve) */
  I18N.switchTo = async (l) => {
    const lang = l === 'en' ? 'en' : 'ja';
    if (lang === I18N.lang) return false;
    if (lang === 'ja') { I18N.lang = 'ja'; use({}); return true; }
    try {
      const r = await fetch(`/i18n/${lang}.json`);
      use(await r.json());
      I18N.lang = lang;
      return true;
    } catch (e) { console.warn('[i18n]', e); return false; }
  };
  loadSync();

  const JA = /[぀-ヿ㐀-鿿！-｠]/;
  /** 文字を今の言語に訳す(辞書にない文字はそのまま) */
  I18N.t = function (s) {
    if (I18N.lang === 'ja' || s == null) return s;
    const str = String(s);
    if (!JA.test(str)) return str;
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(str);
    const core = m[2];
    let out = I18N.strings[core];
    if (out == null) {
      for (const p of I18N.patterns) {
        const r = p.re.exec(core);
        if (!r) continue;
        const vals = {};
        p.idx.forEach((n, i) => { vals[n] = r[i + 1]; });
        out = p.to.replace(/\{(\d)\}/g, (_, n) => I18N.t(vals[n] == null ? '' : vals[n]));
        break;
      }
    }
    return out == null ? str : m[1] + out + m[3];
  };

  if (I18N.lang === 'ja' || !isAdmin) return;

  // ---- 管理画面の文字を自動で訳す ----
  const SKIP = '.ov-stage, [data-i18n-skip], script, style, textarea';
  const SKIP_ATTR = '.ov-stage, [data-i18n-skip]';
  const ATTRS = ['title', 'placeholder', 'aria-label'];
  // 訳した結果をもう一度訳さない(訳しきれない文字が残っても、くり返さない)
  const done = new WeakMap();
  function trText(node) {
    const p = node.parentElement;
    if (!p || p.closest(SKIP)) return;
    const v = node.data;
    if (!JA.test(v) || done.get(node) === v) return;
    const t = I18N.t(v);
    done.set(node, t);
    if (t !== v) node.data = t;
  }
  function trAttrs(el) {
    if (el.closest(SKIP_ATTR)) return;
    for (const a of ATTRS) {
      const v = el.getAttribute(a);
      const key = `i18n${a.replace('-', '')}`;
      if (!v || !JA.test(v) || el.dataset[key] === v) continue;
      const t = I18N.t(v);
      el.dataset[key] = t;
      if (t !== v) el.setAttribute(a, t);
    }
  }
  function walk(root) {
    if (root.nodeType === 3) { trText(root); return; }
    if (root.nodeType !== 1) return;
    if (root.closest && root.closest(SKIP)) { trAttrs(root); return; }
    trAttrs(root);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: (n) => (n.nodeType === 1 && n.matches(SKIP) ? (trAttrs(n), NodeFilter.FILTER_REJECT) : NodeFilter.FILTER_ACCEPT),
    });
    let n = w.nextNode();
    while (n) {
      if (n.nodeType === 3) trText(n); else trAttrs(n);
      n = w.nextNode();
    }
  }
  const mo = new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'childList') m.addedNodes.forEach(walk);
      else if (m.type === 'characterData') trText(m.target);
      else if (m.type === 'attributes') trAttrs(m.target);
    }
  });
  function start() {
    walk(document.body);
    mo.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
  // タブの題名
  const t0 = document.title;
  document.title = I18N.t(t0);
  new MutationObserver(() => { const t = I18N.t(document.title); if (t !== document.title) document.title = t; })
    .observe(document.querySelector('title') || document.head, { childList: true, characterData: true, subtree: true });
  // 確認ダイアログ・お知らせ
  const c0 = window.confirm.bind(window);
  const a0 = window.alert.bind(window);
  const p0 = window.prompt.bind(window);
  window.confirm = (m) => c0(I18N.t(m));
  window.alert = (m) => a0(I18N.t(m));
  window.prompt = (m, d) => p0(I18N.t(m), d);
})();
