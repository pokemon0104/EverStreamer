/* オーバーレイ/管理画面 共通の土台:状態・登録口・ユーティリティ */
(function () {
  'use strict';
  const OV = (window.OV = window.OV || {});
  // ---- 横画面(16:9)/縦画面(9:16) ----
  // /overlay-vertical、または ?canvas=v で開くと縦画面(1080x1920)になる
  const qs = new URLSearchParams(location.search);
  OV.canvas = /vertical/.test(location.pathname) || qs.get('canvas') === 'v' ? 'v' : 'h';
  OV.W = OV.canvas === 'v' ? 1080 : 1920;
  OV.H = OV.canvas === 'v' ? 1920 : 1080;
  // 縦画面では、これらの設定だけ縦画面用(vPanels など)を使う。その他は横と共通
  OV.V_ALIAS = { panels: 'vPanels', layout: 'vLayout', layoutPresets: 'vLayoutPresets', presets: 'vPresets', background: 'vBackground', reactions: 'vReactions', gameFrame: 'vGameFrame', storyView: 'vStoryView', characterView: 'vCharacterView', alertView: 'vAlertView' };
  OV.canvasKey = (k) => (OV.canvas === 'v' && OV.V_ALIAS[k]) || k;
  // OV.raw = サーバーの設定そのもの / OV.state = この画面から見た設定(縦画面なら panels → vPanels)
  OV.raw = {};
  const view = new Proxy({}, {
    get: (t, k) => OV.raw[typeof k === 'string' ? OV.canvasKey(k) : k],
    set: (t, k, v) => { OV.raw[typeof k === 'string' ? OV.canvasKey(k) : k] = v; return true; },
    has: (t, k) => (typeof k === 'string' ? OV.canvasKey(k) : k) in OV.raw,
    ownKeys: () => Reflect.ownKeys(OV.raw),
    getOwnPropertyDescriptor: (t, k) => ({ value: OV.raw[k], enumerable: true, configurable: true, writable: true }),
  });
  Object.defineProperty(OV, 'state', { get: () => view, set: (v) => { OV.raw = v || {}; }, configurable: true });
  /** サーバーから届いた設定欄を反映する(key はサーバーの名前:vPanels など) */
  OV.setSection = (key, value) => { OV.raw[key] = value; };
  /** この画面に関係する設定欄か(縦画面のときに横画面のパネルが変わっても描き直さない) */
  OV.sectionRelevant = (key) => {
    const vKeys = Object.values(OV.V_ALIAS);
    const hKeys = Object.keys(OV.V_ALIAS);
    return OV.canvas === 'v' ? !hKeys.includes(key) : !vKeys.includes(key);
  };
  OV.catalogs = {};
  OV.panelTypes = {};
  OV.layers = [];
  OV.tickers = [];

  /** パネル種別を登録する(各機能の overlay.js から呼ぶ) */
  OV.registerPanelType = (type, def) => { OV.panelTypes[type] = Object.assign({ type, label: type }, def); };
  /** パネル以外の全画面レイヤーを登録する(後続ステップの字幕・リアクション用) */
  OV.registerLayer = (def) => OV.layers.push(def);
  /** 0.5秒ごとに呼ばれる処理を登録する(経過時間など) */
  OV.onTick = (fn) => OV.tickers.push(fn);
  /** サーバーからのメッセージを受け取る(例:OV.onMessage('reactions:fire', fn)) */
  OV.msgHandlers = {};
  OV.onMessage = (type, fn) => { (OV.msgHandlers[type] = OV.msgHandlers[type] || []).push(fn); };
  OV.dispatch = (type, payload, msg) => {
    for (const fn of OV.msgHandlers[type] || []) {
      try { fn(payload, msg); } catch (e) { console.error(e); }
    }
  };
  OV.role = 'overlay'; // 管理画面では 'admin' に変わる(音は OBS 用の画面だけで鳴らす)

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
  /** null のキーは削除。サーバーと同じ規則 */
  function deepMerge(t, p) {
    if (!isObj(p)) return t;
    for (const [k, v] of Object.entries(p)) {
      if (k === '__proto__' || k === 'constructor') continue;
      if (v === null) { delete t[k]; continue; }
      if (isObj(v)) { if (!isObj(t[k])) t[k] = {}; deepMerge(t[k], v); } else t[k] = clone(v);
    }
    return t;
  }
  /** パッチ同士を合成する(null=削除指示を保持する) */
  function mergePatch(a, b) {
    for (const [k, v] of Object.entries(b)) {
      if (isObj(v) && isObj(a[k])) mergePatch(a[k], v);
      else a[k] = clone(v);
    }
    return a;
  }
  function hexToRgba(hex, a = 1) {
    let h = String(hex || '#000000').trim();
    if (!h.startsWith('#')) return h;
    h = h.slice(1);
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h.slice(0, 6), 16);
    if (Number.isNaN(n)) return hex;
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  }
  /** 日本語フォールバック付きのフォント指定(属性値に入れても壊れないよう単引用符) */
  function fontStack(f, fallback) {
    const clean = (x) => String(x).replace(/["'\\;{}<>]/g, '');
    const fam = clean(f || 'Noto Sans JP');
    const fb = fallback ? `'${clean(fallback)}', ` : '';
    return `'${fam}', ${fb}'Noto Sans JP', 'Hiragino Sans', 'Yu Gothic UI', 'Meiryo', sans-serif`;
  }
  OV.util = { esc, clamp, isObj, clone, deepMerge, mergePatch, hexToRgba, fontStack };
  /** 配信画面に出す決まった文字を、いまの言語に訳す(辞書は /i18n/en.json) */
  OV.t = (s) => (window.I18N ? I18N.t(s) : s);

  // frame:〇〇 は、ゲーム枠と同じデザインのスタイル(features/gameFrame が作る)
  // tpl は、いま選んでいるテンプレートのスタイル(features/theme が作る)
  OV.styleById = (id) => {
    const s = String(id || '');
    if (s === 'tpl' && OV.templateStyle) return OV.templateStyle();
    if (s.startsWith('frame:') && OV.frameStyle) return OV.frameStyle(id);
    return ((OV.catalogs.styles && OV.catalogs.styles.styles) || []).find((x) => x.id === id);
  };
  /** 実際に使われる見た目 = 共通初期値 + スタイル + パネルの個別調整 */
  // スタイルの中の {accent} などは、いまのテンプレートとメインカラーで置き換える
  OV.resolveTokens = (o) => (window.TOKENS && OV.tokens ? TOKENS.resolve(o, OV.tokens()) : o);
  OV.effectiveLook = (p) => Object.assign({},
    OV.resolveTokens((OV.catalogs.styles && OV.catalogs.styles.base) || {}),
    OV.resolveTokens((OV.styleById(p.styleId) || {}).look || {}),
    p.look || {});

  /** フォントはサーバー経由(ローカルキャッシュ)で読み込む */
  OV.loadFonts = () => {
    for (const f of OV.catalogs.fonts || []) {
      const id = `font-${f.family.replace(/\W/g, '_')}`;
      if (document.getElementById(id)) continue;
      const l = document.createElement('link');
      l.id = id;
      l.rel = 'stylesheet';
      l.href = `/fonts/css?family=${encodeURIComponent(f.family)}`;
      document.head.appendChild(l);
    }
  };
})();
