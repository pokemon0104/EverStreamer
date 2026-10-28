'use strict';
// パネル共通:作成・削除・複製・並べ替え・スタイル適用
const path = require('path');
const { uid, clone, deepMerge, pick, isPlainObject, watchJson } = require('../../core/util');

// スタイル変更時も維持する「サイズ系」の個別調整
const SIZE_KEYS = ['headingSize', 'bodySize', 'numberSize', 'lineHeight', 'letterSpacing', 'padding'];

// 「見出しを枠線の上に重ねる」の設定(自分でオンにしていれば、スタイルを変えても維持する)
const BORDER_TITLE_KEYS = ['borderTitle', 'borderTitleAlign', 'borderTitleInset', 'borderTitleScale', 'borderTitlePad', 'borderTitleBgMode', 'borderTitleBgColor'];

const PANEL_BASE = () => ({
  id: uid('p'),
  type: 'text',
  name: 'パネル',
  visible: true,
  placement: 'container', // container = サイドバー内 / free = 自由配置
  x: 40,
  y: 280,
  w: 340,
  h: 260,
  widthMode: 'auto', // auto / fixed
  heightMode: 'auto', // auto(文字量に合わせる) / fixed(固定px。はみ出す場合は文字を縮小)
  pairWithNext: false, // 次のパネルと横並び
  fill: false, // 残りのスペースを埋める
  fillMin: 120,
  styleId: 'tpl',
  look: {}, // スタイルからの個別調整
  anim: { type: 'fade', ms: 350 },
  data: {},
});

let panelTypes = {};

function makePanel(type, extra = {}) {
  const t = panelTypes[type];
  if (!t) throw new Error(`未知のパネル種別です: ${type}`);
  const p = PANEL_BASE();
  p.type = type;
  deepMerge(p, t.defaults());
  deepMerge(p, extra);
  return p;
}

function normalizePanel(p) {
  if (!isPlainObject(p)) return null;
  const t = panelTypes[p.type];
  const base = PANEL_BASE();
  const typeDefaults = t ? t.defaults() : {};
  const out = { ...base, ...p };
  out.id = typeof p.id === 'string' && p.id ? p.id : base.id;
  out.look = isPlainObject(p.look) ? p.look : {};
  out.anim = { ...base.anim, ...(typeDefaults.anim || {}), ...(isPlainObject(p.anim) ? p.anim : {}) };
  out.data = { ...(typeDefaults.data || {}), ...(isPlainObject(p.data) ? p.data : {}) };
  return out;
}

function defaultPanels() {
  const likes = makePanel('number', { name: 'いいね数', data: { mode: 'value', label: 'いいね', value: 128 } });
  const comments = makePanel('number', { name: 'コメント数', data: { mode: 'value', label: 'コメント', value: 54 } });
  return [
    makePanel('gameTitle', { name: 'ゲームタイトル' }),
    makePanel('richText', { name: 'ゲーム全体の目的', styleId: 'tpl', look: { headingSize: 24, bodySize: 20 }, data: { source: 'purpose' } }),
    makePanel('richText', { name: '今日の目標', styleId: 'tpl', look: { headingSize: 26, bodySize: 20 }, data: { source: 'goal' } }),
    makePanel('number', { name: '登録者目標', data: { mode: 'goal', label: '登録者目標', goal: 500, current: 429, unit: '人' } }),
    makePanel('text', { name: '配信情報', data: { title: '配信情報', body: '- 初見プレイ・攻略情報なしで進めます\n- ネタバレ・指示コメントはご遠慮ください\n- 毎週土曜 21時から配信' } }),
    makePanel('social', { name: '名前とSNS' }),
    makePanel('supporters', { name: '最新のサポーター', visible: false }),
    makePanel('camera', { name: 'カメラ枠', visible: false }),
    // いいね・コメントは、グループで横一列にそろえる
    makePanel('group', { name: 'いいね・コメント', data: { members: [likes.id, comments.id] } }),
    likes,
    comments,
    makePanel('comments', { name: 'コメント欄' }),
    makePanel('text', {
      name: 'ネタバレ禁止', visible: false, placement: 'free', x: 24, y: 330, w: 300,
      anim: { type: 'slideLeft', ms: 400 },
      data: { title: 'ネタバレ禁止', body: '- この先の展開・攻略のコメントはお控えください' },
    }),
  ];
}

