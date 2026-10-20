/* テンプレートのデザイントークン:サーバー(require)とブラウザ(/core/tokens.js)で共通
 *
 * テンプレートの値の中に {accent} や {accent@0.4} と書くと、トークンの値に置き換わる。
 *   {accent}        … メインカラー(#rrggbb)
 *   {accent@0.4}    … メインカラーを不透明度 0.4 で(rgba)
 *   {accentLight} / {accentDark} … メインカラーを明るく/暗くした色(自動で作る)
 *   {accent2} {bg} {surface} {text} {muted} {font} {headingFont} {numberFont} {radius} など
 * 値全体が {radius} のように1つのトークンだけで、その値が数値なら、数値のまま入る。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TOKENS = api;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

  function toRgb(hex) {
    let h = String(hex || '').trim();
    if (!HEX.test(h)) return null;
    h = h.slice(1);
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const toHex = (rgb) => `#${rgb.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;
  /** 2色を混ぜる(t=0 で a、t=1 で b) */
  function mix(a, b, t) {
    const x = toRgb(a);
    const y = toRgb(b);
    if (!x || !y) return a;
    return toHex(x.map((v, i) => v + (y[i] - v) * t));
  }
  function alpha(hex, a) {
    const c = toRgb(hex);
    if (!c) return hex;
    return `rgba(${c[0]},${c[1]},${c[2]},${Math.min(1, Math.max(0, Number(a)))})`;
  }
  /** 色の明るさ(0〜1)。文字色を白か黒か選ぶときに使う */
  function luminance(hex) {
    const c = toRgb(hex);
    if (!c) return 0;
    const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  }
  /** コントラスト比(WCAG)。4.5 以上で読みやすい */
  function contrast(a, b) {
    const x = luminance(a) + 0.05;
    const y = luminance(b) + 0.05;
    return x > y ? x / y : y / x;
  }
  const isColor = (v) => HEX.test(String(v || '').trim());

  /** テンプレートの初期トークンに、ユーザーが選んだ色(theme.accent など)を重ねて、派生色を足す */
  function tokensFor(template, theme) {
    const t = Object.assign({}, (template && template.tokens) || {});
    const th = theme || {};
    if (isColor(th.accent)) t.accent = th.accent;
    if (isColor(th.accent2)) t.accent2 = th.accent2;
    if (!isColor(t.accent)) t.accent = '#4f8cff';
    if (!isColor(t.accent2)) t.accent2 = t.accent;
    if (!isColor(t.bg)) t.bg = '#0d0f17';
    if (!isColor(t.text)) t.text = '#ffffff';
    if (!isColor(t.surface)) t.surface = t.bg;
    if (!isColor(t.muted)) t.muted = mix(t.text, t.bg, 0.4);
    t.accentLight = mix(t.accent, '#ffffff', 0.45);
    t.accentDark = mix(t.accent, '#000000', 0.45);
    t.accent2Light = mix(t.accent2, '#ffffff', 0.45);
    t.accent2Dark = mix(t.accent2, '#000000', 0.45);
    // メインカラーの上に乗せる文字の色(白か黒のうち読みやすい方)
    // 白で十分読めるなら白(多くの配色で見栄えがよい)。明るすぎる色のときだけ黒
    const on = (c) => (contrast(c, '#ffffff') >= 3 ? '#ffffff' : '#111111');
    t.onAccent = on(t.accent);
    t.onAccent2 = on(t.accent2);
    return t;
  }

  const RE = /\{(\w+)(?:@([\d.]+))?\}/g;
  function resolveString(s, tk) {
    const whole = /^\{(\w+)\}$/.exec(s);
    if (whole && typeof tk[whole[1]] === 'number') return tk[whole[1]];
    return s.replace(RE, (m, k, a) => {
      if (!(k in tk)) return m;
      const v = tk[k];
      return a != null ? alpha(String(v), a) : String(v);
    });
  }
  /** オブジェクトの中の {トークン} をすべて置き換えた複製を返す */
  function resolve(v, tk) {
    if (typeof v === 'string') return resolveString(v, tk);
    if (Array.isArray(v)) return v.map((x) => resolve(x, tk));
    if (isObj(v)) {
      const o = {};
      for (const [k, x] of Object.entries(v)) o[k] = resolve(x, tk);
      return o;
    }
    return v;
  }
  /** テンプレートの名前などは {ja, en} の形。lang に合うものを返す */
  const label = (v, lang) => (isObj(v) ? (v[lang] || v.ja || v.en || '') : String(v == null ? '' : v));

  return { tokensFor, resolve, mix, alpha, luminance, contrast, isColor, label };
}));
