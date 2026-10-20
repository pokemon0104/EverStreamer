'use strict';
// あらすじ:配信の前に、ゲームのあらすじを画面に出す(トランジション付きで登場・退場)。
// ・文章はゲームの設定(game.story / storyTitle)に保存 → ゲームプロファイルと一緒に切り替わり、横・縦で共通
// ・出し方とデザインは story(横・縦で共通)、表示する場所と大きさは storyView(縦画面は vStoryView)
// ・再生の進み具合は storyPlay(保存しない)。ページ送り・スクロール・終了のタイミングはサーバーが決める
const path = require('path');
const { uid, deepMerge, isPlainObject, clone, watchJson } = require('../../core/util');
const theme = require('../../core/theme');

const ENTERS = ['fade', 'slideUp', 'slideDown', 'slideLeft', 'zoom', 'zoomOut', 'blur', 'wipe', 'curtain', 'shutter', 'iris', 'window', 'cinema', 'none'];
const TEXTFX = ['none', 'type', 'charFade', 'lines', 'blur'];
const PAGEFX = ['fade', 'slide', 'up', 'none'];

const defaultDesign = () => ({
  font: 'Noto Sans JP', titleFont: 'Noto Sans JP', size: 38, titleSize: 44, color: '#ffffff', titleColor: '#ffd84a',
  align: 'left', lineHeight: 1.75, letterSpacing: 0.04, bold: true,
  strokeWidth: 0, strokeColor: '#000000', shadowBlur: 0, shadowY: 3, shadowColor: '#000000', glow: 0, glowColor: '#ffffff',
  boxColor: '#0d1020', boxAlpha: 0.9, boxImage: '', borderStyle: 'solid', borderWidth: 2, borderColor: '#ffffff', radius: 18, padding: 44, boxWidth: 72, boxShadow: true,
  titleDeco: 'none', dim: 0.45, backdropBlur: 0, backdropColor: '#000000', valign: 'center',
});
const defaults = () => ({
  designId: 'tpl', // 最後に選んだデザイン(目印)。tpl = テンプレートに合わせる
  design: defaultDesign(),
  showTitle: true,
  mode: 'pages', // pages = ページ送り / scroll = スクロール(エンドロール)
  enter: 'zoom', // 登場のしかた
  exit: 'fade', // 退場のしかた
  enterMs: 1200,
  exitMs: 1400,
  textFx: 'type', // 文字の出し方
  typeSpeed: 22, // タイプライター・1文字ずつ:1秒あたりの文字数
  lineDelay: 700, // 1行ずつ:行の間隔(ms)
  pageFx: 'fade', // ページの切り替え
  auto: true, // 自動でページを送る
  pageSec: 6, // 全文が出てから次のページまでの秒数
  scrollStyle: 'roll', // roll = 下から上へ / crawl = 奥へ流れる(宇宙のエンドロール風)
  scrollSec: 45,
  autoEnd: true, // 最後まで行ったら自動で退場
  hideUi: true, // 表示中はサイドバー・パネルを隠す
});
const viewDefaults = () => ({
  area: 'full', // full = 画面全体 / game = ゲーム映像の場所 / gameBottom = ゲーム映像の下側 / custom = 数値で指定
  x: 100, y: 100, w: 1200, h: 700,
  margin: 60,
  scale: 1, // 文字と余白の倍率
  boxWidth: 0, // 0 = デザインの幅を使う / 1〜100 = この画面だけの幅(%)
});
const emptyPlay = () => ({ active: false, phase: 'idle', token: '', page: 0, pages: 0, paused: false, local: false });

const pick = (v, list, d) => (list.includes(v) ? v : d);
const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };

