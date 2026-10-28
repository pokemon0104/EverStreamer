'use strict';
// 機能ごとに「横型・縦型のどちらの画面に出すか」を決める(感謝・お祝い・演出・コメント連動)
// 設定は横と縦で共通の1つ(screens)。各画面のオーバーレイが、自分の画面に出してよいかを見る
const { isPlainObject } = require('../../core/util');

const KINDS = ['thanks', 'celebrate', 'reactions', 'ct'];
const defaults = () => Object.fromEntries(KINDS.map((k) => [k, { h: true, v: true }]));

function normalize(v) {
  const o = isPlainObject(v) ? v : {};
  const out = defaults();
  for (const k of KINDS) {
    const x = isPlainObject(o[k]) ? o[k] : {};
    out[k] = { h: x.h !== false, v: x.v !== false };
  }
  return out;
}

module.exports = {
  order: 30,
  sections: { screens: { default: defaults, normalize } },
  handlers: {
    // { kind: 'thanks', screen: 'h' | 'v', on: true/false }(canvas は「管理画面で編集中の画面」に使われるので、別の名前にしている)
    set({ kind, screen, on }, ctx) {
      if (!KINDS.includes(kind) || !['h', 'v'].includes(screen)) return;
      ctx.raw.screens = normalize(ctx.raw.screens);
      ctx.raw.screens[kind][screen] = !!on;
      ctx.commitRaw('screens');
    },
  },
  KINDS,
};