// 縦画面(1080x1920)の初期配置:左上ロゴ/右に目的/ゲーム映像/横型コメント/縦型コメント用の空き(右下はアバター用に空ける)
function defaultVerticalPanels() {
  const fixed = { placement: 'free', heightMode: 'fixed' };
  const clear = { bgAlpha: 0, bgImage: '', borderWidth: 0, borderStyle: 'none', insetColor: '', innerShadow: '', shadowBlur: 0, shadowY: 0, padding: 4, tplDeco: false };
  const num = (name, label, metric, y) => makePanel('number', {
    name, visible: false, ...fixed, x: 860, y, w: 204, h: 72, styleId: 'tpl', look: { numberSize: 44, padding: 8 },
    data: { mode: 'value', label, view: 'emoji', source: 'youtube', metric, scope: 'total' },
  });
  const nums = [num('いいね(縦)', 'いいね', 'likeCount', 296), num('コメント(縦)', 'コメント', 'chatCount', 376), num('登録者(縦)', '登録者', 'subscriberCount', 456)];
  nums.forEach((p) => { p.visible = true; });
  return [
    makePanel('gameLogo', { name: 'ゲームロゴ', ...fixed, x: 16, y: 16, w: 360, h: 250, look: clear }),
    // 目的と目標は2枚に分ける(内容はゲームの設定に保存され、横画面と共通)
    makePanel('richText', { name: 'ゲーム全体の目的', ...fixed, x: 388, y: 16, w: 676, h: 104, styleId: 'tpl', look: { headingSize: 26, bodySize: 26, padding: 10 }, data: { source: 'purpose' } }),
    makePanel('richText', { name: '今日の目標', ...fixed, x: 388, y: 128, w: 676, h: 138, styleId: 'tpl', look: { headingSize: 28, bodySize: 28, padding: 10 }, data: { source: 'goal' } }),
    // いいね・コメント・登録者は、グループで横一列(YouTube の表示と重なるので、初期は非表示)
    makePanel('group', { name: 'いいね・コメント・登録者', visible: false, ...fixed, x: 16, y: 906, w: 1048, h: 80, data: { members: nums.map((p) => p.id) } }),
    makePanel('comments', { name: '横型コメント', ...fixed, x: 16, y: 1002, w: 1048, h: 300, fill: false, look: { headingSize: 30, bodySize: 30, padding: 14 }, data: { title: '横型コメント', source: 'h', max: 6 } }),
    makePanel('space', { name: '縦型コメント(空き)', ...fixed, x: 16, y: 1318, w: 628, h: 586, data: { label: '縦型配信のコメント(YouTube が表示する場所)' } }),
    ...nums,
  ];
}

const find = (ctx, id) => ctx.state.panels.find((p) => p.id === id);