function normalize(v) {
  const d = defaults();
  const o = isPlainObject(v) ? v : {};
  const out = { ...d, ...o, design: { ...defaultDesign(), ...(isPlainObject(o.design) ? o.design : {}) } };
  out.enter = pick(out.enter, ENTERS, d.enter);
  out.exit = pick(out.exit, ENTERS, d.exit);
  out.textFx = pick(out.textFx, TEXTFX, d.textFx);
  out.pageFx = pick(out.pageFx, PAGEFX, d.pageFx);
  out.mode = out.mode === 'scroll' ? 'scroll' : 'pages';
  out.scrollStyle = out.scrollStyle === 'crawl' ? 'crawl' : 'roll';
  out.enterMs = num(out.enterMs, d.enterMs, 0, 8000);
  out.exitMs = num(out.exitMs, d.exitMs, 0, 8000);
  out.typeSpeed = num(out.typeSpeed, d.typeSpeed, 2, 200);
  out.lineDelay = num(out.lineDelay, d.lineDelay, 50, 5000);
  out.pageSec = num(out.pageSec, d.pageSec, 1, 120);
  out.scrollSec = num(out.scrollSec, d.scrollSec, 5, 600);
  return out;
}
function normalizeView(v) {
  const d = viewDefaults();
  const o = { ...d, ...(isPlainObject(v) ? v : {}) };
  o.area = ['full', 'game', 'gameBottom', 'custom'].includes(o.area) ? o.area : 'full';
  o.scale = num(o.scale, 1, 0.3, 3);
  o.margin = num(o.margin, 60, 0, 400);
  o.boxWidth = num(o.boxWidth, 0, 0, 100);
  return o;
}

// ---- 文章をページに分ける(--- だけの行で区切る)。オーバーレイ側(overlay.js)と同じ規則 ----
function pagesOf(text) {
  return String(text || '').replace(/\r\n?/g, '\n').split(/\n[ \t]*-{3,}[ \t]*(?:\n|$)/)
    .map((p) => p.replace(/^\n+|\n+$/g, '')).filter((p) => p.trim());
}
const plainLen = (t) => String(t || '').replace(/\*\*|==/g, '').replace(/\s/g, '').length;

let storeRef = null;
let hubRef = null;
let timer = null;

function publish() {
  hubRef.broadcast('core:section', { key: 'storyPlay', value: storeRef.state.storyPlay });
}
const cfg = () => storeRef.state.story;
const P = () => storeRef.state.storyPlay;

// このページを表示し終わるまでの時間(登場 + 文字が出るまで + 読む時間)
function pageMs(i) {
  const c = cfg();
  const pages = pagesOf((storeRef.state.game || {}).story);
  const text = pages[i] || '';
  let reveal = 0;
  if (c.textFx === 'type' || c.textFx === 'charFade') reveal = (plainLen(text) / c.typeSpeed) * 1000;
  else if (c.textFx === 'lines') reveal = text.split('\n').length * c.lineDelay;
  else if (c.textFx === 'blur') reveal = 1200;
  return (i === 0 ? c.enterMs : 500) + reveal + c.pageSec * 1000;
}
function schedule() {
  clearTimeout(timer);
  const p = P();
  if (!p.active || p.paused || p.phase !== 'show') return;
  const c = cfg();
  if (c.mode === 'scroll') {
    if (c.autoEnd) timer = setTimeout(() => end(), c.enterMs + c.scrollSec * 1000);
    return;
  }
  if (!c.auto) return;
  timer = setTimeout(() => {
    const now = P();
    if (!now.active || now.phase !== 'show') return;
    if (now.page < now.pages - 1) { now.page += 1; publish(); schedule(); } else if (c.autoEnd) end();
  }, pageMs(p.page));
}
function start() {
  const pages = pagesOf((storeRef.state.game || {}).story);
  if (!pages.length) return false;
  clearTimeout(timer);
  storeRef.state.storyPlay = { active: true, phase: 'show', token: uid('st'), page: 0, pages: pages.length, paused: false };
  publish();
  schedule();
  return true;
}
function go(d) {
  const p = P();
  if (!p.active || p.phase !== 'show') return;
  const n = p.page + d;
  if (n < 0) return;
  if (n >= p.pages) { end(); return; }
  p.page = n;
  publish();
  schedule();
}
function end() {
  clearTimeout(timer);
  const p = P();
  if (!p.active || p.phase === 'out') return;
  p.phase = 'out';
  publish();
  timer = setTimeout(() => {
    const now = P();
    if (now.token !== p.token) return;
    storeRef.state.storyPlay = { ...emptyPlay(), token: p.token };
    publish();
  }, cfg().exitMs + 200);
}
function hide() {
  clearTimeout(timer);
  storeRef.state.storyPlay = { ...emptyPlay(), token: (P() || {}).token || '' };
  publish();
}

