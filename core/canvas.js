'use strict';
// 横画面(16:9 / 1920x1080)と縦画面(9:16 / 1080x1920)。
// 縦画面では、下の設定だけを別に持つ(パネル・配置・背景・演出の場所など)。
// それ以外(ゲーム・YouTube・お祝い・感謝など)は横と縦で共通。
const V_ALIAS = {
  panels: 'vPanels',
  layout: 'vLayout',
  layoutPresets: 'vLayoutPresets',
  presets: 'vPresets',
  background: 'vBackground',
  reactions: 'vReactions',
  gameFrame: 'vGameFrame',
  storyView: 'vStoryView',
  characterView: 'vCharacterView',
  alertView: 'vAlertView',
};
const CANVAS = {
  h: { w: 1920, h: 1080, label: '横画面' },
  v: { w: 1080, h: 1920, label: '縦画面' },
};

const keyFor = (canvas, key) => (canvas === 'v' && V_ALIAS[key]) || key;

/** 縦画面の操作では、state.panels などが縦画面用の設定を指すようにする */
function viewFor(state, canvas) {
  if (canvas !== 'v') return state;
  return new Proxy(state, {
    get: (t, k) => t[typeof k === 'string' ? keyFor('v', k) : k],
    set: (t, k, v) => { t[typeof k === 'string' ? keyFor('v', k) : k] = v; return true; },
    has: (t, k) => (typeof k === 'string' ? keyFor('v', k) : k) in t,
  });
}

/** 横・縦すべてのパネル(サーバー側の機能が、両方の画面を見るときに使う) */
const allPanels = (state) => [...(state.panels || []), ...(state.vPanels || [])];

module.exports = { V_ALIAS, CANVAS, keyFor, viewFor, allPanels };