module.exports = {
  order: 10,
  prepare(ctx) { panelTypes = ctx.panelTypes; },
  sections: {
    panels: {
      default: defaultPanels,
      normalize: (list) => (Array.isArray(list) ? list.map(normalizePanel).filter(Boolean) : defaultPanels()),
      vDefault: defaultVerticalPanels,
      vNormalize: (list) => (Array.isArray(list) ? list.map(normalizePanel).filter(Boolean) : defaultVerticalPanels()),
    },
  },
  init({ paths, catalogs }) {
    watchJson(path.join(paths.config, 'styles.json'), (d) => catalogs.set('styles', d), { fallback: { base: {}, styles: [] } });
  },
  handlers: {
    add({ type = 'text', placement, preset }, ctx) {
      // サイドバーを使っていない画面(縦画面の初期など)では、自由配置で追加する
      const lay = ctx.state.layout || {};
      if (!placement && lay.container && lay.container.enabled === false) placement = 'free';
      const freeCount = ctx.state.panels.filter((x) => x.placement === 'free').length;
      // 自由配置は重ならないよう少しずつずらして置く
      const p = makePanel(type, placement === 'free' ? { placement: 'free', x: 40 + (freeCount % 8) * 30, y: 200 + (freeCount % 8) * 30 } : {});
      // 決まった名前・内容で追加する(「今日の目標」パネルなど)。名前と data だけ受け付ける
      if (isPlainObject(preset)) {
        if (typeof preset.name === 'string' && preset.name.trim()) p.name = preset.name.slice(0, 40);
        if (isPlainObject(preset.data)) deepMerge(p.data, preset.data);
      }
      const list = ctx.state.panels;
      // サイドバーでは「残りを埋める」パネル(コメント欄)の手前に入れる
      let idx = list.length;
      if (p.placement !== 'free') {
        const fillIdx = list.findIndex((x) => x.fill && x.placement !== 'free');
        if (fillIdx >= 0) idx = fillIdx;
      }
      list.splice(idx, 0, p);
      ctx.commit('panels');
      ctx.reply('panels:added', { id: p.id });
    },
    update({ id, patch }, ctx) {
      const p = find(ctx, id);
      if (!p || !isPlainObject(patch)) return;
      const safe = { ...patch };
      delete safe.id;
      delete safe.type;
      deepMerge(p, safe);
      ctx.commit('panels');
      if (ctx.bus) setTimeout(() => ctx.bus.emit('panels:updated', { id }), 0); // 数値が変わったあとの目標判定用
    },
    remove({ id }, ctx) {
      const i = ctx.state.panels.findIndex((p) => p.id === id);
      if (i < 0) return;
      ctx.state.panels.splice(i, 1);
      ctx.commit('panels');
    },
    duplicate({ id }, ctx) {
      const list = ctx.state.panels;
      const i = list.findIndex((p) => p.id === id);
      if (i < 0) return;
      const copy = clone(list[i]);
      copy.id = uid('p');
      copy.name = `${list[i].name} のコピー`;
      copy.pairWithNext = false;
      if (copy.placement === 'free') { copy.x += 30; copy.y += 30; }
      list.splice(i + 1, 0, copy);
      ctx.commit('panels');
      ctx.reply('panels:added', { id: copy.id });
    },
    reorder({ ids }, ctx) {
      if (!Array.isArray(ids)) return;
      const list = ctx.state.panels;
      const byId = new Map(list.map((p) => [p.id, p]));
      const next = ids.map((x) => byId.get(x)).filter(Boolean);
      for (const p of list) if (!next.includes(p)) next.push(p);
      ctx.state.panels = next;
      ctx.commit('panels');
    },
    setStyle({ id, styleId, all }, ctx) {
      const targets = all ? ctx.state.panels : [find(ctx, id)].filter(Boolean);
      for (const p of targets) {
        p.styleId = styleId;
        const keepTitle = p.look && p.look.borderTitle === true ? pick(p.look, BORDER_TITLE_KEYS) : {};
        p.look = { ...pick(p.look, SIZE_KEYS), ...keepTitle }; // 枠・背景・文字装飾はスタイルに戻す(「見出しを枠線の上に」をオンにしていれば維持)
      }
      ctx.commit('panels');
    },
    // すべてのパネルの見た目を一部だけ変える(例:見出しを枠線の上に重ねる)。キーは決まったものだけ受け付ける
    setLookAll({ patch }, ctx) {
      if (!isPlainObject(patch)) return;
      const safe = pick(patch, BORDER_TITLE_KEYS);
      for (const p of ctx.state.panels) {
        if (p.type === 'group') continue;
        p.look = { ...(p.look || {}), ...safe };
      }
      ctx.commit('panels');
    },
    // 初期のパネル構成に戻す(縦画面なら縦型の初期配置)
    resetAll(_, ctx) {
      ctx.state.panels = ctx.canvas === 'v' ? defaultVerticalPanels() : defaultPanels();
      ctx.commit('panels');
      ctx.toast(ctx.canvas === 'v' ? '縦型の初期配置に戻しました' : '初期のパネル構成に戻しました');
    },
    resetLook({ id, keys }, ctx) {
      const p = find(ctx, id);
      if (!p) return;
      if (Array.isArray(keys)) keys.forEach((k) => delete p.look[k]);
      else p.look = {};
      ctx.commit('panels');
    },
  },
};

// ほかの機能(グループなど)からパネルを作るときに使う
module.exports.makePanel = (type, extra) => makePanel(type, extra);