module.exports = {
  order: 33,
  namespace: 'story',
  sections: {
    story: { default: defaults, normalize },
    storyDesigns: { default: () => [], normalize: (v) => (Array.isArray(v) ? v.filter((x) => isPlainObject(x) && x.id && isPlainObject(x.design)) : []) },
    storyView: {
      default: viewDefaults, normalize: normalizeView,
      vDefault: () => normalizeView({ scale: 0.9, boxWidth: 92, margin: 40 }),
      vNormalize: normalizeView,
    },
    storyPlay: { default: emptyPlay, normalize: () => emptyPlay(), transient: true },
  },
  init({ store, hub, paths, catalogs }) {
    storeRef = store;
    hubRef = hub;
    if (!store.state.storyPlay) store.state.storyPlay = emptyPlay();
    watchJson(path.join(paths.config, 'story-designs.json'), (d) => catalogs.set('storyDesigns', Array.isArray(d.designs) ? d.designs : []), { fallback: { designs: [] } });
  },
  handlers: {
    start(_, ctx) { if (!start()) ctx.toast('あらすじが空です。先に文章を書いてください', 'warn'); },
    next() { go(1); },
    prev() { go(-1); },
    end() { end(); },
    hide() { hide(); },
    pause() {
      const p = P();
      if (!p.active || p.phase !== 'show') return;
      p.paused = !p.paused;
      publish();
      schedule();
    },
    update({ patch }, ctx) {
      if (!isPlainObject(patch)) return;
      if (isPlainObject(patch.design) && ctx.state.story.designId === 'tpl') ctx.state.story.designId = 'custom';
      deepMerge(ctx.state.story, patch);
      ctx.state.story = normalize(ctx.state.story);
      ctx.commit('story');
    },
    updateView({ patch }, ctx) {
      if (!isPlainObject(patch)) return;
      deepMerge(ctx.state.storyView, patch);
      ctx.state.storyView = normalizeView(ctx.state.storyView);
      ctx.commit('storyView');
    },
    // デザインを当てる(プリセット or 自分のデザイン)
    applyDesign({ id }, ctx) {
      if (id === 'tpl') {
        ctx.state.story.design = { ...defaultDesign(), ...(theme.value(ctx.catalogs, ctx.raw, 'story') || {}) };
        ctx.state.story.designId = 'tpl';
        return ctx.commit('story');
      }
      const all = [...(ctx.catalogs.get ? ctx.catalogs.get('storyDesigns') || [] : []), ...ctx.state.storyDesigns];
      const d = all.find((x) => x.id === id);
      if (!d) return;
      ctx.state.story.design = { ...defaultDesign(), ...clone(d.design) };
      ctx.state.story.designId = d.id;
      ctx.commit('story');
    },
    // 今のデザインに名前を付けて保存(同じ名前なら上書き)
    saveDesign({ name, overwriteId }, ctx) {
      const list = ctx.state.storyDesigns;
      let e = overwriteId ? list.find((x) => x.id === overwriteId) : null;
      if (!e) {
        const n = String(name || '').trim().slice(0, 30);
        if (!n) return ctx.toast('デザインの名前を入力してください', 'warn');
        e = list.find((x) => x.name === n);
        if (!e) { e = { id: uid('sd'), name: n }; list.push(e); }
      }
      e.design = clone(ctx.state.story.design);
      ctx.state.story.designId = e.id;
      ctx.commit('storyDesigns', 'story');
      ctx.toast(`デザイン「${e.name}」を保存しました`);
    },
    renameDesign({ id, name }, ctx) {
      const e = ctx.state.storyDesigns.find((x) => x.id === id);
      const n = String(name || '').trim().slice(0, 30);
      if (!e || !n) return;
      e.name = n;
      ctx.commit('storyDesigns');
    },
    deleteDesign({ id }, ctx) {
      ctx.state.storyDesigns = ctx.state.storyDesigns.filter((x) => x.id !== id);
      ctx.commit('storyDesigns');
    },
  },
  _test: { pagesOf },
};
